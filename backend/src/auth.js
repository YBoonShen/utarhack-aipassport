// AI Passport — the session authority.
//
// "Is this caller signed in, and as whom" is a question only the server may
// answer. This is where it is answered: signing in mints a session *record*, the
// browser is handed the opaque token that names it, and every later request is
// judged against the record — never against anything the client says about
// itself.
//
// Why this module exists at all. The demo treated the browser's localStorage as
// proof of a session: a `{"role":"admin"}` object left there by an earlier demo
// (or typed into devtools) rendered the full admin console, and the dashboard
// then *re-asserted* that stored identity to the backend on load, so a session
// nobody had authenticated brought itself back to life. With the backend down
// the browser never learned otherwise, which is exactly the "signed in when they
// never signed in" report. Nothing here reads client-supplied identity: a token
// is either present in this registry and unexpired, or it is not a session.
//
// This is the seam Firebase Authentication drops into. createSession() becomes
// the ID-token mint, verifySession() becomes admin.auth().verifyIdToken(), and
// the shape every caller (server.js, the web app, the Chrome extension) is
// written against does not change.

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data')

// Overridable so a test can run against a scratch file instead of the demo's own
// sessions — the registry on disk belongs to whoever is signed in right now.
const SESSION_FILE = process.env.AUTH_SESSION_FILE || path.join(DATA_DIR, 'sessions.json')

function positive(value, fallback) {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

// Two clocks, because they answer two different questions.
//
//   IDLE     — how long a session survives without being used. This is what
//              "your session expired" means to an employee who walked away.
//   ABSOLUTE — how long it may live at all, however busy it is. A token that
//              leaks must not be renewable forever.
//
// Both are environment-tunable, which is also how the expiry tests run in
// milliseconds rather than hours.
export const IDLE_TTL_MS = positive(process.env.AUTH_SESSION_IDLE_MS, 8 * 60 * 60 * 1000)
export const ABSOLUTE_TTL_MS = positive(process.env.AUTH_SESSION_MAX_MS, 24 * 60 * 60 * 1000)

// A bound on the registry. Sessions are small, but an unbounded map fed by an
// open /auth/login is a memory leak with a request behind it.
const MAX_SESSIONS = 200

// token -> { token, user, issuedAt, lastSeenAt }
const sessions = new Map()

// The one session the *Chrome extension* follows.
//
// The extension runs on another origin and cannot share the dashboard's storage,
// so it has no token of its own: it asks "who is signed in on this machine's
// dashboard" and protects that employee. That pointer is this. It is a
// convenience for a co-located client, never a credential — reading it grants
// nothing, and it is subject to exactly the same expiry as the record it names.
let activeToken = null

let lastSaveAt = 0

// ---- lifetimes -------------------------------------------------------------

/** When this session stops being valid — whichever clock runs out first. */
export function expiresAt(session) {
  return Math.min(session.lastSeenAt + IDLE_TTL_MS, session.issuedAt + ABSOLUTE_TTL_MS)
}

/** The session as a client may see it. The token is never echoed back here. */
export function publicSession(session) {
  return session
    ? { user: session.user, issuedAt: session.issuedAt, expiresAt: expiresAt(session) }
    : null
}

/** Drops every lapsed record. Cheap, and keeps the registry from growing stale. */
export function sweep(now = Date.now()) {
  let removed = 0
  for (const [token, session] of sessions) {
    if (now >= expiresAt(session)) {
      sessions.delete(token)
      if (activeToken === token) activeToken = null
      removed++
    }
  }
  if (removed) save()
  return removed
}

// ---- the registry ----------------------------------------------------------

/**
 * Sign in: a new session record, and the token that names it.
 *
 * The token is 32 random bytes. It is the only thing the browser is given, and
 * it means nothing on its own — an attacker cannot construct one, and editing it
 * in devtools produces a token this registry has never heard of.
 */
export function createSession(user, now = Date.now()) {
  sweep(now)
  // Oldest out first if somehow at the ceiling. Signing in must always succeed.
  while (sessions.size >= MAX_SESSIONS) {
    const oldest = [...sessions.values()].sort((a, b) => a.lastSeenAt - b.lastSeenAt)[0]
    sessions.delete(oldest.token)
    if (activeToken === oldest.token) activeToken = null
  }

  const session = {
    token: crypto.randomBytes(32).toString('base64url'),
    user,
    issuedAt: now,
    lastSeenAt: now,
  }
  sessions.set(session.token, session)
  // The newest sign-in is the one the extension follows, which is the behaviour
  // the demo already had: sign in as an admin in a second window and the
  // extension reports an admin session.
  activeToken = session.token
  save()
  return session
}

/**
 * The whole of authentication, in one function.
 *
 * `reason` matters as much as the verdict does. A caller has to be able to tell
 * "your session ended" (clear the local state, sign the user out) apart from
 * "we could not ask" (a network failure, which must never destroy a valid
 * session) — and only the first of those two ever reaches here at all.
 *
 * Verifying *touches* the session: an employee working in the dashboard keeps it
 * alive, and one who walked away lets it lapse. Reads that do not carry a token
 * — the extension's poll — deliberately do not touch, so an open ChatGPT tab
 * cannot keep a session alive for a browser nobody is sitting at.
 */
export function verifySession(token, { now = Date.now(), touch = true } = {}) {
  if (!token || typeof token !== 'string') return { ok: false, reason: 'missing' }

  const session = sessions.get(token)
  if (!session) return { ok: false, reason: 'invalid' }

  if (now >= expiresAt(session)) {
    destroySession(token)
    return { ok: false, reason: 'expired' }
  }

  if (touch) {
    session.lastSeenAt = now
    // Not written on every request: a disk write per API call would be a real
    // cost for a field that only has to survive a restart approximately.
    if (now - lastSaveAt > 30_000) save(now)
  }
  return { ok: true, session }
}

/**
 * Who is signed in on this machine's dashboard, for the client that has no token
 * of its own (the Chrome extension). Null is a complete and honest answer:
 * nobody is, or whoever was has expired.
 */
export function activeSession(now = Date.now()) {
  if (!activeToken) return null
  const result = verifySession(activeToken, { now, touch: false })
  if (!result.ok) {
    // verifySession already dropped an expired record; an unknown one just
    // leaves a dangling pointer.
    activeToken = null
    save()
    return null
  }
  return result.session
}

/** Sign out one session. Returns the record that ended, or null if there was none. */
export function destroySession(token) {
  const session = sessions.get(token)
  if (!session) return null
  sessions.delete(token)
  if (activeToken === token) activeToken = null
  save()
  return session
}

/**
 * Sign out whoever the extension is currently following.
 *
 * Kept for the tokenless caller: a client that signed in before this change, or
 * a `curl -X POST /api/auth/logout`. The web app always presents its own token.
 */
export function destroyActiveSession() {
  return activeToken ? destroySession(activeToken) : null
}

/** Every session, ended. Used by the demo reset and by the tests. */
export function resetSessions() {
  sessions.clear()
  activeToken = null
  save()
}

/** Diagnostics only — never served to a client. */
export function sessionCount() {
  return sessions.size
}

// ---- reading the credential off a request ----------------------------------

/**
 * The bearer token, or ''.
 *
 * One header, one scheme. Anything else — a query parameter, a cookie the
 * browser attaches automatically — either lands in a server log or travels on
 * requests the employee did not initiate.
 */
export function tokenFromRequest(req) {
  const header = req.get?.('authorization') || req.headers?.authorization || ''
  const match = /^Bearer\s+(.+)$/i.exec(String(header).trim())
  return match ? match[1].trim() : ''
}

// ---- persistence -----------------------------------------------------------
//
// Sessions live on disk for the same reason a real deployment keeps them in a
// datastore rather than in one process's memory: restarting the API is an
// operational event, not a decision to sign out everybody using it. Expiry is
// still enforced on read, so a record surviving a restart is only ever a record
// that had not run out.
//
// (This also replaces the workaround it makes unnecessary: the dashboard used to
// re-POST its stored identity on every load so the extension would keep
// following it across a backend restart. That workaround was localStorage
// authenticating itself.)

function save(now = Date.now()) {
  lastSaveAt = now
  try {
    fs.mkdirSync(path.dirname(SESSION_FILE), { recursive: true })
    fs.writeFileSync(
      SESSION_FILE,
      JSON.stringify({ version: 1, activeToken, sessions: [...sessions.values()] })
    )
  } catch (err) {
    // A registry that cannot be written still works for this process's lifetime.
    console.warn('Could not persist sessions:', err.message)
  }
}

function load() {
  try {
    if (!fs.existsSync(SESSION_FILE)) return
    const saved = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'))
    if (saved?.version !== 1 || !Array.isArray(saved.sessions)) return

    const now = Date.now()
    for (const session of saved.sessions) {
      if (!session?.token || !session.user) continue
      const record = {
        token: String(session.token),
        user: session.user,
        issuedAt: Number(session.issuedAt) || now,
        lastSeenAt: Number(session.lastSeenAt) || now,
      }
      // A stored session that has already run out is not restored — coming back
      // from disk must never extend a lifetime.
      if (now < expiresAt(record)) sessions.set(record.token, record)
    }
    if (saved.activeToken && sessions.has(saved.activeToken)) activeToken = saved.activeToken
  } catch (err) {
    console.warn('Could not read stored sessions:', err.message)
  }
}

load()
