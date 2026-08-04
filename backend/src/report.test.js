// Compliance report + offline recovery tests — run with `npm test` (backend).
//
// The report is the one screen a regulator would actually read, so what it
// claims at the bottom — "generated from the append-only audit log" — has to be
// literally true. These tests hold every figure to an event that produced it,
// and pin the two rules that make the recovery path safe to count: an offline
// event is recorded exactly once, and it earns no XP.
//
// Note: these tests exercise the real store, so they reset it — running them
// clears any saved demo progression in backend/data/progress.json.
import assert from 'node:assert/strict'
import {
  db, resetStore, reportSummary, recordPromptEvent, recordOfflineEvent,
  recordOverride, resolveAlert, decideVisa,
} from './store.js'

let passed = 0
function test(name, fn) {
  resetStore() // every case starts from the seeded period baseline
  fn()
  passed++
  console.log(`  ✓ ${name}`)
}

const IC = [{ type: 'IC', count: 1 }]

// ---- the baseline ----------------------------------------------------------

test('the seeded period matches the reference report', () => {
  const r = reportSummary()
  assert.equal(r.promptsProtected, 4120)
  assert.equal(r.itemsMasked, 612)
  assert.equal(r.toolsApproved, 8) // 7 before the period + 1 approved visa in the seed
  assert.equal(r.risksResolved, 3)
  assert.equal(r.humanReviews, 11)
  assert.equal(r.confirmedLeaks, 0)
  assert.equal(r.recoveredEvents, 0)
})

// ---- every figure traces to an event ---------------------------------------

test('a masked prompt moves prompts protected and items masked', () => {
  recordPromptEvent({ detections: [{ type: 'IC', count: 2 }], masked: 'x [MASKED-IC] [MASKED-IC]' })
  const r = reportSummary()
  assert.equal(r.promptsProtected, 4121)
  assert.equal(r.itemsMasked, 614)
})

test('a clean prompt is protected but masks nothing', () => {
  recordPromptEvent({ detections: [], masked: 'Explain SQL joins' })
  const r = reportSummary()
  assert.equal(r.promptsProtected, 4121)
  assert.equal(r.itemsMasked, 612)
})

test('an override is a confirmed data leak', () => {
  assert.equal(reportSummary().confirmedLeaks, 0)
  recordOverride({ prompt: 'send it anyway 880505-10-5566' })
  assert.equal(reportSummary().confirmedLeaks, 1)
})

test('resolving a human-review alert completes a human review', () => {
  resolveAlert('RA-2050') // seeded, kind: 'human-review'
  const r = reportSummary()
  assert.equal(r.humanReviews, 12)
  assert.equal(r.risksResolved, 4)
})

test('resolving the same alert twice cannot complete two reviews', () => {
  resolveAlert('RA-2050')
  resolveAlert('RA-2050')
  resolveAlert('RA-2050')
  assert.equal(reportSummary().humanReviews, 12)
})

test('resolving an ordinary alert is not a human review', () => {
  resolveAlert('RA-2048') // repeated identifiers — no `kind`
  const r = reportSummary()
  assert.equal(r.humanReviews, 11)
  assert.equal(r.risksResolved, 4)
})

test('approving a tool moves tools reviewed & approved', () => {
  decideVisa('A-0492', 'approve')
  assert.equal(reportSummary().toolsApproved, 9)
})

test('declining a tool does not', () => {
  decideVisa('A-0492', 'decline')
  assert.equal(reportSummary().toolsApproved, 8)
})

// ---- offline recovery ------------------------------------------------------

test('a recovered event is recorded, counted and marked', () => {
  const ok = recordOfflineEvent({
    id: 'q1', detections: IC, masked: 'client [MASKED-IC]',
    tool: 'ChatGPT', at: '2026-08-04T09:12:00.000Z',
  })
  assert.equal(ok, true)

  const r = reportSummary()
  assert.equal(r.promptsProtected, 4121)
  assert.equal(r.itemsMasked, 613)
  assert.equal(r.recoveredEvents, 1)

  const event = db.auditEvents[0]
  assert.equal(event.offline, true)
  assert.ok(event.recordedAt, 'a recovered event carries when it reached the log')
  assert.notEqual(event.time, event.recordedAt, 'occurred-at and recorded-at are distinct')
})

// The flush is retried whenever the gateway answers, and a response that never
// arrives leaves the extension holding events the backend already took. Without
// this, one flaky reconnection inflates every figure above.
test('the same offline event can never be counted twice', () => {
  const first = recordOfflineEvent({ id: 'q1', detections: IC, masked: 'a [MASKED-IC]' })
  const again = recordOfflineEvent({ id: 'q1', detections: IC, masked: 'a [MASKED-IC]' })
  assert.equal(first, true)
  assert.equal(again, false)

  const r = reportSummary()
  assert.equal(r.promptsProtected, 4121)
  assert.equal(r.itemsMasked, 613)
  assert.equal(r.recoveredEvents, 1)
  assert.equal(db.auditEvents.filter(e => e.offline).length, 1)
})

test('an event with no id is refused rather than recorded unverifiably', () => {
  assert.equal(recordOfflineEvent({ detections: IC, masked: 'a [MASKED-IC]' }), false)
  assert.equal(reportSummary().recoveredEvents, 0)
})

// XP is a reward for behaviour the gateway witnessed. A recovered clean prompt
// was scored on the employee's own device, so paying it retroactively would let
// an outage become a way to earn — and is exactly what an auditor would pull on.
test('a recovered clean prompt earns no XP', () => {
  const before = db.profile.points
  recordOfflineEvent({ id: 'q2', detections: [], masked: 'Explain SQL joins', at: null })
  assert.equal(db.profile.points, before)
  assert.equal(reportSummary().recoveredEvents, 1)
})

test('a live clean prompt still earns XP', () => {
  const before = db.profile.points
  recordPromptEvent({ detections: [], masked: 'Explain SQL joins' })
  assert.equal(db.profile.points, before + 2)
})

// A recovered event must never re-notify: the employee already saw the
// checkpoint on-device when it happened.
test('a recovered event does not notify the employee again', () => {
  const before = db.notifications.length
  recordOfflineEvent({ id: 'q3', detections: IC, masked: 'a [MASKED-IC]' })
  assert.equal(db.notifications.length, before)
})

test('a live masked prompt does notify', () => {
  const before = db.notifications.length
  recordPromptEvent({ detections: IC, masked: 'a [MASKED-IC]' })
  assert.equal(db.notifications.length, before + 1)
})

resetStore()
console.log(`\n${passed} report tests passed`)
