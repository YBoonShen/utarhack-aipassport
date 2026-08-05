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

// Who this tab is signed in as, stated on every request. The server validates
// it against its own directory before believing any of it — this is not a
// credential, it is the seam a Firebase ID token slots into later. It exists
// because the backend has to answer two browsers at once (an admin console and
// an employee passport) without the later sign-in redefining who the earlier
// one is: notifications, assigned training and the quiz all hang off it.
function identityHeaders() {
  const user = currentUser()
  if (!user) return {}
  return { 'X-AIP-Role': user.role, 'X-AIP-User': user.id }
}

async function request(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: { ...identityHeaders(), ...(options.headers || {}) },
  })
  if (!res.ok) {
    // Keep the status and payload — callers such as the 24h retry lock need the
    // details the server sent with the error (e.g. 423 + retryAvailableAt).
    const error = new Error(`API ${path} failed (${res.status})`)
    error.status = res.status
    error.body = await res.json().catch(() => null)
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

// ---- demo auth (localStorage session; Firebase Auth later) ----

const KEY = 'aip-user'

export function currentUser() {
  try {
    return JSON.parse(localStorage.getItem(KEY))
  } catch {
    return null
  }
}

// The email decides both the role and, for an employee, which directory record
// signs in — so the same demo can show a training reaching one employee and not
// another. The server resolves it; this only passes it on.
export async function login(role, email) {
  const user = await api.post('/auth/login', { role, email })
  localStorage.setItem(KEY, JSON.stringify(user))
  return user
}

// The server-side session (db.session) is what the Chrome extension reads to
// learn who is signed in, and it lives in memory — a backend restart drops it
// while this tab is still signed in from localStorage. That split is what left
// the extension reporting "signed out" for an employee who plainly was not, so
// the dashboard re-asserts its session whenever it loads.
//
// Only ever a *re-assertion*: with nothing in localStorage there is nothing to
// restore, so a genuinely fresh browser still starts signed out.
export async function restoreSession() {
  const user = currentUser()
  if (!user) return null
  try {
    const { user: live } = await request('/auth/session')
    if (live?.role === user.role && live?.id === user.id) return live
    // Same tab, different identity on the shared session — re-assert this one.
    return await api.post('/auth/login', { role: user.role, email: user.id })
  } catch {
    return null // backend down; the local session is unaffected
  }
}

export function logout() {
  localStorage.removeItem(KEY)
  // Clear the shared server-side session too, so the Chrome extension signs out
  // with the web app instead of holding a stale employee. Fire-and-forget: the
  // local session is already gone, so a failed call must not block the redirect.
  api.post('/auth/logout').catch(() => {})
}
