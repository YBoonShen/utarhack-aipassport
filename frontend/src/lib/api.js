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
// So the developer detail is kept for development and nothing else.
// `import.meta.env.DEV` is replaced at build time, so the branch below is
// eliminated from a production bundle — the hint is not merely hidden from the
// page, it is not in the shipped JavaScript to be found.
const DEV_HINT = ' (dev: is the backend running? cd backend && npm run dev)'

// Pre-auth. Says only that the attempt could not be completed, and points at
// the person who can actually help — no infrastructure, no instructions.
export const SIGN_IN_UNAVAILABLE =
  'Sign-in is unavailable right now. Please try again in a moment, or contact your IT administrator.' +
  (import.meta.env.DEV ? DEV_HINT : '')

// Post-auth. The reader is a known employee, so it can be a little warmer, but
// it still describes the effect rather than the architecture.
export const SERVICE_UNAVAILABLE =
  'We could not reach the service just now. Nothing was sent. Please try again in a moment.' +
  (import.meta.env.DEV ? DEV_HINT : '')

async function request(path, options) {
  const res = await fetch(`/api${path}`, options)
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

export async function login(role) {
  const user = await api.post('/auth/login', { role })
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
    if (live?.role === user.role) return live
    return await api.post('/auth/login', { role: user.role })
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
