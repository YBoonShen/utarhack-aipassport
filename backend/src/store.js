// Shared data store — the single source of truth both the employee and admin
// UIs read/write through the REST API. The progression slice (XP, per-training
// records, stamps) is mirrored to backend/data/progress.json so it survives a
// server restart; POST /api/reset returns to the seed state. Swap these
// functions for Firestore queries once the Firebase project is connected (see
// firebase.js) — the persisted shape is already document-friendly.
//
// Everything an admin configures and everything an employee sees comes from
// here, never from browser storage: the training library, who a module is
// assigned to, the notification that assignment produces and the audit trail
// behind it are all one set of records. That is what makes "Admin published and
// assigned it" and "the employee can open it" the same fact rather than two
// copies that can disagree.
//
// XP rules (proposal §1/§5, ported from Jia Yin's state.js):
//   • Training is the main XP source. Each module carries its own point value
//     and each employee keeps ONE progress record per module
//     (trainingProgress[moduleId]) holding the BEST result ever achieved. A
//     retry can only raise that record, so repeating a module cannot farm XP —
//     see completeTraining().
//   • Activity XP (activityXP) covers everything else: clean prompts +2,
//     overriding the checkpoint -20 (and the safe streak resets). Masking
//     protects but earns nothing, so sensitive prompts can't be farmed either.
//   • totalXP = activityXP + Σ trainingProgress[*].pointsEarned, and the level
//     is derived from that total by levels.js. A level once earned is sticky.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { levelFor, LEVEL_BENEFITS, MAX_XP } from './levels.js'
import {
  DEFAULT_EMPLOYEE_ID, EMPLOYEES, departmentName, employeeById, employeesInDepartment, isDepartment,
} from './directory.js'
import { MAX_QUESTIONS, moduleIssue, normaliseQuestions, seedLibrary } from './training.js'
import {
  SEVERITY, OVERRIDE_SEVERITY, TOOL_SEVERITY, TOOL_REPEAT_WINDOW_MINUTES,
  MODEL_SEVERITY, MODEL_REPEAT_WINDOW_MINUTES,
  REPEAT_WINDOW_MINUTES, REPEAT_ESCALATE_AT, MODES, effectiveMode,
  pruneRepeats, repeatCounts, repeatVerdict, identifierLabel, dueAtFor, dueLabel,
} from './risk.js'

const COLLEAGUES = [
  { name: 'Lim Kai Wen', dept: 'Engineering', points: 1725 },
  { name: 'Nurul Aisyah', dept: 'Engineering', points: 1610 },
  { name: 'Priya Kumar', dept: 'Engineering', points: 1445 },
  { name: 'Daniel Wong', dept: 'Engineering', points: 1320 },
  { name: 'Mei Xin', dept: 'Engineering', points: 1180 },
  { name: 'Jason Teh', dept: 'Engineering', points: 950 },
]

// A blank passport. Every signed-in employee gets one of these; only the demo
// employee below starts with history on it.
function blankProfile(id) {
  const record = employeeById(id)
  return {
    id,
    initials: record?.initials || id.slice(0, 2),
    name: `Employee ${id}`,
    dept: record?.dept || 'Eng',
    licenseNo: `AIP-2026-${id.replace(/\D/g, '').padStart(6, '0')}`,
    issued: '02 Jan 2026',
    level: 1,
    levelName: 'Trainee',
    points: 0,
    activityXP: 0,
    trainingProgress: {},
    streakDays: 0,
    promptsProtected: 0,
    itemsMasked: 0,
    // Times this employee sent the original prompt after a checkpoint flagged
    // it. The one demonstrably unsafe act the system records per person, and
    // the only thing that pulls the AI Safety Score down — see safetyFor().
    overrides: 0,
    trainingCompleted: false,
    completedModules: [],
    moduleCompletions: {},
    stamps: [],
    // moduleId -> { [questionIndex]: { correct } } for the attempt in progress,
    // and the attempt counter that stops one evaluation settling twice.
    quiz: {},
    quizAttempt: {},
  }
}

function demoProfile() {
  return {
    ...blankProfile(DEFAULT_EMPLOYEE_ID),
    name: 'Tan Jia Yin',
    licenseNo: 'AIP-2026-004173',
    // level / levelName / points / target / progressPercentage … are all
    // derived — syncProgression() fills them in from activityXP + training XP.
    level: 2,
    levelName: 'Navigator',
    points: 1240,
    // XP earned outside training (safe prompts, streaks, historic activity).
    activityXP: 1240,
    streakDays: 21,
    promptsProtected: 47,
    itemsMasked: 12,
    // These three passport stamps predate the current module library, so each
    // carries the id of the closest module that still exists — that is what a
    // stamp's "View training" button opens at Question 1.
    stamps: [
      { title: 'AI BASICS', moduleId: 3, score: 'PASSED · 100%', date: '04 JAN 2026', shape: 'circle', color: '#078b6c' },
      { title: 'DATA PRIVACY', moduleId: 1, score: 'PASSED · 100%', date: '11 JAN 2026', shape: 'square', color: '#d92d20' },
      { title: 'SAFE PROMPTS', moduleId: 2, score: 'PASSED · 92%', date: '25 JAN 2026', shape: 'circle', color: '#365fd9' },
    ],
  }
}

function seed() {
  const state = {
    // Who the API is answering as. Set by /api/auth/login; every per-employee
    // read (profile, notifications, assigned modules) is scoped by it, so one
    // employee's records are never served to another.
    sessionEmployeeId: DEFAULT_EMPLOYEE_ID,
    employees: { [DEFAULT_EMPLOYEE_ID]: demoProfile() },

    counters: { promptsToday: 312, maskedToday: 58, nextEventNo: 8218, nextRequestNo: 493, nextAlertNo: 2052 },

    // The reporting period behind the one-click compliance report (O3). The
    // daily counters above reset with the demo; these accumulate across the
    // period the report covers, which is why they are tracked separately.
    report: {
      from: '01 Jul 2026',
      to: '19 Jul 2026',
      promptsProtected: 4120,
      itemsMasked: 612,
      humanReviewsCompleted: 11,
      confirmedLeaks: 0,
      toolsApprovedBefore: 7,
      risksResolvedBefore: 3,
      recoveredEvents: 0,
    },

    // Ids of offline events already backfilled, so a retried flush from the
    // extension can never double-count.
    backfilled: new Set(),

    // ---- training ----------------------------------------------------------
    // The library an admin curates and the assignment records that decide who
    // each module reaches. Both sides of the app read these same arrays.
    trainingLibrary: seedLibrary(),
    // { id, moduleId, moduleTitle, type: 'employee'|'department', department,
    //   employeeIds: [], assignedAt, assignedBy }
    assignments: [],
    nextModuleId: seedLibrary().reduce((max, m) => Math.max(max, m.id), 0) + 1,

    auditEvents: [
      auditSeed('EV-8217', '14:02', 'E-217', 'Eng', 'ChatGPT', 'MASKED', 'NIST PR.DS', 'Fix bug for client [MASKED-NAME] in module…', { resource: 'ChatGPT', risk: 'MEDIUM' }),
      auditSeed('EV-8216', '13:58', 'F-102', 'Fin', 'Gemini', 'ALERT', 'PDPA P7', 'Summarise payment for [MASKED-ID] invoice…', { resource: 'Gemini', risk: 'HIGH', status: 'FLAGGED' }),
      auditSeed('EV-8215', '13:51', 'S-044', 'Sales', 'SummarizerX', 'REDIRECTED', 'AIGE 4.2', 'Switched to approved tool · ChatGPT', { resource: 'SummarizerX', risk: 'MEDIUM' }),
      auditSeed('EV-8214', '13:47', 'E-198', 'Eng', 'ChatGPT', 'CLEAN', 'NIST GV.4', 'Explain the difference between SQL joins…', { resource: 'ChatGPT' }),
      auditSeed('EV-8213', '13:40', 'H-011', 'HR', 'Gemini', 'MASKED', 'EU AI Act 4', 'Draft letter to [MASKED-NAME], [MASKED-PHONE]…', { resource: 'Gemini', risk: 'MEDIUM' }),
    ],

    // The queue as it stood before this session — other employees in a 303-person
    // organisation. They carry the same fields the engine writes, including the
    // key it de-duplicates on, so a live alert for the demo employee sits
    // alongside them rather than colliding with one.
    alerts: [
      {
        id: 'RA-2048', key: 'repeat:F-102:CUSTOMER_RECORD', severity: 'HIGH', status: 'open',
        employeeId: 'F-102', occurrences: 4,
        title: 'Repeated identifiers in prompts',
        meta: 'Finance · User F-102 · 4 events in 15 min',
        dueAt: dueAtFor('HIGH'),
        detailMeta: 'Finance · User F-102 · detected today at 13:58',
        what: 'Four prompts from this employee contained a customer record ID within 15 minutes. The gateway masked every instance before transmission — nothing left the organisation — but the pattern suggests personal data is being pasted in as a matter of habit.',
        evidence: '4 × customer record ID masked · 15-minute window', evidenceNote: 'Layer 1 pattern match · masked records only, no raw prompt stored',
        timeline: [['13:58', 'Alert created'], ['14:01', 'Employee notified'], ['14:06', 'Escalated to HIGH · 4 occurrences']],
        recommend: 'Assign the Data Privacy refresher and ask the manager to check in.', primary: 'Assign training',
      },
      {
        id: 'RA-2049', key: 'tool:S-044:summarizerx:seed', severity: 'MEDIUM', status: 'open',
        employeeId: 'S-044', occurrences: 1,
        title: 'Unapproved tool detected',
        meta: 'Sales · SummarizerX · no approved access',
        dueAt: dueAtFor('MEDIUM'),
        detailMeta: 'Sales · User S-044 · detected today at 13:51',
        what: 'An employee opened SummarizerX, which has no approved access. The Smart Gateway still protected their prompts, but a tool nobody has reviewed has no agreed terms for what it does with company data.',
        evidence: 'SummarizerX opened · gateway protection active · no data confirmed sent', evidenceNote: 'Tool register check · no prompt content recorded',
        timeline: [['13:51', 'Alert created'], ['13:51', 'Redirect to approved tool offered'], ['13:52', 'Approved tool opened']],
        recommend: 'Review the SummarizerX tool access request, or point the employee at an approved alternative.', primary: 'Review tool request',
      },
      {
        id: 'RA-2050', key: 'review:REF-2026-041', severity: 'MEDIUM', status: 'open',
        occurrences: 1,
        title: 'AI-assisted decision flagged',
        kind: 'human-review', // resolving it counts as a completed human review (O5 → report)
        meta: 'HR screening · human review requested',
        dueAt: dueAtFor('MEDIUM'),
        detailMeta: 'HR · Case REF-2026-041 · flagged today at 11:20',
        what: 'An affected applicant used the public transparency page to request a human review of an AI-assisted screening decision.',
        evidence: 'Screening summary for [MASKED-NAME]…', evidenceNote: 'Disclosure record complete · masked only',
        timeline: [['11:20', 'Review requested'], ['11:24', 'Case assigned'], ['—', 'Human decision pending']],
        recommend: 'Route the case to an independent human reviewer.', primary: 'Open review case',
      },
      {
        id: 'RA-2051', key: 'trend:Ops:masking-rate', severity: 'MONITORING', status: 'open',
        occurrences: 1,
        title: 'Masking rate above baseline',
        meta: 'Operations · 2.1× weekly average',
        dueAt: dueAtFor('MONITORING'),
        detailMeta: 'Operations · department-wide · trend since 15 Jul',
        what: 'The masking rate in Operations is 2.1× the weekly average. No single user is responsible; the pattern is spread across the team, so this is observed rather than actioned.',
        evidence: 'Aggregated masking events · no raw text stored', evidenceNote: 'Trend monitor · auto-resolves if rate normalises',
        timeline: [['15 Jul', 'Trend detected'], ['16 Jul', 'Threshold exceeded'], ['—', 'Observation ends in 24h']],
        recommend: 'Keep observing. Assign group refresher if the trend continues.', primary: 'Acknowledge',
      },
    ],

    visaRequests: [
      {
        id: 'A-0492', tool: 'SummarizerX', status: 'SECURITY REVIEW', dept: 'Sales',
        requester: 'S-044', owner: 'M. Wong', submitted: '14 Jul 2026',
        purpose: 'Summarise customer meeting notes and produce follow-up actions.',
        scopes: ['Internal', 'No personal data', 'Text only'],
      },
      {
        id: 'A-0491', tool: 'MeetingMind', status: 'COMPLIANCE', dept: 'Operations',
        requester: 'O-031', owner: 'R. Tan', submitted: '15 Jul 2026',
        purpose: 'Transcribe internal meetings and generate action items for the team.',
        scopes: ['Internal', 'Voice + text', 'No customer data'],
      },
      {
        id: 'A-0488', tool: 'GitHub Copilot', status: 'APPROVED', dept: 'Engineering',
        requester: 'E-217', owner: 'A. Rahman', submitted: '10 Jul 2026', decided: '12 Jul 2026',
        purpose: 'Assist with code review and refactoring on internal repositories.',
        scopes: ['Source code', 'Internal repos', 'Level 3 only'],
      },
      {
        id: 'A-0486', tool: 'TranslateAI', status: 'REDIRECTED', dept: 'Marketing',
        requester: 'M-083', owner: 'N. Lee', submitted: '08 Jul 2026', decided: '09 Jul 2026',
        purpose: 'Translate campaign copy for regional markets.',
        scopes: ['Marketing copy', 'No personal data', 'Text only'],
      },
    ],

    // The approved-tool register: every AI tool the organisation knows about and
    // where it stands. This is what decides whether a prompt is heading
    // somewhere that has been reviewed — the visa workflow moves tools through
    // it, and the Smart Gateway checks it on every use.
    //
    // `status`: APPROVED (reviewed and cleared) · UNAPPROVED (never reviewed, or
    // a visa still in flight) · SUSPENDED (was approved, withdrawn after an
    // incident — using it anyway is the more serious finding).
    // `model` and `dataScope` describe what the tool is and what it is cleared
    // to receive; `minLevel` is the AI License level a tool needs, which is what
    // makes a source-code tool unavailable to a Trainee. These are register
    // fields rather than presentation, because the employee's AI Tools page was
    // carrying its own hard-coded copy of all three — so a tool the admin
    // suspended still read "approved · renews in 45 days" to the employee.
    //
    // Three fields carry the enforcement:
    //
    // `hosts` / `url` — where the tool actually lives. The extension used to
    // hold the only copy of this, which meant the register could approve a tool
    // the browser could not recognise, and nothing could name an approved
    // alternative because no record knew a URL. Admin-set only: it is a
    // navigation target, so it must never come from a request form.
    //
    // `models` — a greenlit tool is not a greenlit catalogue. Platforms ship
    // models continuously and an organisation that reviewed Sonnet has reviewed
    // nothing about whatever shipped last week, so a model carries its own
    // status. `aliases` exist because the extension reads a UI label ("Sonnet
    // 5") rather than an API id. A model not listed here is UNKNOWN, never
    // unapproved — see modelStatus().
    //
    // `blockOn` — the detection types this tool may not receive **at all**, even
    // masked. This is what makes "which data may go to which class of tool" a
    // rule rather than a sentence: a code assistant has no business receiving
    // customer IC numbers however well they are masked. It can only ever tighten
    // the org's mode, never loosen it.
    orgTools: [
      {
        name: 'AI Assistant', vendor: 'Internal', model: 'AI Passport Assistant',
        dataScope: 'Internal · non-personal', status: 'APPROVED',
        hosts: [], url: null, blockOn: [],
      },
      {
        name: 'ChatGPT', vendor: 'OpenAI', model: 'GPT-5.6 Terra',
        dataScope: 'Internal · non-personal', status: 'APPROVED',
        hosts: ['chatgpt.com', 'chat.openai.com'], url: 'https://chatgpt.com', blockOn: [],
        // The GPT-5.6 family: Sol (highest capability), Terra (the balanced
        // default) and Luna (fastest, cheapest). The org has cleared the two
        // everyday tiers; Sol is the one still in review.
        models: [
          { id: 'gpt-5.6-terra', label: 'GPT-5.6 Terra', aliases: ['gpt-5.6 terra', 'terra', 'auto'], status: 'APPROVED' },
          { id: 'gpt-5.6-luna', label: 'GPT-5.6 Luna', aliases: ['gpt-5.6 luna', 'luna'], status: 'APPROVED' },
          { id: 'gpt-5.6-sol', label: 'GPT-5.6 Sol', aliases: ['gpt-5.6 sol', 'sol'], status: 'UNAPPROVED' },
        ],
      },
      {
        name: 'Claude', vendor: 'Anthropic', model: 'Claude Sonnet 5',
        dataScope: 'Internal · non-personal', status: 'APPROVED',
        hosts: ['claude.ai'], url: 'https://claude.ai', blockOn: [],
        // The case-study scenario: the platform is approved, one model on it is
        // not. Fable 5 was previously registered as a *tool* whose vendor was
        // "Claude", which is the tool/model conflation this list removes.
        models: [
          { id: 'claude-sonnet-5', label: 'Claude Sonnet 5', aliases: ['sonnet 5', 'sonnet'], status: 'APPROVED' },
          { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', aliases: ['haiku 4.5', 'haiku'], status: 'APPROVED' },
          {
            id: 'claude-fable-5', label: 'Claude Fable 5', aliases: ['fable 5', 'fable'],
            status: 'UNAPPROVED', flag: 'Security team flagged a breach',
          },
        ],
      },
      {
        name: 'Gemini', vendor: 'Google', model: 'Gemini 3.6 Flash',
        dataScope: 'Internal · non-personal', status: 'APPROVED',
        hosts: ['gemini.google.com'], url: 'https://gemini.google.com', blockOn: [],
        models: [
          { id: 'gemini-3-6-flash', label: 'Gemini 3.6 Flash', aliases: ['3.6 flash', 'flash'], status: 'APPROVED' },
          { id: 'gemini-3-5-flash-lite', label: 'Gemini 3.5 Flash-Lite', aliases: ['flash-lite', 'lite'], status: 'APPROVED' },
          { id: 'gemini-3-5-pro', label: 'Gemini 3.5 Pro', aliases: ['3.5 pro', 'pro'], status: 'UNAPPROVED' },
        ],
      },
      {
        // GitHub's coding assistant is "GitHub Copilot" — this entry used to
        // read "CodePilot Pro · Copilot Labs", which is not a product that
        // exists and read as a typo for the real one. levelBenefit(3) already
        // named GitHub Copilot, so the register was the odd one out.
        name: 'GitHub Copilot', vendor: 'GitHub', model: 'GPT-5.3-Codex',
        dataScope: 'Source code · internal repos', status: 'APPROVED', minLevel: 3,
        hosts: [], url: null,
        // Cleared for source code, never for customer identity. Masked is not
        // good enough here: the tool has no business holding the shape of a
        // customer record at all.
        blockOn: ['IC', 'PASSPORT', 'CARD', 'CUSTOMER_RECORD'],
      },
      // Real tools nobody has put through a review. The extension recognises
      // these hosts, so opening one is a demonstrable unapproved-tool event.
      {
        name: 'DeepSeek', vendor: 'DeepSeek', model: 'DeepSeek-V4',
        dataScope: 'Not reviewed', status: 'UNAPPROVED',
        hosts: ['deepseek.com'], url: 'https://deepseek.com',
      },
      {
        name: 'Kimi', vendor: 'Moonshot AI', model: 'Kimi K3',
        dataScope: 'Not reviewed', status: 'UNAPPROVED',
        hosts: ['kimi.com', 'moonshot.cn'], url: 'https://kimi.com',
      },
      // Requested but still in review — a visa in flight is not an approval.
      { name: 'SummarizerX', vendor: 'Summarize Inc.', model: 'Vendor model', dataScope: 'Meeting notes', status: 'UNAPPROVED' },
      { name: 'MeetingMind', vendor: 'MeetingMind', model: 'MeetingMind Pro v2', dataScope: 'Voice + text · no customer data', status: 'UNAPPROVED' },
      { name: 'TranslateAI', vendor: 'TranslateAI', model: 'TranslateAI v4', dataScope: 'Marketing copy · no personal data', status: 'UNAPPROVED' },
    ],

    // Rolling window behind the repeated-identifier rule: { employeeId, type, at }.
    // In-memory by design — it is a live signal about the last few minutes, not
    // a record. The audit log is where the events themselves are kept.
    riskWindow: [],

    // Every notification carries the employee it belongs to — /api/notifications
    // only ever returns the signed-in employee's own.
    notifications: [
      {
        id: 'n-visa', employeeId: DEFAULT_EMPLOYEE_ID, category: 'TOOL ACCESS', time: 'Today · 08:15', received: 'Received 17 Jul 2026 · 08:15',
        title: 'SummarizerX moved to compliance review',
        body: 'Request A-0492 passed security review. Compliance checks are now in progress.',
        what: 'Your tool access request for SummarizerX cleared the security review stage. The compliance team is now checking vendor terms and data handling before a final decision.',
        facts: [['Request', 'A-0492'], ['Tool', 'SummarizerX'], ['Stage', 'Compliance review'], ['Submitted', '15 Jul 2026'], ['Expected decision', 'Within 2 working days']],
        action: { label: 'View AI tools', to: '/tools' },
        read: false, deleted: false,
      },
      {
        id: 'n-milestone', employeeId: DEFAULT_EMPLOYEE_ID, category: 'MILESTONE', time: 'Yesterday · 17:45', received: 'Received 16 Jul 2026 · 17:45',
        title: '21-day safe prompt streak',
        body: 'No unsafe prompts were sent for 21 consecutive days. Your license remains in good standing.',
        what: 'Every prompt you sent in the last 21 days passed the Smart Gateway with no unsafe content. Streaks like this keep your AI License in good standing.',
        facts: [['Streak', '21 days'], ['Unsafe prompts', '0'], ['License standing', 'Good'], ['Started', '26 Jun 2026'], ['Reward', '+50 safety points']],
        action: { label: 'View my license', to: '/license' },
        read: false, deleted: false,
      },
      {
        id: 'n-gateway', employeeId: DEFAULT_EMPLOYEE_ID, category: 'SMART GATEWAY', time: '16 Jul 2026 · 15:42', received: 'Received 16 Jul 2026 · 15:42',
        title: '2 sensitive items were masked',
        body: 'A name and IC number were removed before your prompt was sent to Gemini.',
        what: 'The Smart Gateway detected a personal name and an IC number in your prompt. Both were replaced with masked tokens before the prompt left your browser.',
        facts: [['Items masked', 'Name, IC number'], ['AI tool', 'Gemini'], ['Stored version', 'Masked only'], ['Action needed', 'None'], ['Reward', 'Protected · no points change']],
        read: false, deleted: false,
      },
    ],

    // Who is signed in right now. Set by /api/auth/login, cleared by
    // /api/auth/logout. Deliberately not persisted: a restart signs you out.
    session: null,

    settings: {
      mode: 'Mask and continue', // 'Mask and continue' | 'Warn only' | 'Block'
      controls: {
        personalIdentifiers: true, // IC, passport, phone, email + Layer 2 names
        customerRecords: true,     // card numbers
        financialFigures: true,    // RM/USD amounts
        sourceCode: false,         // credentials/secrets
      },
      experience: { explainMask: true, showSafeVersion: true, awardPoints: true },
      escalate: true,
      policyVersion: 11,
    },
  }

  // `db.profile` always means "the employee this request is about". Defining it
  // as a getter keeps every existing caller working while making the store
  // multi-employee: none of the XP, quiz or stamp code below has to know that
  // more than one passport exists.
  Object.defineProperty(state, 'profile', {
    enumerable: false,
    get() {
      return (state.employees[state.sessionEmployeeId] ??= blankProfile(state.sessionEmployeeId))
    },
  })

  return state
}

function auditSeed(id, time, user, dept, tool, action, control, record, extra = {}) {
  return {
    id, time, user, dept, tool, action, control, record,
    at: null, role: 'Employee', resource: tool, status: 'SUCCESS', risk: 'LOW', ...extra,
  }
}

export let db = seed()

// ---- persistence -----------------------------------------------------------
// Only the progression slice is written to disk: it is the part an employee
// earns and must never lose to a refresh, a re-login, a different device or a
// server restart. The training library and its assignment records are written
// with it — an admin publishing a module and assigning it is a decision, not
// demo scenery, and it has to survive a restart the same way XP does.

const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data')
const DATA_FILE = path.join(DATA_DIR, 'progress.json')

const PROFILE_FIELDS = [
  'activityXP', 'level', 'trainingProgress', 'completedModules', 'moduleCompletions',
  'trainingCompleted', 'stamps', 'streakDays', 'promptsProtected', 'itemsMasked',
  'overrides', 'quiz', 'quizAttempt', 'name', 'initials', 'dept', 'licenseNo',
]

function snapshot() {
  const employees = {}
  for (const [id, p] of Object.entries(db.employees)) {
    employees[id] = Object.fromEntries(PROFILE_FIELDS.map(f => [f, p[f]]))
  }
  return {
    version: 2,
    employees,
    trainingLibrary: db.trainingLibrary,
    assignments: db.assignments,
    nextModuleId: db.nextModuleId,
    notifications: db.notifications,
  }
}

function save() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true })
    fs.writeFileSync(DATA_FILE, JSON.stringify(snapshot(), null, 2))
  } catch (err) {
    console.warn('Could not persist progression:', err.message)
  }
}

// Notifications written before "visa" was retired are already on disk, so they
// are brought up to the current vocabulary as they are read back. Only the
// category, the action label and its link change — the record of what happened
// is left exactly as it was written.
function migrateNotification(n) {
  if (!n || typeof n !== 'object') return n
  const migrated = n.category === 'VISA UPDATE' ? { ...n, category: 'TOOL ACCESS' } : { ...n }
  if (migrated.action?.to === '/visas') {
    migrated.action = {
      ...migrated.action,
      to: '/tools',
      label: /visa/i.test(migrated.action.label || '') ? 'View AI tools' : migrated.action.label,
    }
  }
  return migrated
}

function load() {
  try {
    if (!fs.existsSync(DATA_FILE)) return
    const saved = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))

    if (saved.version === 2) {
      for (const [id, fields] of Object.entries(saved.employees || {})) {
        Object.assign((db.employees[id] ??= blankProfile(id)), fields)
      }
      if (Array.isArray(saved.trainingLibrary) && saved.trainingLibrary.length) db.trainingLibrary = saved.trainingLibrary
      if (Array.isArray(saved.assignments)) db.assignments = saved.assignments
      if (Array.isArray(saved.notifications)) db.notifications = saved.notifications.map(migrateNotification)
      db.nextModuleId = Math.max(
        Number(saved.nextModuleId) || 0,
        db.trainingLibrary.reduce((max, m) => Math.max(max, Number(m.id) || 0), 0) + 1
      )
      return
    }

    // v1 — one flat profile plus a shared quiz map. Read it into the demo
    // employee so nobody's XP is lost to the upgrade.
    const { quiz, quizAttempt, ...profileFields } = saved
    const demo = db.employees[DEFAULT_EMPLOYEE_ID]
    Object.assign(demo, profileFields)
    if (quiz) demo.quiz = quiz
    if (quizAttempt) demo.quizAttempt = quizAttempt
  } catch (err) {
    console.warn('Could not read saved progression, using seed:', err.message)
  }
}

export function resetStore() {
  db = seed()
  try {
    fs.rmSync(DATA_FILE, { force: true })
  } catch {
    /* nothing persisted yet */
  }
  syncProgression()
}

// ---- sessions --------------------------------------------------------------

/** Points the store at one employee for the requests that follow. */
export function setSessionEmployee(id) {
  const known = employeeById(id) ? id : DEFAULT_EMPLOYEE_ID
  db.sessionEmployeeId = known
  db.employees[known] ??= blankProfile(known)
  syncProgression()
  return db.profile
}

/** The employee a request is about — the session's, never a client-supplied id. */
export function currentEmployeeId() {
  return db.session?.role === 'admin' ? null : db.sessionEmployeeId
}

// ---- XP + level progression (single source of truth) -----------------------

/** XP contributed by training — the sum of the BEST result per unique module. */
export function trainingXP(profile = db.profile) {
  return Object.values(profile.trainingProgress || {}).reduce((sum, r) => sum + (r.pointsEarned || 0), 0)
}

// ---- AI Safety Score -------------------------------------------------------
// The employee mirror of the admin risk score, and the one number on the licence
// card that used to be a constant: every passport rendered 80 · Excellent
// because the server never sent this field at all and the browser fell back to a
// literal. It is derived here so it moves with the records it claims to
// describe, and so the employee and the admin are reading the same arithmetic.
//
// Only facts the store actually holds go into it:
//   • baseline 60 — a new employee has done nothing unsafe, so they do not start
//     "At risk"; they start with no record either way.
//   • safe streak, up to +20 — profile.streakDays, reset to 0 by an override.
//   • assigned training completed, up to +20 — the share of the modules they
//     actually have, not of the whole library, so training assigned to somebody
//     else never counts against them. Training assigned to THEM and not yet
//     done does: outstanding mandatory training is a real compliance signal,
//     and it is the part of the score they can close themselves.
//   • −20 per override — the one case where protected data demonstrably left the
//     organisation (recordOverride), which is what the card already tells them.
const SAFETY_BASE = 60
const SAFETY_STREAK_TARGET = 21
const SAFETY_OVERRIDE_PENALTY = 20

export function safetyFor(profile = db.profile) {
  const streak = Math.max(0, Number(profile.streakDays) || 0)
  const streakPoints = Math.round(Math.min(1, streak / SAFETY_STREAK_TARGET) * 20)

  const assigned = modulesForEmployee(profile.id)
  const completed = assigned.filter(m => (profile.completedModules || []).includes(m.id)).length
  const trainingPoints = assigned.length ? Math.round((completed / assigned.length) * 20) : 0

  const penalty = (Math.max(0, Number(profile.overrides) || 0)) * SAFETY_OVERRIDE_PENALTY
  const score = Math.max(0, Math.min(100, SAFETY_BASE + streakPoints + trainingPoints - penalty))

  const grade = score >= 80 ? 'Excellent' : score >= 60 ? 'Good' : score >= 40 ? 'Fair' : 'At risk'
  return {
    score,
    grade,
    streakDays: streak,
    overrides: Math.max(0, Number(profile.overrides) || 0),
    modulesCompleted: completed,
    modulesAssigned: assigned.length,
  }
}

/**
 * The employee profile as the API serves it: the stored record plus the fields
 * that are derived rather than kept. Everything employee-facing reads this, so a
 * derived number cannot be correct on one screen and invented on another.
 */
export function publicProfile(profile = db.profile) {
  return { ...profile, safety: safetyFor(profile) }
}

// Recomputes totalXP from its parts and stamps the derived level fields onto
// the profile. Called after every change that can move XP — nothing else is
// allowed to set profile.points or profile.level by hand.
function syncProgression(profile = db.profile) {
  const p = profile
  p.activityXP = Math.max(0, Math.round(p.activityXP || 0))
  const state = levelFor(p.activityXP + trainingXP(p), p.level)

  p.points = state.totalXP // back-compat alias — existing UI reads profile.points
  p.xp = state.totalXP
  p.trainingXP = trainingXP(p)
  p.level = state.level
  p.levelName = state.levelName
  p.target = state.nextLevelXP // "points / target" is now the current band's ceiling
  p.currentLevelXP = state.currentLevelXP
  p.nextLevelXP = state.nextLevelXP
  p.nextLevelName = state.nextLevelName
  p.xpToNext = state.xpToNext
  p.progressPercentage = state.progressPercentage
  p.learningPercentage = state.learningPercentage
  p.isMaxLevel = state.isMaxLevel
  p.isMaxXP = state.isMaxXP
  p.maxXP = MAX_XP
  return state
}

function announceLevelUp(state) {
  addNotification({
    category: 'MILESTONE',
    title: `Level ${state.level} · ${state.levelName} reached`,
    body: `You reached ${state.currentLevelXP.toLocaleString()} safety points. ${LEVEL_BENEFITS[state.level]} is now unlocked.`,
    what: `Your safe-AI progress earned Level ${state.level} · ${state.levelName}. Safety points come from completed training and safe day-to-day AI use; repeating a module you have already passed does not add more.`,
    facts: [
      ['New level', `Level ${state.level} · ${state.levelName}`],
      ['Unlocked', LEVEL_BENEFITS[state.level]],
      ['Total points', `${state.totalXP.toLocaleString()} points`],
      ['Next level', state.isMaxLevel ? 'Maximum level reached' : `${state.nextLevelName} at ${state.nextLevelXP.toLocaleString()} points`],
      ['Next step', 'Open My AI License to see the new class'],
    ],
    action: { label: 'View my license', to: '/license' },
  })
}

// Runs `mutate`, re-derives the level, and reports whether a threshold was
// crossed. Every XP change in the app goes through here, so the level-up
// notification fires exactly once per threshold.
function applyProgression(mutate) {
  const before = db.profile.level
  mutate()
  const state = syncProgression()
  const levelUp = state.level > before
    ? { from: before, to: state.level, levelName: state.levelName, totalXP: state.totalXP }
    : null
  if (levelUp) announceLevelUp(state)
  save()
  return { state, levelUp }
}

// Adjusts non-training XP (safe prompts, penalties). Levels are sticky, so a
// penalty slows the climb but never demotes. Returns true on a level-up.
export function applyPoints(delta) {
  const { levelUp } = applyProgression(() => {
    db.profile.activityXP = Math.max(0, db.profile.activityXP + delta)
  })
  return Boolean(levelUp)
}

load()
for (const p of Object.values(db.employees)) syncProgression(p)

// ---- audit log -------------------------------------------------------------
// One append-only feed for everything that has to be explainable later: the
// gateway's own decisions, and the governance actions an admin takes. An
// action that changes who can do what, or what an employee is asked to learn,
// is recorded the same way a masked prompt is.

const CONTROL_TAGS = {
  IC: 'PDPA P7', PASSPORT: 'PDPA P7', PHONE: 'PDPA P7', EMAIL: 'PDPA P7', NAME: 'PDPA P7',
  CARD: 'PDPA P7', FINANCIAL: 'NIST PR.DS', CREDENTIAL: 'NIST PR.DS',
}

const AUDIT_LIMIT = 200

function nowTime() {
  return new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function todayDate() {
  return new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

// A strictly increasing ISO timestamp.
//
// "The training you were last working on" is answered by sorting these stamps,
// and Date.now() has millisecond resolution — two answers submitted in the same
// millisecond produced identical strings, so the sort fell back to library order
// and named the wrong module as current. Rare by hand, routine under a fast
// client or a test.
//
// Never more than a few milliseconds ahead of the wall clock in practice, since
// it only advances when two events genuinely land in the same tick.
let lastStampMs = 0
function stampNow() {
  lastStampMs = Math.max(Date.now(), lastStampMs + 1)
  return new Date(lastStampMs).toISOString()
}

/**
 * Records one auditable event.
 *
 * `time` is when it happened, `recordedAt` when the log received it — the two
 * differ only for an event masked on-device during a gateway outage, and
 * keeping both is what lets an auditor read the gap correctly. The list stays
 * in arrival order because an append-only log records when it received an
 * event, not when the event claims to have happened.
 */
export function recordAudit({
  action, record, actor, dept, role = 'Employee', tool = 'AI Assistant', resource,
  control = 'NIST GV.4', status = 'SUCCESS', risk = 'LOW', time, offline = false, countsAsPrompt = false,
}) {
  const text = String(record ?? '')
  const event = {
    id: `EV-${db.counters.nextEventNo++}`,
    time: time || nowTime(),
    at: new Date().toISOString(),
    user: actor || db.profile.id,
    dept: dept || db.profile.dept,
    role,
    tool,
    resource: resource || tool,
    action,
    control,
    status,
    risk,
    record: text.length > 72 ? `${text.slice(0, 69)}…` : text,
  }
  if (offline) {
    event.offline = true
    event.recordedAt = nowTime()
  }
  db.auditEvents.unshift(event)
  db.auditEvents = db.auditEvents.slice(0, AUDIT_LIMIT)
  if (countsAsPrompt) db.counters.promptsToday += 1
  return event
}

// The admin identity behind a governance action. One place, so every audit
// entry an admin produces names the same actor.
export const ADMIN_ACTOR = { id: 'AD-001', role: 'Admin · Compliance role', dept: 'Governance' }

function adminAudit({ action, record, resource, control = 'AIGE 4.2', status = 'SUCCESS', risk = 'LOW' }) {
  return recordAudit({
    action, record, resource, control, status, risk,
    actor: ADMIN_ACTOR.id, dept: ADMIN_ACTOR.dept, role: 'Admin', tool: resource || 'AI Passport',
  })
}

/** Sign-in / sign-out are governance events: who had access, and when. */
export function recordSession(kind, user) {
  return recordAudit({
    action: kind === 'in' ? 'SIGN-IN' : 'SIGN-OUT',
    record: `${user.role === 'admin' ? 'Administrator' : 'Employee'} ${user.id} ${kind === 'in' ? 'signed in' : 'signed out'}`,
    actor: user.id,
    dept: user.role === 'admin' ? ADMIN_ACTOR.dept : db.profile.dept,
    role: user.role === 'admin' ? 'Admin' : 'Employee',
    tool: 'AI Passport',
    resource: 'AI Passport console',
    control: 'NIST PR.AC',
  })
}

const ACTIVITY_LIMIT = 50

/**
 * One employee's own slice of the audit log — what "My AI Activity" shows them.
 *
 * The filtering happens here rather than in the browser on purpose: /api/audit
 * is the whole organisation's feed, and a page that shows an employee their own
 * history must never be sent anybody else's events to filter out afterwards.
 * Same records, same order, same masked-only text as the admin log.
 */
export function activityFor(employeeId, limit = ACTIVITY_LIMIT) {
  return db.auditEvents.filter(e => e.user === employeeId).slice(0, limit)
}

// ---- risk alerts -----------------------------------------------------------
// The rules live in risk.js; this is the plumbing that fires them. Two
// properties matter throughout:
//
//   • An alert is raised for a *pattern*, never for a single protected prompt.
//     The gateway masking something is the system working, and an alert for it
//     would be noise that teaches an admin to ignore the queue.
//   • A pattern that continues escalates the alert it already has. It never
//     opens a second one — a queue with the same finding in it five times is
//     the same failure as no queue at all.

const SEVERITY_RANK = { MONITORING: 1, MEDIUM: 2, HIGH: 3 }

/**
 * Creates an alert, or escalates the open one that already covers this finding.
 * `key` is what makes the two the same finding — employee + rule + subject.
 */
function raiseAlert({ key, severity, employeeId, dept, title, meta, detailMeta, what, evidence, evidenceNote, recommend, primary, kind, occurrences }) {
  const existing = key ? db.alerts.find(a => a.key === key && a.status === 'open') : null

  if (existing) {
    // A rule that counts its own evidence (three IC numbers in a window) states
    // the count; one that does not (a tool opened again) just increments. The
    // number on the card always means the same thing as the number in the
    // alert's own text.
    existing.occurrences = occurrences ?? (existing.occurrences || 1) + 1
    const escalated = SEVERITY_RANK[severity] > SEVERITY_RANK[existing.severity]
    if (escalated) {
      existing.severity = severity
      // A more serious finding gets the shorter deadline that goes with it.
      existing.dueAt = dueAtFor(severity)
    }
    existing.meta = meta
    existing.what = what
    existing.evidence = evidence
    existing.updatedAt = new Date().toISOString()
    existing.timeline.push([
      nowTime(),
      escalated
        ? `Escalated to ${severity} · ${existing.occurrences} occurrences`
        : `Recurred · ${existing.occurrences} occurrences`,
    ])
    return { alert: existing, escalated, isNew: false }
  }

  const alert = {
    id: `RA-${db.counters.nextAlertNo++}`,
    key: key || null,
    severity,
    status: 'open',
    employeeId: employeeId || null,
    occurrences: occurrences ?? 1,
    title, meta, detailMeta, what, evidence, evidenceNote, recommend, primary,
    ...(kind ? { kind } : {}),
    createdAt: new Date().toISOString(),
    dueAt: dueAtFor(severity),
    timeline: [[nowTime(), 'Alert created']],
  }
  db.alerts.unshift(alert)
  return { alert, escalated: false, isNew: true }
}

/** Adds the live `due` countdown without storing a label that goes stale. */
function decorateAlert(alert) {
  return alert.dueAt ? { ...alert, due: dueLabel(alert.dueAt) } : alert
}

/**
 * Rule 1 — repeated identifiers.
 *
 * Every masked identifier joins a 15-minute rolling window. Three of the same
 * kind from one employee is a habit worth a conversation; five is worth a
 * manager's attention, and escalates the alert that already exists rather than
 * adding another.
 */
function noteMaskedIdentifiers(detections) {
  const employeeId = db.profile.id
  const at = Date.now()
  for (const d of detections) {
    for (let i = 0; i < d.count; i++) db.riskWindow.push({ employeeId, type: d.type, at })
  }
  db.riskWindow = pruneRepeats(db.riskWindow, at)

  const verdict = repeatVerdict(repeatCounts(db.riskWindow, employeeId))
  if (!verdict) return null

  const label = identifierLabel(verdict.type)
  const dept = db.profile.dept
  const { alert, isNew, escalated } = raiseAlert({
    key: `repeat:${employeeId}:${verdict.type}`,
    severity: verdict.severity,
    employeeId,
    dept,
    // The rule counts the evidence itself, so the card shows how many times the
    // identifier was masked — the same figure its own text quotes.
    occurrences: verdict.count,
    title: 'Repeated identifiers in prompts',
    meta: `${departmentName(dept)} · User ${employeeId} · ${verdict.count} events in ${REPEAT_WINDOW_MINUTES} min`,
    detailMeta: `${departmentName(dept)} · User ${employeeId} · detected today at ${nowTime()}`,
    what: `${verdict.count} prompts from this employee contained a ${label} within ${REPEAT_WINDOW_MINUTES} minutes. The gateway masked every instance before transmission — nothing left the organisation — but the pattern suggests personal data is being pasted in as a matter of habit.`,
    evidence: `${verdict.count} × ${label} masked · ${REPEAT_WINDOW_MINUTES}-minute window`,
    evidenceNote: 'Layer 1 pattern match · masked records only, no raw prompt stored',
    recommend: verdict.count >= REPEAT_ESCALATE_AT
      ? 'Assign the Data Privacy refresher and ask the manager to check in.'
      : 'Assign the 5-minute Data Privacy refresher.',
    primary: 'Assign training',
  })

  if (isNew || escalated) {
    recordAudit({
      action: 'ALERT',
      resource: alert.id,
      tool: 'AI Passport',
      record: `${isNew ? 'Risk alert raised' : 'Risk alert escalated'} · repeated ${label} × ${verdict.count}`,
      control: 'PDPA P7',
      status: 'FLAGGED',
      risk: verdict.severity,
    })
    // The employee is told before their manager acts on it — "guide, don't
    // punish" only holds if the guidance reaches them first.
    addNotification({
      category: 'SMART GATEWAY',
      title: 'A pattern was spotted in your prompts',
      body: `A ${label} has been masked ${verdict.count} times in the last ${REPEAT_WINDOW_MINUTES} minutes. Nothing was exposed — a short refresher will help.`,
      what: `The Smart Gateway protected every one of these prompts, so no personal data left your browser. It flagged the pattern because removing identifiers before you paste is faster than having them masked each time.`,
      facts: [
        ['Identifier', label],
        ['Times masked', String(verdict.count)],
        ['Window', `${REPEAT_WINDOW_MINUTES} minutes`],
        ['Data exposed', 'None — every instance was masked'],
        ['Suggested', 'Spotting Personal Data in Prompts'],
      ],
      action: { label: 'Open training', to: '/training' },
    })
  }
  return alert
}

/** The register's record for a tool, by name. */
export function registerEntry(name) {
  const key = String(name || '').trim().toLowerCase()
  return db.orgTools.find(t => t.name.toLowerCase() === key) || null
}

/** APPROVED · UNAPPROVED · SUSPENDED — the register's word on a tool. */
export function toolStatus(name) {
  return registerEntry(name)?.status || 'UNAPPROVED'
}

export function toolRegister() {
  return db.orgTools
}

/** The register record for whichever host the browser is on, or null. */
export function toolForHost(hostname) {
  const host = String(hostname || '').trim().toLowerCase()
  if (!host) return null
  return db.orgTools.find(t =>
    (t.hosts || []).some(h => host === h || host.endsWith(`.${h}`))
  ) || null
}

// ---- model-level policy ------------------------------------------------------
// A tool being approved says nothing about every model on it. These resolve the
// second level, and they are deliberately forgiving in one direction: a model
// the register does not list is UNKNOWN, never UNAPPROVED. The extension reads a
// label out of somebody else's UI, and platforms rename models constantly —
// blocking on "we could not identify this" would punish the employee for the
// register being a week out of date.

const normaliseModel = s => String(s || '').trim().toLowerCase().replace(/[_\s]+/g, ' ')

export function modelsFor(toolName) {
  return registerEntry(toolName)?.models || []
}

/** The model record a UI label refers to, or null when nothing matches. */
export function matchModel(toolName, label) {
  const observed = normaliseModel(label)
  if (!observed) return null
  const models = modelsFor(toolName)

  // Longest candidate first, across every model on the tool: "gpt-5.1-mini"
  // must win over "gpt-5.1" when both would match the same label.
  const candidates = models.flatMap(m =>
    [m.id, m.label, ...(m.aliases || [])].map(a => ({ model: m, alias: normaliseModel(a) }))
  ).filter(c => c.alias).sort((a, b) => b.alias.length - a.alias.length)

  return candidates.find(c => observed.includes(c.alias) || c.alias.includes(observed))?.model || null
}

/** APPROVED · UNAPPROVED · SUSPENDED · UNKNOWN for one model on one tool. */
export function modelStatus(toolName, label) {
  if (modelsFor(toolName).length === 0) return 'UNKNOWN' // no model policy on this tool
  return matchModel(toolName, label)?.status || 'UNKNOWN'
}

/** The models an employee may use on this tool — what a block panel offers. */
export function approvedModels(toolName) {
  return modelsFor(toolName).filter(m => m.status === 'APPROVED').map(m => m.label)
}

// ---- per-employee tool access ------------------------------------------------
//
// The register is organisation-wide, but "approved" is a question about a person:
// a Level-3 tool is not approved for a Trainee, and a request this employee had
// declined is not reopened by the tool being on somebody else's list. That fold
// used to happen in the browser (frontend Visas.jsx), which meant the gateway
// and the employee's own AI Tools page could — and did — hold different opinions
// about the same tool. It happens here now, and both read the result.
//
// The vocabulary is the one the AI Tools page already renders:
//   active · locked · review · declined · suspended · unreviewed

const REFUSED_VISA = ['DECLINED', 'REDIRECTED']
const PENDING_VISA = ['SECURITY REVIEW', 'COMPLIANCE']

export function toolAccessFor(employeeId, toolName) {
  const entry = registerEntry(toolName)
  const name = entry?.name || String(toolName || '').trim()
  const profile = db.employees[employeeId]
  const level = profile?.level || 0
  const registered = entry?.status || 'UNAPPROVED'

  const request = db.visaRequests.find(
    r => String(r.tool).toLowerCase() === name.toLowerCase() && r.requester === employeeId
  ) || null

  const needsLevel = Boolean(entry?.minLevel) && level < entry.minLevel

  // Same precedence the AI Tools page applies: a suspension beats everything,
  // and an approval is an approval however the employee got there.
  const access = registered === 'SUSPENDED' ? 'suspended'
    : registered === 'APPROVED' ? (needsLevel ? 'locked' : 'active')
    : request && PENDING_VISA.includes(request.status) ? 'review'
    : request && REFUSED_VISA.includes(request.status) ? 'declined'
    : 'unreviewed'

  const explain = {
    active: `${name} is approved for you.`,
    locked: `${name} is approved for the organisation but needs AI License Level ${entry?.minLevel}. You are Level ${level}.`,
    review: `Your request for ${name} is still with IT and Compliance.`,
    declined: `Your request for ${name} was not approved.`,
    suspended: `${name} was suspended organisation-wide after a security concern.`,
    unreviewed: `${name} has not been through security and compliance review, so there are no agreed terms covering what it does with company data.`,
  }[access]

  return {
    tool: name,
    entry,
    status: registered,
    access,
    approved: access === 'active',
    explain,
    minLevel: entry?.minLevel || null,
    level,
    blockOn: entry?.blockOn || [],
    request,
  }
}

/**
 * Approved tools this employee could use instead, newest-friendly first.
 * Only tools with a URL are offered: an alternative nobody can open is not an
 * alternative. Admin-set URLs only — see the register comment.
 */
export function alternativesFor(employeeId, toolName) {
  const exclude = String(toolName || '').toLowerCase()
  return db.orgTools
    .filter(t => t.url && t.name.toLowerCase() !== exclude)
    .filter(t => toolAccessFor(employeeId, t.name).approved)
    .map(t => ({ name: t.name, url: t.url, model: t.model, dataScope: t.dataScope }))
}

/**
 * The whole gateway verdict for one prompt: which mode really applies, why, and
 * what to offer instead. One call so the extension, the web Gateway and the
 * audit log cannot reach three different answers.
 */
export function gatewayPolicyFor({ employeeId, tool, model, types = [] }) {
  const access = toolAccessFor(employeeId, tool)
  const status = model ? modelStatus(access.tool, model) : 'UNKNOWN'
  const verdict = effectiveMode({
    orgMode: db.settings.mode,
    access: access.access,
    modelStatus: status,
    blockOn: access.blockOn,
    types,
  })

  return {
    tool: access.tool,
    access: access.access,
    approved: access.approved,
    toolStatus: access.status,
    explain: access.explain,
    minLevel: access.minLevel,
    level: access.level,
    model: model ? { name: model, status, approved: status === 'APPROVED' || status === 'UNKNOWN' } : null,
    approvedModels: approvedModels(access.tool),
    blockOn: access.blockOn,
    // The human sentence behind blockOn, so a refusal can say what the tool *is*
    // cleared for rather than only what it is not.
    dataScope: access.entry?.dataScope || null,
    orgMode: db.settings.mode,
    mode: verdict.mode,
    reason: verdict.reason,
    refused: verdict.refused,
    tightened: verdict.mode !== db.settings.mode,
    alternatives: alternativesFor(employeeId, access.tool),
  }
}

/**
 * Rule 2 — an AI tool nobody approved.
 *
 * Called when an employee reaches a tool: by the Chrome extension as it arms
 * the checkpoint on a page, and by the web Gateway when a tool is selected.
 * Approved tools return quietly; anything else is one alert per employee + tool
 * per hour, so a working session produces a finding rather than a queue.
 */
export function recordToolUse({ tool }) {
  const name = String(tool || '').trim()
  if (!name) return { ok: false, reason: 'no_tool' }

  const employeeId = db.profile.id
  const dept = db.profile.dept
  const resolved = toolAccessFor(employeeId, name)
  const status = resolved.status

  // Approved *for this employee* is the only quiet answer. A tool the
  // organisation cleared but this employee's licence does not reach is not the
  // same finding as an unreviewed vendor — nothing unknown is receiving data —
  // but it is still someone working outside what they are cleared for, and it
  // used to pass silently because approval was only ever asked org-wide.
  if (resolved.access === 'active') return { ok: true, status, access: resolved.access, alert: null }

  if (resolved.access === 'locked') {
    const { alert, isNew, escalated } = raiseAlert({
      key: `level:${employeeId}:${name.toLowerCase()}:${Math.floor(Date.now() / (TOOL_REPEAT_WINDOW_MINUTES * 60_000))}`,
      severity: SEVERITY.MEDIUM,
      employeeId,
      dept,
      title: 'Tool used above licence level',
      meta: `${departmentName(dept)} · ${name} · needs Level ${resolved.minLevel}`,
      detailMeta: `${departmentName(dept)} · User ${employeeId} · detected today at ${nowTime()}`,
      what: `${name} is approved for the organisation but requires AI License Level ${resolved.minLevel}, and this employee is Level ${resolved.level}. The tool itself has been reviewed, so this is a training gap rather than a vendor risk.`,
      evidence: `${name} opened at Level ${resolved.level} · Level ${resolved.minLevel} required`,
      evidenceNote: 'Licence level check · no prompt content recorded',
      recommend: 'Assign the training that raises this employee to the required level.',
      primary: 'Assign training',
    })
    if (isNew || escalated) {
      recordAudit({
        action: 'RESTRICTED', resource: name, tool: name,
        record: `Tool above licence level · ${name} · Level ${resolved.minLevel} required · alert ${alert.id}`,
        control: 'AIGE 4.2', status: 'FLAGGED', risk: SEVERITY.MEDIUM,
      })
      addNotification({
        category: 'TOOL ACCESS',
        title: `${name} needs AI License Level ${resolved.minLevel}`,
        body: `${name} is approved here, but it sits above your current level. Sensitive prompts will not be sent there until you reach Level ${resolved.minLevel}.`,
        what: `${name} has been reviewed and cleared for the organisation, but it handles data that needs a higher AI License level than you hold. Finishing your assigned training is what raises it.`,
        facts: [
          ['Tool', name],
          ['Required level', `Level ${resolved.minLevel}`],
          ['Your level', `Level ${resolved.level}`],
          ['Your prompts', 'Protected — sensitive content is held back'],
          ['Next step', 'Complete your assigned training'],
        ],
        action: { label: 'Open my training', to: '/training' },
      })
    }
    return { ok: true, status, access: resolved.access, alert, isNew }
  }

  const severity = TOOL_SEVERITY[status] || SEVERITY.MEDIUM
  const suspended = status === 'SUSPENDED'

  // One finding per employee + tool for the window. A fresh key each hour is
  // what lets tomorrow's use raise a new alert instead of silently joining a
  // resolved one.
  const bucket = Math.floor(Date.now() / (TOOL_REPEAT_WINDOW_MINUTES * 60_000))
  const { alert, isNew, escalated } = raiseAlert({
    key: `tool:${employeeId}:${name.toLowerCase()}:${bucket}`,
    severity,
    employeeId,
    dept,
    title: suspended ? 'Suspended tool used' : 'Unapproved tool detected',
    meta: `${departmentName(dept)} · ${name} · ${suspended ? 'suspended org-wide' : 'no approved access'}`,
    detailMeta: `${departmentName(dept)} · User ${employeeId} · detected today at ${nowTime()}`,
    what: suspended
      ? `${name} was suspended organisation-wide after a vendor security concern, and an employee opened it anyway. Prompts sent there are outside the organisation's review.`
      : `An employee opened ${name}, which has no approved access. The Smart Gateway still protected their prompts, but a tool nobody has reviewed has no agreed terms for what it does with company data.`,
    evidence: `${name} opened · gateway protection ${suspended ? 'active' : 'active'} · no data confirmed sent`,
    evidenceNote: 'Tool register check · no prompt content recorded',
    recommend: suspended
      ? 'Contact the employee and confirm the suspension was understood.'
      : `Review the ${name} tool access request, or point the employee at an approved alternative.`,
    primary: suspended ? 'Acknowledge' : 'Review tool request',
  })

  if (isNew || escalated) {
    recordAudit({
      action: suspended ? 'SUSPENDED' : 'UNAPPROVED',
      resource: name,
      tool: name,
      record: `${suspended ? 'Suspended' : 'Unapproved'} tool opened · ${name} · alert ${alert.id}`,
      control: 'AIGE 4.2',
      status: 'FLAGGED',
      risk: severity,
    })
    addNotification({
      category: 'TOOL ACCESS',
      title: suspended ? `${name} is suspended` : `${name} is not an approved tool`,
      body: suspended
        ? `${name} was withdrawn organisation-wide. Please stop using it and switch to an approved tool.`
        : `${name} is not approved for you yet. Your prompts are still protected, but request tool access before putting company data in it.`,
      what: suspended
        ? `An administrator suspended ${name} for the whole organisation. Anything you send there is outside the organisation's review.`
        : `${name} has not been through security and compliance review, so there are no agreed terms covering what it does with company data. Requesting tool access is the way to get it reviewed.`,
      facts: [
        ['Tool', name],
        ['Status', status],
        ['Your prompts', 'Still protected by the Smart Gateway'],
        ['Next step', suspended ? 'Switch to an approved tool' : 'Request tool access from AI Tools'],
        ['Recorded', `Audit log · alert ${alert.id}`],
      ],
      action: { label: 'Open AI Tools', to: '/tools' },
    })
  }
  return { ok: true, status, access: resolved.access, alert, isNew }
}

/**
 * Rule 2b — an unreviewed model on a reviewed tool.
 *
 * The website is greenlit; the model the employee picked is not. Same shape as
 * recordToolUse, and the same restraint: a model the register cannot identify
 * raises nothing at all, because that is the register being out of date rather
 * than the employee doing anything.
 */
export function recordModelUse({ tool, model }) {
  const toolName = String(tool || '').trim()
  const label = String(model || '').trim()
  if (!toolName || !label) return { ok: false, reason: 'no_model' }

  const entry = registerEntry(toolName)
  const matched = matchModel(toolName, label)
  const status = modelStatus(toolName, label)
  if (status === 'APPROVED' || status === 'UNKNOWN') {
    return { ok: true, status, alert: null }
  }

  const name = matched?.label || label
  const employeeId = db.profile.id
  const dept = db.profile.dept
  const severity = MODEL_SEVERITY[status] || SEVERITY.MEDIUM
  const suspended = status === 'SUSPENDED'
  const cleared = approvedModels(toolName)

  const bucket = Math.floor(Date.now() / (MODEL_REPEAT_WINDOW_MINUTES * 60_000))
  const { alert, isNew, escalated } = raiseAlert({
    key: `model:${employeeId}:${toolName.toLowerCase()}:${name.toLowerCase()}:${bucket}`,
    severity,
    employeeId,
    dept,
    title: suspended ? 'Suspended model used' : 'Unapproved model detected',
    meta: `${departmentName(dept)} · ${entry?.name || toolName} · ${name}`,
    detailMeta: `${departmentName(dept)} · User ${employeeId} · detected today at ${nowTime()}`,
    what: `${entry?.name || toolName} is an approved tool, but the employee selected ${name}, which has not been reviewed${matched?.flag ? ` — ${matched.flag.toLowerCase()}` : ''}. The gateway held sensitive content back, so nothing protected reached it.`,
    evidence: `${name} selected on ${entry?.name || toolName} · sensitive prompts refused`,
    evidenceNote: 'Model check · no prompt content recorded',
    recommend: cleared.length
      ? `Point the employee at ${cleared.join(' or ')} on the same tool.`
      : `Review whether ${name} should be added to the approved model list.`,
    primary: 'Review tool request',
  })

  if (isNew || escalated) {
    recordAudit({
      action: suspended ? 'SUSPENDED' : 'UNAPPROVED',
      resource: `${entry?.name || toolName} · ${name}`,
      tool: entry?.name || toolName,
      record: `${suspended ? 'Suspended' : 'Unapproved'} model selected · ${name} on ${entry?.name || toolName} · alert ${alert.id}`,
      control: 'AIGE 4.2',
      status: 'FLAGGED',
      risk: severity,
    })
    addNotification({
      category: 'TOOL ACCESS',
      title: `${name} is not an approved model`,
      body: cleared.length
        ? `${entry?.name || toolName} is approved, but ${name} is not. Switch to ${cleared.join(' or ')} — sensitive prompts will not be sent to ${name}.`
        : `${entry?.name || toolName} is approved, but ${name} has not been reviewed. Sensitive prompts will not be sent to it.`,
      what: `Approving a tool is not the same as approving every model on it. ${name} has not been through review, so there are no agreed terms for what it does with company data. You can keep using ${entry?.name || toolName} on an approved model.`,
      facts: [
        ['Tool', entry?.name || toolName],
        ['Model selected', name],
        ['Approved models', cleared.length ? cleared.join(', ') : 'None listed yet'],
        ['Your prompts', 'Protected — sensitive content is held back'],
        ['Recorded', `Audit log · alert ${alert.id}`],
      ],
      action: { label: 'Open AI Tools', to: '/tools' },
    })
  }
  return { ok: true, status, alert, isNew }
}

// `offline` + `time` describe an event that was masked on the employee's device
// while the gateway was down and is only now reaching the log. Such an event is
// recorded and counted like any other — the audit log has to be complete — but
// `award` is false for it: XP is a reward for behaviour the gateway actually
// witnessed, and back-dating points for events it never saw live is precisely
// what an auditor would pull on.
export function recordPromptEvent({ detections, masked, tool = 'AI Assistant', time, offline = false, award = true }) {
  const total = detections.reduce((n, d) => n + d.count, 0)
  const clean = total === 0
  const event = recordAudit({
    action: clean ? 'CLEAN' : 'MASKED',
    record: masked,
    tool,
    resource: tool,
    control: clean ? 'NIST GV.4' : CONTROL_TAGS[detections[0].type] || 'NIST PR.DS',
    risk: clean ? 'LOW' : 'MEDIUM',
    time, offline, countsAsPrompt: true,
  })

  db.report.promptsProtected += 1
  if (offline) db.report.recoveredEvents += 1

  let levelUp = false
  if (clean) {
    // Clean prompts earn a small reward; masked prompts are protected but earn
    // nothing, so sensitive prompts can't be farmed for points.
    if (award && db.settings.experience.awardPoints) levelUp = applyPoints(2)
  } else {
    db.counters.maskedToday += total
    db.report.itemsMasked += total
    db.profile.promptsProtected += 1
    db.profile.itemsMasked += total
    save()
    // A live event feeds the repeated-identifier window. A recovered one does
    // not: it is minutes or hours old, so counting it as "just now" would let a
    // gateway outage manufacture a pattern that never happened in real time.
    if (!offline) noteMaskedIdentifiers(detections)
    const types = detections.map(d => `${d.type.toLowerCase()} ×${d.count}`).join(', ')
    // An offline event was already explained on-device by the checkpoint the
    // employee confirmed. Notifying again when it reaches the log would be the
    // same masking reported twice.
    if (!offline) {
      addNotification({
        category: 'SMART GATEWAY',
        title: `${total} sensitive item${total === 1 ? '' : 's'} ${total === 1 ? 'was' : 'were'} masked`,
        body: `Detected: ${types}. Only the masked version was stored in the audit log.`,
        what: 'The Smart Gateway detected sensitive content in your prompt and replaced it with masked tokens before it left your browser. The audit log stores only the masked version.',
        facts: [
          ['Items masked', detections.map(d => d.type).join(', ')],
          ['AI tool', tool],
          ['Stored version', 'Masked only'],
          ['Action needed', 'None'],
          ['Points', 'Protected · no points change'],
        ],
      })
    }
  }
  return { event, levelUp }
}

// One offline event coming back from the extension's queue. The caller has
// already re-run detection on it, so this is only the recording half.
// Returns false when the id has been seen before — a flush that is retried
// after a timeout must not count the same prompt twice.
export function recordOfflineEvent({ id, detections, masked, tool, at }) {
  if (!id || db.backfilled.has(id)) return false
  db.backfilled.add(id)
  const when = at ? new Date(at) : null
  const time = when && !Number.isNaN(when.getTime())
    ? when.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : nowTime()
  recordPromptEvent({ detections, masked, tool, time, offline: true, award: false })
  return true
}

// Overriding the checkpoint (Warn-only mode, "Send original anyway"):
// -20 points, streak reset, High alert for the admin, ALERT audit event.
export function recordOverride({ prompt }) {
  db.profile.streakDays = 0
  // Counted on the employee's own record, not only in the admin queue: it is
  // what the AI Safety Score on their licence deducts for (safetyFor()).
  db.profile.overrides = (db.profile.overrides || 0) + 1
  applyPoints(-20)
  const event = recordAudit({
    action: 'ALERT', record: prompt, control: 'PDPA P7', status: 'FLAGGED', risk: 'HIGH', countsAsPrompt: true,
  })
  // The gateway found sensitive content and the employee sent the original
  // anyway: that is sensitive data confirmed to have left the organisation, so
  // it is what "Confirmed data leaks" on the compliance report counts, and the
  // one rule that is HIGH on its first occurrence.
  db.report.confirmedLeaks += 1
  raiseAlert({
    key: `override:${db.profile.id}`,
    severity: OVERRIDE_SEVERITY,
    employeeId: db.profile.id,
    dept: db.profile.dept,
    title: 'Protected prompt overridden',
    meta: `${departmentName(db.profile.dept)} · ${db.profile.id} · sensitive data sent unmasked`,
    detailMeta: `${departmentName(db.profile.dept)} · User ${db.profile.id} · detected today at ${nowTime()}`,
    what: 'An employee used Warn-only mode to send the original prompt after the gateway flagged sensitive content. This is the one case where protected data demonstrably left the organisation. 20 points were deducted and the safe streak was reset.',
    evidence: event.record,
    evidenceNote: 'Original sent by employee choice · flagged for review',
    recommend: 'Assign the 5-minute Data Privacy refresher and confirm the prompt was recalled where possible.',
    primary: 'Assign training',
  })
  addNotification({
    category: 'SMART GATEWAY',
    title: 'Original prompt sent — points deducted',
    body: 'You chose to send the original prompt. -20 safety points and your safe streak was reset.',
    what: 'The gateway flagged sensitive content but Warn-only mode let you send the original. This event was logged for review; sending the protected version instead avoids penalties.',
    facts: [
      ['Points', '-20'],
      ['Safe streak', 'Reset to 0 days'],
      ['Logged as', 'ALERT · visible to admin'],
      ['Better option', 'Send the protected version'],
      ['Policy', 'Warn only'],
    ],
  })
  return { event, profile: db.profile }
}

// ---- notifications ---------------------------------------------------------

/**
 * Adds one notification to an employee's inbox.
 *
 * `action` is the quick action rendered on it ({ label, to }) — the shortest
 * path from being told about something to doing it. `key` makes the write
 * idempotent: an assignment that is re-confirmed, or a page that remounts, can
 * never produce a second copy of the same notification.
 */
export function addNotification({ category, title, body, what, facts, action, key, employeeId }) {
  const owner = employeeId || db.profile.id
  if (key && db.notifications.some(n => n.employeeId === owner && n.key === key)) return null

  const stamp = new Date()
  const clock = stamp.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  const n = {
    id: `n-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    employeeId: owner,
    key: key || null,
    category,
    time: `Today · ${clock}`,
    received: `Received ${todayDate()} · ${clock}`,
    title, body, what, facts,
    action: action || null,
    read: false, deleted: false,
  }
  db.notifications.unshift(n)
  save()
  return n
}

/** One employee's inbox — never anyone else's. */
export function notificationsFor(employeeId) {
  return db.notifications.filter(n => n.employeeId === employeeId)
}

/** Read/delete/restore, scoped so an id from another inbox does nothing. */
export function updateNotification(employeeId, id, patch) {
  const n = db.notifications.find(x => x.id === id && x.employeeId === employeeId)
  if (!n) return null
  Object.assign(n, patch)
  save()
  return n
}

// ---- training library ------------------------------------------------------

export function moduleById(id) {
  return db.trainingLibrary.find(m => m.id === Number(id)) || null
}

/** The record the UI renders: questions as a count, plus live assignee total. */
export function publicModule(module, { withQuestions = false } = {}) {
  if (!module) return null
  const { questions, ...rest } = module
  return {
    ...rest,
    questionCount: questions.length,
    assignedTotal: (module.assigned || 0) + assignedEmployeeIds(module.id).size,
    // Completions, counted the same way as assignees: the standing rollout
    // figure plus the employees who have actually finished it in this system.
    // `module.done` is a COUNT in the seed, and the admin list was rendering it
    // with a "%" after it — 78 completions on a 303-person rollout was being
    // shown as "78% done".
    doneTotal: (module.done || 0) + completedEmployeeIds(module.id).size,
    maxQuestions: MAX_QUESTIONS,
    ...(withQuestions ? { questions } : {}),
  }
}

/** Employees whose own progress record marks this module completed. */
function completedEmployeeIds(moduleId) {
  const id = Number(moduleId)
  const ids = new Set()
  for (const [employeeId, p] of Object.entries(db.employees)) {
    if (p.trainingProgress?.[id]?.completed) ids.add(employeeId)
  }
  return ids
}

/** Every module, with its questions — the admin's view of the library. */
export function libraryForAdmin() {
  return db.trainingLibrary.map(m => publicModule(m, { withQuestions: true }))
}

export function createModule({ title, subtitle, points, minutes, questions = [] }) {
  const clean = String(title || '').trim()
  if (!clean) return { ok: false, error: 'Give the module a title before creating it.' }
  const parsed = normaliseQuestions(questions)
  if (parsed.error) return { ok: false, error: parsed.error }
  if (parsed.questions.length === 0) return { ok: false, error: 'Add at least one question before creating the module.' }

  const record = {
    id: db.nextModuleId++,
    title: clean,
    subtitle: String(subtitle || '').trim() || 'Created by your administrator for your team.',
    points: Number(points) || 0,
    minutes: Number(minutes) || 0,
    // Published immediately so it can be assigned from the same screen, but it
    // reaches nobody until it is: created modules are 'assigned' audience.
    status: 'live',
    audience: 'assigned',
    builtin: false,
    assigned: 0,
    done: 0,
    questions: parsed.questions,
    createdAt: new Date().toISOString(),
  }
  db.trainingLibrary.push(record)
  save()
  adminAudit({
    action: 'CREATED',
    resource: record.title,
    record: `Training module created · ${parsed.questions.length} question${parsed.questions.length === 1 ? '' : 's'} · ${record.points} XP`,
  })
  return { ok: true, module: publicModule(record, { withQuestions: true }) }
}

/**
 * Saves an edit to an existing module. The admin's question editor holds its
 * changes locally until Confirm, so this is called once with the finished set
 * rather than after every keystroke — a half-edited question never reaches an
 * employee's assessment.
 */
export function updateModule(id, { title, subtitle, points, minutes, questions }) {
  const module = moduleById(id)
  if (!module) return { ok: false, error: 'That training module no longer exists.' }

  let questionChange = null
  if (questions !== undefined) {
    const parsed = normaliseQuestions(questions)
    if (parsed.error) return { ok: false, error: parsed.error }
    questionChange = { from: module.questions.length, to: parsed.questions.length }
    module.questions = parsed.questions
  }
  if (title !== undefined && String(title).trim()) module.title = String(title).trim()
  if (subtitle !== undefined && String(subtitle).trim()) module.subtitle = String(subtitle).trim()
  if (points !== undefined && Number(points) >= 0) module.points = Number(points)
  if (minutes !== undefined && Number(minutes) >= 0) module.minutes = Number(minutes)
  module.updatedAt = new Date().toISOString()
  save()

  adminAudit({
    action: 'UPDATED',
    resource: module.title,
    record: questionChange
      ? `Questions saved · ${questionChange.to} question${questionChange.to === 1 ? '' : 's'} (was ${questionChange.from})`
      : 'Module details updated',
  })
  return { ok: true, module: publicModule(module, { withQuestions: true }) }
}

/** Publish ('live') or hide ('draft'). Hidden modules leave the employee's list
 *  immediately; their assignment records are left untouched, so publishing
 *  again restores exactly who had it. */
export function setModuleStatus(id, status) {
  const module = moduleById(id)
  if (!module) return { ok: false, error: 'That training module no longer exists.' }
  const next = status === 'live' ? 'live' : 'draft'
  if (module.status === next) return { ok: true, module: publicModule(module, { withQuestions: true }) }
  module.status = next
  module.updatedAt = new Date().toISOString()
  save()
  adminAudit({
    action: next === 'live' ? 'PUBLISHED' : 'HIDDEN',
    resource: module.title,
    record: next === 'live'
      ? `Module published · visible to ${assignedEmployeeIds(module.id).size} assigned employee(s)`
      : 'Module hidden from employees · assignment records kept',
    risk: next === 'live' ? 'LOW' : 'MEDIUM',
  })
  return { ok: true, module: publicModule(module, { withQuestions: true }) }
}

/** Point value of a module — read from the library, so an admin's edit to a
 *  module's XP is the XP an employee can earn from it. */
export function modulePoints(moduleId) {
  return moduleById(moduleId)?.points ?? 150
}

function questionCount(moduleId) {
  return moduleById(moduleId)?.questions.length || 0
}

// ---- assignments -----------------------------------------------------------

export function assignedEmployeeIds(moduleId) {
  const id = Number(moduleId)
  const ids = new Set()
  for (const r of db.assignments) {
    if (r.moduleId === id) r.employeeIds.forEach(e => ids.add(e))
  }
  return ids
}

/** The module ids one employee has been assigned, personally or by department. */
export function assignedModuleIds(employeeId) {
  const ids = new Set()
  if (!employeeId) return ids
  for (const r of db.assignments) {
    if (r.employeeIds.includes(employeeId)) ids.add(r.moduleId)
  }
  return ids
}

/**
 * One employee's state on one module, assembled from the two records that hold
 * it: the answers of the attempt in progress (profile.quiz) and the settled
 * progression record (profile.trainingProgress).
 *
 * This travels with the module so the training screens can order and label by
 * real state. They previously could not: the module list carried no per-module
 * progress at all, so "current training" was decided by library order and the
 * dashboard had to fetch /quiz/results separately for the one module it had
 * already guessed at.
 *
 * A retry clears the answers but keeps the record, so a module being redone
 * reads completed: true with attempted: 0 — which is what stops a redo being
 * mistaken for unfinished work.
 */
export function moduleProgressFor(profile, moduleId) {
  const id = Number(moduleId)
  const answers = profile?.quiz?.[id] || {}
  const record = profile?.trainingProgress?.[id] || null
  const attempted = Object.keys(answers).length
  const completed = Boolean(record?.completed) || (profile?.completedModules || []).includes(id)

  // ISO-8601 sorts lexically, so the latest stamp is the last one.
  const stamps = [
    ...Object.values(answers).map(a => a?.at),
    record?.lastAttemptAt,
  ].filter(Boolean).sort()

  return {
    attempted,
    completed,
    // Started and not settled — the attempt the employee is in the middle of.
    // A completed module is never "in progress", even while being redone.
    inProgress: attempted > 0 && !completed,
    started: attempted > 0 || completed,
    attempts: record?.attempts || 0,
    pointsEarned: record?.pointsEarned || 0,
    bestScorePct: record?.bestScorePct || 0,
    lastActivityAt: stamps.length ? stamps[stamps.length - 1] : null,
  }
}

/**
 * The modules one employee actually has: published, and either part of the
 * standing curriculum or assigned to them personally or through their
 * department. Nobody sees a module that was assigned to somebody else.
 *
 * Each carries this employee's own progress on it, so the training screens
 * order and label from the server's records rather than from library order.
 */
export function modulesForEmployee(employeeId) {
  const assigned = assignedModuleIds(employeeId)
  const profile = db.employees[employeeId] || null
  return db.trainingLibrary
    .filter(m => m.status === 'live' && (m.audience === 'everyone' || assigned.has(m.id)))
    .map(m => ({
      ...publicModule(m),
      assignedToMe: assigned.has(m.id),
      progress: moduleProgressFor(profile, m.id),
    }))
}

/**
 * The access check. Everything employee-facing that names a module id goes
 * through here, so a module can only be opened by someone it actually reaches —
 * whether they got to it from their training list, a notification, or by typing
 * the URL.
 */
export function canAccessModule(employeeId, moduleId) {
  const module = moduleById(moduleId)
  if (!module) return { ok: false, reason: 'not_found' }
  if (module.status !== 'live') return { ok: false, reason: 'not_published', module }
  if (module.audience === 'everyone') return { ok: true, module }
  if (assignedModuleIds(employeeId).has(module.id)) return { ok: true, module }
  return { ok: false, reason: 'not_assigned', module }
}

/** Who a selection targets, split into newly-assigned and already-assigned. */
export function resolveRecipients({ moduleId, type, department, employeeIds = [] }) {
  const targeted = type === 'department'
    ? employeesInDepartment(department).map(e => e.id)
    // Only ids the directory actually has — a request naming an unknown
    // employee assigns nothing rather than creating a record for a ghost.
    : [...new Set(employeeIds)].filter(id => employeeById(id))
  const already = assignedEmployeeIds(moduleId)
  return {
    targeted,
    duplicates: targeted.filter(id => already.has(id)),
    fresh: targeted.filter(id => !already.has(id)),
  }
}

/**
 * Assigns a module and tells the people who got it.
 *
 * One record per confirmed assignment, holding only the employees who did not
 * already have the module — so re-assigning the same training writes no
 * duplicate record, and the notification is keyed by module + employee, so it
 * cannot arrive twice either.
 */
export function assignTraining({ moduleId, type, department, employeeIds = [] }) {
  const module = moduleById(moduleId)
  const issue = moduleIssue(module)
  if (issue) return { ok: false, error: issue }
  if (type === 'department' && !isDepartment(department)) {
    return { ok: false, error: 'Pick a department from the list.' }
  }

  const { targeted, duplicates, fresh } = resolveRecipients({ moduleId: module.id, type, department, employeeIds })
  if (targeted.length === 0) {
    return {
      ok: false,
      error: type === 'department'
        ? `${departmentName(department)} has no employees, so there is nobody to assign this training to.`
        : 'Select at least one employee.',
    }
  }
  if (fresh.length === 0) {
    return { ok: false, error: 'Everyone selected already has this training — nothing new to assign.', duplicates: duplicates.length }
  }

  const record = {
    id: `AS-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
    moduleId: module.id,
    moduleTitle: module.title,
    type: type === 'department' ? 'department' : 'employee',
    department: type === 'department' ? department : null,
    employeeIds: fresh,
    assignedAt: new Date().toISOString(),
    assignedBy: ADMIN_ACTOR.id,
  }
  db.assignments.push(record)

  for (const id of fresh) notifyAssignment(module, id, record)

  save()
  adminAudit({
    action: 'ASSIGNED',
    resource: module.title,
    record: `Assigned to ${type === 'department' ? `${departmentName(department)} department` : `${fresh.length} employee(s)`} · ${fresh.join(', ')}`,
    control: 'EU AI Act 4',
  })

  return { ok: true, record, assigned: fresh.length, duplicates: duplicates.length, targeted: targeted.length }
}

// The employee half of an assignment: an inbox entry that says what arrived and
// opens it in one click. Keyed by module + employee, so navigating away and
// back, or a re-confirmed assignment, never produces a second copy.
function notifyAssignment(module, employeeId, record) {
  addNotification({
    employeeId,
    key: `assign:${module.id}`,
    category: 'TRAINING',
    title: 'New training assigned to you',
    body: `${module.title} is now on your training list · ${module.questions.length} question${module.questions.length === 1 ? '' : 's'} · +${module.points} XP.`,
    what: `Your administrator assigned ${module.title} to ${record.type === 'department' ? `the ${departmentName(record.department)} department` : 'you'}. It is available now from your Training page, and completing it adds its stamp to your AI Passport.`,
    facts: [
      ['Module', module.title],
      ['Assigned', 'Just now'],
      ['Learning time', `${module.minutes} minutes`],
      ['Assessment', `${module.questions.length} question${module.questions.length === 1 ? '' : 's'}`],
      ['Reward', `+${module.points} XP`],
    ],
    action: { label: 'Start training', to: `/training/quiz/${module.id}` },
  })
}

export function assignmentRecords() {
  return [...db.assignments].sort((a, b) => b.assignedAt.localeCompare(a.assignedAt))
}

/** One employee's assignment records — what they were given and when. */
export function assignmentsForEmployee(employeeId) {
  return assignmentRecords().filter(r => r.employeeIds.includes(employeeId))
}

// ---- quiz + per-module training progress -----------------------------------
// Answering a question does not move XP on its own. XP is awarded once, when
// the whole assessment is evaluated (completeTraining), and only as the module's
// own point value scaled by the score — so an attempt is worth what the module
// is worth, never a multiple of it.

// Stamp identity. The three built-in modules keep the wording their passport
// stamps already use; anything an admin creates gets a stamp derived from its
// title, so a new module still earns a real stamp rather than a blank one.
const BUILTIN_STAMPS = {
  1: { stamp: 'PERSONAL DATA', color: '#078b6c', shape: 'circle' },
  2: { stamp: 'TOOL SELECTION', color: '#078b6c', shape: 'square' },
  3: { stamp: 'HUMAN REVIEW', color: '#d92d20', shape: 'circle' },
}

function stampFor(module) {
  if (BUILTIN_STAMPS[module?.id]) return BUILTIN_STAMPS[module.id]
  const words = String(module?.title || 'Training').replace(/[^\w\s]/g, ' ').split(/\s+/).filter(Boolean)
  return { stamp: words.slice(0, 2).join(' ').toUpperCase() || 'TRAINING', color: '#365fd9', shape: 'circle' }
}

// What the completion notification points at next: the employee's next
// outstanding module, read from the same library they are looking at.
function nextModuleLabel(employeeId, justCompleted) {
  const next = modulesForEmployee(employeeId)
    .find(m => m.id !== justCompleted && !db.profile.completedModules.includes(m.id))
  return next ? `${next.title} · ${next.minutes} min` : 'More modules coming soon'
}

// The one authoritative progression record per employee + module. Created lazily
// so a module the employee has never opened carries no record at all.
function progressRecord(moduleId) {
  const store = (db.profile.trainingProgress ??= {})
  const module = moduleById(moduleId)
  return (store[moduleId] ??= {
    moduleId: Number(moduleId),
    title: module?.title || `Module ${moduleId}`,
    modulePoints: modulePoints(moduleId),
    completed: false,
    attempts: 0,
    bestCorrect: 0,
    total: questionCount(moduleId) || 3,
    bestScorePct: 0,
    pointsEarned: 0, // BEST result ever — this is what counts toward total XP
    lastAttemptPoints: 0,
    lastXpGained: 0,
    lastOutcome: null, // 'first' | 'improved' | 'unchanged'
    settledAttempt: 0,
    firstCompletedAt: null,
    lastAttemptAt: null,
  })
}

// `selected` is the option index the employee actually chose (null for the
// write-your-own practice question). Recorded alongside the verdict because the
// answer is final and the quiz page has to be able to put the employee back
// exactly where they were after a refresh — knowing only that Q2 was wrong is
// not enough to redraw Q2, and re-asking it would show feedback for an answer
// that is not the one being scored.
export function answerQuiz(moduleId, question, correct, selected) {
  const bucket = ((db.profile.quiz ??= {})[moduleId] ??= {})
  if (bucket[question] === undefined) {
    // `at` is what makes "the training you were last working on" answerable.
    // Without it the only ordering available was the library's own, so the
    // Training dashboard always called module 1 "current" even when the
    // employee had been part-way through module 3.
    bucket[question] = {
      correct,
      selected: Number.isInteger(selected) ? selected : null,
      // Monotonic: two answers in the same millisecond must still order.
      at: stampNow(),
    }
    save()
  }
  return quizResults(moduleId)
}

// The whole assessment is answered before it is evaluated, and a retry is only
// offered on the results screen — locked for 24h from that evaluation.
//
// Single switch: set RETRY_LOCK_ENABLED to false to go back to unlimited
// retries. /api/quiz/retry then always succeeds and retryLocked is never true.
// (The matching frontend switch is RETRY_LOCK_ENABLED in
// frontend/src/lib/retryLock.js — turn off both.)
export const RETRY_LOCK_ENABLED = true
export const RETRY_LOCK_HOURS = 24
export const RETRY_LOCK_MS = RETRY_LOCK_HOURS * 60 * 60 * 1000

function retryState(moduleId) {
  const completedAt = db.profile.moduleCompletions[moduleId] || null
  if (!completedAt || !RETRY_LOCK_ENABLED) return { completedAt, retryAvailableAt: null, retryLocked: false }
  const availableAt = new Date(completedAt).getTime() + RETRY_LOCK_MS
  return {
    completedAt,
    retryAvailableAt: new Date(availableAt).toISOString(),
    retryLocked: Date.now() < availableAt,
  }
}

export function quizResults(moduleId) {
  const answers = db.profile.quiz?.[moduleId] || {}
  const attempted = Object.keys(answers).length
  const correct = Object.values(answers).filter(a => a.correct).length
  // The assessment is as long as the module actually is — a module an admin
  // gave 6 questions is scored out of 6, not out of a constant.
  const total = questionCount(moduleId) || 3
  const record = db.profile.trainingProgress?.[moduleId] || null
  return {
    answers,
    attempted,
    correct,
    total,
    // What the CURRENT attempt is worth: the module's own points scaled by the
    // score. Whether any of it is actually added to the total is decided by
    // completeTraining (best result wins).
    pointsEarned: attemptPoints(moduleId, correct, total),
    module: record,
    progression: levelFor(db.profile.points, db.profile.level),
    ...retryState(moduleId),
    profile: db.profile,
  }
}

// An attempt is worth the module's point value scaled by the score — 3/3 on a
// 150-point module is 150, 2/3 is 100. It is never a per-question bonus that
// could be re-earned by answering the same question again after a retry.
function attemptPoints(moduleId, correct, total) {
  if (!total) return 0
  return Math.round(modulePoints(moduleId) * (correct / total))
}

// Starts a fresh attempt from Q1 — allowed only once the 24h lock has expired.
// The progress record (best score, earned XP) survives: a retry can only raise
// it, so the answers being wiped never costs the employee XP.
export function retryTraining(moduleId) {
  const state = retryState(moduleId)
  if (state.retryLocked) return { ok: false, ...state }
  ;(db.profile.quiz ??= {})[moduleId] = {}
  db.profile.quizAttempt[moduleId] = (db.profile.quizAttempt[moduleId] ?? 1) + 1
  delete db.profile.moduleCompletions[moduleId]
  save()
  return { ok: true, ...quizResults(moduleId) }
}

// Evaluates the whole assessment and settles this module's XP contribution.
//
// Anti-farm rule (§3): the module's contribution to total XP is
//   pointsEarned = MAX(previous pointsEarned, this attempt's points)
// so total XP only ever moves by the improvement. Redoing a module you already
// aced adds nothing; redoing it worse takes nothing away.
export function completeTraining(moduleId) {
  const module = moduleById(moduleId)
  const meta = stampFor(module)
  const title = module?.title || `Module ${moduleId}`
  const results = quizResults(moduleId)
  const record = progressRecord(moduleId)
  const attempt = db.profile.quizAttempt[moduleId] ?? 1
  const earnedNow = attemptPoints(moduleId, results.correct, results.total)

  // Same attempt submitted twice (double-click, replayed request, refresh of a
  // POST): this attempt was already settled, so return the stored outcome
  // without touching XP, attempt count or the 24h lock.
  if (record.settledAttempt === attempt) {
    return { ...quizResults(moduleId), award: awardOf(record, meta, title, moduleId), levelUp: null, duplicate: true }
  }

  const previousPoints = record.pointsEarned
  const firstCompletion = !record.completed
  const scorePct = Math.round((results.correct / results.total) * 100)

  const { levelUp } = applyProgression(() => {
    record.completed = true
    record.attempts += 1
    record.settledAttempt = attempt
    record.total = results.total
    record.title = title
    record.modulePoints = modulePoints(moduleId)
    record.lastAttemptPoints = earnedNow
    record.lastScorePct = scorePct
    record.bestCorrect = Math.max(record.bestCorrect, results.correct)
    record.bestScorePct = Math.max(record.bestScorePct, scorePct)
    // The whole anti-farm rule, in one line.
    record.pointsEarned = Math.max(previousPoints, earnedNow)
    record.lastXpGained = record.pointsEarned - previousPoints
    record.lastOutcome = firstCompletion ? 'first' : record.lastXpGained > 0 ? 'improved' : 'unchanged'
    // Same monotonic stamp as the answers it is sorted against.
    record.lastAttemptAt = stampNow()
    record.firstCompletedAt ??= record.lastAttemptAt
    // Every evaluation (first pass or a later retry) restarts the 24h lock.
    db.profile.moduleCompletions[moduleId] = record.lastAttemptAt
  })

  // Completing an assigned module is what closes the governance loop the
  // assignment opened, so it is recorded next to it in the same audit log.
  recordAudit({
    action: 'COMPLETED',
    resource: title,
    tool: 'AI Passport',
    record: `${title} · ${results.correct}/${results.total} correct · ${record.pointsEarned} XP held`,
    control: 'EU AI Act 4',
  })

  if (firstCompletion) {
    if (!db.profile.completedModules.includes(Number(moduleId))) db.profile.completedModules.push(Number(moduleId))
    if (Number(moduleId) === 1) db.profile.trainingCompleted = true
    db.profile.stamps.push({
      title: meta.stamp,
      moduleId: Number(moduleId),
      score: `PASSED · ${record.bestScorePct}%`,
      date: todayDate().toUpperCase(),
      shape: meta.shape,
      color: meta.color,
    })
    addNotification({
      category: 'TRAINING',
      title: 'Training stamp earned',
      body: `${title} completed · ${results.correct}/${results.total} correct · +${record.lastXpGained} XP.`,
      what: `You completed ${title} and the ${meta.stamp} stamp was added to your AI Passport. XP is awarded once per module — retaking it later can only raise this module's contribution, never add a second reward.`,
      facts: [
        ['Module', title],
        ['Score', `${results.correct}/${results.total} · ${scorePct}%`],
        ['Stamp', meta.stamp],
        ['XP earned', `+${record.lastXpGained} XP`],
        ['Next module', nextModuleLabel(db.profile.id, Number(moduleId))],
      ],
      action: { label: 'View my license', to: '/license' },
    })
  } else {
    // Re-evaluated after a retry — refresh this module's own stamp instead of
    // pushing a second one. The stamp always shows the BEST result.
    const stamp = db.profile.stamps.find(s => s.title === meta.stamp)
    if (stamp) {
      stamp.score = `PASSED · ${record.bestScorePct}%`
      if (record.lastXpGained > 0) stamp.date = todayDate().toUpperCase()
    }
    if (record.lastXpGained > 0) {
      addNotification({
        category: 'TRAINING',
        title: `${title} improved`,
        body: `New best ${scorePct}% · +${record.lastXpGained} XP added for the improvement.`,
        what: `You retook ${title} and beat your previous result. Only the improvement is added — this module's contribution is now ${record.pointsEarned} XP, not ${previousPoints} + ${earnedNow}.`,
        facts: [
          ['Module', title],
          ['Previous best', `${previousPoints} XP`],
          ['New best', `${record.pointsEarned} XP`],
          ['XP added', `+${record.lastXpGained} XP`],
          ['Attempts', String(record.attempts)],
        ],
        action: { label: 'View my license', to: '/license' },
      })
    }
  }

  save()
  return { ...quizResults(moduleId), award: awardOf(record, meta, title, moduleId), levelUp }
}

// The completion summary the results screen renders — also rebuilt from the
// stored record on a later visit, so a refresh shows the same numbers.
function awardOf(record, meta, title, moduleId) {
  return {
    moduleId: record.moduleId,
    title,
    modulePoints: record.modulePoints,
    attemptPoints: record.lastAttemptPoints,
    previousPoints: record.pointsEarned - record.lastXpGained,
    pointsEarned: record.pointsEarned,
    xpGained: record.lastXpGained,
    outcome: record.lastOutcome,
    attempts: record.attempts,
    bestScorePct: record.bestScorePct,
    lastScorePct: record.lastScorePct,
    stamp: meta.stamp,
    nextModule: nextModuleLabel(db.profile.id, Number(moduleId)),
  }
}

// Everything the admin needs about one employee's progression — levels and XP
// derived from the same records the employee sees, with the attempt count shown
// alongside so repeated attempts are visible but never inflate the XP.
export function progressionSummary(profile = db.profile) {
  const p = profile
  return {
    id: p.id,
    name: p.name,
    dept: p.dept,
    level: p.level,
    levelName: p.levelName,
    totalXP: p.points,
    trainingXP: trainingXP(p),
    activityXP: p.activityXP,
    currentLevelXP: p.currentLevelXP,
    nextLevelXP: p.nextLevelXP,
    nextLevelName: p.nextLevelName,
    xpToNext: p.xpToNext,
    progressPercentage: p.progressPercentage,
    isMaxLevel: p.isMaxLevel,
    isMaxXP: p.isMaxXP,
    assignedModules: modulesForEmployee(p.id).length,
    modulesCompleted: Object.values(p.trainingProgress || {}).filter(r => r.completed).length,
    modules: Object.values(p.trainingProgress || {}).map(r => ({
      moduleId: r.moduleId,
      title: r.title,
      completed: r.completed,
      attempts: r.attempts,
      bestScorePct: r.bestScorePct,
      modulePoints: r.modulePoints,
      pointsEarned: r.pointsEarned, // best result only — never attempts × reward
      lastAttemptAt: r.lastAttemptAt,
    })),
  }
}

/** Every employee who has a live record — what the admin directory overlays. */
export function allProgressionSummaries() {
  return Object.values(db.employees).map(progressionSummary)
}

// ---- risk alerts ----

export function openAlerts() {
  return db.alerts.filter(a => a.status === 'open')
}

/**
 * The alert queue as the admin screens read it: newest first, most severe
 * first, and with the `due` countdown computed now rather than when the alert
 * was written.
 */
export function alertsView() {
  return [...db.alerts]
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === 'open' ? -1 : 1
      const rank = (SEVERITY_RANK[b.severity] || 0) - (SEVERITY_RANK[a.severity] || 0)
      return rank || String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
    })
    .map(decorateAlert)
}

export function resolveAlert(id) {
  const a = db.alerts.find(x => x.id === id)
  if (a && a.status !== 'resolved') {
    a.status = 'resolved'
    a.resolvedAt = new Date().toISOString()
    a.timeline?.push([nowTime(), 'Resolved by Admin · Compliance role'])
    // Closing a human-review case is a completed human review (O5). Counted
    // here rather than derived on read so a later re-open cannot un-complete a
    // review that demonstrably happened.
    if (a.kind === 'human-review') db.report.humanReviewsCompleted += 1
    adminAudit({
      action: 'RESOLVED',
      resource: a.id,
      record: `Risk alert resolved · ${a.title}`,
      control: 'NIST GV.4',
      risk: a.severity === 'HIGH' ? 'HIGH' : 'MEDIUM',
    })
  }
  return db.alerts
}

// The one-click compliance report (O3). Every number is the audit log's own
// arithmetic: a period baseline plus what this session actually recorded.
export function reportSummary() {
  const r = db.report
  return {
    period: { from: r.from, to: r.to },
    promptsProtected: r.promptsProtected,
    itemsMasked: r.itemsMasked,
    toolsApproved: r.toolsApprovedBefore + db.visaRequests.filter(v => v.status === 'APPROVED').length,
    risksResolved: r.risksResolvedBefore + db.alerts.filter(a => a.status === 'resolved').length,
    humanReviews: r.humanReviewsCompleted,
    confirmedLeaks: r.confirmedLeaks,
    recoveredEvents: r.recoveredEvents,
    trainingAssigned: db.assignments.reduce((n, a) => n + a.employeeIds.length, 0),
    events: db.auditEvents.length,
  }
}

export function addReviewRequest(ref) {
  // Keyed by reference, so the same person clicking twice raises one case.
  raiseAlert({
    key: `review:${ref}`,
    severity: SEVERITY.HIGH,
    kind: 'human-review',
    title: 'Human review requested',
    meta: `Public portal · ref ${ref} · affected person`,
    detailMeta: `Public transparency portal · ref ${ref} · received today at ${nowTime()}`,
    what: 'A person affected by an AI-assisted decision used the public transparency portal to request a fresh human review. The reviewer must not rely on the original AI recommendation.',
    evidence: `Decision reference ${ref} · job application screening`,
    evidenceNote: 'Disclosure record complete · masked only',
    recommend: 'Route the case to an independent human reviewer.',
    primary: 'Open review case',
  })
  recordAudit({
    action: 'REVIEW',
    actor: 'PUBLIC',
    dept: 'Public portal',
    role: 'Public',
    tool: 'Transparency portal',
    resource: ref,
    record: `Human review requested for decision ${ref}`,
    control: 'EU AI Act 86',
    status: 'FLAGGED',
    risk: 'HIGH',
  })
  return openAlerts()
}

// ---- leaderboard (proposal §5.1) ----

export function leaderboard() {
  const rows = [
    ...COLLEAGUES,
    { name: db.profile.name, dept: db.profile.dept, points: db.profile.points, you: true },
  ].sort((a, b) => b.points - a.points)
  return rows.map((r, i) => ({ ...r, rank: i + 1 }))
}

// ---- visas / tool approvals ----

// `model`, `vendor` and `category` are what the employee filled in on the
// request form. They were being collected and thrown away, which is why an
// approved tool then joined the register as "Unreviewed vendor" with no model —
// and why the employee's own AI Tools list could not describe a tool it had just
// asked for.
export function applyForVisa({ tool, purpose, scopes, model, vendor, category }) {
  const request = {
    id: `A-0${db.counters.nextRequestNo++}`,
    tool: tool || 'SummarizerX',
    model: String(model || '').trim() || 'Vendor model',
    vendor: String(vendor || '').trim() || 'Unreviewed vendor',
    category: String(category || '').trim(),
    status: 'SECURITY REVIEW',
    dept: db.profile.dept,
    requester: db.profile.id,
    owner: 'A. Rahman',
    submitted: todayDate(),
    purpose: purpose || '',
    scopes: scopes && scopes.length ? scopes : ['Internal', 'Text only'],
  }
  db.visaRequests.unshift(request)
  recordAudit({
    action: 'REQUESTED',
    resource: request.tool,
    tool: request.tool,
    record: `Tool access requested · ${request.id} · ${request.tool}`,
    control: 'AIGE 4.2',
  })
  return request
}

export function decideVisa(id, decision, note) {
  const request = db.visaRequests.find(r => r.id === id)
  if (!request) return null
  const statusMap = { approve: 'APPROVED', decline: 'DECLINED', redirect: 'REDIRECTED' }
  request.status = statusMap[decision] || request.status
  request.decided = todayDate()
  if (note) request.decisionNote = note

  // The decision is what moves the tool through the approved-tool register, so
  // approving a visa is also what stops the Smart Gateway flagging that tool as
  // unapproved. One decision, one effect — the two cannot drift apart.
  const registered = db.orgTools.find(t => t.name.toLowerCase() === request.tool.toLowerCase())
  if (registered && registered.status !== 'SUSPENDED') {
    registered.status = decision === 'approve' ? 'APPROVED' : 'UNAPPROVED'
  } else if (!registered) {
    // A tool nobody had registered before. It joins with what the requester
    // declared about it, so an approved tool describes itself on their AI Tools
    // list instead of appearing as a bare name.
    //
    // Note what is deliberately NOT copied across: `hosts` and `url`. Those two
    // are the only register fields the browser ever acts on — the extension
    // matches a page against `hosts` and can navigate to `url` — and everything
    // in `request` is free text an employee typed into a form. Letting a request
    // populate them would turn the approval queue into an open-redirect vector,
    // where approving a request is what makes the extension trust a URL a
    // stranger chose. An admin sets them on the register directly or not at all,
    // which is also why alternativesFor() only ever offers a tool that has one.
    db.orgTools.push({
      name: request.tool,
      vendor: request.vendor || 'Unreviewed vendor',
      model: request.model || 'Vendor model',
      dataScope: (request.scopes || []).join(' · ') || 'As declared in the request',
      status: decision === 'approve' ? 'APPROVED' : 'UNAPPROVED',
    })
  }

  // Governance decisions are themselves auditable
  adminAudit({
    action: 'APPROVAL',
    resource: request.tool,
    record: `${request.tool} · ${request.id} · ${request.status} by Admin`,
    status: request.status === 'DECLINED' ? 'BLOCKED' : 'SUCCESS',
    risk: request.status === 'APPROVED' ? 'MEDIUM' : 'LOW',
  })

  const titles = {
    approve: `${request.tool} access approved`,
    decline: `${request.tool} access declined`,
    redirect: `${request.tool} request redirected`,
  }
  const bodies = {
    approve: `Request ${request.id} was approved. The tool has been added to your approved AI tools.`,
    decline: `Request ${request.id} was declined. An approved alternative remains available.`,
    redirect: `Request ${request.id} was closed with a one-click switch to an approved alternative.`,
  }
  addNotification({
    // The employee who asked is the employee who is told — not whoever happens
    // to be signed in when the admin decides.
    employeeId: employeeById(request.requester) ? request.requester : undefined,
    category: 'TOOL ACCESS',
    title: titles[decision] || `${request.tool} request updated`,
    body: bodies[decision] || `Request ${request.id} status: ${request.status}.`,
    what: `IT and Compliance completed the review of your ${request.tool} request. ${bodies[decision] || ''}`,
    facts: [
      ['Request', request.id],
      ['Tool', request.tool],
      ['Decision', request.status],
      ['Decided', request.decided],
      ['Reviewer', 'Admin · Compliance role'],
    ],
    action: { label: 'View AI tools', to: '/tools' },
  })
  return request
}

// Admin action: suspend one AI tool for the whole organisation. Like decideVisa
// this is a governance decision, so it is recorded in the same audit log and
// announced through the same notification feed — no separate action history.
// Already-suspended tools return ok:false so a repeated click can never write a
// second suspension or a second audit entry.
export function suspendToolOrgWide(name, admin = ADMIN_ACTOR) {
  const key = String(name || '').trim().toLowerCase()
  const tool = db.orgTools.find(t => t.name.toLowerCase() === key)
  if (!tool) return { ok: false, reason: 'not_found' }
  if (tool.status === 'SUSPENDED') return { ok: false, reason: 'already_suspended', tool, tools: db.orgTools }

  tool.status = 'SUSPENDED'
  tool.suspendedOn = todayDate()
  tool.suspendedAt = new Date().toISOString()
  tool.suspendedBy = admin.role

  const event = adminAudit({
    action: 'SUSPENDED',
    resource: tool.name,
    record: `${tool.name} · suspended organisation-wide by ${admin.role}`,
    status: 'BLOCKED',
    risk: 'HIGH',
  })

  // Org-wide means everybody: each employee with a passport is told in their
  // own inbox rather than one notification standing in for all of them.
  for (const id of EMPLOYEES.map(e => e.id)) {
    addNotification({
      employeeId: id,
      key: `suspend:${tool.name}`,
      category: 'TOOL ACCESS',
      title: `${tool.name} suspended organisation-wide`,
      body: `${tool.name} is suspended for every employee. It can no longer be used or requested until the suspension is lifted.`,
      what: `An administrator suspended ${tool.name} for the whole organisation after a vendor security concern. The tool now shows as blocked in your AI Tools list and new requests for it are not accepted.`,
      facts: [
        ['Tool', tool.name],
        ['Vendor', tool.vendor],
        ['Scope', 'Organisation-wide'],
        ['Effective', 'Immediately'],
        ['Recorded', `Audit log · ${event.id}`],
      ],
      action: { label: 'View AI tools', to: '/tools' },
    })
  }

  return { ok: true, tool, event, tools: db.orgTools }
}

/**
 * Admin action: change one model's standing inside a tool that stays approved.
 *
 * This is the control the case study's scenario needs — the website is fine, one
 * model on it is not — and it is deliberately a different action from suspending
 * the tool. Suspending Claude would stop an organisation using Claude; refusing
 * Fable 5 leaves every approved model on it working.
 */
export function setModelStatus(toolName, modelId, status, admin = ADMIN_ACTOR) {
  const entry = registerEntry(toolName)
  if (!entry) return { ok: false, reason: 'tool_not_found' }
  if (!['APPROVED', 'UNAPPROVED', 'SUSPENDED'].includes(status)) {
    return { ok: false, reason: 'bad_status' }
  }

  const key = String(modelId || '').trim().toLowerCase()
  const model = (entry.models || []).find(m => m.id.toLowerCase() === key)
  if (!model) return { ok: false, reason: 'model_not_found' }
  if (model.status === status) {
    return { ok: false, reason: 'unchanged', tool: entry, model, tools: db.orgTools }
  }

  const before = model.status
  model.status = status
  if (status === 'SUSPENDED') {
    model.suspendedOn = todayDate()
    model.suspendedBy = admin.id
  } else {
    model.suspendedOn = null
    model.suspendedBy = null
  }

  const event = adminAudit({
    action: status === 'APPROVED' ? 'APPROVAL' : 'RESTRICTED',
    resource: `${entry.name} · ${model.label}`,
    record: `Model ${model.label} on ${entry.name} · ${before} → ${status} by Admin`,
    control: 'AIGE 4.2',
    status: status === 'APPROVED' ? 'SUCCESS' : 'BLOCKED',
    risk: status === 'APPROVED' ? 'LOW' : 'MEDIUM',
  })

  const cleared = approvedModels(entry.name)
  for (const id of EMPLOYEES.map(e => e.id)) {
    addNotification({
      employeeId: id,
      key: `model:${entry.name}:${model.id}:${status}`,
      category: 'TOOL ACCESS',
      title: status === 'APPROVED'
        ? `${model.label} is now approved`
        : `${model.label} is no longer approved`,
      body: status === 'APPROVED'
        ? `${model.label} on ${entry.name} has been reviewed and cleared for use.`
        : `${entry.name} is still approved, but ${model.label} is not. ${cleared.length ? `Use ${cleared.join(' or ')} instead.` : ''}`.trim(),
      what: status === 'APPROVED'
        ? `IT and Compliance reviewed ${model.label} and added it to the approved model list for ${entry.name}.`
        : `Approving a tool is not the same as approving every model on it. ${model.label} has been withdrawn from the approved list for ${entry.name}; the tool itself is unaffected and every other approved model keeps working.`,
      facts: [
        ['Tool', entry.name],
        ['Model', model.label],
        ['Status', status],
        ['Approved models', cleared.length ? cleared.join(', ') : 'None listed'],
        ['Decided by', 'Admin · Compliance role'],
      ],
      action: { label: 'View AI tools', to: '/tools' },
    })
  }

  return { ok: true, tool: entry, model, event, tools: db.orgTools }
}

// ---- settings --------------------------------------------------------------

export function updateSettings({ mode, controls, experience, escalate }) {
  if (mode) db.settings.mode = mode
  if (controls) db.settings.controls = { ...db.settings.controls, ...controls }
  if (experience) db.settings.experience = { ...db.settings.experience, ...experience }
  if (typeof escalate === 'boolean') db.settings.escalate = escalate
  db.settings.policyVersion += 1

  adminAudit({
    action: 'POLICY',
    resource: 'Smart Gateway policy',
    record: `Gateway policy v${db.settings.policyVersion} · mode ${db.settings.mode}`,
    control: 'NIST GV.1',
    risk: db.settings.mode === 'Warn only' ? 'HIGH' : 'MEDIUM',
  })

  for (const id of EMPLOYEES.map(e => e.id)) {
    addNotification({
      employeeId: id,
      key: `policy:${db.settings.policyVersion}`,
      category: 'SMART GATEWAY',
      title: 'Protection policy updated',
      body: `Gateway policy v${db.settings.policyVersion} is now active for all employees.`,
      what: `An admin updated the Smart Gateway protection policy. Mode: ${db.settings.mode}. The change was recorded in the audit log.`,
      facts: [
        ['Policy version', `v${db.settings.policyVersion}`],
        ['Protection mode', db.settings.mode],
        ['Effective', 'Immediately'],
        ['Changed by', 'Admin · Compliance role'],
        ['Audit', 'Recorded'],
      ],
      action: { label: 'Open Smart Gateway', to: '/gateway' },
    })
  }
  return db.settings
}

export { MAX_QUESTIONS, moduleIssue }
export {
  SEVERITY, RESPONSE_HOURS, REPEAT_WINDOW_MINUTES, REPEAT_WARN_AT, REPEAT_ESCALATE_AT,
  TOOL_REPEAT_WINDOW_MINUTES,
} from './risk.js'
