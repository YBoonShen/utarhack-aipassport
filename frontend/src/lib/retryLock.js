// 24-hour assessment retry lock.
//
// An employee now completes every question before being evaluated (no
// question-level retry). Retry lives only on the results/performance screen and
// is locked for 24h from the moment the assessment was evaluated.
//
// The backend store is the source of truth (profile.moduleCompletions), but the
// timestamp is mirrored into localStorage so the lock survives a refresh or a
// re-login even when the API is unavailable. Whichever completion is *later*
// wins, so a stale copy can never unlock a retry early.

// ---- single switch -------------------------------------------------------
// Set RETRY_LOCK_ENABLED to false to go back to unlimited retries: every
// retryStatus() then reports unlocked, the results screen's Retry button is
// always live, and the quiz stops redirecting completed modules to the results
// screen. Nothing else has to change on the frontend. (The matching switch on
// the server is RETRY_LOCK_ENABLED in backend/src/store.js — turn off both.)
export const RETRY_LOCK_ENABLED = true
export const RETRY_LOCK_HOURS = 24

export const RETRY_LOCK_MS = RETRY_LOCK_HOURS * 60 * 60 * 1000

const KEY = 'aip-training-completions' // { [moduleId]: ISO timestamp }

function readAll() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY))
    return raw && typeof raw === 'object' ? raw : {}
  } catch {
    return {}
  }
}

function writeAll(map) {
  try {
    localStorage.setItem(KEY, JSON.stringify(map))
  } catch {
    /* storage unavailable (private mode) — the server copy still applies */
  }
}

export function recordCompletion(moduleId, iso = new Date().toISOString()) {
  const map = readAll()
  map[moduleId] = iso
  writeAll(map)
  return iso
}

// Called when a retry actually starts — the previous evaluation no longer locks.
export function clearCompletion(moduleId) {
  const map = readAll()
  delete map[moduleId]
  writeAll(map)
}

function toTime(value) {
  if (!value) return 0
  const t = new Date(value).getTime()
  return Number.isNaN(t) ? 0 : t
}

function formatRemaining(ms) {
  if (ms <= 0) return 'now'
  const minutes = Math.floor(ms / 60000)
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h > 0) return `${h}h ${m}m`
  const s = Math.floor((ms % 60000) / 1000)
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

function formatWhen(ms) {
  return new Date(ms).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

// `serverIso` is profile.moduleCompletions[moduleId] / quizResults.completedAt.
export function retryStatus(moduleId, serverIso, now = Date.now()) {
  const completed = Math.max(toTime(readAll()[moduleId]), toTime(serverIso))
  if (!completed || !RETRY_LOCK_ENABLED) {
    return { completedAt: completed || null, availableAt: null, locked: false, remainingMs: 0, remainingLabel: 'now', availableLabel: '' }
  }
  const availableAt = completed + RETRY_LOCK_MS
  const remainingMs = Math.max(0, availableAt - now)
  return {
    completedAt: completed,
    availableAt,
    locked: remainingMs > 0,
    remainingMs,
    remainingLabel: formatRemaining(remainingMs),
    availableLabel: formatWhen(availableAt),
  }
}
