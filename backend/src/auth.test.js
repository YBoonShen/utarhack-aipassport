// Authentication tests — run with `npm test` (backend).
//
// Two halves, because there are two things that can be wrong.
//
//   The registry (auth.js) — does a token mean what it says? Tested with an
//   injected clock, so expiry is exact rather than timed.
//
//   The API (server.js) — does the server refuse what it should refuse? These
//   run against the real Express app on an ephemeral port, and the ones that
//   matter most are the refusals: an unauthenticated caller claiming to be an
//   administrator, a token the registry has never seen, and a session that has
//   run out. Each of those used to be a way in.
//
// Note: these exercise the real store, so they reset it — running them clears
// any saved demo progression in backend/data/progress.json.

import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// Set before anything imports auth.js: the lifetimes and the file it persists to
// are read once, at module load. A scratch file keeps the demo's own sessions —
// whoever is signed in right now — out of the test's way.
const SESSION_FILE = path.join(os.tmpdir(), `aip-sessions-test-${process.pid}.json`)
process.env.AUTH_SESSION_FILE = SESSION_FILE
process.env.AUTH_SESSION_IDLE_MS = '800'
process.env.AUTH_SESSION_MAX_MS = '2000'

const auth = await import('./auth.js')
const { app } = await import('./server.js')
const { resetStore } = await import('./store.js')

let passed = 0
async function test(name, fn) {
  await fn()
  passed++
  console.log(`  ✓ ${name}`)
}

const EMPLOYEE = { role: 'employee', id: 'E-217', initials: 'JY', name: 'Tan Jia Yin' }
const ADMIN = { role: 'admin', id: 'AD-001', initials: 'AD', name: 'Admin' }

// ---- the registry ----------------------------------------------------------

await test('a token this registry never issued is not a session', () => {
  auth.resetSessions()
  assert.equal(auth.verifySession('').reason, 'missing')
  assert.equal(auth.verifySession(undefined).reason, 'missing')
  // The shape of a hand-made credential: plausible, and meaningless.
  assert.equal(auth.verifySession('admin').reason, 'invalid')
  assert.equal(auth.verifySession('a'.repeat(43)).reason, 'invalid')
})

await test('a fresh session verifies, and names the user the server recorded', () => {
  auth.resetSessions()
  const session = auth.createSession(EMPLOYEE)
  const result = auth.verifySession(session.token)
  assert.equal(result.ok, true)
  assert.deepEqual(result.session.user, EMPLOYEE)
  // The identity comes off the record. Nothing the caller sends contributes.
  assert.equal(result.session.user.role, 'employee')
})

await test('two sign-ins are two sessions — one ending does not end the other', () => {
  auth.resetSessions()
  const first = auth.createSession(EMPLOYEE)
  const second = auth.createSession(ADMIN)
  auth.destroySession(second.token)
  assert.equal(auth.verifySession(first.token).ok, true)
  assert.equal(auth.verifySession(second.token).reason, 'invalid')
})

await test('an idle session expires, and expiring destroys it', () => {
  auth.resetSessions()
  const t0 = 1_000_000
  const session = auth.createSession(EMPLOYEE, t0)

  assert.equal(auth.verifySession(session.token, { now: t0 + 799 }).ok, true)
  // 800ms idle from that last touch.
  const lapsed = auth.verifySession(session.token, { now: t0 + 799 + 800 })
  assert.equal(lapsed.ok, false)
  assert.equal(lapsed.reason, 'expired')
  // Gone, not merely refused — a lapsed session cannot come back.
  assert.equal(auth.verifySession(session.token, { now: t0 }).reason, 'invalid')
})

await test('using a session keeps it alive; the absolute cap ends it anyway', () => {
  auth.resetSessions()
  const t0 = 2_000_000
  const session = auth.createSession(EMPLOYEE, t0)

  // Touched every 500ms — comfortably inside the 800ms idle window each time.
  for (let t = 500; t <= 1500; t += 500) {
    assert.equal(auth.verifySession(session.token, { now: t0 + t }).ok, true, `alive at +${t}`)
  }
  // …but 2000ms after it was issued it ends regardless of how busy it was, so a
  // token that leaked cannot be renewed forever.
  assert.equal(auth.verifySession(session.token, { now: t0 + 2000 }).reason, 'expired')
})

await test('the session the extension follows is the newest sign-in', () => {
  auth.resetSessions()
  auth.createSession(EMPLOYEE)
  assert.equal(auth.activeSession().user.id, 'E-217')
  auth.createSession(ADMIN)
  assert.equal(auth.activeSession().user.role, 'admin')
})

await test('signing out clears what the extension follows', () => {
  auth.resetSessions()
  const session = auth.createSession(EMPLOYEE)
  assert.equal(auth.activeSession()?.user.id, 'E-217')
  auth.destroySession(session.token)
  assert.equal(auth.activeSession(), null)
})

await test('the extension reading the session does not keep it alive', () => {
  auth.resetSessions()
  const t0 = 3_000_000
  auth.createSession(EMPLOYEE, t0)
  // An open ChatGPT tab polls "who is signed in" every few seconds. If that
  // counted as use, a browser nobody is sitting at would hold a session open
  // indefinitely — so reads do not touch.
  for (let t = 200; t <= 600; t += 200) assert.ok(auth.activeSession(t0 + t))
  assert.equal(auth.activeSession(t0 + 900), null)
})

// ---- the API ---------------------------------------------------------------

const server = app.listen(0)
await new Promise(resolve => server.once('listening', resolve))
const BASE = `http://127.0.0.1:${server.address().port}/api`

async function call(pathname, { token, method = 'GET', body, headers = {} } = {}) {
  const res = await fetch(`${BASE}${pathname}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  return { status: res.status, body: await res.json().catch(() => null) }
}

const signIn = (role, email) =>
  call('/auth/login', { method: 'POST', body: { role, email } })

await test('a fresh browser is signed out — nobody is, and the server says so', async () => {
  auth.resetSessions()
  const res = await call('/auth/session')
  assert.equal(res.status, 200)
  assert.equal(res.body.user, null)
  assert.equal(res.body.authenticated, false)
})

await test('signing in returns a session token and the server\'s own record of the user', async () => {
  auth.resetSessions()
  const res = await signIn('employee', 'jiayin.tan@abcd.com')
  assert.equal(res.status, 200)
  assert.equal(typeof res.body.token, 'string')
  assert.ok(res.body.token.length >= 32)
  assert.equal(res.body.user.role, 'employee')
  assert.ok(res.body.expiresAt > Date.now())
})

await test('the token, and only the token, produces an authenticated session', async () => {
  auth.resetSessions()
  const { body: { token, user } } = await signIn('employee', 'jiayin.tan@abcd.com')

  const good = await call('/auth/session', { token })
  assert.equal(good.status, 200)
  assert.equal(good.body.authenticated, true)
  assert.equal(good.body.user.id, user.id)

  // The shape of a stale token in localStorage after a server restart or a
  // sign-out elsewhere: 401 with a reason, so the browser knows to clear it
  // rather than to keep trying.
  const bad = await call('/auth/session', { token: 'not-a-real-token' })
  assert.equal(bad.status, 401)
  assert.equal(bad.body.authenticated, false)
  assert.equal(bad.body.reason, 'invalid')
})

await test('claiming to be an administrator in a header is refused', async () => {
  auth.resetSessions()
  // This is the header the browser used to send, filled in from localStorage,
  // and the server used to believe it. An unauthenticated caller is now
  // unauthenticated however they describe themselves.
  const forged = await call('/audit', { headers: { 'X-AIP-Role': 'admin', 'X-AIP-User': 'AD-001' } })
  assert.equal(forged.status, 401)
  assert.equal(forged.body.authenticated, false)

  const anonymous = await call('/alerts')
  assert.equal(anonymous.status, 401)
})

await test('an employee session cannot reach the admin console\'s data', async () => {
  auth.resetSessions()
  const { body: { token } } = await signIn('employee', 'jiayin.tan@abcd.com')
  // 403, not 401: there *is* a verified session — it is simply not an admin's.
  const res = await call('/audit', { token })
  assert.equal(res.status, 403)
})

await test('an admin session reaches it', async () => {
  auth.resetSessions()
  const { body: { token } } = await signIn('admin', 'admin@abcd.com')
  const res = await call('/audit', { token })
  assert.equal(res.status, 200)
  assert.ok(Array.isArray(res.body.events))
})

await test('the extension follows whoever signed in on the dashboard', async () => {
  auth.resetSessions()
  await signIn('employee', 'jiayin.tan@abcd.com')
  // No token: this is the extension's tokenless view of the shared session.
  const seen = await call('/auth/session')
  assert.equal(seen.status, 200)
  assert.equal(seen.body.user.role, 'employee')
  assert.equal(seen.body.authenticated, true)
})

await test('signing out ends the session for the web app and the extension at once', async () => {
  auth.resetSessions()
  const { body: { token } } = await signIn('employee', 'jiayin.tan@abcd.com')

  const out = await call('/auth/logout', { token, method: 'POST' })
  assert.equal(out.status, 200)

  // The web app's own token is dead…
  const after = await call('/auth/session', { token })
  assert.equal(after.status, 401)
  // …and the extension's next poll sees nobody signed in, which is what turns
  // its protection off on the AI tool the employee is still sitting on.
  const extension = await call('/auth/session')
  assert.equal(extension.body.user, null)

  // Signing out twice is not an error. An expired token is already signed out.
  assert.equal((await call('/auth/logout', { token, method: 'POST' })).status, 200)
})

await test('an expired session is refused, with the reason the client needs', async () => {
  auth.resetSessions()
  const { body: { token } } = await signIn('employee', 'jiayin.tan@abcd.com')
  assert.equal((await call('/profile', { token })).status, 200)

  // Idle past AUTH_SESSION_IDLE_MS (800ms above) with no requests in between.
  await new Promise(r => setTimeout(r, 900))

  const res = await call('/profile', { token })
  assert.equal(res.status, 401)
  assert.equal(res.body.reason, 'expired')
  assert.equal(res.body.authenticated, false)
  // And the extension stops protecting an employee whose session ran out.
  assert.equal((await call('/auth/session')).body.user, null)
})

await test('a demo reset signs everybody out rather than leaving orphaned tokens', async () => {
  auth.resetSessions()
  const { body: { token } } = await signIn('admin', 'admin@abcd.com')
  await call('/reset', { method: 'POST' })
  assert.equal((await call('/audit', { token })).status, 401)
})

server.close()
resetStore()
fs.rmSync(SESSION_FILE, { force: true })
console.log(`\n${passed} auth tests passed`)
