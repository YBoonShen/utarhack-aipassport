// AI Passport backend — Express API (Team Soda)
// The in-memory store (store.js) is the shared source of truth for the
// employee and admin UIs. Firebase (Auth + Firestore) replaces it once the
// team creates the Firebase project — see README "Firebase setup".

import 'dotenv/config'
import { pathToFileURL } from 'node:url'
import express from 'express'
import cors from 'cors'
import { RULES, applyRules } from './detector.js'
import { maskNamesIn } from './layer2.js'
import { logDetection, verifyFirebaseToken, firebaseStatus } from './firebase.js'
import {
  db, resetStore, recordPromptEvent, recordOfflineEvent, recordOverride, recordAudit, recordSession,
  recordAccountCreated,
  answerQuiz, quizResults, completeTraining, retryTraining, applyForVisa, decideVisa,
  suspendToolOrgWide, clearToolOrgWide, recordToolUse, toolStatus, openAlerts, alertsView, resolveAlert, actOnAlert,
  auditView,
  recordModelUse, recordBlockedAttempt, gatewayPolicyFor, toolForHost, setModelStatus,
  toolRegister, toolAccessFor, toolModelsFor, freeModelFor, requestableTools, REQUEST_MIN_LEVEL, shadowAITools,
  addReviewRequest, leaderboard, progressionSummary,
  allProgressionSummaries, updateSettings,
  setSessionEmployee, ensureEmployeeProfile, notificationsFor, updateNotification, activityFor, publicProfile,
  libraryForAdmin, moduleById, publicModule, createModule, updateModule, setModuleStatus,
  modulesForEmployee, canAccessModule, assignTraining, assignmentRecords, assignmentsForEmployee,
  MAX_QUESTIONS,
} from './store.js'
import { complianceReport, executiveSummary, analystSummary, avgLicenseLevel, riskPosture } from './compliance.js'
import { LEVELS } from './levels.js'
import { MODES, ORG_MODES } from './risk.js'
import { DEPARTMENTS, EMPLOYEES, employeeById, isDepartment, registerEmployee } from './directory.js'
import {
  createSession, verifySession, activeSession, destroySession, destroyActiveSession,
  resetSessions, tokenFromRequest, expiresAt, publicSession,
} from './auth.js'
import {
  createAccount, verifyPassword, accountFromGoogle, findByEmail, publicAccount,
  isValidEmail, normaliseEmail, passwordProblem,
  PASSWORD_POLICY, SEED_ADMIN_EMAIL, SEED_EMPLOYEE_EMAIL,
  SEED_ADMIN_PASSWORD, SEED_EMPLOYEE_PASSWORD, usingDefaultSeedPasswords,
} from './accounts.js'

const app = express()
app.use(cors())
app.use(express.json())

// ---- who is asking ---------------------------------------------------------
//
// A verified session token is the only thing that decides this. The browser
// presents `Authorization: Bearer <token>`, auth.js looks the token up in its
// own registry, and the identity comes off the *record* — never off the request.
// A token that is unknown or has run out is not a weaker identity, it is a 401:
// the client is told which of the two it was so it can clear its stale state
// rather than keep rendering a session that ended.
//
// Firebase Auth replaces auth.js underneath this and nothing above it changes.
function actorFromSession(session) {
  const { role, id } = session.user
  return role === 'admin' ? { role: 'admin', id: 'AD-001' } : { role: 'employee', id }
}

/**
 * The fallback for a caller with no token: the Chrome extension, a health check,
 * curl. These are read-only, employee-scoped clients that follow whoever is
 * signed in on this machine's dashboard.
 *
 * What is deliberately *not* here any more: `X-AIP-Role: admin`. An unverified
 * caller could previously claim to be an administrator simply by setting a
 * header, and every admin route believed it. Administration now requires a
 * verified session and nothing else — see requireAdmin.
 */
function actorOf(req) {
  const claimed = String(req.get('x-aip-user') || '').trim()
  if (employeeById(claimed)) return { role: 'employee', id: claimed }
  const session = activeSession()
  if (session?.user?.role === 'admin') return { role: 'admin', id: 'AD-001' }
  const id = session?.user?.id
  return { role: 'employee', id: employeeById(id) ? id : db.sessionEmployeeId }
}

// Routes that must still answer when the presented token is no longer good.
// Signing in and signing out are how a client *recovers* from that state, and
// /auth/session is the route whose whole job is to report it.
// Signing up and reading the SSO config are pre-auth for the same reason: they
// are the screens a browser holding a dead token has to be able to use.
const TOKEN_OPTIONAL = new Set([
  '/api/health', '/api/auth/login', '/api/auth/logout', '/api/auth/session',
  '/api/auth/register', '/api/auth/google', '/api/auth/firebase', '/api/auth/sso/config',
])

app.use((req, res, next) => {
  const token = tokenFromRequest(req)

  if (token) {
    const result = verifySession(token)
    if (result.ok) {
      req.auth = { verified: true, token, session: result.session }
      req.actor = actorFromSession(result.session)
    } else {
      req.auth = { verified: false, token, reason: result.reason }
      // A stale token is an answer, not an ambiguity. Everything except the
      // recovery routes stops here, so a client can never keep operating on a
      // session the server has already ended.
      if (!TOKEN_OPTIONAL.has(req.path)) {
        return res.status(401).json({
          error: result.reason === 'expired'
            ? 'Your session has expired. Please sign in again.'
            : 'Your session is no longer valid. Please sign in again.',
          reason: result.reason,
          authenticated: false,
        })
      }
    }
  }

  req.auth ??= { verified: false, token: '', reason: 'anonymous' }
  req.actor ??= actorOf(req)
  // Points the store's per-employee views (profile, notifications, quiz,
  // assigned modules) at this request's employee.
  if (req.actor.role === 'employee') setSessionEmployee(req.actor.id)
  next()
})

// Two separate refusals, because they mean different things to the client. 401:
// there is no verified session behind this request — sign in. 403: there is one,
// and it is not an administrator's.
function requireAdmin(req, res, next) {
  if (!req.auth.verified) {
    return res.status(401).json({
      error: 'This action requires a signed-in administrator session.',
      reason: req.auth.reason,
      authenticated: false,
    })
  }
  if (req.actor.role !== 'admin') {
    return res.status(403).json({ error: 'This action is restricted to administrators.' })
  }
  next()
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'aipassport-backend', time: new Date().toISOString(), firebase: firebaseStatus() })
})

// ---- auth ------------------------------------------------------------------
//
// Three ways in, one way through. A password sign-in, a Google SSO sign-in and
// a registration all end at signInAs(): the credential is proven first, and only
// then is a session minted. Nothing below takes the caller's word for their
// role, their employee id or their level.
//
// What this replaced: the route used to read `{ role, email }` out of the
// request body and believe both. `role: 'admin'` in a curl body was an
// administrator, the password field was never even looked at, and the sign-up
// wizard wrote nothing anywhere — so a "created" account could not sign in.
//
// Firebase Authentication is the drop-in for accounts.js underneath this;
// signInAs() and everything above it stay exactly as they are.

/**
 * Turn a proven account into a session.
 *
 * The user record handed back to the browser is built here, from the registry
 * and the store — never from the request. For an employee that means their
 * directory entry and their passport decide who they are and what level they
 * are, which is what stops a new sign-up from landing inside E-217's history.
 */
function signInAs(account, res) {
  let user
  if (account.role === 'admin') {
    user = {
      role: 'admin', id: 'AD-001', initials: account.initials || 'AD',
      name: account.name, title: 'Compliance role', email: account.email,
    }
  } else {
    // The directory first — setSessionEmployee() resolves an id it does not
    // know back to the demo employee, so an unregistered new starter would
    // otherwise open somebody else's passport.
    registerEmployee({ id: account.employeeId, initials: account.initials, dept: account.dept })
    ensureEmployeeProfile({
      id: account.employeeId,
      name: account.name,
      initials: account.initials,
      dept: account.dept,
      defaultTool: account.defaultTool,
    })
    const p = setSessionEmployee(account.employeeId)
    user = {
      role: 'employee', id: p.id, initials: p.initials, name: p.name,
      title: `${p.dept} · Level ${p.level}`, email: account.email,
      level: p.level, defaultTool: p.defaultTool || null,
    }
  }

  const session = createSession(user)
  // Mirrored for the store, whose per-employee views ask "is the current session
  // an admin's". auth.js remains the authority; this is a projection of it.
  db.session = user
  recordSession('in', user)
  return res.json({ user, token: session.token, expiresAt: expiresAt(session) })
}

// One sentence for every way a sign-in can fail. Deliberately identical for
// "no such account" and "wrong password": a form that distinguishes them is a
// tool for finding out who works here (CWE-204).
const SIGN_IN_REFUSED = 'Email or password is incorrect.'

// ---- brute force -----------------------------------------------------------
//
// A password endpoint with no cost per attempt is a password endpoint that gets
// guessed. Failures are counted against two different keys, because there are
// two different attacks:
//
//   per email — one account being worked through. Tripped quickly (8), since
//               nobody mistypes their own password eight times in a row.
//   per source address — one machine spraying one password across many
//               accounts, which the per-email counter never sees. Tripped far
//               later (40), because a whole office can share one address and
//               locking that out is a self-inflicted outage.
//
// A success clears both, so somebody who fumbles twice and then gets it right
// is not carrying a penalty around.
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000
const MAX_ATTEMPTS = { email: 8, ip: 40 }
const attempts = new Map() // key -> { count, firstAt }

function attemptKeys(req, email) {
  return [`ip:${req.ip}`, `email:${normaliseEmail(email)}`]
}

function throttled(keys, now = Date.now()) {
  return keys.some(key => {
    const record = attempts.get(key)
    if (!record) return false
    if (now - record.firstAt > ATTEMPT_WINDOW_MS) {
      attempts.delete(key)
      return false
    }
    return record.count >= MAX_ATTEMPTS[key.split(':')[0]]
  })
}

function recordFailure(keys, now = Date.now()) {
  for (const key of keys) {
    const record = attempts.get(key)
    if (!record || now - record.firstAt > ATTEMPT_WINDOW_MS) attempts.set(key, { count: 1, firstAt: now })
    else record.count++
  }
}

function clearFailures(keys) {
  for (const key of keys) attempts.delete(key)
}

/** Sign in with an email and a password. The password is checked, always. */
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {}
  const keys = attemptKeys(req, email)

  if (throttled(keys)) {
    return res.status(429).json({
      error: 'Too many sign-in attempts. Please wait a few minutes and try again.',
      authenticated: false,
    })
  }

  const result = verifyPassword(email, password)
  if (!result.ok) {
    recordFailure(keys)
    // `reason` is for the server's own logs, never the screen — the browser is
    // shown SIGN_IN_REFUSED whichever of the three it was.
    return res.status(401).json({ error: SIGN_IN_REFUSED, authenticated: false })
  }

  clearFailures(keys)
  return signInAs(result.account, res)
})

/**
 * Create an account.
 *
 * Always an employee, always Level 1. `role` is not read from the body at all:
 * an administrator is provisioned, and there is no request anywhere that
 * creates one. The employee id is a *request* — the directory allocates a free
 * one if the caller asks for an id that already belongs to somebody.
 */
app.post('/api/auth/register', (req, res) => {
  const { name, email, password, org, dept, employeeId, consent } = req.body || {}

  if (!String(name || '').trim()) return res.status(400).json({ error: 'Enter your full name.', field: 'name' })
  if (!isValidEmail(email)) return res.status(400).json({ error: 'Enter a valid work email address.', field: 'email' })

  const weak = passwordProblem(password)
  if (weak) return res.status(400).json({ error: weak, field: 'password' })
  if (!consent) return res.status(400).json({ error: 'Please accept the acceptable-use and privacy policies.', field: 'consent' })

  // An existing email is the one case where saying so is the right call: the
  // person is standing at a *sign-up* form, they cannot proceed without knowing,
  // and the alternative is an account they think exists and cannot use.
  if (findByEmail(email)) {
    return res.status(409).json({ error: 'An account already exists for this email. Try signing in instead.', field: 'email' })
  }

  try {
    const account = createAccount({
      email,
      password,
      name,
      role: 'employee',
      dept: isDepartment(dept) ? dept : departmentCodeFor(dept),
      org: String(org || '').trim() || null,
      employeeId,
    })
    // The passport is created here rather than at first sign-in so the admin
    // console sees the new starter immediately — at 0 points, which is Level 1.
    const profile = ensureEmployeeProfile({
      id: account.employeeId, name: account.name, initials: account.initials, dept: account.dept,
    })
    // …and the audit trail starts here too, so the admin never meets an employee
    // id whose origin the log cannot account for.
    recordAccountCreated({ id: account.employeeId, dept: account.dept, level: profile.level })
    return res.status(201).json({ ok: true, user: publicAccount(account) })
  } catch (err) {
    if (err.code === 'email-taken') {
      return res.status(409).json({ error: 'An account already exists for this email. Try signing in instead.', field: 'email' })
    }
    if (err.code === 'weak-password') return res.status(400).json({ error: err.message, field: 'password' })
    return res.status(400).json({ error: 'Could not create the account. Please check the details and try again.' })
  }
})

// The sign-up form sends the department's display name ("Engineering"); the
// directory keys on its code ("Eng"). Anything unrecognised lands in Eng rather
// than creating a department nobody administers.
function departmentCodeFor(name) {
  const value = String(name || '').trim().toLowerCase()
  return DEPARTMENTS.find(d => d.name.toLowerCase() === value || d.code.toLowerCase() === value)?.code || 'Eng'
}

// ---- Google SSO ------------------------------------------------------------
//
// Two modes, and the difference is whether a Google client id is configured.
//
//   Configured (GOOGLE_CLIENT_ID) — the real thing. The browser runs Google
//   Identity Services, Google signs an ID token, and this server checks that
//   signature, audience, issuer, expiry and email_verified before it will look
//   the account up. The browser's claim about who signed in is not part of it.
//
//   Not configured — demo chooser. The sign-in screen offers the two seeded
//   organisation identities so SSO can be *shown* on a laptop with no Google
//   project behind it. This is a sign-in-as-anyone endpoint by construction, so
//   it is fenced in on three sides: it needs no client id to be set, it refuses
//   to run under NODE_ENV=production, and it will only ever pick an account
//   that already exists and is SSO-enabled. Setting GOOGLE_CLIENT_ID turns it
//   off completely.
const GOOGLE_CLIENT_ID = String(process.env.GOOGLE_CLIENT_ID || '').trim()
const SSO_DOMAINS = String(process.env.SSO_ALLOWED_DOMAINS || 'abcd.com')
  .split(',').map(d => d.trim().toLowerCase()).filter(Boolean)
const DEMO_SSO = !GOOGLE_CLIENT_ID && process.env.NODE_ENV !== 'production'

/**
 * Verify a Google ID token.
 *
 * Google's own tokeninfo endpoint does the signature check against their
 * rotating keys, which is the part that must not be approximated. Everything it
 * cannot know for us — that the token was minted for *this* application, by
 * Google, that it has not expired, and that Google actually verified the
 * mailbox — is checked here. A token that fails any of them is not a weaker
 * identity, it is nothing.
 */
async function verifyGoogleIdToken(credential) {
  if (!GOOGLE_CLIENT_ID || !credential) return null
  let claims
  try {
    const response = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`
    )
    if (!response.ok) return null
    claims = await response.json()
  } catch {
    return null
  }

  // aud — minted for this application, not for some other site the person also
  // signed into with Google.
  if (claims.aud !== GOOGLE_CLIENT_ID) return null
  if (!['accounts.google.com', 'https://accounts.google.com'].includes(claims.iss)) return null
  if (!(Number(claims.exp) * 1000 > Date.now())) return null
  // An unverified address is an address somebody typed, not one they own.
  if (claims.email_verified !== true && claims.email_verified !== 'true') return null
  if (!claims.email) return null
  return { email: claims.email, sub: claims.sub, name: claims.name || claims.email.split('@')[0] }
}

/** What the sign-in screen needs to know before it can draw the SSO button. */
app.get('/api/auth/sso/config', (req, res) => {
  res.json({
    google: {
      enabled: Boolean(GOOGLE_CLIENT_ID) || DEMO_SSO,
      clientId: GOOGLE_CLIENT_ID || null,
      demo: DEMO_SSO,
      // Only in demo mode, and only accounts that already exist. Nothing here is
      // a credential — choosing one still has to pass /auth/google below.
      accounts: DEMO_SSO
        ? [SEED_EMPLOYEE_EMAIL, SEED_ADMIN_EMAIL]
          .map(email => findByEmail(email))
          .filter(a => a?.sso)
          .map(a => ({ email: a.email, name: a.name, role: a.role, initials: a.initials }))
        : [],
    },
  })
})

app.post('/api/auth/google', async (req, res) => {
  const { credential, demoEmail } = req.body || {}

  if (GOOGLE_CLIENT_ID) {
    const identity = await verifyGoogleIdToken(credential)
    if (!identity) {
      return res.status(401).json({ error: 'Google sign-in could not be verified. Please try again.', authenticated: false })
    }
    const result = accountFromGoogle({ ...identity, allowedDomains: SSO_DOMAINS })
    if (!result.ok) {
      return res.status(403).json({
        error: result.reason === 'domain-not-allowed'
          ? 'That Google account is not part of your organisation.'
          : 'Single sign-on is not enabled for that account.',
        authenticated: false,
      })
    }
    // A first-time Google signer was just provisioned. Recorded separately from
    // a self-registration because it is a materially different claim: Google
    // verified the mailbox and the domain is one this organisation allows.
    if (result.created) {
      const profile = ensureEmployeeProfile({
        id: result.account.employeeId, name: result.account.name,
        initials: result.account.initials, dept: result.account.dept,
      })
      recordAccountCreated({
        id: result.account.employeeId,
        dept: result.account.dept,
        via: `Google SSO · ${identity.email.split('@')[1]}`,
        level: profile.level,
      })
    }
    return signInAs(result.account, res)
  }

  if (!DEMO_SSO) {
    return res.status(503).json({ error: 'Google sign-in is not configured.', authenticated: false })
  }

  // Demo chooser. The email is only ever used to *look up* an account that
  // already exists and has SSO enabled — it can never create one, and it can
  // never reach an account somebody registered through the sign-up form.
  const account = findByEmail(demoEmail)
  if (!account?.sso) {
    return res.status(401).json({ error: 'That account is not available for single sign-on.', authenticated: false })
  }
  return signInAs(account, res)
})

// ---- Firebase Authentication (proposal ZONE 3 · F) -------------------------
//
// The browser signs in with the Firebase client SDK (email/password or Google)
// and hands us the ID token Firebase minted. We verify that token with the
// Admin SDK — Google's signature, audience, issuer, expiry — and only then mint
// *our* session, so everything downstream (the extension's active-session
// pointer, the audit trail, the admin/employee guards) is unchanged: Firebase
// answers "who is this", the existing session system answers "and are they
// still signed in".
//
// The verified email is matched to an account exactly like Google SSO is: a
// seeded/SSO account signs in, a first-time signer on an allowed domain is
// provisioned as a Level 1 employee, anyone else is refused. When Firebase is
// not configured the token cannot be verified and this returns 503, which is
// the frontend's signal to fall back to password / demo sign-in.
app.post('/api/auth/firebase', async (req, res) => {
  const { idToken } = req.body || {}

  const identity = await verifyFirebaseToken(idToken)
  if (!identity) {
    // Either Firebase is offline here, or the token did not verify. Both are the
    // same to the person at the keyboard: this credential did not get them in.
    return res.status(firebaseStatus().configured ? 401 : 503).json({
      error: firebaseStatus().configured
        ? 'Firebase sign-in could not be verified. Please try again.'
        : 'Firebase sign-in is not configured.',
      authenticated: false,
    })
  }

  if (!identity.email || !identity.emailVerified) {
    return res.status(401).json({
      error: 'Your Google/Firebase account must have a verified email to sign in.',
      authenticated: false,
    })
  }

  const result = accountFromGoogle({
    email: identity.email,
    sub: identity.uid,
    name: identity.name,
    allowedDomains: SSO_DOMAINS,
  })
  if (!result.ok) {
    return res.status(403).json({
      error: result.reason === 'domain-not-allowed'
        ? 'That account is not part of your organisation.'
        : 'Single sign-on is not enabled for that account.',
      authenticated: false,
    })
  }

  if (result.created) {
    const profile = ensureEmployeeProfile({
      id: result.account.employeeId, name: result.account.name,
      initials: result.account.initials, dept: result.account.dept,
    })
    recordAccountCreated({
      id: result.account.employeeId,
      dept: result.account.dept,
      via: `Firebase · ${identity.provider || 'auth'} · ${identity.email.split('@')[1]}`,
      level: profile.level,
    })
  }
  return signInAs(result.account, res)
})

// Two questions share this route, and the difference is the token.
//
//   With a token — the web app asking about *its own* session. This is the call
//   that decides whether the admin console renders at all, so it answers only
//   from the registry: 200 for a live session, 401 (with the reason) for one
//   that has expired or was never real. It never infers a session from the fact
//   that somebody, somewhere, is signed in.
//
//   Without one — the Chrome extension, which lives on another origin, cannot
//   share the dashboard's storage and has no token of its own. It asks who is
//   signed in on this machine's dashboard and protects that employee.
//   `{ user: null }` is the honest answer when nobody is.
app.get('/api/auth/session', (req, res) => {
  if (req.auth.verified) {
    return res.json({ ...publicSession(req.auth.session), authenticated: true })
  }
  if (req.auth.token) {
    return res.status(401).json({ user: null, authenticated: false, reason: req.auth.reason })
  }
  const session = activeSession()
  res.json({ ...(publicSession(session) || { user: null }), authenticated: Boolean(session) })
})

app.post('/api/auth/logout', (req, res) => {
  // Signing out is idempotent and must never fail: an expired token is already
  // signed out, and saying so is the same answer as ending a live session.
  const ended = req.auth.token ? destroySession(req.auth.token) : destroyActiveSession()
  if (ended) recordSession('out', ended.user)
  db.session = activeSession()?.user || null
  res.json({ ok: true, authenticated: false })
})

// ---- smart gateway ---------------------------------------------------------
// `preview: true` runs the exact same detection but records nothing. The Chrome
// extension uses it for the debounced while-typing check, then calls again
// without the flag when the employee actually protects and sends — so one sent
// prompt still produces exactly one audit event, same as the web Gateway.
// The detection pipeline itself, with no HTTP and no recording: both /api/detect
// and /api/detect/backfill run exactly this, so a prompt that was masked
// on-device during an outage is scanned by the same rules, the same admin
// controls and the same Layer 2 when it finally reaches the gateway.
async function runDetection(prompt) {
  // Respect the admin's sensitive-data controls
  const c = db.settings.controls
  // Every rule in detector.js must appear under exactly one control, otherwise
  // it can never run — CUSTOMER_RECORD and SECRET were previously unreachable.
  const enabledTypes = new Set([
    ...(c.personalIdentifiers ? ['IC', 'PASSPORT', 'PHONE', 'EMAIL'] : []),
    ...(c.customerRecords ? ['CARD', 'CUSTOMER_RECORD', 'BANK'] : []),
    ...(c.financialFigures ? ['FINANCIAL'] : []),
    ...(c.sourceCode ? ['CREDENTIAL', 'SECRET'] : []),
  ])
  // Layer 1 — rule-based regex + validators, filtered by the admin's controls.
  // Same applyRules the offline extension mirrors, so on-device and server masking
  // agree token-for-token.
  const { masked: maskedL1, detections } = applyRules(prompt, RULES, enabledTypes)
  let masked = maskedL1

  // Layer 2 — person names via Gemini (heuristic fallback when offline).
  // Layer 2 sees the Layer-1-masked text, never the raw prompt.
  let layer2 = 'none'
  if (c.personalIdentifiers) {
    const result2 = await maskNamesIn(masked)
    if (result2.count > 0) {
      masked = result2.masked
      detections.push({ type: 'NAME', count: result2.count })
      layer2 = result2.source
    }
  }

  return { masked, detections, layer2 }
}

/**
 * Is the gateway refusing to let this prompt go?
 *
 * Two different refusals, and the order matters. A **ban** is about the
 * destination, so it refuses a prompt with nothing in it — that is the whole
 * difference between "banned" and "unapproved". Everything else is about the
 * content: Block with nothing detected means there was nothing to hold back, and
 * an ordinary prompt is never the thing an approval workflow exists to stop.
 */
function isRefused(policy, detections) {
  return Boolean(policy.banned) || (policy.mode === MODES.BLOCK && detections.length > 0)
}

app.post('/api/detect', async (req, res) => {
  const { prompt, tool, model, preview } = req.body || {}
  if (typeof prompt !== 'string' || prompt.length === 0) {
    return res.status(400).json({ error: 'Body must be { "prompt": "..." }' })
  }

  // Layer 2 can await a network call, and another request may run in between.
  // The employee this prompt belongs to is decided before the await and
  // re-asserted after it, so the event is never recorded against whoever
  // happened to call the API while this one was waiting.
  const employeeId = req.actor.role === 'employee' ? req.actor.id : db.sessionEmployeeId
  const { masked, detections, layer2 } = await runDetection(prompt)
  setSessionEmployee(employeeId)

  // Where this prompt is heading decides what may happen to it. `mode` is no
  // longer the org setting read straight off the record: an unapproved tool, an
  // unapproved model, or a data category this tool is not cleared for each
  // tighten it to Block, and none of them can ever loosen it.
  //
  // This is the whole answer to "an employee is on a tool nobody approved".
  // Nothing stops them opening it and a clean prompt is untouched — the register
  // only decides what the tool is allowed to *receive*.
  const policy = gatewayPolicyFor({
    employeeId,
    tool: tool || 'AI Assistant',
    model: model || null,
    types: detections.map(d => d.type),
  })

  // Preview = while-typing check: same result, no audit event, no counters, no
  // points. Only the masked/detection outcome is returned.
  if (preview) {
    return res.json({
      masked, detections, layer2, levelUp: false, preview: true,
      mode: policy.mode, policy, blocked: isRefused(policy, detections), explain: db.settings.experience,
    })
  }

  // The gateway is refusing this prompt: a banned destination refuses every
  // prompt, an uncleared one refuses the sensitive part. Nothing is sent, so
  // nothing is recorded as sent — the incident is what goes in the log instead.
  // Writing a MASKED prompt event here would put a delivery in the audit trail
  // that never happened, and leave the refusal itself invisible to the admin.
  if (isRefused(policy, detections)) {
    recordBlockedAttempt({
      tool: tool || 'AI Assistant',
      model: model || null,
      reason: policy.reason,
      types: detections.map(d => d.type),
    })
    return res.json({
      masked, detections, layer2, levelUp: false, blocked: true,
      mode: policy.mode, policy, explain: db.settings.experience,
    })
  }

  const { event, levelUp } = recordPromptEvent({
    detections, masked, tool: tool || 'AI Assistant',
    // `notify` names an unreviewed destination: the prompt still went, masked
    // like any other, so the admin-facing rule for it lives on this path
    // rather than on the refusal one — see recordPromptEvent / noteNotifiedPrompt.
    notify: policy.notify,
  })
  const audit = await logDetection({ detections, masked })
  res.json({
    masked, detections, layer2, levelUp,
    mode: policy.mode, policy, explain: db.settings.experience, event: event.id, audit,
  })
})

// Offline events coming back from the extension's queue.
//
// While the gateway is unreachable the extension masks with its local Layer 1
// copy and sends anyway — protection never depends on this service being up.
// What used to be lost is the *record*, so the extension keeps those events and
// posts them here. The text arriving is the already-masked version, never the
// raw prompt, and it is scanned again by the full pipeline so Layer 2 (which
// could not run on-device) still gets its pass.
app.post('/api/detect/backfill', async (req, res) => {
  const { events } = req.body || {}
  if (!Array.isArray(events)) {
    return res.status(400).json({ error: 'Body must be { "events": [...] }' })
  }

  const employeeId = req.actor.role === 'employee' ? req.actor.id : db.sessionEmployeeId
  const accepted = []
  const duplicates = []
  // Bounded: one flush cannot be used to inject an unlimited number of events.
  for (const e of events.slice(0, 50)) {
    if (!e || typeof e.id !== 'string' || typeof e.prompt !== 'string' || !e.prompt) continue
    const { masked, detections } = await runDetection(e.prompt)
    setSessionEmployee(employeeId)
    const recorded = recordOfflineEvent({
      id: e.id, detections, masked, tool: e.tool || 'AI Assistant', at: e.at,
    })
    ;(recorded ? accepted : duplicates).push(e.id)
  }
  res.json({ accepted, duplicates, recovered: db.report.recoveredEvents })
})

// An employee reached an AI tool. The Chrome extension calls this as it arms
// the checkpoint on a page; the web Gateway calls it when a tool is selected.
// Approved tools answer quietly — only a tool the organisation has not reviewed
// (or has withdrawn) produces an audit event and a risk alert.
app.post('/api/gateway/tool-use', (req, res) => {
  const { tool, model } = req.body || {}
  if (typeof tool !== 'string' || !tool.trim()) {
    return res.status(400).json({ error: 'Body must be { "tool": "..." }' })
  }
  const result = recordToolUse({ tool })
  // A model was named, so the second level is resolved and recorded in the same
  // call. Silent unless the model is one the register refuses — see
  // recordModelUse for why an unrecognised model raises nothing.
  const modelResult = typeof model === 'string' && model.trim()
    ? recordModelUse({ tool, model })
    : null

  const employeeId = req.actor.role === 'employee' ? req.actor.id : db.sessionEmployeeId
  res.json({
    // `approved` stays the org-wide answer the first clients were written
    // against; `access` is the per-employee one they should move to.
    status: result.status,
    approved: result.status === 'APPROVED',
    access: result.access,
    alert: result.alert ? { id: result.alert.id, severity: result.alert.severity } : null,
    model: modelResult
      ? {
        status: modelResult.status,
        alert: modelResult.alert ? { id: modelResult.alert.id, severity: modelResult.alert.severity } : null,
      }
      : null,
    policy: gatewayPolicyFor({ employeeId, tool, model }),
  })
})

// Everything the checkpoint needs about where a prompt is heading, without
// recording anything: this employee's standing on the tool, the selected model's
// standing, the mode that really applies, and which approved tools to offer
// instead. One call, because three separate ones is how the extension and the
// dashboard came to hold different opinions about the same tool.
//
// GET on purpose — resolving is not an event. Opening the popup used to POST a
// tool-use and write an audit record for a question nobody asked.
app.get('/api/gateway/tool-status', (req, res) => {
  const tool = String(req.query.tool || '')
  const model = String(req.query.model || '')
  const host = String(req.query.host || '')
  const employeeId = req.actor.role === 'employee' ? req.actor.id : db.sessionEmployeeId

  // The extension knows the hostname for certain and the tool name only by its
  // own local table. Resolving the host against the register when one is given
  // keeps the register the authority on what a page is.
  const resolved = host ? toolForHost(host)?.name || tool : tool

  res.json({
    ...gatewayPolicyFor({ employeeId, tool: resolved, model: model || null }),
    // Kept so callers written against the old shape keep working.
    status: toolStatus(resolved),
  })
})

// The employee changed model inside an approved tool. Recorded on its own so an
// admin sees the switch even when no prompt follows it.
app.post('/api/gateway/model-use', (req, res) => {
  const { tool, model } = req.body || {}
  if (typeof tool !== 'string' || !tool.trim() || typeof model !== 'string' || !model.trim()) {
    return res.status(400).json({ error: 'Body must be { "tool": "...", "model": "..." }' })
  }
  const result = recordModelUse({ tool, model })
  const employeeId = req.actor.role === 'employee' ? req.actor.id : db.sessionEmployeeId
  res.json({
    status: result.status,
    approved: result.status === 'APPROVED' || result.status === 'UNKNOWN',
    alert: result.alert ? { id: result.alert.id, severity: result.alert.severity } : null,
    policy: gatewayPolicyFor({ employeeId, tool, model }),
  })
})

// The checkpoint refused a prompt on the employee's device, so the backend never
// saw it. This is that incident reaching the admin dashboard.
//
// The Chrome extension runs its while-typing check with `preview: true` — no
// records — and blocks the send itself, which means /api/detect is never called
// for a prompt that does not go. Without this route an unapproved tool or a
// banned model would refuse silently: the employee would be stopped and the
// organisation would learn nothing. Prompt text is never accepted here, only the
// detection types.
app.post('/api/gateway/blocked', (req, res) => {
  const { tool, model, reason, types } = req.body || {}
  if (typeof tool !== 'string' || !tool.trim()) {
    return res.status(400).json({ error: 'Body must be { "tool": "...", "reason": "..." }' })
  }
  const result = recordBlockedAttempt({
    tool,
    model: typeof model === 'string' && model.trim() ? model : null,
    reason: String(reason || 'tool-unapproved'),
    // Types only — a list of category names, never the text they were found in.
    types: Array.isArray(types) ? types.filter(t => typeof t === 'string').slice(0, 20) : [],
  })
  res.json({
    ok: true,
    alert: result.alert ? { id: result.alert.id, severity: result.alert.severity } : null,
  })
})

// Warn-only mode: employee insists on sending the original — penalised + logged.
//
// The prompt arrives raw because the employee is about to send it raw, and that
// is exactly why it is scanned here before anything is written: the record of a
// leak must not itself be a second copy of the leaked data. The same two-layer
// pipeline every other prompt goes through runs on it, and only the masked text
// plus the detection categories are handed to the store — see recordOverride,
// which masks again rather than trusting this caller.
app.post('/api/gateway/override', async (req, res) => {
  const { prompt } = req.body || {}
  if (typeof prompt !== 'string' || prompt.length === 0) {
    return res.status(400).json({ error: 'Body must be { "prompt": "..." }' })
  }
  const employeeId = req.actor.role === 'employee' ? req.actor.id : db.sessionEmployeeId
  const { masked, detections } = await runDetection(prompt)
  // Layer 2 can await, so the employee this override belongs to is re-asserted
  // after it — same discipline as /api/detect.
  setSessionEmployee(employeeId)
  res.json(recordOverride({ masked, detections }))
})

// ---- employee data ---------------------------------------------------------
// The stored record plus its derived fields (AI Safety Score). Served through
// publicProfile() so no screen has to invent a number the server did not send.
app.get('/api/profile', (req, res) => res.json(publicProfile()))

app.get('/api/leaderboard', (req, res) => res.json(leaderboard()))

// The employee's XP / level progression, plus the level table the UI labels
// bands with. Admin reads the same records — one source of truth for both sides.
app.get('/api/progression', (req, res) => {
  res.json({ levels: LEVELS, employees: allProgressionSummaries(), ...progressionSummary() })
})

// Quiz: an answer is recorded (first attempt per question only) but earns no XP
// on its own — XP is settled once, when the assessment is evaluated. Both routes
// refuse a module this employee has not been given, so an unassigned module
// cannot be completed by posting to the API directly.
function guardModule(req, res) {
  const moduleId = Number(req.body?.module ?? req.query?.module) || 1
  const access = canAccessModule(req.actor.id, moduleId)
  if (!access.ok) {
    recordAudit({
      action: 'DENIED',
      resource: access.module?.title || `Module ${moduleId}`,
      tool: 'AI Passport',
      record: `Access refused · module ${moduleId} is ${access.reason.replace('_', ' ')} for ${req.actor.id}`,
      control: 'NIST PR.AC',
      status: 'BLOCKED',
      risk: 'HIGH',
    })
    res.status(403).json({ error: 'This training is not assigned to you.', reason: access.reason })
    return null
  }
  return moduleId
}

app.post('/api/quiz/answer', (req, res) => {
  const moduleId = guardModule(req, res)
  if (moduleId === null) return
  const { question, correct, selected } = req.body || {}
  res.json(answerQuiz(moduleId, Number(question), Boolean(correct), Number.isInteger(selected) ? selected : null))
})

app.get('/api/quiz/results', (req, res) => {
  const moduleId = guardModule(req, res)
  if (moduleId === null) return
  res.json(quizResults(moduleId))
})

app.post('/api/training/complete', (req, res) => {
  const moduleId = guardModule(req, res)
  if (moduleId === null) return
  res.json(completeTraining(moduleId))
})

// Retry is only offered after the whole assessment has been evaluated, and only
// once the 24h lock has expired — 423 while it is still locked.
app.post('/api/quiz/retry', (req, res) => {
  const moduleId = guardModule(req, res)
  if (moduleId === null) return
  const result = retryTraining(moduleId)
  res.status(result.ok ? 200 : 423).json(result)
})

// ---- training library + assignments ----------------------------------------
// The admin half writes; the employee half reads its own slice. Both run off
// db.trainingLibrary and db.assignments, which is what keeps "published and
// assigned" and "visible to that employee" the same fact.

app.get('/api/training/library', requireAdmin, (req, res) => {
  res.json({
    modules: libraryForAdmin(),
    assignments: assignmentRecords(),
    departments: DEPARTMENTS,
    employees: EMPLOYEES,
    maxQuestions: MAX_QUESTIONS,
  })
})

app.post('/api/training/modules', requireAdmin, (req, res) => {
  const result = createModule(req.body || {})
  if (!result.ok) return res.status(400).json(result)
  res.json(result)
})

// The question editor holds its edits locally and sends the finished set once,
// so a module never sits in a half-edited state where an employee could open it.
app.put('/api/training/modules/:id', requireAdmin, (req, res) => {
  const result = updateModule(Number(req.params.id), req.body || {})
  if (!result.ok) return res.status(result.error?.includes('no longer exists') ? 404 : 400).json(result)
  res.json(result)
})

app.post('/api/training/modules/:id/status', requireAdmin, (req, res) => {
  const result = setModuleStatus(Number(req.params.id), req.body?.status)
  if (!result.ok) return res.status(404).json(result)
  res.json(result)
})

app.get('/api/training/assignments', requireAdmin, (req, res) => res.json(assignmentRecords()))

app.post('/api/training/assignments', requireAdmin, (req, res) => {
  const { moduleId, type, department, employeeIds } = req.body || {}
  const result = assignTraining({ moduleId: Number(moduleId), type, department, employeeIds })
  if (!result.ok) return res.status(400).json(result)
  res.json(result)
})

// The employee's own training list — published modules that are either standing
// curriculum or assigned to them. Never anybody else's.
app.get('/api/training/mine', (req, res) => {
  res.json({
    employeeId: req.actor.id,
    modules: modulesForEmployee(req.actor.id),
    assignments: assignmentsForEmployee(req.actor.id),
  })
})

// One module, with its questions — the lesson itself. This is the only route
// that hands out question content, and it applies the same access check as the
// quiz routes, so a direct URL for somebody else's training returns 403 rather
// than the assessment.
app.get('/api/training/mine/:id', (req, res) => {
  const moduleId = Number(req.params.id)
  const access = canAccessModule(req.actor.id, moduleId)
  if (!access.ok) {
    recordAudit({
      action: 'DENIED',
      resource: access.module?.title || `Module ${moduleId}`,
      tool: 'AI Passport',
      record: `Access refused · module ${moduleId} is ${access.reason.replace('_', ' ')} for ${req.actor.id}`,
      control: 'NIST PR.AC',
      status: 'BLOCKED',
      risk: 'HIGH',
    })
    return res.status(access.reason === 'not_found' ? 404 : 403).json({
      error: access.reason === 'not_found'
        ? 'That training module does not exist.'
        : 'This training is not assigned to you.',
      reason: access.reason,
    })
  }
  res.json(publicModule(moduleById(moduleId), { withQuestions: true }))
})

// ---- notifications ---------------------------------------------------------
// Scoped to the signed-in employee both ways: the list is theirs, and an id
// from somebody else's inbox does nothing.
app.get('/api/notifications', (req, res) => {
  if (req.actor.role === 'admin') return res.json([])
  res.json(notificationsFor(req.actor.id))
})
const notificationPatch = patch => (req, res) => {
  if (req.actor.role === 'admin') return res.status(403).json({ error: 'Employee inbox only.' })
  res.json(updateNotification(req.actor.id, req.params.id, patch) || {})
}
app.post('/api/notifications/:id/read', notificationPatch({ read: true }))
app.post('/api/notifications/:id/delete', notificationPatch({ deleted: true }))
app.post('/api/notifications/:id/restore', notificationPatch({ deleted: false }))

// ---- my AI activity --------------------------------------------------------
// The signed-in employee's own audit events, behind the Home "My AI Activity"
// card and the page it opens. Scoped on the server (activityFor), so the
// browser is never sent an event belonging to somebody else — /api/audit, the
// organisation-wide feed, stays where it is for the admin console.
app.get('/api/activity/mine', (req, res) => {
  if (req.actor.role === 'admin') {
    return res.status(403).json({ error: 'This is an employee view. Administrators use the Audit Log.' })
  }
  const p = db.profile
  res.json({
    events: activityFor(req.actor.id),
    counters: {
      promptsProtected: p.promptsProtected,
      itemsMasked: p.itemsMasked,
      streakDays: p.streakDays,
    },
  })
})

// ---- visas / tool approvals ------------------------------------------------
app.get('/api/visas', (req, res) => res.json(db.visaRequests))

// The employee's guided request form, server-side: which AI tools they may ask
// for, and whether their AI License lets them ask at all. The browser renders
// this list rather than a set of text boxes, and applyForVisa re-checks the same
// two rules — a request naming anything else is refused however it was made.
app.get('/api/tools/requestable', (req, res) => {
  const employeeId = req.actor.role === 'employee' ? req.actor.id : db.sessionEmployeeId
  const level = db.employees[employeeId]?.level || 0
  res.json({
    canRequest: level >= REQUEST_MIN_LEVEL,
    minLevel: REQUEST_MIN_LEVEL,
    level,
    tools: requestableTools(employeeId),
  })
})

app.post('/api/visas/apply', (req, res) => {
  const result = applyForVisa(req.body || {})
  if (!result.ok) return res.status(403).json({ error: result.error })
  res.json(result.request)
})
app.post('/api/visas/:id/decision', requireAdmin, (req, res) => {
  const { decision, note } = req.body || {}
  const request = decideVisa(req.params.id, decision, note)
  if (!request) return res.status(404).json({ error: 'Request not found' })
  res.json(request)
})

// Org-wide tool status (Tool Approvals' vendor security card). Suspending is an
// admin action: it updates the tool here, writes one audit event and notifies
// employees — 409 if the tool is already suspended, so a repeat click is a no-op.
app.get('/api/tools', (req, res) => res.json(toolRegister()))

// The register folded for the signed-in employee: the same rows, plus where
// *they* stand on each one and which models they may use.
//
// The fold used to live in the browser (Visas.jsx compared minLevel against the
// profile), which meant the page and the gateway could reach different answers
// about the same tool — the page would say "approved" while the checkpoint
// refused the prompt. One function answers it now and both read the result.
app.get('/api/tools/mine', (req, res) => {
  const employeeId = req.actor.role === 'employee' ? req.actor.id : db.sessionEmployeeId
  // The employee's preferred destination — what the Gateway opens on. Marked
  // here rather than chosen in the browser, and only when the register actually
  // approves it for them: a default is a convenience, never an access grant.
  const preferred = db.employees[employeeId]?.defaultTool || null
  res.json(toolRegister().map(entry => {
    const access = toolAccessFor(employeeId, entry.name)
    // Models folded the same way the tool is: `access` per model, so the page
    // can show a Trainee their free models as available and the paid ones as
    // what Level 2 opens, without holding a level table of its own.
    const models = toolModelsFor(employeeId, entry.name)
    const free = freeModelFor(employeeId, entry.name)
    return {
      ...entry,
      access: access.access,
      approved: access.approved,
      explain: access.explain,
      request: access.request,
      models,
      // What the AI Tools page puts in the MODEL column at every licence level:
      // the newest free model on the tool, falling back to the register's own
      // headline model for a tool with no model policy.
      displayModel: free?.label || entry.model,
      category: entry.category || 'assistant',
      isDefault: entry.name === preferred && access.approved,
    }
  }))
})

// Per-model decision inside a tool that stays approved — the case-study
// scenario where the website is greenlit and one model on it is not. Separate
// from /api/tools/suspend on purpose: suspending Claude stops an organisation
// using Claude, whereas refusing one model leaves every approved one working.
app.post('/api/tools/model-status', requireAdmin, (req, res) => {
  const { tool, model, status } = req.body || {}
  const result = setModelStatus(tool, model, status)
  if (!result.ok) {
    const code = result.reason === 'unchanged' ? 409 : result.reason === 'bad_status' ? 400 : 404
    return res.status(code).json({ error: result.reason, tools: result.tools })
  }
  res.json({ tool: result.tool, model: result.model, event: result.event, tools: result.tools })
})
app.post('/api/tools/suspend', requireAdmin, (req, res) => {
  const { tool } = req.body || {}
  const result = suspendToolOrgWide(tool)
  if (!result.ok) return res.status(result.reason === 'not_found' ? 404 : 409).json(result)
  res.json(result)
})

// The register's other direction (O3: "approve or decline in one click", O4).
// Clearing an unreviewed tool, or lifting a suspension once the vendor issue is
// resolved. Separate from deciding an employee's access request on purpose —
// see clearToolOrgWide, and the note in decideVisa about why one employee's
// approval must never open a tool for everybody.
app.post('/api/tools/clear', requireAdmin, (req, res) => {
  const { tool } = req.body || {}
  const result = clearToolOrgWide(tool)
  if (!result.ok) return res.status(result.reason === 'not_found' ? 404 : 409).json(result)
  res.json(result)
})

// ---- admin data ------------------------------------------------------------
// The whole organisation's audit feed, and therefore admin-only: it carries
// every employee's governance history, which is the one thing an employee must
// not be able to read about their colleagues. Their own slice is served by
// /api/activity/mine, filtered on the server rather than in the browser.
//
// auditView() folds in each event's review status from the alert it opened. It
// is derived on read, so the log itself stays append-only.
app.get('/api/audit', requireAdmin, (req, res) => {
  res.json({ events: auditView(), counters: { promptsToday: db.counters.promptsToday, maskedToday: db.counters.maskedToday } })
})

app.get('/api/stats', (req, res) => {
  res.json({
    promptsToday: db.counters.promptsToday,
    maskedToday: db.counters.maskedToday,
    openAlerts: openAlerts().length,
    // Org-wide average across the 303 seeded employees, of whom the signed-in
    // one is live. 2.1 is that population's standing average at their seeded
    // Level 2; their levelling up nudges it. Derived in compliance.js because
    // the report's risk score reads the same figure — two definitions of "how
    // licensed is this workforce" would eventually disagree on the same screen.
    avgLicense: avgLicenseLevel(),
    pendingApprovals: db.visaRequests.filter(r => ['SECURITY REVIEW', 'COMPLIANCE'].includes(r.status)).length,
    // Events masked on-device during a gateway outage and recorded afterwards.
    recoveredEvents: db.report.recoveredEvents,
  })
})

// One-click compliance report (O3). The numbers live here, not in the page, so
// what a regulator downloads is what the audit log holds. complianceReport()
// spreads reportSummary()'s flat totals in alongside the document sections, so
// this route answers both the old shape and the new one.
app.get('/api/report', requireAdmin, (req, res) => res.json(complianceReport()))

// The executive summary at the top of that report, written from the same
// figures. Separate from /api/report because it is the one part that can take a
// second to produce (a model call) and the one part that may fail — the report
// must still render when the summary does not, so a failure here can never take
// the numbers down with it.
//
// `?refresh=1` is "Regenerate with AI": it bypasses the cache that keeps the
// screen's five-second poll from spending a request per tick.
app.get('/api/report/summary', requireAdmin, async (req, res) => {
  try {
    res.json(await executiveSummary({ refresh: req.query.refresh === '1' }))
  } catch {
    // The writer of last resort. Never a 500: an empty summary box on a report
    // whose figures are all present reads as the whole page being broken.
    res.json({ summary: analystSummary(complianceReport()), source: 'analyst', cached: false })
  }
})

// The board-level "one number" behind the Overview gauge (O3). Same
// riskPosture() the compliance report embeds, so the score an admin watches on
// the dashboard is the score the downloaded report states — there is no second
// calculation that could drift from it.
app.get('/api/risk', requireAdmin, (req, res) => res.json(riskPosture()))

// Shadow AI (O3): unapproved tools the audit log has actually seen. Admin-only
// for the same reason as the audit feed — it names departments and counts.
app.get('/api/shadow-ai', requireAdmin, (req, res) => res.json({ tools: shadowAITools() }))

// ---- risk alerts ----
// Sorted by severity with a live `due` countdown — see alertsView(). The rules
// that decide severity are in risk.js and are surfaced to the admin screen so
// the queue can be explained rather than just read.
// Admin-only for the same reason as the audit feed: an alert names the employee
// it is about, their department and what they did.
app.get('/api/alerts', requireAdmin, (req, res) => res.json(alertsView()))
app.post('/api/alerts/:id/resolve', requireAdmin, (req, res) => {
  resolveAlert(req.params.id)
  res.json(alertsView())
})

// The rest of the alert workflow — acknowledge, escalate, and the two actions
// that open another screen. Each is a governance decision, so each lands on the
// alert's timeline and in the audit log rather than only in a toast the admin
// sees once. Escalating raises the severity by hand and moves the deadline with
// it: a human who knows more than the rule did is allowed to overrule it.
app.post('/api/alerts/:id/action', requireAdmin, (req, res) => {
  const result = actOnAlert(req.params.id, String(req.body?.action || ''))
  if (!result.ok) {
    const code = result.reason === 'not_found' ? 404 : result.reason === 'unknown_action' ? 400 : 409
    return res.status(code).json({ error: result.reason })
  }
  res.json({ ok: true, alert: result.alert, alerts: alertsView() })
})

// Public transparency portal: affected person requests a human review
app.post('/api/review-request', (req, res) => {
  const { ref } = req.body || {}
  res.json(addReviewRequest(ref || 'REF-DEMO-2026-041'))
})

// `modes` is the list of protection modes an admin may actually choose, sent
// with the policy rather than hard-coded in the Settings screen — so removing or
// adding an org-wide mode is a change to risk.js and nowhere else. Block is not
// in it: it exists only as a verdict the gateway derives for a destination that
// has not been cleared.
app.get('/api/settings', (req, res) => res.json({ ...db.settings, modes: ORG_MODES }))
app.put('/api/settings', requireAdmin, (req, res) => {
  res.json({ ...updateSettings(req.body || {}), modes: ORG_MODES })
})

// ---- demo helpers ----------------------------------------------------------
// Back to the seed state, sessions included: a reset that left people signed in
// would leave the browser holding a token for an organisation that no longer
// has the record behind it.
app.post('/api/reset', (req, res) => {
  resetStore()
  resetSessions()
  db.session = null
  res.json({ ok: true })
})

// Sessions outlive a restart (see auth.js), so the store's projection of "who is
// signed in" is restored with them rather than starting out disagreeing.
db.session = activeSession()?.user || null

const PORT = process.env.PORT || 5001

// Imported by the HTTP tests, which bind their own ephemeral port. Only the
// process actually started as the backend opens the real one.
export { app }

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  app.listen(PORT, () => {
    console.log(`AI Passport backend running on http://localhost:${PORT}`)
    console.log(
      GOOGLE_CLIENT_ID
        ? `Google SSO: enabled (client ${GOOGLE_CLIENT_ID.slice(0, 12)}…), domains: ${SSO_DOMAINS.join(', ')}`
        : DEMO_SSO
          ? 'Google SSO: demo chooser (set GOOGLE_CLIENT_ID in backend/.env for real Google sign-in)'
          : 'Google SSO: disabled'
    )
    // Printed only while the seeded passwords are still the shipped defaults —
    // the moment SEED_*_PASSWORD is set, they stop appearing in the log. A real
    // deployment must set them; this line is how you notice you have not.
    if (usingDefaultSeedPasswords()) {
      console.log('\nDemo sign-in (default passwords — override with SEED_EMPLOYEE_PASSWORD / SEED_ADMIN_PASSWORD):')
      console.log(`  employee · ${SEED_EMPLOYEE_EMAIL}  ${SEED_EMPLOYEE_PASSWORD}`)
      console.log(`  admin    · ${SEED_ADMIN_EMAIL}  ${SEED_ADMIN_PASSWORD}`)
      console.log(`  new accounts: ${PASSWORD_POLICY.describe}\n`)
    }
  })
}