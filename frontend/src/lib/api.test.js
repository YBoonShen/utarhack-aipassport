// Web app session tests — run with `npm test` (backend).
//
// lib/api.js is where the browser decides what it knows about its own session,
// and it is the layer the whole admin bug lived in: a cached user object was
// treated as a signed-in administrator, and an unreachable backend could never
// contradict it. So these tests are mostly about what the browser is *not*
// allowed to conclude.
//
// They run against the real Express app rather than a mock, because the answer
// being checked is the one the two of them agree on. React is not involved: the
// provider in lib/auth.jsx is a state machine over exactly these three results
// (authenticated / unauthenticated / unavailable), and this is where they are
// produced.

import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const SESSION_FILE = path.join(os.tmpdir(), `aip-sessions-web-${process.pid}.json`)
const ACCOUNT_FILE = path.join(os.tmpdir(), `aip-accounts-web-${process.pid}.json`)
process.env.AUTH_SESSION_FILE = SESSION_FILE
process.env.AUTH_ACCOUNT_FILE = ACCOUNT_FILE

// Pin the seeded passwords, independent of backend/.env (server.js loads dotenv).
process.env.SEED_EMPLOYEE_PASSWORD = 'Passport#2026'
process.env.SEED_ADMIN_PASSWORD = 'AdminPass#2026'

const { app } = await import('../../../backend/src/server.js')
const { resetStore } = await import('../../../backend/src/store.js')
const { resetSessions } = await import('../../../backend/src/auth.js')

const server = app.listen(0)
await new Promise(resolve => server.once('listening', resolve))
const ORIGIN = `http://127.0.0.1:${server.address().port}`

// ---- the browser, as far as api.js can tell --------------------------------

const store = new Map()
globalThis.localStorage = {
  getItem: key => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: key => store.delete(key),
  clear: () => store.clear(),
}

// api.js calls fetch('/api/…'): a same-origin path, which Node cannot resolve on
// its own. `mode` is how the two failures that matter are reproduced.
const realFetch = globalThis.fetch
let mode = 'online'
globalThis.fetch = (url, options) => {
  if (mode === 'network-down') {
    // What the browser sees when there is nothing listening: fetch rejects.
    return Promise.reject(new TypeError('Failed to fetch'))
  }
  if (mode === 'proxy-down') {
    // What the Vite dev proxy actually returns when the backend is not running,
    // verified against a live server: 502. It must never be read as a verdict
    // about the session.
    return Promise.resolve(new Response('Bad Gateway', { status: 502 }))
  }
  return realFetch(new URL(url, ORIGIN), options)
}

const api = await import('./api.js')

// logFailure() writes the real error to the console on purpose. The failures
// below are all expected, so the noise is muted rather than read.
const realError = console.error
console.error = () => {}

let passed = 0
async function test(name, fn) {
  mode = 'online'
  store.clear()
  resetSessions()
  await fn()
  passed++
  console.log(`  ✓ ${name}`)
}

// ---- scenarios -------------------------------------------------------------

await test('a fresh browser is signed out', async () => {
  const result = await api.fetchSession()
  assert.equal(result.status, 'unauthenticated')
  assert.equal(result.user, null)
})

await test('a cached user with no token is not a session — and is cleared', async () => {
  // The admin bug, exactly: an object left in localStorage by an earlier demo.
  // It used to mount the admin console; it is now discarded on the first check.
  store.set('aip-user', JSON.stringify({ role: 'admin', id: 'AD-001' }))
  const result = await api.fetchSession()
  assert.equal(result.status, 'unauthenticated')
  assert.equal(api.currentUser(), null)
  assert.equal(store.has('aip-user'), false)
})

await test('signing in stores a token, and the session verifies against the server', async () => {
  const user = await api.login('admin@abcd.com', 'AdminPass#2026')
  assert.equal(user.role, 'admin')
  assert.ok(api.getToken().length > 20)
  assert.ok(api.sessionExpiry() > Date.now())

  const result = await api.fetchSession()
  assert.equal(result.status, 'authenticated')
  assert.equal(result.user.role, 'admin')
})

await test('an unreachable backend is "unavailable" — never authenticated, never signed out', async () => {
  await api.login('jiayin.tan@abcd.com', 'Passport#2026')
  const token = api.getToken()

  mode = 'network-down'
  const dropped = await api.fetchSession()
  assert.equal(dropped.status, 'unavailable')
  assert.notEqual(dropped.status, 'authenticated')

  mode = 'proxy-down'
  const proxied = await api.fetchSession()
  assert.equal(proxied.status, 'unavailable')

  // And the session survives it. An outage has not signed anybody out, so
  // destroying the token here would turn a two-second blip into a sign-out.
  assert.equal(api.getToken(), token)
})

await test('the backend coming back resolves the session with no sign-in', async () => {
  await api.login('jiayin.tan@abcd.com', 'Passport#2026')
  mode = 'network-down'
  assert.equal((await api.fetchSession()).status, 'unavailable')
  mode = 'online'
  const back = await api.fetchSession()
  assert.equal(back.status, 'authenticated')
  assert.equal(back.user.id, 'E-217')
})

await test('a session the server has ended signs this browser out and clears it', async () => {
  await api.login('jiayin.tan@abcd.com', 'Passport#2026')
  const seen = []
  const stop = api.onAuthInvalid(reason => seen.push(reason))

  // Ended elsewhere — another window signing out, an administrator revoking it,
  // an expiry. The token in this browser is now a token the registry does not
  // recognise, and the only place that can be discovered is the server.
  resetSessions()

  const result = await api.fetchSession()
  assert.equal(result.status, 'unauthenticated')
  assert.equal(api.getToken(), '')
  assert.equal(api.currentUser(), null)
  assert.deepEqual(seen, ['invalid'])
  stop()
})

await test('a 401 on any ordinary call ends the session, wherever it happened', async () => {
  await api.login('jiayin.tan@abcd.com', 'Passport#2026')
  const seen = []
  const stop = api.onAuthInvalid(reason => seen.push(reason))
  resetSessions()

  // A background poll, not a sign-in check. It must sign the app out just the
  // same, rather than failing quietly and leaving the screen looking live.
  await assert.rejects(() => api.api.get('/notifications'), err => err.authInvalid === true)
  assert.equal(api.getToken(), '')
  assert.deepEqual(seen, ['invalid'])
  stop()
})

await test('an outage on an ordinary call is not a sign-out', async () => {
  await api.login('jiayin.tan@abcd.com', 'Passport#2026')
  const seen = []
  const stop = api.onAuthInvalid(reason => seen.push(reason))

  mode = 'proxy-down'
  await assert.rejects(() => api.api.get('/notifications'), err => err.offline === true && !err.authInvalid)
  assert.ok(api.getToken(), 'the session is untouched')
  assert.deepEqual(seen, [])
  stop()
})

await test('signing out clears this browser even if the server never hears about it', async () => {
  await api.login('jiayin.tan@abcd.com', 'Passport#2026')
  mode = 'network-down'
  await api.logout()
  assert.equal(api.getToken(), '')
  assert.equal(api.currentUser(), null)
})

await test('signing out ends the session the extension follows', async () => {
  await api.login('jiayin.tan@abcd.com', 'Passport#2026')
  await api.logout()
  // The extension's tokenless view — the record it protects an employee on.
  const seen = await (await realFetch(`${ORIGIN}/api/auth/session`)).json()
  assert.equal(seen.user, null)
})

console.error = realError
server.close()
resetStore()
fs.rmSync(SESSION_FILE, { force: true })
fs.rmSync(ACCOUNT_FILE, { force: true })
console.log(`\n${passed} web app session tests passed`)
