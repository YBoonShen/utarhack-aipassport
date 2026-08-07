// Thin fetch helpers for the AI Passport backend (proxied through /api).

// ---- what the user is told when a call fails -------------------------------
//
// An unreachable service is the same event to us and a very different one to
// tell a stranger about. "Backend not running — start it with: cd backend &&
// npm run dev" was being shown on the sign-in screen, which is the one page
// anybody can reach without credentials: it disclosed that there is a separate
// backend service, the repository layout, and the runtime — free reconnaissance
// in exchange for a failed request (CWE-209). It also instructed the reader to
// paste a shell command, which is the shape of a real attack pattern and not a
// habit a security product should be teaching.
//
// The two channels are therefore kept apart, and neither one is weakened for the
// other's sake:
//   • the screen gets a plain sentence about what happened and what to do next;
//   • the console gets the whole error, for whoever is actually debugging it.
// No user-facing string carries a command, a path, a status code or a stack.

// Pre-auth. Says only that the attempt could not be completed — no
// infrastructure, no instructions, and in a real auth backend no hint as to
// whether the account exists.
export const SIGN_IN_UNAVAILABLE = 'Sign-in is temporarily unavailable. Please try again in a moment.'

// Post-auth. The reader is a known employee, so it can be a little warmer, but
// it still describes the effect rather than the architecture.
export const SERVICE_UNAVAILABLE = 'We could not reach the service just now. Nothing was sent. Please try again in a moment.'

/**
 * The developer half of a failure: the real error, in the console, where only
 * somebody with devtools open will read it. Callers pair this with one of the
 * user-facing strings above — never with the error itself.
 */
export function logFailure(scope, error) {
  console.error(`[AI Passport] ${scope} failed`, error)
}

// The session token, sent on every request. This *is* the credential: the server
// looks it up in its own registry (backend/src/auth.js) and derives the caller's
// identity from the record it finds, so nothing this browser believes about
// itself is part of the answer.
//
// It replaces a pair of `X-AIP-Role` / `X-AIP-User` headers filled in from
// localStorage — an arrangement in which the browser stated who it was and the
// server took its word for the role. The seam is unchanged; a Firebase ID token
// goes in exactly here.
function authHeaders() {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

/**
 * The two failures that must never be confused.
 *
 * `offline` — the request did not complete: the backend is down, the network
 * dropped, the dev proxy refused the connection. It says nothing at all about
 * whether the session is valid, so nothing may be concluded from it.
 *
 * `authInvalid` — the server answered 401. That *is* a statement about the
 * session: it has expired or was never real. This is the only signal that may
 * sign somebody out, and it clears the stored session as it passes.
 */
async function request(path, options = {}) {
  let res
  try {
    res = await fetch(`/api${path}`, {
      ...options,
      headers: { ...authHeaders(), ...(options.headers || {}) },
    })
  } catch (cause) {
    const error = new Error(`API ${path} could not be reached`)
    error.status = 0
    error.offline = true
    error.cause = cause
    throw error
  }

  if (!res.ok) {
    // Keep the status and payload — callers such as the 24h retry lock need the
    // details the server sent with the error (e.g. 423 + retryAvailableAt).
    const error = new Error(`API ${path} failed (${res.status})`)
    error.status = res.status
    error.body = await res.json().catch(() => null)
    if (res.status === 401) {
      error.authInvalid = true
      error.reason = error.body?.reason || 'invalid'
      // Whatever this tab was showing, the server has just said the session
      // behind it is over. Clearing here — rather than in whichever screen
      // happened to make the call — is what stops one stale token from being
      // re-sent by the next twelve requests.
      clearStoredSession()
      emitAuthInvalid(error.reason)
    }
    // A 5xx is the dev proxy's answer when the backend is not listening, and the
    // deployment's answer when it is unwell. Either way it is an outage, not a
    // verdict about the session.
    if (res.status >= 500) error.offline = true
    throw error
  }
  return res.json()
}

export const api = {
  get: path => request(path),
  post: (path, body) =>
    request(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    }),
  put: (path, body) =>
    request(path, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    }),
}

// ---- the session, as this browser holds it ---------------------------------
//
// Two things are stored, and only one of them is a credential.
//
//   aip-token — the opaque session token the server minted. Proof, and the only
//               proof: it means nothing until the server recognises it.
//   aip-user  — a *cache* of who that session belongs to, so the header can draw
//               an avatar without a round trip and so per-employee local keys
//               (the level-up celebration, the 24h retry lock) know whose they
//               are. It is display state. It has never been, and must never
//               become, the reason an authenticated screen renders.
//
// The distinction is the entire admin bug: the router used to read aip-user
// synchronously and mount the admin console on the strength of it, so a leftover
// object from a previous demo — or one typed into devtools — was a signed-in
// administrator, and with the backend down nothing ever contradicted it.

const KEY = 'aip-user'
const TOKEN_KEY = 'aip-token'
const EXPIRY_KEY = 'aip-session-expires'

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || ''
  } catch {
    return ''
  }
}

/** The cached display identity. Never evidence of a session — see above. */
export function currentUser() {
  try {
    return JSON.parse(localStorage.getItem(KEY))
  } catch {
    return null
  }
}

/** When the server said this session runs out, or 0 if we were never told. */
export function sessionExpiry() {
  return Number(localStorage.getItem(EXPIRY_KEY)) || 0
}

export function storeSession({ user, token, expiresAt }) {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(KEY, JSON.stringify(user))
  if (expiresAt) localStorage.setItem(EXPIRY_KEY, String(expiresAt))
  return user
}

export function clearStoredSession() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(KEY)
  localStorage.removeItem(EXPIRY_KEY)
}

// Any request may be the one that discovers the session has ended. Subscribers
// (the auth provider) hear about it once, wherever it happened, so a 401 in a
// background poll signs the tab out just as a 401 on a click would.
const authInvalidListeners = new Set()

export function onAuthInvalid(fn) {
  authInvalidListeners.add(fn)
  return () => authInvalidListeners.delete(fn)
}

function emitAuthInvalid(reason) {
  for (const fn of authInvalidListeners) {
    try {
      fn(reason)
    } catch (err) {
      logFailure('auth listener', err)
    }
  }
}

// ---- signing in ------------------------------------------------------------
//
// The browser sends a credential and receives a session. It does not send a
// role: which console opens is decided by the account the server proves, not by
// anything typed into this app. (It used to send `{ role }` straight from the
// email box, which is authentication by text field.)

export async function login(email, password) {
  const { user, token, expiresAt } = await api.post('/auth/login', { email, password })
  storeSession({ user, token, expiresAt })
  return user
}

/**
 * Sign in with Google.
 *
 * `credential` is the ID token Google Identity Services handed the page — it is
 * passed straight through and verified on the server, because a token this app
 * merely *received* proves nothing until Google's signature on it is checked.
 * `demoEmail` is the no-Google-project fallback the server only honours in demo
 * mode (see /api/auth/google).
 */
export async function loginWithGoogle({ credential, demoEmail } = {}) {
  const { user, token, expiresAt } = await api.post('/auth/google', { credential, demoEmail })
  storeSession({ user, token, expiresAt })
  return user
}

/**
 * Sign in with Firebase (proposal ZONE 3 · F).
 *
 * `idToken` is the token the Firebase client SDK produced after a Google popup
 * or an email/password sign-in. It is passed straight through and verified on
 * the server with the Admin SDK before it means anything — exactly like the
 * Google credential above. The seam this file's header points at (`api.js:46`):
 * a Firebase ID token goes in here, and the same session comes back out.
 */
export async function loginWithFirebase(idToken) {
  const { user, token, expiresAt } = await api.post('/auth/firebase', { idToken })
  storeSession({ user, token, expiresAt })
  return user
}

/** Whether SSO is configured, and with what. Safe to call unauthenticated. */
export async function ssoConfig() {
  return api.get('/auth/sso/config')
}

/**
 * Create an account. Deliberately does *not* sign the new employee in: the
 * account is only proven once its password has been used, which is also the
 * screen Figma 00F leads to ("Continue to sign in").
 */
export async function register(details) {
  return api.post('/auth/register', details)
}

/**
 * Ask the server who this browser is. The only function in the app that may
 * answer that question, and it answers in three ways, never two:
 *
 *   authenticated   — the token names a live session; `user` comes off the
 *                     server's record, not off anything stored here.
 *   unauthenticated — no token, or the server refused it. Local state is
 *                     already cleared by then.
 *   unavailable     — the request did not complete. Nothing is concluded and
 *                     nothing is cleared: a backend that is down has not
 *                     signed anybody out, and must not be able to.
 */
// The session is re-checked every few seconds while the backend is down, and one
// console line per attempt would bury whatever else the person debugging is
// looking at. The first failure of an outage is logged; the rest are the same
// error.
let outageLogged = false

export async function fetchSession({ signal } = {}) {
  if (!getToken()) {
    // Nothing to verify. A cached user with no token is the residue of an older
    // build (or a hand-edited one); it is not a session, so it goes.
    clearStoredSession()
    return { status: 'unauthenticated', user: null, reason: 'no-token' }
  }
  try {
    const data = await request('/auth/session', { signal })
    if (!data?.user) {
      clearStoredSession()
      return { status: 'unauthenticated', user: null, reason: 'no-session' }
    }
    storeSession({ user: data.user, token: getToken(), expiresAt: data.expiresAt })
    outageLogged = false
    return { status: 'authenticated', user: data.user, expiresAt: data.expiresAt }
  } catch (err) {
    if (err.authInvalid) {
      outageLogged = false
      return { status: 'unauthenticated', user: null, reason: err.reason }
    }
    if (!outageLogged) {
      outageLogged = true
      logFailure('session check', err)
    }
    return { status: 'unavailable', user: null, reason: 'unreachable' }
  }
}

// Ends the session at the server first, so the Chrome extension — which follows
// whoever is signed in on the dashboard — stops protecting an employee who has
// signed out. The local state is cleared either way: a failed call must never
// leave the browser holding a session it has decided to end.
export async function logout() {
  try {
    await api.post('/auth/logout')
  } catch (err) {
    logFailure('sign-out', err)
  } finally {
    clearStoredSession()
  }
}
