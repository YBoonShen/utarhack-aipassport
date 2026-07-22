// Shared in-memory data store — the single source of truth both the employee
// and admin UIs read/write through the REST API. Restarting the server (or
// POST /api/reset) returns to the seed state. Swap these functions for
// Firestore queries once the Firebase project is connected (see firebase.js).
//
// Points rules (proposal §1/§5, ported from Jia Yin's state.js): masking
// protects but does NOT earn points (so sensitive prompts can't be farmed);
// clean prompts +2; overriding the checkpoint and sending the original costs
// -20 and resets the safe streak; quiz questions award +50 on a correct FIRST
// attempt. Level 3 unlocks at 2,000 points and is sticky once earned.

const LEVEL_TARGET = 2000

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
      level: 2,
      levelName: 'Navigator',
      points: 1240,
      target: LEVEL_TARGET,
      streakDays: 21,
      promptsProtected: 47,
      itemsMasked: 12,
      trainingCompleted: false, // module 1 done — kept for back-compat with existing UI checks
      completedModules: [],
      stamps: [
        { title: 'AI BASICS', score: 'PASSED · 100%', date: '04 JAN 2026', shape: 'circle', color: '#078b6c' },
        { title: 'DATA PRIVACY', score: 'PASSED · 100%', date: '11 JAN 2026', shape: 'square', color: '#d92d20' },
        { title: 'SAFE PROMPTS', score: 'PASSED · 92%', date: '25 JAN 2026', shape: 'circle', color: '#365fd9' },
      ],
    },

    counters: { promptsToday: 312, maskedToday: 58, overridesToday: 0, nextEventNo: 8218, nextRequestNo: 493, nextAlertNo: 2052 },

    // Trailing 5-day organisational risk-score history — the live score is
    // appended by riskScore() so the trend line always ends on "today".
    riskHistory: [46, 43, 39, 36, 33],

    quiz: { 1: {}, 2: {}, 3: {} }, // moduleId -> { [questionIndex]: { correct } } — first attempt only

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

export function resetStore() {
  db = seed()
}

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

// Level is sticky once earned — dropping points later doesn't demote mid-demo.
export function applyPoints(delta) {
  const p = db.profile
  p.points = Math.max(0, p.points + delta)
  const computed = p.points >= LEVEL_TARGET ? 3 : 2
  const levelUp = computed > p.level
  if (levelUp) {
    p.level = computed
    p.levelName = 'Ambassador'
    addNotification({
      category: 'MILESTONE',
      title: 'Level 3 · Ambassador reached',
      body: 'You hit 2,000 safety points. New tools and data categories are now unlocked.',
      what: 'Your consistent safe-AI habits earned Level 3 · Ambassador. GitHub Copilot and additional data categories are now available within your Engineering role.',
      facts: [
        ['New level', 'Level 3 · Ambassador'],
        ['Unlocked', 'GitHub Copilot · source code scope'],
        ['Points', `${p.points.toLocaleString()} / ${p.target.toLocaleString()}`],
        ['Role limit', 'Engineering'],
        ['Next step', 'Visit My Visas to see the new visa'],
      ],
    })
  }
  return levelUp
}

function pushAuditEvent({ action, record }) {
  const event = {
    id: `EV-${db.counters.nextEventNo++}`,
    time: nowTime(),
    user: db.profile.id,
    dept: 'Eng',
    tool: 'AI Assistant',
    action,
    control: 'NIST GV.4',
    record: record.length > 60 ? record.slice(0, 57) + '…' : record,
  }
  db.auditEvents.unshift(event)
  db.auditEvents = db.auditEvents.slice(0, 50)
  db.counters.promptsToday += 1
  return event
}

export function recordPromptEvent({ detections, masked, tool = 'AI Assistant' }) {
  const total = detections.reduce((n, d) => n + d.count, 0)
  const clean = total === 0
  const event = pushAuditEvent({ action: clean ? 'CLEAN' : 'MASKED', record: masked })
  event.tool = tool
  event.control = clean ? 'NIST GV.4' : CONTROL_TAGS[detections[0].type] || 'NIST PR.DS'

  let levelUp = false
  if (clean) {
    // Clean prompts earn a small reward; masked prompts are protected but earn
    // nothing, so sensitive prompts can't be farmed for points.
    if (db.settings.experience.awardPoints) levelUp = applyPoints(2)
  } else {
    db.counters.maskedToday += total
    db.profile.promptsProtected += 1
    db.profile.itemsMasked += total
    const types = detections.map(d => `${d.type.toLowerCase()} ×${d.count}`).join(', ')
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
  return { event, levelUp }
}

// Overriding the checkpoint (Warn-only mode, "Send original anyway"):
// -20 points, streak reset, High alert for the admin, ALERT audit event.
export function recordOverride({ prompt }) {
  db.profile.streakDays = 0
  db.counters.overridesToday += 1
  applyPoints(-20)
  const event = pushAuditEvent({ action: 'ALERT', record: prompt })
  event.control = 'PDPA P7'
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

// ---- quiz (first attempt only earns points: +50 per correct) — per module ----

const MODULE_META = {
  1: { title: 'Spotting Personal Data in Prompts', stamp: 'PERSONAL DATA', stampColor: '#078b6c', stampShape: 'circle', next: 'Safe AI Tool Selection · 18 Jul' },
  2: { title: 'Safe AI Tool Selection', stamp: 'TOOL SELECTION', stampColor: '#078b6c', stampShape: 'square', next: 'Human Review in AI Decisions · 25 Jul' },
  3: { title: 'Human Review in AI Decisions', stamp: 'HUMAN REVIEW', stampColor: '#d92d20', stampShape: 'circle', next: 'More modules coming soon' },
}

export function answerQuiz(moduleId, question, correct) {
  const bucket = (db.quiz[moduleId] ??= {})
  if (bucket[question] === undefined) {
    bucket[question] = { correct }
    if (correct) applyPoints(50)
  }
  return quizResults(moduleId)
}

export function quizResults(moduleId) {
  const answers = db.quiz[moduleId] || {}
  const attempted = Object.keys(answers).length
  const correct = Object.values(answers).filter(a => a.correct).length
  return { answers, attempted, correct, total: 3, pointsEarned: correct * 50, profile: db.profile }
}

export function completeTraining(moduleId) {
  const meta = MODULE_META[moduleId] || MODULE_META[1]
  const results = quizResults(moduleId)
  if (!db.profile.completedModules.includes(moduleId)) {
    db.profile.completedModules.push(moduleId)
    if (moduleId === 1) db.profile.trainingCompleted = true
    db.profile.stamps.push({
      title: meta.stamp,
      score: `PASSED · ${Math.round((results.correct / results.total) * 100)}%`,
      date: todayDate().toUpperCase(),
      shape: meta.stampShape,
      color: meta.stampColor,
    })
    addNotification({
      category: 'TRAINING',
      title: 'Training stamp earned',
      body: `${meta.title} completed · ${results.correct}/${results.total} first-try correct · +${results.pointsEarned} safety miles.`,
      what: `You completed ${meta.title}. Points are earned for first-attempt correct answers, and the ${meta.stamp} stamp was added to your AI Passport.`,
      facts: [
        ['Module', meta.title],
        ['First-try score', `${results.correct}/${results.total}`],
        ['Stamp', meta.stamp],
        ['Reward', `+${results.pointsEarned} safety miles`],
        ['Next module', meta.next],
      ],
    })
  }
  return { ...results, profile: db.profile }
}

// ---- risk alerts ----

export function openAlerts() {
  return db.alerts.filter(a => a.status === 'open')
}

export function resolveAlert(id) {
  const a = db.alerts.find(x => x.id === id)
  if (a) a.status = 'resolved'
  return db.alerts
}

export function addReviewRequest(ref) {
  db.alerts.unshift({
    id: `RA-${db.counters.nextAlertNo++}`, severity: 'HIGH', status: 'open',
    title: 'Human review requested',
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

// ---- organisational AI risk score (proposal §6 — quantified governance) ----
// A single 0–100 score the board can read at a glance: LOWER is better. It is
// computed live from the same signals the admin already acts on, so resolving
// an alert or an employee overriding the gateway visibly moves the number.
// Each masked item is treated as one prevented exposure; RM value uses the
// IBM/Ponemon per-record breach cost (~USD 165 ≈ RM 780) as a defensible proxy.
const VALUE_PER_ITEM_RM = 780

export function riskScore() {
  const open = openAlerts()
  const high = open.filter(a => a.severity === 'HIGH').length
  const med = open.filter(a => a.severity === 'MEDIUM').length
  const mon = open.filter(a => a.severity === 'MONITORING').length
  const overrides = db.counters.overridesToday
  const pending = db.visaRequests.filter(r => ['SECURITY REVIEW', 'COMPLIANCE'].includes(r.status)).length
  const modulesDone = db.profile.completedModules.length
  const trainingGap = Math.max(0, 3 - modulesDone)

  // Each factor contributes points of risk; the gauge sums them (capped at 100).
  const factors = [
    { key: 'alerts', label: 'Unresolved risk alerts', points: high * 10 + med * 4 + mon * 1, detail: `${high} high · ${med} medium · ${mon} monitoring` },
    { key: 'override', label: 'Policy overrides today', points: overrides * 15, detail: overrides ? `${overrides} employee override${overrides === 1 ? '' : 's'}` : 'No overrides — gateway respected' },
    { key: 'shadow', label: 'Shadow-AI exposure', points: pending * 2, detail: `${pending} tool${pending === 1 ? '' : 's'} pending review` },
    { key: 'training', label: 'Training coverage gap', points: trainingGap * 1, detail: `${modulesDone}/3 core modules complete` },
    { key: 'residual', label: 'Baseline residual risk', points: 4, detail: 'Always-on gateway · masked storage' },
  ].map(f => ({ ...f, tone: f.points >= 12 ? 'high' : f.points >= 5 ? 'med' : 'low' }))

  const score = Math.min(100, Math.max(0, factors.reduce((n, f) => n + f.points, 0)))
  const band = score < 25 ? 'Low' : score < 45 ? 'Moderate' : score < 70 ? 'Elevated' : 'High'
  const trend = [...db.riskHistory, score]
  const prev = db.riskHistory[db.riskHistory.length - 1]

  const maskedToday = db.counters.maskedToday
  return {
    score, band, factors, trend,
    delta: score - prev, // negative = improving
    metrics: {
      promptsProtected: db.counters.promptsToday,
      itemsIntercepted: maskedToday,
      incidentsPrevented: maskedToday,
      valueProtected: maskedToday * VALUE_PER_ITEM_RM,
      overrides,
      confirmedLeaks: 0,
    },
  }
}

// ---- live demo simulator (pitch mode) --------------------------------------
// Injects synthetic org-wide activity so every admin screen visibly moves
// during a live demo. Runs on the server so audit log, KPIs, the department
// chart and the risk score all react from one source. Purely additive — it
// never touches the signed-in employee's own profile/points.
export const sim = { on: false, injected: 0 }

const SIM_USERS = [
  { user: 'F-102', dept: 'Fin' }, { user: 'S-044', dept: 'Sales' }, { user: 'S-051', dept: 'Sales' },
  { user: 'E-198', dept: 'Eng' }, { user: 'E-233', dept: 'Eng' }, { user: 'H-011', dept: 'HR' },
  { user: 'M-083', dept: 'Mkt' }, { user: 'O-031', dept: 'Ops' },
]
const SIM_TOOLS = ['ChatGPT', 'Gemini', 'Claude', 'Copilot']
const SIM_CLEAN = [
  'Explain the difference between SQL joins with examples',
  'Draft a polite follow-up email to a supplier about delivery',
  'Summarise the key points of our Q3 marketing strategy',
  'Write unit tests for a pagination helper function',
  'Rewrite this paragraph to be clearer and more concise',
]
const SIM_MASKED = [
  { record: 'Fix login bug reported by client [MASKED-NAME], ref [MASKED-RECORD]', control: 'PDPA P7' },
  ['Draft payment reminder for invoice [MASKED-RECORD], amount [MASKED-AMOUNT]', 'NIST PR.DS'],
  ['Reply to [MASKED-NAME] at [MASKED-EMAIL] about their account', 'PDPA P7'],
  ['Verify customer identity — IC [MASKED-IC], phone [MASKED-PHONE]', 'PDPA P7'],
  ['Review contractor onboarding for [MASKED-NAME], passport [MASKED-PASSPORT]', 'PDPA P7'],
]
const pick = arr => arr[Math.floor(Math.random() * arr.length)]

function pushSimEvent({ user, dept, tool, action, control, record }) {
  const event = {
    id: `EV-${db.counters.nextEventNo++}`,
    time: nowTime(), user, dept, tool, action,
    control: control || 'NIST GV.4',
    record: record.length > 60 ? record.slice(0, 57) + '…' : record,
    sim: true,
  }
  db.auditEvents.unshift(event)
  db.auditEvents = db.auditEvents.slice(0, 50)
  return event
}

// One tick of simulated traffic. Weighted so most prompts are clean, some are
// masked, and occasionally an unapproved-tool redirect or an override alert
// fires — enough variety to make the dashboard feel alive without spamming.
export function simulateTick() {
  const who = pick(SIM_USERS)
  const tool = pick(SIM_TOOLS)
  const roll = Math.random()
  db.counters.promptsToday += 1
  sim.injected += 1

  if (roll < 0.55) {
    pushSimEvent({ ...who, tool, action: 'CLEAN', record: pick(SIM_CLEAN) })
  } else if (roll < 0.9) {
    const m = pick(SIM_MASKED)
    const record = Array.isArray(m) ? m[0] : m.record
    const control = Array.isArray(m) ? m[1] : m.control
    const count = 1 + Math.floor(Math.random() * 2)
    db.counters.maskedToday += count
    pushSimEvent({ ...who, tool, action: 'MASKED', control, record })
  } else if (roll < 0.96) {
    pushSimEvent({ ...who, tool: 'SummarizerX', action: 'REDIRECTED', control: 'AIGE 4.2', record: 'Switched to approved tool · ChatGPT' })
  } else {
    // Rare high-risk override — also raises the live risk score.
    db.counters.overridesToday += 1
    pushSimEvent({ ...who, tool, action: 'ALERT', control: 'PDPA P7', record: 'Original prompt sent after gateway warning' })
    db.alerts.unshift({
      id: `RA-${db.counters.nextAlertNo++}`, severity: 'HIGH', status: 'open',
      title: 'Protected prompt overridden',
      meta: `${who.dept} · ${who.user} · just now`, due: 'Review today',
      detailMeta: `${who.dept} · User ${who.user} · detected today at ${nowTime()}`,
      what: 'An employee sent the original prompt after the gateway flagged sensitive content. Points were deducted and the event was logged for review.',
      evidence: 'Original sent by employee choice · flagged for review', evidenceNote: 'Simulated event · live demo',
      timeline: [[nowTime(), 'Override recorded'], ['—', 'Manager review pending']],
      recommend: 'Assign the 5-minute Data Privacy refresher.', primary: 'Assign training',
    })
  }
  return { injected: sim.injected }
}

// ---- compliance report data (single source for the AI report page) ---------
// Maps live detections to the controls they evidence so the report reads as a
// regulator-ready document rather than a static mock-up.
const REPORT_CONTROLS = [
  { type: 'Personal identifiers (IC, passport, phone, email, names)', framework: 'Malaysia PDPA · Principle 7 (Security)', evidence: 'Masked before transmission · raw values never stored' },
  { type: 'Financial figures (amounts, invoices)', framework: 'NIST AI RMF · MEASURE 2.7', evidence: 'Amounts tokenised · audit stores masked text only' },
  { type: 'Customer & case records', framework: 'PDPA · Principle 7 + retention limit', evidence: 'Reference IDs masked · 90-day purge enforced' },
  { type: 'Credentials & source secrets', framework: 'NIST AI RMF · MANAGE 2.2', evidence: 'Keys and secrets blocked at the gateway' },
  { type: 'AI-assisted decisions', framework: 'EU AI Act · Art. 14 (Human oversight)', evidence: 'Public review portal · independent human sign-off' },
  { type: 'AI literacy & training', framework: 'EU AI Act · Art. 4 (AI literacy)', evidence: 'Gamified licence · per-employee training stamps' },
]

export function reportData() {
  const risk = riskScore()
  const toolsApproved = db.visaRequests.filter(r => r.status === 'APPROVED').length
  const risksResolved = db.alerts.filter(a => a.status === 'resolved').length
  const today = todayDate()
  return {
    org: 'Example Sdn Bhd',
    period: '1–' + today.split(' ')[0] + ' ' + today.split(' ').slice(1).join(' '),
    generated: today,
    risk,
    controls: REPORT_CONTROLS,
    frameworks: [
      { name: 'NIST AI RMF', detail: 'Govern · Map · Measure · Manage — all evidenced', status: 'Compliant' },
      { name: 'EU AI Act', detail: 'Art. 4 literacy · Art. 14 human oversight · transparency', status: 'Compliant' },
      { name: 'Malaysia PDPA', detail: 'Personal-data handling · masking · 90-day retention', status: 'Compliant' },
    ],
    kpis: {
      promptsProtected: risk.metrics.promptsProtected,
      itemsMasked: risk.metrics.itemsIntercepted,
      toolsApproved,
      risksResolved,
      humanReviews: 11,
      confirmedLeaks: 0,
      valueProtected: risk.metrics.valueProtected,
    },
    topEvents: db.auditEvents.slice(0, 8),
  }
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
