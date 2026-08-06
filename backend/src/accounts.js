// AI Passport — the account registry: who may sign in, and what proves it.
//
// auth.js answers "is this token a live session". This module answers the
// question *before* that one: "is this person who they say they are". They are
// deliberately separate — a session is minted only once an account has been
// proven, and nothing here ever hands out a session by itself.
//
// What this replaces. /api/auth/login used to read the role straight off the
// email ("does it start with admin?") and ignore the password field entirely,
// so `admin@anything` was an administrator and the Create-account wizard was
// three screens that wrote nothing anywhere. Both are real authentication bugs
// rather than cosmetic ones: the first is authentication by client-supplied
// string, the second means a "created" account could never sign in.
//
// The rules this module enforces:
//   • a password is checked against a stored scrypt hash, never compared as text
//   • the plaintext password is never stored, never logged and never returned
//   • an unknown email and a wrong password are the same refusal, so the form
//     cannot be used to enumerate who works here
//   • registration always creates an *employee* at Level 1. Administrator is a
//     provisioned role, never something a sign-up form can ask for
//   • Google SSO identities are matched on the *verified* email in the ID token
//
// Firebase Authentication is the drop-in: findByEmail/verifyPassword become
// admin.auth() lookups and createAccount() becomes admin.auth().createUser().
// The shape every caller sees — `publicAccount()` — does not change.

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEFAULT_EMPLOYEE_ID, employeeById, nextEmployeeId, registerEmployee } from './directory.js'

const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data')

// Overridable so tests run against a scratch file rather than the demo's own
// accounts — the file on disk holds real (hashed) credentials.
const ACCOUNT_FILE = process.env.AUTH_ACCOUNT_FILE || path.join(DATA_DIR, 'accounts.json')

// ---- password hashing ------------------------------------------------------
//
// scrypt, from node's own crypto — memory-hard, so a stolen accounts.json is
// expensive to attack offline rather than a list of passwords. Every account
// gets its own 16-byte salt, so two people who chose the same password do not
// have the same hash and one cracked hash is one account.
//
// The parameters travel *with* the hash (`scrypt$N$r$p$salt$key`) rather than
// living in a constant, so raising the cost later does not invalidate the
// passwords already stored.

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 }

export function hashPassword(password, params = SCRYPT) {
  const salt = crypto.randomBytes(16)
  const key = crypto.scryptSync(String(password), salt, params.keylen, {
    N: params.N, r: params.r, p: params.p,
    // scrypt's default memory ceiling is below what N=16384 needs.
    maxmem: 256 * 1024 * 1024,
  })
  return `scrypt$${params.N}$${params.r}$${params.p}$${salt.toString('base64')}$${key.toString('base64')}`
}

/**
 * Does this password produce the stored hash?
 *
 * Constant-time comparison via timingSafeEqual: a byte-by-byte `===` leaks how
 * much of a guess was right through how long the answer took. Any malformed or
 * missing hash is `false` — never a pass.
 */
export function verifyPasswordHash(password, stored) {
  try {
    const [scheme, N, r, p, salt, key] = String(stored || '').split('$')
    if (scheme !== 'scrypt' || !salt || !key) return false
    const expected = Buffer.from(key, 'base64')
    const actual = crypto.scryptSync(String(password), Buffer.from(salt, 'base64'), expected.length, {
      N: Number(N), r: Number(r), p: Number(p), maxmem: 256 * 1024 * 1024,
    })
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual)
  } catch {
    return false
  }
}

// ---- what counts as a valid credential -------------------------------------

// Deliberately permissive on the local part and strict about the shape: this is
// a format check, not an attempt to decide which addresses exist.
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/

export function normaliseEmail(email) {
  return String(email || '').trim().toLowerCase()
}

export function isValidEmail(email) {
  const value = normaliseEmail(email)
  return value.length <= 254 && EMAIL_RE.test(value)
}

// The policy the sign-up screen already promises ("At least 12 characters …
// must include at least a number and a symbol"). Stated once, here, so the form
// and the server cannot drift apart — the server is the half that decides.
export const PASSWORD_POLICY = {
  minLength: 12,
  maxLength: 128,
  describe: 'Use at least 12 characters, including a number and a symbol.',
}

export function passwordProblem(password) {
  const value = String(password ?? '')
  if (value.length < PASSWORD_POLICY.minLength) return PASSWORD_POLICY.describe
  // A ceiling as well as a floor: scrypt hashes whatever it is given, and an
  // unbounded password field is an unbounded amount of work per login attempt.
  if (value.length > PASSWORD_POLICY.maxLength) return 'Password is too long.'
  if (!/\d/.test(value)) return PASSWORD_POLICY.describe
  if (!/[^A-Za-z0-9]/.test(value)) return PASSWORD_POLICY.describe
  return null
}

// ---- the registry ----------------------------------------------------------
//
// email (lowercased) -> account. `aliases` lets one person sign in as
// `jiayin.tan@abcd.com` or `tanjiayin@abcd.com` without two accounts and two
// passports existing for the same human being.

const accounts = new Map() // primary email -> record
const aliasIndex = new Map() // any email (primary or alias) -> primary email

function initialsFrom(name, fallback = '??') {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return fallback
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  // "Tan Jia Yin" -> JY: the given names, which is how the directory renders it.
  return (parts.length >= 3 ? parts[1][0] + parts[2][0] : parts[0][0] + parts[1][0]).toUpperCase()
}

function index(account) {
  accounts.set(account.email, account)
  aliasIndex.set(account.email, account.email)
  for (const alias of account.aliases || []) aliasIndex.set(normaliseEmail(alias), account.email)
}

/** The account for an email, or null. Aliases resolve to the same record. */
export function findByEmail(email) {
  const primary = aliasIndex.get(normaliseEmail(email))
  return primary ? accounts.get(primary) || null : null
}

/**
 * The account as a client may see it.
 *
 * The hash never leaves this module — not to the API, not to a log line, not to
 * the admin console. There is no code path that returns `passwordHash`.
 */
export function publicAccount(account) {
  if (!account) return null
  return {
    email: account.email,
    name: account.name,
    role: account.role,
    employeeId: account.employeeId || null,
    dept: account.dept || null,
    org: account.org || null,
    initials: account.initials,
    defaultTool: account.defaultTool || null,
    createdAt: account.createdAt,
    provider: account.google ? 'google' : 'password',
  }
}

/**
 * Create an account.
 *
 * `role` is not taken from the caller unless it is explicitly passed by *server*
 * code — the registration route always passes 'employee'. An employee is placed
 * in the directory here, before any profile exists, because store.js resolves an
 * unknown employee id to the demo employee: without this a new sign-up would
 * silently land inside somebody else's passport.
 */
export function createAccount({
  email, password, name, role = 'employee', dept = 'Eng', org = null,
  employeeId = null, claimEmployeeId = false, aliases = [], google = null,
  defaultTool = null, sso = false,
}) {
  const normalised = normaliseEmail(email)
  if (!isValidEmail(normalised)) throw Object.assign(new Error('invalid-email'), { code: 'invalid-email' })
  if (findByEmail(normalised)) throw Object.assign(new Error('email-taken'), { code: 'email-taken' })

  // A password is required unless the account is SSO-only. `null` here means
  // "there is no password that opens this account", which verifyPassword must
  // treat as a refusal and not as "any password will do".
  let passwordHash = null
  if (password != null) {
    const problem = passwordProblem(password)
    if (problem) throw Object.assign(new Error(problem), { code: 'weak-password' })
    passwordHash = hashPassword(password)
  } else if (!google && !sso) {
    throw Object.assign(new Error('password-required'), { code: 'password-required' })
  }

  const initials = initialsFrom(name, role === 'admin' ? 'AD' : '??')
  const account = {
    email: normalised,
    aliases: aliases.map(normaliseEmail).filter(a => a && a !== normalised),
    name: String(name || '').trim() || normalised.split('@')[0],
    role: role === 'admin' ? 'admin' : 'employee',
    initials,
    // An administrator is not in the employee directory at all — they have no
    // passport, no level and no department to be assigned training through.
    dept: role === 'admin' ? null : dept,
    org,
    passwordHash,
    // The Google `sub` claim once this account has actually signed in with
    // Google — a stable id that survives the person changing their name.
    google: google || null,
    sso: Boolean(sso || google),
    defaultTool,
    employeeId: null,
    createdAt: new Date().toISOString(),
  }

  if (account.role === 'employee') {
    // Two very different requests, and conflating them is how one employee ends
    // up inside another's passport:
    //
    //   claimEmployeeId — *server* code binding an account to a directory record
    //   that already exists (the seeded Tan Jia Yin is E-217). Only refused if
    //   another account already holds that id.
    //
    //   employeeId from a sign-up body — a preference. Honoured only when the
    //   id belongs to nobody at all. Somebody typing "E-198" into the wizard
    //   gets the next free id, not that employee's history.
    const requested = String(employeeId || '').trim().toUpperCase()
    const claimedByAnother = requested && [...accounts.values()].some(a => a.employeeId === requested)
    const allowed = requested && !claimedByAnother && (claimEmployeeId || !employeeById(requested))
    account.employeeId = allowed ? requested : nextEmployeeId(dept)
    registerEmployee({ id: account.employeeId, initials: account.initials, dept })
  }

  index(account)
  save()
  return account
}

/**
 * The password check, and the only one.
 *
 * Every failure returns the same verdict shape with a `reason` the *server* may
 * log but must never show: "no such account" and "wrong password" are one
 * message to the person at the keyboard.
 */
export function verifyPassword(email, password) {
  const account = findByEmail(email)
  if (!account) {
    // Hash anyway. Returning early on an unknown email makes the response
    // measurably faster for addresses that do not exist, which is user
    // enumeration by stopwatch.
    hashPassword(String(password ?? ''))
    return { ok: false, reason: 'no-account' }
  }
  if (!account.passwordHash) return { ok: false, reason: 'sso-only' }
  if (!verifyPasswordHash(password, account.passwordHash)) return { ok: false, reason: 'bad-password' }
  return { ok: true, account }
}

/**
 * Sign in with a *verified* Google identity.
 *
 * The caller has already checked the ID token's signature, audience and issuer
 * — this function trusts the claims it is handed and nothing else. An email
 * Google has not marked verified never reaches here.
 *
 * A first-time signer on an allowed domain is provisioned as an employee at
 * Level 1, which is how an organisation SSO is expected to behave; anyone else
 * is refused rather than quietly given an account.
 */
export function accountFromGoogle({ email, sub, name, allowedDomains = [] }) {
  const normalised = normaliseEmail(email)
  if (!isValidEmail(normalised)) return { ok: false, reason: 'invalid-email' }

  const existing = findByEmail(normalised)
  if (existing) {
    if (!existing.sso) return { ok: false, reason: 'sso-not-enabled' }
    // Bind the Google subject to the account the first time, so a later name or
    // alias change still resolves to the same passport.
    if (sub && !existing.google) {
      existing.google = String(sub)
      save()
    }
    return { ok: true, account: existing, created: false }
  }

  const domain = normalised.split('@')[1] || ''
  if (allowedDomains.length && !allowedDomains.includes(domain)) {
    return { ok: false, reason: 'domain-not-allowed' }
  }

  const account = createAccount({
    email: normalised,
    password: null,
    name: name || normalised.split('@')[0],
    role: 'employee',
    dept: 'Eng',
    google: sub ? String(sub) : null,
    sso: true,
  })
  return { ok: true, account, created: true }
}

/** Change a password. Used by password reset; the old hash is replaced, not kept. */
export function setPassword(email, password) {
  const account = findByEmail(email)
  if (!account) return { ok: false, reason: 'no-account' }
  const problem = passwordProblem(password)
  if (problem) return { ok: false, reason: 'weak-password', message: problem }
  account.passwordHash = hashPassword(password)
  save()
  return { ok: true, account }
}

/** Every account, for the admin console. Hashes are not included — see publicAccount. */
export function allAccounts() {
  return [...accounts.values()].map(publicAccount)
}

export function accountCount() {
  return accounts.size
}

// ---- the accounts that exist before anybody signs up -----------------------
//
// Two seeded identities, because a demo has to be able to show both sides of
// the product without a sign-up first:
//
//   Tan Jia Yin — the employee whose passport carries the seeded history
//   (E-217). ChatGPT is her default AI tool and it is approved outright, so the
//   Gateway opens on an approved destination rather than on the internal
//   assistant.
//
//   Admin — the compliance console. Provisioned, never registerable: there is
//   no request body anywhere that can create an administrator.
//
// Both passwords are environment-overridable, and *must* be overridden for any
// deployment that is not a local demo. They are printed once at startup by
// server.js only when they are still the defaults.

export const SEED_EMPLOYEE_EMAIL = normaliseEmail(process.env.SEED_EMPLOYEE_EMAIL || 'jiayin.tan@abcd.com')
export const SEED_ADMIN_EMAIL = normaliseEmail(process.env.SEED_ADMIN_EMAIL || 'admin@abcd.com')
export const DEFAULT_EMPLOYEE_PASSWORD = 'Passport#2026'
export const DEFAULT_ADMIN_PASSWORD = 'AdminPass#2026'
export const SEED_EMPLOYEE_PASSWORD = process.env.SEED_EMPLOYEE_PASSWORD || DEFAULT_EMPLOYEE_PASSWORD
export const SEED_ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD

export function usingDefaultSeedPasswords() {
  return SEED_EMPLOYEE_PASSWORD === DEFAULT_EMPLOYEE_PASSWORD || SEED_ADMIN_PASSWORD === DEFAULT_ADMIN_PASSWORD
}

function seed() {
  if (!findByEmail(SEED_EMPLOYEE_EMAIL)) {
    createAccount({
      email: SEED_EMPLOYEE_EMAIL,
      // Both spellings reach the same passport — the demo is introduced as
      // "tanjiayin" as often as it is as "jiayin.tan".
      aliases: ['tanjiayin@abcd.com', 'tan.jiayin@abcd.com'],
      password: SEED_EMPLOYEE_PASSWORD,
      name: 'Tan Jia Yin',
      role: 'employee',
      dept: 'Eng',
      org: 'ABCD Sdn Bhd',
      employeeId: DEFAULT_EMPLOYEE_ID,
      claimEmployeeId: true, // she *is* E-217 — the seeded passport is hers
      defaultTool: 'ChatGPT',
      sso: true,
    })
  }
  if (!findByEmail(SEED_ADMIN_EMAIL)) {
    createAccount({
      email: SEED_ADMIN_EMAIL,
      password: SEED_ADMIN_PASSWORD,
      name: 'Admin',
      role: 'admin',
      org: 'ABCD Sdn Bhd',
      sso: true,
    })
  }
}

/** Wipe and re-seed. Used by the demo reset and by the tests. */
export function resetAccounts() {
  accounts.clear()
  aliasIndex.clear()
  seed()
  save()
}

// ---- persistence -----------------------------------------------------------
//
// Accounts outlive the process: an employee who signed up before lunch must
// still be able to sign in after a restart. Only the hash is written — there is
// nothing in this file that can be turned back into a password.

function save() {
  try {
    fs.mkdirSync(path.dirname(ACCOUNT_FILE), { recursive: true })
    fs.writeFileSync(
      ACCOUNT_FILE,
      JSON.stringify({ version: 1, accounts: [...accounts.values()] }, null, 2),
      // Best effort on POSIX; a no-op on Windows, where the demo runs. The file
      // lives under backend/data/, which .gitignore keeps out of the repository.
      { mode: 0o600 }
    )
  } catch (err) {
    console.warn('Could not persist accounts:', err.message)
  }
}

function load() {
  try {
    if (!fs.existsSync(ACCOUNT_FILE)) return
    const saved = JSON.parse(fs.readFileSync(ACCOUNT_FILE, 'utf8'))
    if (saved?.version !== 1 || !Array.isArray(saved.accounts)) return
    for (const record of saved.accounts) {
      if (!record?.email) continue
      const account = {
        ...record,
        email: normaliseEmail(record.email),
        aliases: Array.isArray(record.aliases) ? record.aliases.map(normaliseEmail) : [],
        role: record.role === 'admin' ? 'admin' : 'employee',
      }
      // The directory is rebuilt from the accounts file on every boot, so an
      // employee who signed up yesterday is still a known employee today and
      // does not fall back to the demo passport.
      if (account.role === 'employee' && account.employeeId) {
        registerEmployee({ id: account.employeeId, initials: account.initials, dept: account.dept })
      }
      index(account)
    }
  } catch (err) {
    console.warn('Could not read stored accounts:', err.message)
  }
}

load()
seed()
