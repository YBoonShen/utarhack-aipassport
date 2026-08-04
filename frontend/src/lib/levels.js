// AI License levels — frontend mirror of backend/src/levels.js.
//
//   Level 1 · Trainee        0 – 500
//   Level 2 · Navigator    501 – 2,000
//   Level 3 · Ambassador 2,001 – 4,000
//   Level 4 · Guardian   4,001 – 8,000   ← maximum. There is no Level 5.
//
// The backend is the source of truth for how much XP an employee has and which
// level that puts them in — /api/profile already carries level, levelName,
// progressPercentage and friends. This module exists so every screen renders
// the same bands from one place, and so the offline fallback profiles still
// show a sensible level when the API is unreachable. Change one table, change
// both (same arrangement as RETRY_LOCK_* in lib/retryLock.js / store.js).

export const LEVELS = [
  { level: 1, name: 'Trainee', min: 0, max: 500 },
  { level: 2, name: 'Navigator', min: 501, max: 2000 },
  { level: 3, name: 'Ambassador', min: 2001, max: 4000 },
  { level: 4, name: 'Guardian', min: 4001, max: 8000 },
]

export const MAX_LEVEL = LEVELS[LEVELS.length - 1].level
export const MAX_XP = LEVELS[LEVELS.length - 1].max

/** See backend/src/levels.js — identical calculation. */
export function levelFor(totalXP, stickyLevel = 0) {
  const xp = Math.max(0, Math.round(Number(totalXP) || 0))
  const earned = LEVELS.find(l => xp <= l.max) || LEVELS[LEVELS.length - 1]
  const level = Math.min(MAX_LEVEL, Math.max(earned.level, Number(stickyLevel) || 0))
  const band = LEVELS[level - 1]
  const next = LEVELS[level] || null
  const isMaxXP = xp >= MAX_XP

  const span = band.max - band.min
  const raw = span > 0 ? ((xp - band.min) / span) * 100 : 100
  const progressPercentage = isMaxXP ? 100 : Math.max(0, Math.min(100, Math.round(raw)))

  return {
    level: band.level,
    levelName: band.name,
    totalXP: xp,
    currentLevelXP: band.min,
    nextLevelXP: band.max,
    nextLevelName: next ? next.name : null,
    xpToNext: next ? Math.max(0, band.max + 1 - xp) : 0,
    progressPercentage,
    isMaxLevel: band.level === MAX_LEVEL,
    isMaxXP,
  }
}

// Level state for a profile straight from /api/profile. The server sends the
// authoritative numbers; this recomputes them from profile.points so a fallback
// profile (API offline) still renders a correct band instead of a blank card.
export function levelState(profile) {
  return levelFor(profile?.points ?? 0, profile?.level ?? 0)
}

// XP shown against nextLevelXP — capped at the ceiling so Guardian reads
// "8,000 / 8,000" rather than overflowing past the end of the bar.
export function barXP(state) {
  return Math.min(state.totalXP, state.nextLevelXP)
}

// "751 XP to Ambassador" / "MAX LEVEL" — the compact label beside a bar.
export function nextLevelLabel(state) {
  if (state.isMaxXP) return 'MAX LEVEL'
  if (state.isMaxLevel) return `${(MAX_XP - state.totalXP).toLocaleString()} XP to full Guardian`
  return `${state.xpToNext.toLocaleString()} XP to ${state.nextLevelName}`
}

// The fuller sentence under a progress bar. Never names a Level 5.
export function progressHint(state) {
  if (state.isMaxXP) return 'Guardian · maximum AI License level reached'
  if (state.isMaxLevel) return `${(MAX_XP - state.totalXP).toLocaleString()} XP to a complete Guardian record`
  return `${state.xpToNext.toLocaleString()} XP to Level ${state.level + 1} · ${state.nextLevelName}`
}

// ---- level-up celebration (shown once, never on a refresh) ------------------
// The server tells us a threshold was crossed; this remembers which levels have
// already been celebrated on this device so re-opening or refreshing the
// results screen never replays the animation.

const KEY = 'aip-celebrated-levels'

function readCelebrated() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY))
    return Array.isArray(raw) ? raw : []
  } catch {
    return []
  }
}

/** True exactly once per level — call only when the server reported a level-up. */
export function celebrateOnce(level) {
  const seen = readCelebrated()
  if (seen.includes(level)) return false
  try {
    localStorage.setItem(KEY, JSON.stringify([...seen, level]))
  } catch {
    /* storage unavailable (private mode) — celebrating twice is the worst case */
  }
  return true
}
