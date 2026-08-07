// Account + credential tests — run with `npm test` (backend).
//
// auth.test.js proves a token means what it says. This file proves the step
// before it: that a credential was actually *checked*, and that creating an
// account creates something real.
//
// Every test here maps to one of the five things the sign-in has to get right:
//
//   1. employee and admin credentials are validated during sign-in
//   2. a created account's credentials and details are recorded securely
//   3. a newly created user can sign in with those credentials
//   4. every newly created employee account starts at Level 1
//   5. authentication state cannot falsely show somebody as signed in
//
// The refusals matter more than the successes. Before this, `{ role: 'admin' }`
// in a request body was an administrator and the password field was never read
// at all — so most of what follows is a test that the wrong answer is refused.

import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// Scratch files, set before anything imports the modules that read them: the
// real registries hold the demo's live sessions and hashed credentials.
const SESSION_FILE = path.join(os.tmpdir(), `aip-sessions-acct-${process.pid}.json`)
const ACCOUNT_FILE = path.join(os.tmpdir(), `aip-accounts-acct-${process.pid}.json`)
process.env.AUTH_SESSION_FILE = SESSION_FILE
process.env.AUTH_ACCOUNT_FILE = ACCOUNT_FILE

// Pin the seeded passwords, independent of backend/.env (server.js loads dotenv).
process.env.SEED_EMPLOYEE_PASSWORD = 'Passport#2026'
process.env.SEED_ADMIN_PASSWORD = 'AdminPass#2026'

const accounts = await import('./accounts.js')
const { app } = await import('./server.js')
const { resetStore } = await import('./store.js')
const { resetSessions } = await import('./auth.js')

let passed = 0
async function test(name, fn) {
  await fn()
  passed++
  console.log(`  ✓ ${name}`)
}

const server = app.listen(0)
await new Promise(resolve => server.once('listening', resolve))
const BASE = `http://127.0.0.1:${server.address().port}/api`

async function call(pathname, { token, method = 'GET', body } = {}) {
  const res = await fetch(`${BASE}${pathname}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  return { status: res.status, body: await res.json().catch(() => null) }
}

const login = (email, password) => call('/auth/login', { method: 'POST', body: { email, password } })

const EMPLOYEE = { email: 'jiayin.tan@abcd.com', password: 'Passport#2026' }
const ADMIN = { email: 'admin@abcd.com', password: 'AdminPass#2026' }

// ---- 2. credentials are recorded securely ----------------------------------

await test('a password is stored as a salted scrypt hash, never as text', () => {
  const account = accounts.findByEmail(EMPLOYEE.email)
  assert.ok(account.passwordHash.startsWith('scrypt$'))
  // The one thing that must never be true of a credential store.
  assert.ok(!account.passwordHash.includes(EMPLOYEE.password))
  assert.equal(accounts.verifyPasswordHash(EMPLOYEE.password, account.passwordHash), true)
  assert.equal(accounts.verifyPasswordHash('Passport#2027', account.passwordHash), false)
})

await test('the same password produces different hashes for different accounts', () => {
  // Per-account salt: without it, two people who chose the same password have
  // the same hash, and cracking one cracks both.
  const a = accounts.hashPassword('Repeated#Pass1')
  const b = accounts.hashPassword('Repeated#Pass1')
  assert.notEqual(a, b)
  assert.ok(accounts.verifyPasswordHash('Repeated#Pass1', a))
  assert.ok(accounts.verifyPasswordHash('Repeated#Pass1', b))
})

await test('the hash never leaves the module — publicAccount cannot carry it', () => {
  const shown = accounts.publicAccount(accounts.findByEmail(ADMIN.email))
  assert.equal(shown.passwordHash, undefined)
  assert.ok(!JSON.stringify(shown).includes('scrypt$'))
})

await test('an account with no password cannot be opened by supplying none', () => {
  accounts.createAccount({ email: 'sso.only@abcd.com', password: null, name: 'SSO Only', sso: true })
  // The trap this guards: a null hash treated as "nothing to check".
  for (const attempt of [undefined, null, '', 'anything']) {
    assert.equal(accounts.verifyPassword('sso.only@abcd.com', attempt).ok, false, `refused: ${attempt}`)
  }
})

// ---- 1. credentials are validated during sign-in ---------------------------

await test('the seeded employee signs in with the right password, and only that one', async () => {
  resetSessions()
  const good = await login(EMPLOYEE.email, EMPLOYEE.password)
  assert.equal(good.status, 200)
  assert.equal(good.body.user.role, 'employee')
  assert.equal(good.body.user.id, 'E-217')

  const wrong = await login(EMPLOYEE.email, 'not-the-password')
  assert.equal(wrong.status, 401)
  assert.equal(wrong.body.token, undefined)
})

await test('the seeded admin signs in and reaches the console; the employee does not', async () => {
  resetSessions()
  const admin = await login(ADMIN.email, ADMIN.password)
  assert.equal(admin.status, 200)
  assert.equal(admin.body.user.role, 'admin')
  assert.equal((await call('/audit', { token: admin.body.token })).status, 200)

  resetSessions()
  const employee = await login(EMPLOYEE.email, EMPLOYEE.password)
  // 403, not 401: a real session that is simply not an administrator's.
  assert.equal((await call('/audit', { token: employee.body.token })).status, 403)
})

await test('a role in the request body is not a role', async () => {
  resetSessions()
  // The exact shape the old route believed: no password, and an asserted role.
  const claimed = await login('admin@abcd.com', undefined)
  assert.equal(claimed.status, 401)

  const forged = await call('/auth/login', {
    method: 'POST',
    body: { email: EMPLOYEE.email, password: EMPLOYEE.password, role: 'admin' },
  })
  assert.equal(forged.status, 200)
  // Signed in — as herself. The role travelled with the request and changed
  // nothing, because it is read off the account.
  assert.equal(forged.body.user.role, 'employee')
  assert.equal((await call('/audit', { token: forged.body.token })).status, 403)
})

await test('an unknown email is refused in the same words as a wrong password', async () => {
  resetSessions()
  const unknown = await login('nobody@abcd.com', 'Passport#2026')
  const wrong = await login(EMPLOYEE.email, 'Passport#2025')
  assert.equal(unknown.status, 401)
  assert.equal(wrong.status, 401)
  // Identical, so the form cannot be used to find out who works here.
  assert.equal(unknown.body.error, wrong.body.error)
})

await test('repeated wrong passwords are throttled rather than answered forever', async () => {
  resetSessions()
  const target = 'throttle.me@abcd.com'
  let sawThrottle = false
  for (let i = 0; i < 12; i++) {
    const res = await login(target, `guess-number-${i}`)
    if (res.status === 429) { sawThrottle = true; break }
  }
  assert.equal(sawThrottle, true, 'guessing was never slowed down')
})

// ---- 3 + 4. registration, and where a new account starts -------------------

const NEW_USER = {
  name: 'Lim Wei Han',
  email: 'weihan.lim@abcd.com',
  password: 'NewStarter#2026',
  org: 'ABCD Sdn Bhd',
  dept: 'Finance',
  consent: true,
}

await test('creating an account records the details and lets that account sign in', async () => {
  const created = await call('/auth/register', { method: 'POST', body: NEW_USER })
  assert.equal(created.status, 201)
  assert.equal(created.body.user.email, NEW_USER.email)
  assert.equal(created.body.user.role, 'employee')
  assert.equal(created.body.user.dept, 'Finance')
  // The response cannot carry the credential back out.
  assert.ok(!JSON.stringify(created.body).includes(NEW_USER.password))

  resetSessions()
  const signedIn = await login(NEW_USER.email, NEW_USER.password)
  assert.equal(signedIn.status, 200)
  assert.equal(signedIn.body.user.name, 'Lim Wei Han')
  // Their own employee record — not the demo employee's.
  assert.notEqual(signedIn.body.user.id, 'E-217')
})

await test('a newly created employee account starts at Level 1', async () => {
  resetSessions()
  const { body: { token, user } } = await login(NEW_USER.email, NEW_USER.password)
  assert.equal(user.level, 1)

  const profile = await call('/profile', { token })
  assert.equal(profile.status, 200)
  assert.equal(profile.body.level, 1)
  assert.equal(profile.body.levelName, 'Trainee')
  assert.equal(profile.body.points, 0)
  // And it is genuinely a blank passport rather than a copy of a seeded one.
  assert.equal(profile.body.promptsProtected, 0)
  assert.deepEqual(profile.body.stamps, [])
})

await test('a new employee keeps their own name even when a session was restored first', async () => {
  // The ordering that used to lose it: sessions survive a restart, so the
  // request middleware calls setSessionEmployee() for the restored employee and
  // creates a bare `Employee M-300` shell *before* any sign-in runs. A passport
  // filled in only on creation stayed a placeholder forever after that.
  const { publicProfile, db } = await import('./store.js')
  const { ensureEmployeeProfile, setSessionEmployee } = await import('./store.js')

  const account = accounts.findByEmail(NEW_USER.email)
  delete db.employees[account.employeeId]
  setSessionEmployee(account.employeeId) // the shell the middleware would make
  assert.equal(db.employees[account.employeeId].name, `Employee ${account.employeeId}`)

  ensureEmployeeProfile({
    id: account.employeeId, name: account.name, initials: account.initials, dept: account.dept,
  })
  assert.equal(publicProfile(db.employees[account.employeeId]).name, 'Lim Wei Han')

  // …and signing in reports the same name, not the placeholder.
  resetSessions()
  const { body: { user } } = await login(NEW_USER.email, NEW_USER.password)
  assert.equal(user.name, 'Lim Wei Han')
})

await test('a sign-up cannot take over an employee id that already belongs to somebody', async () => {
  const res = await call('/auth/register', {
    method: 'POST',
    body: { ...NEW_USER, name: 'Impostor', email: 'impostor@abcd.com', employeeId: 'E-217' },
  })
  assert.equal(res.status, 201)
  // Asked for E-217; given the next free id, so Tan Jia Yin's passport is
  // untouched. This is the whole reason the directory allocates ids.
  assert.notEqual(res.body.user.employeeId, 'E-217')

  resetSessions()
  const { body: { token } } = await login('impostor@abcd.com', NEW_USER.password)
  const profile = await call('/profile', { token })
  assert.notEqual(profile.body.name, 'Tan Jia Yin')
  assert.equal(profile.body.points, 0)
})

await test('registration refuses a weak password, a bad email and a taken one', async () => {
  const weak = await call('/auth/register', { method: 'POST', body: { ...NEW_USER, email: 'weak@abcd.com', password: 'short1!' } })
  assert.equal(weak.status, 400)

  const noSymbol = await call('/auth/register', { method: 'POST', body: { ...NEW_USER, email: 'nosym@abcd.com', password: 'abcdefgh12345' } })
  assert.equal(noSymbol.status, 400)

  const badEmail = await call('/auth/register', { method: 'POST', body: { ...NEW_USER, email: 'not-an-email' } })
  assert.equal(badEmail.status, 400)

  const taken = await call('/auth/register', { method: 'POST', body: NEW_USER })
  assert.equal(taken.status, 409)

  // None of the refusals created anything.
  assert.equal(accounts.findByEmail('weak@abcd.com'), null)
  assert.equal(accounts.findByEmail('nosym@abcd.com'), null)
})

await test('registration cannot create an administrator, however it is asked', async () => {
  const res = await call('/auth/register', {
    method: 'POST',
    body: { ...NEW_USER, name: 'Wants Admin', email: 'wants.admin@abcd.com', role: 'admin' },
  })
  assert.equal(res.status, 201)
  assert.equal(res.body.user.role, 'employee')

  resetSessions()
  const { body: { token } } = await login('wants.admin@abcd.com', NEW_USER.password)
  assert.equal((await call('/audit', { token })).status, 403)
})

// ---- the organisation's record of a new account ----------------------------
//
// The employee's *own* history must be empty — that is Level 1. The
// organisation's record of them must not be: an admin who cannot account for
// where an employee id came from cannot audit anything that id then does.

await test('creating an account is an auditable event the admin can see', async () => {
  resetSessions()
  const email = 'audited.starter@abcd.com'
  await call('/auth/register', {
    method: 'POST',
    body: { ...NEW_USER, name: 'Audited Starter', email, dept: 'Operations' },
  })
  const employeeId = accounts.findByEmail(email).employeeId

  const { body: { token } } = await login(ADMIN.email, ADMIN.password)
  const { body: { events } } = await call('/audit', { token })
  const created = events.find(e => e.action === 'CREATED' && e.user === employeeId)

  assert.ok(created, 'no CREATED event for the new account')
  assert.match(created.record, /account created/)
  assert.match(created.record, /self-registration/)
  // What access was granted, which is the part that matters later.
  assert.match(created.record, /Level 1/)
  assert.equal(created.dept, 'Ops')
  assert.equal(created.control, 'NIST PR.AC')
})

await test('the account creation event carries no name and no email', async () => {
  resetSessions()
  const { body: { token } } = await login(ADMIN.email, ADMIN.password)
  const { body: { events } } = await call('/audit', { token })
  const created = events.filter(e => e.action === 'CREATED' && /account created/.test(e.record))
  assert.ok(created.length > 0)
  // The audit log is privacy-minimised — employee ids and role data, no
  // personal identifiers. Provisioning is no reason to make the first exception.
  for (const event of created) {
    assert.ok(!/@/.test(JSON.stringify(event)), `email leaked into ${event.id}`)
    assert.ok(!/Audited Starter|Lim Wei Han/.test(JSON.stringify(event)), `name leaked into ${event.id}`)
  }
})

await test('an account provisioned by Google SSO is recorded as SSO, not self-registration', async () => {
  // The demo chooser only reaches accounts that already exist, so this exercises
  // the provisioning path directly — the same call the verified-token branch
  // makes once Google has confirmed the identity.
  const { accountFromGoogle } = accounts
  const { ensureEmployeeProfile, recordAccountCreated } = await import('./store.js')

  const result = accountFromGoogle({
    email: 'first.timer@abcd.com', sub: 'google-sub-12345', name: 'First Timer',
    allowedDomains: ['abcd.com'],
  })
  assert.equal(result.ok, true)
  assert.equal(result.created, true)
  const profile = ensureEmployeeProfile({
    id: result.account.employeeId, name: result.account.name,
    initials: result.account.initials, dept: result.account.dept,
  })
  assert.equal(profile.level, 1) // SSO provisioning is Level 1 too
  recordAccountCreated({
    id: result.account.employeeId, dept: result.account.dept,
    via: 'Google SSO · abcd.com', level: profile.level,
  })

  resetSessions()
  const { body: { token } } = await login(ADMIN.email, ADMIN.password)
  const { body: { events } } = await call('/audit', { token })
  const created = events.find(e => e.action === 'CREATED' && e.user === result.account.employeeId)
  assert.ok(created)
  assert.match(created.record, /Google SSO/)
  assert.ok(!/self-registration/.test(created.record))

  // A Google account on a domain nobody allowed is not provisioned at all —
  // so there is no event, because there is no account.
  const refused = accountFromGoogle({
    email: 'outsider@gmail.com', sub: 'x', name: 'Outsider', allowedDomains: ['abcd.com'],
  })
  assert.equal(refused.ok, false)
  assert.equal(refused.reason, 'domain-not-allowed')
})

await test('a new starter appears in the admin directory feed with a renderable row', async () => {
  resetSessions()
  const account = accounts.findByEmail(NEW_USER.email)
  const { body: { token } } = await login(ADMIN.email, ADMIN.password)
  const { body } = await call('/progression', { token })

  const row = body.employees.find(e => e.id === account.employeeId)
  assert.ok(row, 'the new employee is missing from /progression')
  // Every field the admin table needs to draw somebody the seeded frontend
  // directory has never heard of. A missing one is an unrenderable row.
  // Given names, same rule the seeded directory follows (Tan Jia Yin → JY).
  assert.equal(row.initials, 'WH')
  assert.equal(row.dept, 'Finance')
  assert.equal(row.level, 1)
  assert.equal(row.totalXP, 0)
  assert.equal(row.promptsProtected, 0)
  assert.equal(row.openAlerts, 0)
  assert.equal(typeof row.assignedModules, 'number')
  assert.equal(typeof row.modulesCompleted, 'number')
})

// ---- Google SSO ------------------------------------------------------------

await test('the SSO config offers only accounts that exist and have SSO enabled', async () => {
  const res = await call('/auth/sso/config')
  assert.equal(res.status, 200)
  assert.equal(res.body.google.enabled, true)
  assert.equal(res.body.google.demo, true)
  const emails = res.body.google.accounts.map(a => a.email)
  assert.deepEqual(emails.sort(), [ADMIN.email, EMPLOYEE.email].sort())
  // A registered employee is not on the chooser: it lists the two provisioned
  // organisation identities, not everybody who ever signed up.
  assert.ok(!emails.includes(NEW_USER.email))
})

await test('demo SSO signs in the two organisation accounts and refuses anything else', async () => {
  resetSessions()
  const employee = await call('/auth/google', { method: 'POST', body: { demoEmail: EMPLOYEE.email } })
  assert.equal(employee.status, 200)
  assert.equal(employee.body.user.role, 'employee')
  assert.equal(employee.body.user.id, 'E-217')
  // The whole point of the requirement: her default tool is ChatGPT, approved.
  assert.equal(employee.body.user.defaultTool, 'ChatGPT')

  resetSessions()
  const admin = await call('/auth/google', { method: 'POST', body: { demoEmail: ADMIN.email } })
  assert.equal(admin.status, 200)
  assert.equal(admin.body.user.role, 'admin')
  assert.equal((await call('/audit', { token: admin.body.token })).status, 200)

  // An email nobody has an account for is not a way in.
  const stranger = await call('/auth/google', { method: 'POST', body: { demoEmail: 'stranger@gmail.com' } })
  assert.equal(stranger.status, 401)

  // Neither is a made-up Google token — with no client id configured there is
  // nothing to verify it against, so it is refused rather than trusted.
  const forged = await call('/auth/google', { method: 'POST', body: { credential: 'eyJhbGciOiJub25lIn0.e30.' } })
  assert.equal(forged.status, 401)
})

await test('ChatGPT is approved for her, and marked as the default the Gateway opens on', async () => {
  resetSessions()
  const { body: { token } } = await login(EMPLOYEE.email, EMPLOYEE.password)
  const tools = await call('/tools/mine', { token })
  const chatgpt = tools.body.find(t => t.name === 'ChatGPT')
  assert.equal(chatgpt.approved, true)
  assert.equal(chatgpt.access, 'active')
  assert.equal(chatgpt.isDefault, true)
  // Exactly one default, and it is never an unapproved destination.
  assert.equal(tools.body.filter(t => t.isDefault).length, 1)
  assert.ok(tools.body.every(t => !t.isDefault || t.approved))
})

await test('a new employee has no default until one is set, and never an unapproved one', async () => {
  resetSessions()
  const { body: { token } } = await login(NEW_USER.email, NEW_USER.password)
  const tools = await call('/tools/mine', { token })
  const defaults = tools.body.filter(t => t.isDefault)
  // The internal assistant, which is approved at every level — a Trainee is
  // never opened on a destination they would be refused for.
  assert.ok(defaults.length <= 1)
  assert.ok(defaults.every(t => t.approved))
})

// ---- 5. no false "signed in" ----------------------------------------------

await test('a failed sign-in leaves nobody signed in', async () => {
  resetSessions()
  const refused = await login(EMPLOYEE.email, 'wrong-password-entirely')
  assert.equal(refused.status, 401)
  // The tokenless view — what the Chrome extension sees, and what a browser
  // with no token gets. A refused attempt must not have left a session behind.
  const seen = await call('/auth/session')
  assert.equal(seen.body.user, null)
  assert.equal(seen.body.authenticated, false)
})

await test('registering does not sign the new account in', async () => {
  resetSessions()
  await call('/auth/register', {
    method: 'POST',
    body: { ...NEW_USER, name: 'Not Signed In', email: 'not.signed.in@abcd.com' },
  })
  // An account that exists is not a session. The password still has to be used.
  const seen = await call('/auth/session')
  assert.equal(seen.body.user, null)
  assert.equal(seen.body.authenticated, false)
})

server.close()
resetStore()
fs.rmSync(SESSION_FILE, { force: true })
fs.rmSync(ACCOUNT_FILE, { force: true })
console.log(`\n${passed} account tests passed`)
