// Risk alert rules — run with `npm test` (backend).
//
// The point of these is that the queue stays worth reading. Two failures would
// each destroy it in opposite directions: alerting on every protected prompt
// (so an admin learns to ignore the queue), and opening a new card every time a
// pattern repeats (so the queue is five copies of one finding). Both are pinned
// here, along with the severity each rule earns.
//
// Note: these tests exercise the real store, so they reset it — running them
// clears any saved demo state in backend/data/progress.json.
import assert from 'node:assert/strict'
import {
  db, resetStore, setSessionEmployee, recordPromptEvent, recordOfflineEvent, recordOverride,
  recordToolUse, toolStatus, alertsView, resolveAlert, decideVisa, suspendToolOrgWide,
  notificationsFor, openAlerts,
  REPEAT_WARN_AT, REPEAT_ESCALATE_AT, REPEAT_WINDOW_MINUTES,
} from './store.js'
import { dueLabel, pruneRepeats, repeatCounts, repeatVerdict, SEVERITY } from './risk.js'

let passed = 0
function test(name, fn) {
  resetStore()
  setSessionEmployee('E-217')
  fn()
  passed++
  console.log(`  ✓ ${name}`)
}

const IC = [{ type: 'IC', count: 1 }]
const alertsFor = title => openAlerts().filter(a => a.title === title)
const maskPrompt = (detections = IC) =>
  recordPromptEvent({ detections, masked: 'client [MASKED-IC]', tool: 'ChatGPT' })

// ---- rule 1: repeated identifiers ------------------------------------------

test('one protected prompt raises nothing — the gateway working is not a risk', () => {
  const before = openAlerts().length
  maskPrompt()
  assert.equal(openAlerts().length, before)
})

test(`${REPEAT_WARN_AT} of the same identifier raises one MEDIUM alert`, () => {
  for (let i = 0; i < REPEAT_WARN_AT; i++) maskPrompt()
  const raised = alertsFor('Repeated identifiers in prompts').filter(a => a.employeeId === 'E-217')
  assert.equal(raised.length, 1)
  assert.equal(raised[0].severity, SEVERITY.MEDIUM)
  // The count on the card is the evidence the rule counted, so it matches the
  // figure the alert's own text quotes.
  assert.equal(raised[0].occurrences, REPEAT_WARN_AT)
  assert.match(raised[0].what, new RegExp(`^${REPEAT_WARN_AT} prompts`))
})

test(`${REPEAT_ESCALATE_AT} escalates the same alert to HIGH instead of opening a second`, () => {
  for (let i = 0; i < REPEAT_ESCALATE_AT; i++) maskPrompt()
  const raised = alertsFor('Repeated identifiers in prompts').filter(a => a.employeeId === 'E-217')
  assert.equal(raised.length, 1, 'still exactly one card')
  assert.equal(raised[0].severity, SEVERITY.HIGH)
  assert.equal(raised[0].occurrences, REPEAT_ESCALATE_AT, 'the card counts every masked instance')
  assert.ok(raised[0].timeline.some(([, e]) => e.includes('Escalated to HIGH')))
})

test('different identifier types are counted separately', () => {
  // Two of each: neither type reaches the threshold, so nothing is raised.
  maskPrompt([{ type: 'IC', count: 1 }])
  maskPrompt([{ type: 'IC', count: 1 }])
  maskPrompt([{ type: 'PHONE', count: 1 }])
  maskPrompt([{ type: 'PHONE', count: 1 }])
  assert.equal(alertsFor('Repeated identifiers in prompts').filter(a => a.employeeId === 'E-217').length, 0)
})

test('one prompt carrying the same identifier three times counts as three', () => {
  maskPrompt([{ type: 'IC', count: REPEAT_WARN_AT }])
  assert.equal(alertsFor('Repeated identifiers in prompts').filter(a => a.employeeId === 'E-217').length, 1)
})

test('two employees do not add up to one pattern', () => {
  setSessionEmployee('E-217')
  maskPrompt()
  maskPrompt()
  setSessionEmployee('E-198')
  maskPrompt()
  assert.equal(alertsFor('Repeated identifiers in prompts').filter(a => a.employeeId === 'E-198').length, 0)
  assert.equal(alertsFor('Repeated identifiers in prompts').filter(a => a.employeeId === 'E-217').length, 0)
})

test('the employee is told before the manager acts', () => {
  for (let i = 0; i < REPEAT_WARN_AT; i++) maskPrompt()
  const told = notificationsFor('E-217').filter(n => n.title === 'A pattern was spotted in your prompts')
  assert.equal(told.length, 1)
  assert.equal(told[0].action.to, '/training')
})

// A gateway outage must not manufacture a pattern: recovered events are minutes
// or hours old, so counting them as "just now" would raise an alert for
// behaviour that was never bunched together in real time.
test('recovered offline events do not feed the pattern window', () => {
  for (let i = 0; i < REPEAT_ESCALATE_AT; i++) {
    recordOfflineEvent({ id: `q${i}`, detections: IC, masked: 'a [MASKED-IC]' })
  }
  assert.equal(alertsFor('Repeated identifiers in prompts').filter(a => a.employeeId === 'E-217').length, 0)
})

test('events age out of the window', () => {
  const now = Date.now()
  const events = [
    { employeeId: 'E-217', type: 'IC', at: now - (REPEAT_WINDOW_MINUTES + 1) * 60_000 },
    { employeeId: 'E-217', type: 'IC', at: now },
  ]
  assert.equal(pruneRepeats(events, now).length, 1)
})

test('the verdict is silent below the threshold', () => {
  assert.equal(repeatVerdict({ IC: REPEAT_WARN_AT - 1 }), null)
  assert.equal(repeatVerdict({}), null)
  assert.equal(repeatVerdict({ IC: REPEAT_WARN_AT }).severity, SEVERITY.MEDIUM)
  assert.equal(repeatVerdict({ IC: REPEAT_ESCALATE_AT }).severity, SEVERITY.HIGH)
})

test('the verdict names the identifier that repeated most', () => {
  const v = repeatVerdict({ IC: 2, PHONE: REPEAT_WARN_AT + 1 })
  assert.equal(v.type, 'PHONE')
})

test('counts are per employee', () => {
  const events = [
    { employeeId: 'E-217', type: 'IC', at: Date.now() },
    { employeeId: 'E-198', type: 'IC', at: Date.now() },
  ]
  assert.deepEqual(repeatCounts(events, 'E-217'), { IC: 1 })
})

// ---- rule 2: unapproved tool ------------------------------------------------

test('an approved tool raises nothing', () => {
  const before = openAlerts().length
  const result = recordToolUse({ tool: 'ChatGPT' })
  assert.equal(result.status, 'APPROVED')
  assert.equal(result.alert, null)
  assert.equal(openAlerts().length, before)
})

test('a tool with no approved access raises one MEDIUM alert', () => {
  const result = recordToolUse({ tool: 'DeepSeek' })
  assert.equal(result.status, 'UNAPPROVED')
  assert.equal(result.alert.severity, SEVERITY.MEDIUM)
  assert.equal(result.alert.title, 'Unapproved tool detected')
  assert.equal(result.alert.employeeId, 'E-217')
})

test('re-opening the same tool does not fill the queue', () => {
  recordToolUse({ tool: 'DeepSeek' })
  recordToolUse({ tool: 'DeepSeek' })
  recordToolUse({ tool: 'DeepSeek' })
  assert.equal(alertsFor('Unapproved tool detected').filter(a => a.employeeId === 'E-217').length, 1)
})

test('a suspended tool is HIGH, not MEDIUM', () => {
  suspendToolOrgWide('Fable 5')
  const result = recordToolUse({ tool: 'Fable 5' })
  assert.equal(result.status, 'SUSPENDED')
  assert.equal(result.alert.severity, SEVERITY.HIGH)
  assert.equal(result.alert.title, 'Suspended tool used')
})

test('the employee is told which tool, and where to fix it', () => {
  recordToolUse({ tool: 'DeepSeek' })
  const told = notificationsFor('E-217').filter(n => n.title === 'DeepSeek is not an approved tool')
  assert.equal(told.length, 1)
  assert.equal(told[0].action.to, '/tools')
})

test('approving tool access is what stops the tool being flagged', () => {
  assert.equal(toolStatus('SummarizerX'), 'UNAPPROVED')
  assert.equal(recordToolUse({ tool: 'SummarizerX' }).alert.severity, SEVERITY.MEDIUM)

  decideVisa('A-0492', 'approve') // the seeded SummarizerX request
  assert.equal(toolStatus('SummarizerX'), 'APPROVED')
  assert.equal(recordToolUse({ tool: 'SummarizerX' }).alert, null)
})

test('declining tool access leaves the tool unapproved', () => {
  decideVisa('A-0492', 'decline')
  assert.equal(toolStatus('SummarizerX'), 'UNAPPROVED')
})

test('a tool nobody has heard of is treated as unapproved', () => {
  assert.equal(toolStatus('SomeRandomAI'), 'UNAPPROVED')
  assert.equal(recordToolUse({ tool: 'SomeRandomAI' }).alert.severity, SEVERITY.MEDIUM)
})

// ---- rule 3: override --------------------------------------------------------

test('an override is HIGH on its first occurrence', () => {
  recordOverride({ prompt: 'send it anyway 880505-10-5566' })
  const raised = alertsFor('Protected prompt overridden')
  assert.equal(raised.length, 1)
  assert.equal(raised[0].severity, SEVERITY.HIGH)
})

test('repeated overrides escalate one alert rather than flooding the queue', () => {
  recordOverride({ prompt: 'once 880505-10-5566' })
  recordOverride({ prompt: 'twice 880505-10-5566' })
  const raised = alertsFor('Protected prompt overridden')
  assert.equal(raised.length, 1)
  assert.equal(raised[0].occurrences, 2)
})

// ---- the queue ---------------------------------------------------------------

test('the queue is ordered open-first, then most severe', () => {
  const view = alertsView()
  const open = view.filter(a => a.status === 'open')
  const rank = { HIGH: 3, MEDIUM: 2, MONITORING: 1 }
  for (let i = 1; i < open.length; i++) {
    assert.ok(rank[open[i - 1].severity] >= rank[open[i].severity], 'severity never increases down the queue')
  }
  assert.ok(view.findIndex(a => a.status === 'resolved') === -1 || view.at(-1).status === 'resolved')
})

test('the due countdown is derived on read, not stored stale', () => {
  const alert = alertsView().find(a => a.dueAt)
  assert.ok(alert.due.startsWith('Due in') || alert.due.startsWith('Overdue by'))
  assert.equal(dueLabel(new Date(Date.now() + 90 * 60_000).toISOString()), 'Due in 1h 30m')
  assert.equal(dueLabel(new Date(Date.now() - 5 * 60_000).toISOString()), 'Overdue by 5m')
})

test('resolving records who closed it and when', () => {
  const target = openAlerts()[0]
  resolveAlert(target.id)
  const after = db.alerts.find(a => a.id === target.id)
  assert.equal(after.status, 'resolved')
  assert.ok(after.resolvedAt)
  assert.ok(after.timeline.some(([, e]) => e.includes('Resolved by Admin')))
})

test('a resolved pattern that returns opens a fresh alert', () => {
  for (let i = 0; i < REPEAT_WARN_AT; i++) maskPrompt()
  const first = alertsFor('Repeated identifiers in prompts').find(a => a.employeeId === 'E-217')
  resolveAlert(first.id)
  // The window still holds the earlier events, so one more masked prompt is
  // enough to cross the threshold again — and it must not silently rejoin a
  // closed case.
  maskPrompt()
  const open = alertsFor('Repeated identifiers in prompts').filter(a => a.employeeId === 'E-217')
  assert.equal(open.length, 1)
  assert.notEqual(open[0].id, first.id)
})

resetStore()
console.log(`\n${passed} risk tests passed`)
