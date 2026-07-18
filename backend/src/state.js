// In-memory demo state — one shared "world" for the whole prototype so every
// screen (employee + admin) reads the same numbers. Resets on server restart
// or via POST /api/reset. Firebase remains the planned persistent store.
import { maskPromptFull } from './layer2.js'

const LEVEL_TARGET = 2000

function seedAlerts() {
  return [
    { id: 1, level: 'High', color: 'red', title: 'Repeated IC numbers in prompts', sub: 'Finance · user F-102 · 4 events · today', action: 'Assign refresher training →', status: 'open' },
    { id: 2, level: 'Medium', color: 'amber', title: 'Unapproved tool detected', sub: 'Sales · "SummarizerX" · redirected to approved', action: 'Review tool request →', status: 'open' },
    { id: 3, level: 'Medium', color: 'amber', title: 'AI-assisted decision flagged', sub: 'HR screening · human review requested', action: 'Open review case →', status: 'open' },
    { id: 4, level: 'Low', color: 'slate', title: 'License level below department average', sub: 'Marketing · user M-019 · Level 1', action: 'Nudge training →', status: 'open' },
  ]
}

function seedApprovals() {
  return [
    { id: 1, tool: 'SummarizerX', dept: 'Sales', requester: 'S-044 · Wei Ling', purpose: 'Summarise long customer call transcripts into follow-up notes.', vendor: 'Reviewed', dataAccess: 'Reviewed' },
    { id: 2, tool: 'Claude for Sheets', dept: 'Finance', requester: 'F-102 · Ahmad Rizal', purpose: 'Draft formulas and clean up monthly reconciliation sheets.', vendor: 'Pending', dataAccess: 'Pending' },
  ]
}

function seedEvents() {
  return [
    { t: '14:02', u: 'E-217', d: 'Eng', tool: 'ChatGPT', s: 'MASKED', text: 'Fix bug for client [MASKED-NAME] in module…' },
    { t: '13:58', u: 'F-102', d: 'Fin', tool: 'Gemini', s: 'ALERT', text: 'Summarise payment of [MASKED-IC] invoice…' },
    { t: '13:51', u: 'S-044', d: 'Sales', tool: 'SummarizerX', s: 'REDIRECTED', text: '→ switched to approved tool (ChatGPT)' },
    { t: '13:47', u: 'E-198', d: 'Eng', tool: 'ChatGPT', s: 'CLEAN', text: 'Explain difference between SQL joins…' },
    { t: '13:40', u: 'H-011', d: 'HR', tool: 'Gemini', s: 'MASKED', text: 'Draft letter to [MASKED-NAME], [MASKED-PHONE]…' },
  ]
}

const COLLEAGUES = [
  { name: 'Lim Kai Wen', dept: 'Engineering', points: 1725 },
  { name: 'Nurul Aisyah', dept: 'Engineering', points: 1610 },
  { name: 'Priya Kumar', dept: 'Engineering', points: 1445 },
  { name: 'Daniel Wong', dept: 'Engineering', points: 1320 },
  { name: 'Mei Xin', dept: 'Engineering', points: 1180 },
  { name: 'Jason Teh', dept: 'Engineering', points: 950 },
]

function makeState(overrides = {}) {
  return {
    profile: {
      id: 'E-217', name: 'Tan Jia Yin', dept: 'Engineering',
      level: 2, points: 1240, streakDays: 21,
      promptsProtected: 47, itemsMasked: 12,
      target: LEVEL_TARGET,
      ...overrides,
    },
    stats: { promptsToday: 312, maskedToday: 58, engineeringPrompts: 420 },
    alerts: seedAlerts(),
    approvals: seedApprovals(),
    events: seedEvents(),
    quiz: {}, // { [questionIndex]: { picked, correct } } — first attempt only
    nextAlertId: 5,
  }
}

let state = makeState()

export function getState() { return state }

export function reset(overrides) {
  state = makeState(overrides)
  return state
}

function now() {
  return new Date().toTimeString().slice(0, 5)
}

function applyPoints(delta) {
  const p = state.profile
  p.points = Math.max(0, p.points + delta)
  // Level is sticky once earned — dropping points later doesn't demote mid-demo.
  const computed = p.points >= LEVEL_TARGET ? 3 : 2
  const levelUp = computed > p.level
  if (levelUp) p.level = computed
  return levelUp
}

function pushEvent(s, text) {
  state.events.unshift({ t: now(), u: 'E-217', d: 'Eng', tool: 'ChatGPT', s, text })
  state.events = state.events.slice(0, 50)
  state.stats.promptsToday += 1
  state.stats.engineeringPrompts += 1
}

// Points rules (proposal §5): masking protects but does NOT earn points (so
// sensitive prompts can't be farmed); clean prompts +2; overriding the
// checkpoint and sending the original costs -20 and resets the streak.
export async function recordSend(text, override = false) {
  const { masked, detections, layer2 } = await maskPromptFull(text)
  let delta, sentText, status
  if (detections.length === 0) {
    delta = 2
    sentText = text
    status = 'CLEAN'
  } else if (!override) {
    delta = 0
    sentText = masked
    status = 'MASKED'
    state.profile.promptsProtected += 1
    const items = detections.reduce((n, d) => n + d.count, 0)
    state.profile.itemsMasked += items
    state.stats.maskedToday += items
  } else {
    delta = -20
    sentText = text
    status = 'ALERT'
    state.profile.streakDays = 0
    state.alerts.unshift({
      id: state.nextAlertId++, level: 'High', color: 'red',
      title: 'Protected prompt overridden', sub: `Engineering · E-217 · just now`,
      action: 'Assign refresher training →', status: 'open',
    })
  }
  const levelUp = applyPoints(delta)
  pushEvent(status, sentText.slice(0, 60) + (sentText.length > 60 ? '…' : ''))
  return { sentText, status, detections, delta, levelUp, layer2, profile: state.profile }
}

export function answerQuiz(question, picked, correct) {
  if (state.quiz[question] === undefined) {
    state.quiz[question] = { picked, correct }
    if (correct) applyPoints(50)
  }
  return quizResults()
}

export function quizResults() {
  const answers = state.quiz
  const attempted = Object.keys(answers).length
  const correct = Object.values(answers).filter(a => a.correct).length
  return { answers, attempted, correct, pointsEarned: correct * 50, profile: state.profile }
}

export function resolveAlert(id) {
  const a = state.alerts.find(x => x.id === Number(id))
  if (a) a.status = 'resolved'
  return openAlerts()
}

export function openAlerts() {
  return state.alerts.filter(a => a.status === 'open')
}

export function addReviewRequest(ref) {
  state.alerts.unshift({
    id: state.nextAlertId++, level: 'High', color: 'red',
    title: 'Human review requested', sub: `Public portal · ref ${ref} · just now`,
    action: 'Open review case →', status: 'open',
  })
  return openAlerts()
}

export function decideApproval(id) {
  state.approvals = state.approvals.filter(a => a.id !== Number(id))
  return state.approvals
}

export function summaryStats() {
  return {
    promptsToday: state.stats.promptsToday,
    maskedToday: state.stats.maskedToday,
    engineeringPrompts: state.stats.engineeringPrompts,
    activeAlerts: openAlerts().length,
    pendingApprovals: state.approvals.length,
    avgLevel: state.profile.level >= 3 ? 2.2 : 2.1,
  }
}

export function leaderboard() {
  const rows = [
    ...COLLEAGUES,
    { name: state.profile.name, dept: state.profile.dept, points: state.profile.points, you: true },
  ].sort((a, b) => b.points - a.points)
  return rows.map((r, i) => ({ ...r, rank: i + 1 }))
}
