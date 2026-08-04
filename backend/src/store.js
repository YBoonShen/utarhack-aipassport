// Shared data store — the single source of truth both the employee and admin
// UIs read/write through the REST API. The progression slice (XP, per-training
// records, stamps) is mirrored to backend/data/progress.json so it survives a
// server restart; POST /api/reset returns to the seed state. Swap these
// functions for Firestore queries once the Firebase project is connected (see
// firebase.js) — the persisted shape is already document-friendly.
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

// Point value of each module — mirrors frontend/src/lib/trainingModules.js
// (MODULES[id].points), which is what the employee UI advertises on the card.
const MODULE_POINTS = { 1: 150, 2: 180, 3: 200 }

const COLLEAGUES = [
  { name: 'Lim Kai Wen', dept: 'Engineering', points: 1725 },
  { name: 'Nurul Aisyah', dept: 'Engineering', points: 1610 },
  { name: 'Priya Kumar', dept: 'Engineering', points: 1445 },
  { name: 'Daniel Wong', dept: 'Engineering', points: 1320 },
  { name: 'Mei Xin', dept: 'Engineering', points: 1180 },
  { name: 'Jason Teh', dept: 'Engineering', points: 950 },
]

function seed() {
  return {
    profile: {
      id: 'E-217',
      initials: 'JY',
      name: 'Tan Jia Yin',
      dept: 'Engineering',
      licenseNo: 'AIP-2026-004173',
      issued: '02 Jan 2026',
      // level / levelName / points / target / progressPercentage … are all
      // derived — syncProgression() fills them in from activityXP + training XP.
      level: 2,
      levelName: 'Navigator',
      points: 1240,
      // XP earned outside training (safe prompts, streaks, historic activity).
      // The seeded 1,240 is the demo employee's starting Navigator standing.
      activityXP: 1240,
      // One authoritative record per module: moduleId -> { completed, attempts,
      // bestCorrect, bestScorePct, pointsEarned, … }. See completeTraining().
      trainingProgress: {},
      streakDays: 21,
      promptsProtected: 47,
      itemsMasked: 12,
      trainingCompleted: false, // module 1 done — kept for back-compat with existing UI checks
      completedModules: [],
      moduleCompletions: {}, // moduleId -> ISO timestamp of the last evaluation (drives the 24h retry lock)
      // These three passport stamps predate the current module library, so each
      // carries the id of the closest module that still exists — that is what a
      // stamp's "View training" button opens at Question 1.
      stamps: [
        { title: 'AI BASICS', moduleId: 3, score: 'PASSED · 100%', date: '04 JAN 2026', shape: 'circle', color: '#078b6c' },
        { title: 'DATA PRIVACY', moduleId: 1, score: 'PASSED · 100%', date: '11 JAN 2026', shape: 'square', color: '#d92d20' },
        { title: 'SAFE PROMPTS', moduleId: 2, score: 'PASSED · 92%', date: '25 JAN 2026', shape: 'circle', color: '#365fd9' },
      ],
    },

    counters: { promptsToday: 312, maskedToday: 58, nextEventNo: 8218, nextRequestNo: 493, nextAlertNo: 2052 },

    // The reporting period behind the one-click compliance report (O3). The
    // daily counters above reset with the demo; these accumulate across the
    // period the report covers, which is why they are tracked separately.
    // Every field here is written by a real event — see reportSummary(). The
    // baselines are the standing totals for 1–19 Jul before this session;
    // anything that happens now is added on top, so the report a judge
    // downloads is the audit log's own arithmetic, not a constant.
    report: {
      from: '01 Jul 2026',
      to: '19 Jul 2026',
      promptsProtected: 4120,
      itemsMasked: 612,
      humanReviewsCompleted: 11,
      confirmedLeaks: 0,
      // Decisions taken before this session. Live approvals/resolutions are
      // counted from visaRequests/alerts and added to these.
      toolsApprovedBefore: 7,
      risksResolvedBefore: 3,
      // Events masked on-device while the gateway was unreachable and recorded
      // later by /api/detect/backfill — the report says so rather than quietly
      // presenting a recovered event as a live one.
      recoveredEvents: 0,
    },

    // Ids of offline events already backfilled, so a retried flush from the
    // extension can never double-count. In-memory by design: the queue lives in
    // the browser, and a backend restart reseeds the counters it protects.
    backfilled: new Set(),

    quiz: { 1: {}, 2: {}, 3: {} }, // moduleId -> { [questionIndex]: { correct } } — first attempt only
    // moduleId -> attempt number, bumped by every retry. The progress record
    // remembers which attempt it already settled, so re-submitting the same
    // completion (double-click, replayed request) never awards XP twice.
    quizAttempt: { 1: 1, 2: 1, 3: 1 },

    auditEvents: [
      { id: 'EV-8217', time: '14:02', user: 'E-217', dept: 'Eng', tool: 'ChatGPT', action: 'MASKED', control: 'NIST PR.DS', record: 'Fix bug for client [MASKED-NAME] in module…' },
      { id: 'EV-8216', time: '13:58', user: 'F-102', dept: 'Fin', tool: 'Gemini', action: 'ALERT', control: 'PDPA P7', record: 'Summarise payment for [MASKED-ID] invoice…' },
      { id: 'EV-8215', time: '13:51', user: 'S-044', dept: 'Sales', tool: 'SummarizerX', action: 'REDIRECTED', control: 'AIGE 4.2', record: 'Switched to approved tool · ChatGPT' },
      { id: 'EV-8214', time: '13:47', user: 'E-198', dept: 'Eng', tool: 'ChatGPT', action: 'CLEAN', control: 'NIST GV.4', record: 'Explain the difference between SQL joins…' },
      { id: 'EV-8213', time: '13:40', user: 'H-011', dept: 'HR', tool: 'Gemini', action: 'MASKED', control: 'EU AI Act 4', record: 'Draft letter to [MASKED-NAME], [MASKED-PHONE]…' },
    ],

    alerts: [
      {
        id: 'RA-2048', severity: 'HIGH', status: 'open', title: 'Repeated identifiers in prompts',
        meta: 'Finance · User F-102 · 4 events today', due: 'Due in 2h 18m',
        detailMeta: 'Finance · User F-102 · detected today at 13:58',
        what: 'Four prompts contained the same identifier pattern. The gateway masked every instance before transmission.',
        evidence: 'Payment reminder for [MASKED-ID] invoice…', evidenceNote: 'Layer 1 pattern match · confidence 99%',
        timeline: [['13:58', 'Alert created'], ['14:01', 'Employee notified'], ['14:06', 'Manager review pending']],
        recommend: 'Assign the 5-minute Data Privacy refresher.', primary: 'Assign training',
      },
      {
        id: 'RA-2049', severity: 'MEDIUM', status: 'open', title: 'Unapproved tool detected',
        meta: 'Sales · SummarizerX · redirected to approved tool', due: 'Due tomorrow',
        detailMeta: 'Sales · User S-044 · detected today at 13:51',
        what: 'An employee opened an unapproved AI tool. The gateway redirected them to the approved alternative with one click.',
        evidence: 'Switched to approved tool · ChatGPT', evidenceNote: 'Redirect accepted · no data sent to unapproved tool',
        timeline: [['13:51', 'Alert created'], ['13:51', 'Redirect offered'], ['13:52', 'Approved tool opened']],
        recommend: 'Review the pending SummarizerX visa request.', primary: 'Assign training',
      },
      {
        id: 'RA-2050', severity: 'MEDIUM', status: 'open', title: 'AI-assisted decision flagged',
        kind: 'human-review', // resolving it counts as a completed human review (O5 → report)
        meta: 'HR screening · human review requested', due: 'Due tomorrow',
        detailMeta: 'HR · Case REF-2026-041 · flagged today at 11:20',
        what: 'An affected applicant used the public transparency page to request a human review of an AI-assisted screening decision.',
        evidence: 'Screening summary for [MASKED-NAME]…', evidenceNote: 'Disclosure record complete · masked only',
        timeline: [['11:20', 'Review requested'], ['11:24', 'Case assigned'], ['—', 'Human decision pending']],
        recommend: 'Route the case to an independent human reviewer.', primary: 'Open review case',
      },
      {
        id: 'RA-2051', severity: 'MONITORING', status: 'open', title: 'Masking rate above baseline',
        meta: 'Operations · 2.1× weekly average', due: 'Observe 24h',
        detailMeta: 'Operations · department-wide · trend since 15 Jul',
        what: 'The masking rate in Operations is 2.1× the weekly average. No single user is responsible; the pattern is spread across the team.',
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
        id: 'A-0488', tool: 'CodePilot Pro', status: 'APPROVED', dept: 'Engineering',
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

    // Org-wide status of the AI tools the organisation has in circulation — the
    // scope an admin acts on from Tool Approvals, as opposed to visaRequests,
    // which are one employee asking for one tool. Seeded with the vendor the
    // security team flagged; suspendToolOrgWide() flips status to SUSPENDED.
    orgTools: [
      {
        name: 'Fable 5', vendor: 'Claude', model: 'Claude Fable 5',
        status: 'ACTIVE', flag: 'Security team flagged a breach',
        suspendedOn: null, suspendedAt: null, suspendedBy: null,
      },
    ],

    notifications: [
      {
        id: 'n-training', category: 'TRAINING', time: 'Today · 09:30', received: 'Received 17 Jul 2026 · 09:30',
        title: 'New training is ready',
        body: 'Safe AI Tool Selection is available from 18 Jul. Earn 120 safety miles.',
        what: 'Safe AI Tool Selection has been assigned to your Level 2 learning path. It focuses on choosing approved tools and matching each task to an appropriate data scope.',
        facts: [['Module', 'Safe AI Tool Selection'], ['Available', '18 Jul 2026'], ['Learning time', '8 minutes'], ['Assessment', '4 questions'], ['Reward', '+120 safety miles']],
        read: false, deleted: false,
      },
      {
        id: 'n-visa', category: 'VISA UPDATE', time: 'Today · 08:15', received: 'Received 17 Jul 2026 · 08:15',
        title: 'SummarizerX moved to compliance review',
        body: 'Request A-0492 passed security review. Compliance checks are now in progress.',
        what: 'Your visa application for SummarizerX cleared the security review stage. The compliance team is now checking vendor terms and data handling before a final decision.',
        facts: [['Request', 'A-0492'], ['Tool', 'SummarizerX'], ['Stage', 'Compliance review'], ['Submitted', '15 Jul 2026'], ['Expected decision', 'Within 2 working days']],
        read: false, deleted: false,
      },
      {
        id: 'n-milestone', category: 'MILESTONE', time: 'Yesterday · 17:45', received: 'Received 16 Jul 2026 · 17:45',
        title: '21-day safe prompt streak',
        body: 'No unsafe prompts were sent for 21 consecutive days. Your license remains in good standing.',
        what: 'Every prompt you sent in the last 21 days passed the Smart Gateway with no unsafe content. Streaks like this keep your AI License in good standing.',
        facts: [['Streak', '21 days'], ['Unsafe prompts', '0'], ['License standing', 'Good'], ['Started', '26 Jun 2026'], ['Reward', '+50 safety miles']],
        read: false, deleted: false,
      },
      {
        id: 'n-gateway', category: 'SMART GATEWAY', time: '16 Jul 2026 · 15:42', received: 'Received 16 Jul 2026 · 15:42',
        title: '2 sensitive items were masked',
        body: 'A name and IC number were removed before your prompt was sent to Gemini.',
        what: 'The Smart Gateway detected a personal name and an IC number in your prompt. Both were replaced with masked tokens before the prompt left your browser.',
        facts: [['Items masked', 'Name, IC number'], ['AI tool', 'Gemini'], ['Stored version', 'Masked only'], ['Action needed', 'None'], ['Reward', 'Protected · no points change']],
        read: false, deleted: false,
      },
    ],

    // Who is signed in right now. Set by /api/auth/login, cleared by
    // /api/auth/logout. The web app keeps its own localStorage copy for routing,
    // but this is the shared record — it is how the Chrome extension knows who
    // is signed in without being able to read the dashboard's localStorage.
    // Deliberately not persisted to disk: a restart should sign you out.
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
}

export let db = seed()

// ---- persistence -----------------------------------------------------------
// Only the progression slice is written to disk: it is the part an employee
// earns and must never lose to a refresh, a re-login, a different device or a
// server restart. Everything else (audit feed, alerts, counters) is demo data
// that is fine to reseed. This is also the exact shape a Firestore document
// would hold — employees/{id} with a trainingProgress map keyed by moduleId.

const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data')
const DATA_FILE = path.join(DATA_DIR, 'progress.json')

function progressionSnapshot() {
  const p = db.profile
  return {
    activityXP: p.activityXP,
    level: p.level,
    trainingProgress: p.trainingProgress,
    completedModules: p.completedModules,
    moduleCompletions: p.moduleCompletions,
    trainingCompleted: p.trainingCompleted,
    stamps: p.stamps,
    streakDays: p.streakDays,
    promptsProtected: p.promptsProtected,
    itemsMasked: p.itemsMasked,
    quiz: db.quiz,
    quizAttempt: db.quizAttempt,
  }
}

function save() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true })
    fs.writeFileSync(DATA_FILE, JSON.stringify(progressionSnapshot(), null, 2))
  } catch (err) {
    console.warn('Could not persist progression:', err.message)
  }
}

function load() {
  try {
    if (!fs.existsSync(DATA_FILE)) return
    const saved = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))
    const { quiz, quizAttempt, ...profileFields } = saved
    Object.assign(db.profile, profileFields)
    if (quiz) db.quiz = quiz
    if (quizAttempt) db.quizAttempt = quizAttempt
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

// ---- XP + level progression (single source of truth) -----------------------

/** XP contributed by training — the sum of the BEST result per unique module. */
export function trainingXP(profile = db.profile) {
  return Object.values(profile.trainingProgress || {}).reduce((sum, r) => sum + (r.pointsEarned || 0), 0)
}

// Recomputes totalXP from its parts and stamps the derived level fields onto
// the profile. Called after every change that can move XP — nothing else is
// allowed to set profile.points or profile.level by hand.
function syncProgression() {
  const p = db.profile
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
  p.isMaxLevel = state.isMaxLevel
  p.isMaxXP = state.isMaxXP
  p.maxXP = MAX_XP
  return state
}

function announceLevelUp(state) {
  addNotification({
    category: 'MILESTONE',
    title: `Level ${state.level} · ${state.levelName} reached`,
    body: `You crossed ${state.currentLevelXP.toLocaleString()} XP. ${LEVEL_BENEFITS[state.level]} is now unlocked.`,
    what: `Your safe-AI progress earned Level ${state.level} · ${state.levelName}. XP comes from completed training and safe day-to-day AI use; repeating a module you have already passed does not add more.`,
    facts: [
      ['New level', `Level ${state.level} · ${state.levelName}`],
      ['Unlocked', LEVEL_BENEFITS[state.level]],
      ['Total XP', `${state.totalXP.toLocaleString()} XP`],
      ['Next level', state.isMaxLevel ? 'Maximum level reached' : `${state.nextLevelName} at ${(state.nextLevelXP + 1).toLocaleString()} XP`],
      ['Next step', 'Open My AI License to see the new class'],
    ],
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
syncProgression()

// ---- helpers used by the API routes ----

const CONTROL_TAGS = {
  IC: 'PDPA P7', PASSPORT: 'PDPA P7', PHONE: 'PDPA P7', EMAIL: 'PDPA P7', NAME: 'PDPA P7',
  CARD: 'PDPA P7', FINANCIAL: 'NIST PR.DS', CREDENTIAL: 'NIST PR.DS',
}

function nowTime() {
  return new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function todayDate() {
  return new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

// `time` is when the event happened, `offline` marks one that happened while the
// gateway was unreachable and reached the log later. The list stays in arrival
// order — an append-only log records when it received an event, and the two
// fields together are what let the admin see the difference.
function pushAuditEvent({ action, record, time, offline = false }) {
  const event = {
    id: `EV-${db.counters.nextEventNo++}`,
    time: time || nowTime(),
    user: db.profile.id,
    dept: 'Eng',
    tool: 'AI Assistant',
    action,
    control: 'NIST GV.4',
    record: record.length > 60 ? record.slice(0, 57) + '…' : record,
  }
  if (offline) {
    event.offline = true
    event.recordedAt = nowTime()
  }
  db.auditEvents.unshift(event)
  db.auditEvents = db.auditEvents.slice(0, 50)
  db.counters.promptsToday += 1
  return event
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
  const event = pushAuditEvent({ action: clean ? 'CLEAN' : 'MASKED', record: masked, time, offline })
  event.tool = tool
  event.control = clean ? 'NIST GV.4' : CONTROL_TAGS[detections[0].type] || 'NIST PR.DS'

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
  applyPoints(-20)
  const event = pushAuditEvent({ action: 'ALERT', record: prompt })
  event.control = 'PDPA P7'
  // The gateway found sensitive content and the employee sent the original
  // anyway: that is sensitive data confirmed to have left the organisation, so
  // it is what "Confirmed data leaks" on the compliance report counts.
  db.report.confirmedLeaks += 1
  db.alerts.unshift({
    id: `RA-${db.counters.nextAlertNo++}`, severity: 'HIGH', status: 'open',
    title: 'Protected prompt overridden',
    meta: 'Engineering · E-217 · just now', due: 'Review today',
    detailMeta: `Engineering · User E-217 · detected today at ${nowTime()}`,
    what: 'An employee used Warn-only mode to send the original prompt after the gateway flagged sensitive content. 20 points were deducted and the safe streak was reset.',
    evidence: event.record, evidenceNote: 'Original sent by employee choice · flagged for review',
    timeline: [[nowTime(), 'Override recorded'], [nowTime(), 'Points deducted · streak reset'], ['—', 'Manager review pending']],
    recommend: 'Assign the 5-minute Data Privacy refresher.', primary: 'Assign training',
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

export function addNotification({ category, title, body, what, facts }) {
  const stamp = new Date()
  const n = {
    id: `n-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    category,
    time: `Today · ${stamp.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`,
    received: `Received ${todayDate()} · ${stamp.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`,
    title, body, what, facts,
    read: false, deleted: false,
  }
  db.notifications.unshift(n)
  return n
}

// ---- quiz + per-module training progress -----------------------------------
// Answering a question no longer moves XP on its own. XP is awarded once, when
// the whole assessment is evaluated (completeTraining), and only as the module's
// own point value scaled by the score — so an attempt is worth what the module
// is worth, never a multiple of it.

const MODULE_META = {
  1: { title: 'Spotting Personal Data in Prompts', stamp: 'PERSONAL DATA', stampColor: '#078b6c', stampShape: 'circle', next: 'Safe AI Tool Selection · 18 Jul' },
  2: { title: 'Safe AI Tool Selection', stamp: 'TOOL SELECTION', stampColor: '#078b6c', stampShape: 'square', next: 'Human Review in AI Decisions · 25 Jul' },
  3: { title: 'Human Review in AI Decisions', stamp: 'HUMAN REVIEW', stampColor: '#d92d20', stampShape: 'circle', next: 'More modules coming soon' },
}

export function modulePoints(moduleId) {
  return MODULE_POINTS[moduleId] ?? 150
}

// The one authoritative progression record per employee + module. Created lazily
// so a module the employee has never opened carries no record at all.
function progressRecord(moduleId) {
  const store = (db.profile.trainingProgress ??= {})
  return (store[moduleId] ??= {
    moduleId: Number(moduleId),
    title: (MODULE_META[moduleId] || {}).title || `Module ${moduleId}`,
    modulePoints: modulePoints(moduleId),
    completed: false,
    attempts: 0,
    bestCorrect: 0,
    total: 3,
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

export function answerQuiz(moduleId, question, correct) {
  const bucket = (db.quiz[moduleId] ??= {})
  if (bucket[question] === undefined) {
    bucket[question] = { correct }
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
  const answers = db.quiz[moduleId] || {}
  const attempted = Object.keys(answers).length
  const correct = Object.values(answers).filter(a => a.correct).length
  const total = 3
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
  db.quiz[moduleId] = {}
  db.quizAttempt[moduleId] = (db.quizAttempt[moduleId] ?? 1) + 1
  delete db.profile.moduleCompletions[moduleId]
  save()
  return { ok: true, ...quizResults(moduleId) }
}

// Evaluates the whole assessment and settles this module's XP contribution.
//
// Anti-farm rule (§3): the module's contribution to total XP is
//   pointsEarned = MAX(previous pointsEarned, this attempt's points)
// so total XP only ever moves by the improvement. Redoing a module you already
// aced adds nothing; redoing it worse takes nothing away. Because the totals are
// derived from these per-module records rather than accumulated per attempt,
// there is no counter anywhere that repeated completions can inflate.
export function completeTraining(moduleId) {
  const meta = MODULE_META[moduleId] || MODULE_META[1]
  const results = quizResults(moduleId)
  const record = progressRecord(moduleId)
  const attempt = db.quizAttempt[moduleId] ?? 1
  const earnedNow = attemptPoints(moduleId, results.correct, results.total)

  // Same attempt submitted twice (double-click, replayed request, refresh of a
  // POST): this attempt was already settled, so return the stored outcome
  // without touching XP, attempt count or the 24h lock.
  if (record.settledAttempt === attempt) {
    return { ...quizResults(moduleId), award: awardOf(record, meta), levelUp: null, duplicate: true }
  }

  const previousPoints = record.pointsEarned
  const firstCompletion = !record.completed
  const scorePct = Math.round((results.correct / results.total) * 100)

  const { levelUp } = applyProgression(() => {
    record.completed = true
    record.attempts += 1
    record.settledAttempt = attempt
    record.total = results.total
    record.modulePoints = modulePoints(moduleId)
    record.lastAttemptPoints = earnedNow
    record.lastScorePct = scorePct
    record.bestCorrect = Math.max(record.bestCorrect, results.correct)
    record.bestScorePct = Math.max(record.bestScorePct, scorePct)
    // The whole anti-farm rule, in one line.
    record.pointsEarned = Math.max(previousPoints, earnedNow)
    record.lastXpGained = record.pointsEarned - previousPoints
    record.lastOutcome = firstCompletion ? 'first' : record.lastXpGained > 0 ? 'improved' : 'unchanged'
    record.lastAttemptAt = new Date().toISOString()
    record.firstCompletedAt ??= record.lastAttemptAt
    // Every evaluation (first pass or a later retry) restarts the 24h lock.
    db.profile.moduleCompletions[moduleId] = record.lastAttemptAt
  })

  if (firstCompletion) {
    if (!db.profile.completedModules.includes(moduleId)) db.profile.completedModules.push(moduleId)
    if (moduleId === 1) db.profile.trainingCompleted = true
    db.profile.stamps.push({
      title: meta.stamp,
      moduleId,
      score: `PASSED · ${record.bestScorePct}%`,
      date: todayDate().toUpperCase(),
      shape: meta.stampShape,
      color: meta.stampColor,
    })
    addNotification({
      category: 'TRAINING',
      title: 'Training stamp earned',
      body: `${meta.title} completed · ${results.correct}/${results.total} correct · +${record.lastXpGained} XP.`,
      what: `You completed ${meta.title} and the ${meta.stamp} stamp was added to your AI Passport. XP is awarded once per module — retaking it later can only raise this module's contribution, never add a second reward.`,
      facts: [
        ['Module', meta.title],
        ['Score', `${results.correct}/${results.total} · ${scorePct}%`],
        ['Stamp', meta.stamp],
        ['XP earned', `+${record.lastXpGained} XP`],
        ['Next module', meta.next],
      ],
    })
  } else {
    // Re-evaluated after a retry — refresh this module's own stamp instead of
    // pushing a second one. Matched on the stamp title, because older passport
    // stamps can share a moduleId (they are mapped onto the closest module).
    // The stamp always shows the BEST result, like the XP record.
    const stamp = db.profile.stamps.find(s => s.title === meta.stamp)
    if (stamp) {
      stamp.score = `PASSED · ${record.bestScorePct}%`
      if (record.lastXpGained > 0) stamp.date = todayDate().toUpperCase()
    }
    if (record.lastXpGained > 0) {
      addNotification({
        category: 'TRAINING',
        title: `${meta.title} improved`,
        body: `New best ${scorePct}% · +${record.lastXpGained} XP added for the improvement.`,
        what: `You retook ${meta.title} and beat your previous result. Only the improvement is added — this module's contribution is now ${record.pointsEarned} XP, not ${previousPoints} + ${earnedNow}.`,
        facts: [
          ['Module', meta.title],
          ['Previous best', `${previousPoints} XP`],
          ['New best', `${record.pointsEarned} XP`],
          ['XP added', `+${record.lastXpGained} XP`],
          ['Attempts', String(record.attempts)],
        ],
      })
    }
  }

  save()
  return { ...quizResults(moduleId), award: awardOf(record, meta), levelUp }
}

// The completion summary the results screen renders — also rebuilt from the
// stored record on a later visit, so a refresh shows the same numbers.
function awardOf(record, meta) {
  return {
    moduleId: record.moduleId,
    title: record.title,
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
    nextModule: meta.next,
  }
}

// Everything the admin needs about one employee's progression — levels and XP
// derived from the same records the employee sees, with the attempt count shown
// alongside so repeated attempts are visible but never inflate the XP.
export function progressionSummary() {
  const p = db.profile
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

// ---- risk alerts ----

export function openAlerts() {
  return db.alerts.filter(a => a.status === 'open')
}

export function resolveAlert(id) {
  const a = db.alerts.find(x => x.id === id)
  if (a && a.status !== 'resolved') {
    a.status = 'resolved'
    // Closing a human-review case is a completed human review (O5). Counted
    // here rather than derived on read so a later re-open cannot un-complete a
    // review that demonstrably happened.
    if (a.kind === 'human-review') db.report.humanReviewsCompleted += 1
  }
  return db.alerts
}

// The one-click compliance report (O3). Every number is the audit log's own
// arithmetic: a period baseline plus what this session actually recorded. The
// page that renders it holds no figures of its own.
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
    events: db.auditEvents.length,
  }
}

export function addReviewRequest(ref) {
  db.alerts.unshift({
    id: `RA-${db.counters.nextAlertNo++}`, severity: 'HIGH', status: 'open',
    title: 'Human review requested',
    kind: 'human-review',
    meta: `Public portal · ref ${ref} · just now`, due: 'Respond in 5 days',
    detailMeta: `Public transparency portal · ref ${ref} · received today at ${nowTime()}`,
    what: 'A person affected by an AI-assisted decision used the public transparency portal to request a fresh human review. The reviewer must not rely on the original AI recommendation.',
    evidence: `Decision reference ${ref} · job application screening`, evidenceNote: 'Disclosure record complete · masked only',
    timeline: [[nowTime(), 'Review requested'], ['—', 'Assign independent reviewer'], ['—', 'Respond within 5 working days']],
    recommend: 'Route the case to an independent human reviewer.', primary: 'Open review case',
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

export function applyForVisa({ tool, purpose, scopes }) {
  const request = {
    id: `A-0${db.counters.nextRequestNo++}`,
    tool: tool || 'SummarizerX',
    status: 'SECURITY REVIEW',
    dept: db.profile.dept,
    requester: db.profile.id,
    owner: 'A. Rahman',
    submitted: todayDate(),
    purpose: purpose || '',
    scopes: scopes && scopes.length ? scopes : ['Internal', 'Text only'],
  }
  db.visaRequests.unshift(request)
  return request
}

export function decideVisa(id, decision, note) {
  const request = db.visaRequests.find(r => r.id === id)
  if (!request) return null
  const statusMap = { approve: 'APPROVED', decline: 'DECLINED', redirect: 'REDIRECTED' }
  request.status = statusMap[decision] || request.status
  request.decided = todayDate()
  if (note) request.decisionNote = note

  // Governance decisions are themselves auditable
  const event = pushAuditEvent({ action: 'APPROVAL', record: `${request.tool} · ${request.id} · ${request.status} by Admin` })
  event.tool = request.tool
  event.control = 'AIGE 4.2'
  db.counters.promptsToday -= 1 // approvals aren't prompts

  const titles = {
    approve: `${request.tool} visa approved`,
    decline: `${request.tool} visa declined`,
    redirect: `${request.tool} request redirected`,
  }
  const bodies = {
    approve: `Request ${request.id} was approved. The tool has been added to your approved visas.`,
    decline: `Request ${request.id} was declined. An approved alternative remains available.`,
    redirect: `Request ${request.id} was closed with a one-click switch to an approved alternative.`,
  }
  addNotification({
    category: 'VISA UPDATE',
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
  })
  return request
}

// Admin action: suspend one AI tool for the whole organisation. Like decideVisa
// this is a governance decision, so it is recorded in the same audit log and
// announced through the same notification feed — no separate action history.
// Already-suspended tools return ok:false so a repeated click can never write a
// second suspension or a second audit entry.
export function suspendToolOrgWide(name, admin = { id: 'AD-001', role: 'Admin · Compliance role' }) {
  const key = String(name || '').trim().toLowerCase()
  const tool = db.orgTools.find(t => t.name.toLowerCase() === key)
  if (!tool) return { ok: false, reason: 'not_found' }
  if (tool.status === 'SUSPENDED') return { ok: false, reason: 'already_suspended', tool, tools: db.orgTools }

  tool.status = 'SUSPENDED'
  tool.suspendedOn = todayDate()
  tool.suspendedAt = new Date().toISOString()
  tool.suspendedBy = admin.role

  // Governance decisions are themselves auditable — same append-only feed the
  // Audit Log page reads.
  const event = pushAuditEvent({ action: 'SUSPENDED', record: `${tool.name} · suspended organisation-wide by ${admin.role}` })
  event.user = admin.id
  event.dept = 'Org-wide'
  event.tool = tool.name
  event.control = 'AIGE 4.2'
  db.counters.promptsToday -= 1 // suspensions aren't prompts

  addNotification({
    category: 'VISA UPDATE',
    title: `${tool.name} suspended organisation-wide`,
    body: `${tool.name} is suspended for every employee. It can no longer be used or requested until the suspension is lifted.`,
    what: `An administrator suspended ${tool.name} for the whole organisation after a vendor security concern. The tool now shows as suspended on your visa list and new requests for it are not accepted.`,
    facts: [
      ['Tool', tool.name],
      ['Vendor', tool.vendor],
      ['Scope', 'Organisation-wide'],
      ['Effective', 'Immediately'],
      ['Recorded', `Audit log · ${event.id}`],
    ],
  })

  return { ok: true, tool, event, tools: db.orgTools }
}
