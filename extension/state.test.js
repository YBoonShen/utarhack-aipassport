// Extension protection-state tests — run with `npm test` (backend).
//
// state.js is the extension's whole answer to "is this employee protected?", and
// the interesting part of it is the difference between two failures that look
// identical from inside a browser: the backend said nobody is signed in, and the
// backend did not answer. One of those must switch protection off. The other
// must not, or a two-second network blip would end a working session — and after
// long enough it must stop claiming anything at all.
//
// Pure functions with an injected clock, so none of this is timing-dependent.

import assert from 'node:assert/strict'

await import('./state.js')
const STATE = globalThis.AIP_STATE
const GRACE = STATE.AUTH_GRACE_MS

let passed = 0
function test(name, fn) {
  fn()
  passed++
  console.log(`  ✓ ${name}`)
}

const EMPLOYEE = { role: 'employee', id: 'E-217', name: 'Tan Jia Yin' }
const ADMIN = { role: 'admin', id: 'AD-001', name: 'Admin' }
const NOW = 1_700_000_000_000

// ---- what the backend confirmed --------------------------------------------

test('a signed-in employee with the backend answering is protected', () => {
  const s = STATE.derive({ user: EMPLOYEE, online: true, now: NOW })
  assert.equal(s.status, 'active')
  assert.equal(s.active, true)
  assert.equal(s.signedIn, true)
  // Answering is the confirmation.
  assert.equal(s.verifiedAt, NOW)
})

test('the backend saying nobody is signed in switches protection off', () => {
  const s = STATE.derive({ user: null, online: true, now: NOW })
  assert.equal(s.status, 'signedOut')
  assert.equal(s.active, false)
  assert.equal(s.signedIn, false)
})

test('an admin session is not an employee session', () => {
  const s = STATE.derive({ user: ADMIN, online: true, now: NOW })
  assert.equal(s.status, 'notEmployee')
  assert.equal(s.active, false)
})

// ---- what the backend did not say ------------------------------------------

test('nothing known at all is "unavailable", never "signed out"', () => {
  // A browser profile that has never reached the backend. Reporting a sign-out
  // here would blame the employee for a service that is not running.
  const s = STATE.derive({ user: null, online: false, verifiedAt: 0, now: NOW })
  assert.equal(s.status, 'offline')
  assert.equal(s.signedIn, false)
  assert.equal(s.active, false)
})

test('a brief outage does not end a session that was just confirmed', () => {
  const s = STATE.derive({ user: EMPLOYEE, online: false, verifiedAt: NOW - 5_000, now: NOW })
  assert.equal(s.status, 'degraded')
  // Protection stays on: an outage is when it matters most, and the local
  // Layer 1 rules still mask rather than block or leak.
  assert.equal(s.active, true)
  assert.equal(s.signedIn, true)
})

test('a session nobody has been able to confirm stops counting as one', () => {
  const s = STATE.derive({ user: EMPLOYEE, online: false, verifiedAt: NOW - GRACE - 1, now: NOW })
  assert.equal(s.status, 'unverified')
  assert.equal(s.active, false)
  assert.equal(s.signedIn, false)
})

test('the grace window is a boundary, not a slope', () => {
  const at = t => STATE.derive({ user: EMPLOYEE, online: false, verifiedAt: NOW - t, now: NOW }).status
  assert.equal(at(GRACE - 1), 'degraded')
  assert.equal(at(GRACE), 'degraded')
  assert.equal(at(GRACE + 1), 'unverified')
})

test('a confirmed sign-out survives a later outage', () => {
  // The backend said nobody was signed in, and then went away. An outage cannot
  // sign anybody *in*, so this stays a sign-out rather than becoming "unknown".
  const s = STATE.derive({ user: null, online: false, verifiedAt: NOW - 60_000, now: NOW })
  assert.equal(s.status, 'signedOut')
})

test('a failed request never counts as a confirmation', () => {
  const confirmed = NOW - 30_000
  const s = STATE.derive({
    user: EMPLOYEE, online: false, verifiedAt: confirmed, error: 'fetch failed', now: NOW,
  })
  // Still the old timestamp: the clock that decides the grace window may only be
  // moved by an answer. Otherwise every retry would renew the window and
  // `unverified` could never be reached.
  assert.equal(s.verifiedAt, confirmed)
  assert.equal(s.error, 'fetch failed')
})

test('signing back in restores protection with no other input', () => {
  const lapsed = STATE.derive({ user: EMPLOYEE, online: false, verifiedAt: NOW - GRACE - 1, now: NOW })
  assert.equal(lapsed.active, false)
  const back = STATE.derive({ user: EMPLOYEE, online: true, verifiedAt: lapsed.verifiedAt, now: NOW + 1_000 })
  assert.equal(back.status, 'active')
  assert.equal(back.active, true)
})

// ---- how it is described ---------------------------------------------------

test('every state has words, and only "active" claims protection', () => {
  for (const status of ['active', 'degraded', 'unverified', 'signedOut', 'notEmployee', 'offline', 'unknown']) {
    const s = STATE.summary({ status }, 'ChatGPT')
    assert.ok(s.title && s.note, `${status} has copy`)
    if (status !== 'active') {
      assert.notEqual(s.kicker, 'PROTECTION ACTIVE', `${status} does not claim protection`)
    }
  }
  assert.equal(STATE.summary({ status: 'active' }).kicker, 'PROTECTION ACTIVE')
  assert.equal(STATE.summary({ status: 'unverified' }).kicker, 'PROTECTION OFF')
  // Recoverable by trying again, so it offers to.
  assert.equal(STATE.summary({ status: 'unverified' }).retry, true)
})

test('the state before anything is resolved says "checking", not "off"', () => {
  assert.equal(STATE.UNKNOWN.status, 'unknown')
  assert.equal(STATE.UNKNOWN.active, false)
  assert.equal(STATE.summary(STATE.UNKNOWN).kicker, 'CHECKING')
})

console.log(`\n${passed} extension state tests passed`)
