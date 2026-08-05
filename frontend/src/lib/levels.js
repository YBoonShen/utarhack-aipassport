// AI License levels — frontend mirror of backend/src/levels.js.
//
//   Level 1 · Trainee        0 –   499
//   Level 2 · Navigator    500 – 1,999
//   Level 3 · Ambassador 2,000 – 3,999
//   Level 4 · Guardian   4,000 – 8,000   ← maximum. There is no Level 5.
//
// `max` is the EXCLUSIVE top of the band — the same number as the next level's
// threshold, so reaching exactly 500 is Navigator rather than the last point of
// Trainee.
//
// The backend is the source of truth for how much XP an employee has and which
// level that puts them in — /api/profile already carries level, levelName,
// progressPercentage and friends. This module exists so every screen renders
// the same bands from one place, and so the offline fallback profiles still
// show a sensible level when the API is unreachable. Change one table, change
// both (same arrangement as RETRY_LOCK_* in lib/retryLock.js / store.js).
import { currentUser } from './api.js'

export const LEVELS = [
  { level: 1, name: 'Trainee', min: 0, max: 500 },
  { level: 2, name: 'Navigator', min: 500, max: 2000 },
  { level: 3, name: 'Ambassador', min: 2000, max: 4000 },
  { level: 4, name: 'Guardian', min: 4000, max: 8000 },
]

export const MAX_LEVEL = LEVELS[LEVELS.length - 1].level
export const MAX_XP = LEVELS[LEVELS.length - 1].max

// What each level unlocks — mirror of LEVEL_BENEFITS in backend/src/levels.js,
// which is the wording the level-up notification already announces ("… is now
// unlocked"). One fixed sentence per level, keyed by the level itself: two
// employees holding the same level read exactly the same thing, and nothing
// here varies with a person, their XP within the band, or the time of day.
export const LEVEL_BENEFITS = {
  1: 'Approved everyday tools · non-personal data only',
  2: 'ChatGPT and Gemini · internal non-personal data',
  3: 'GitHub Copilot · source code scope',
  4: 'Full approved toolset · mentor and endorse for your team',
}

/** The fixed unlock line for a level. Falls back to Level 1's on a bad level. */
export function levelBenefit(level) {
  return LEVEL_BENEFITS[level] || LEVEL_BENEFITS[1]
}

/** See backend/src/levels.js — identical calculation. */
export function levelFor(totalXP, stickyLevel = 0) {
  const xp = Math.max(0, Math.round(Number(totalXP) || 0))
  // `< max`, not `<=`: max is the next level threshold, so hitting it exactly
  // is already the next level.
  const earned = LEVELS.find(l => xp < l.max) || LEVELS[LEVELS.length - 1]
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
    xpToNext: next ? Math.max(0, band.max - xp) : 0,
    progressPercentage,
    learningPercentage: learningPercentageFor(xp, band.max, isMaxXP),
    isMaxLevel: band.level === MAX_LEVEL,
    isMaxXP,
  }
}

/**
 * Learning progress: current safety points ÷ the points that unlock the next
 * level, × 100. Mirror of learningPercentageFor() in backend/src/levels.js.
 *
 * Floored and held at 99 until the threshold is actually crossed: 1,999 of
 * 2,000 rounds to 100% but is not a level-up, and a bar reading "100% complete"
 * while the employee is still a Navigator is the one thing it must never say.
 */
function learningPercentageFor(xp, threshold, isMaxXP) {
  if (isMaxXP) return 100
  if (!threshold || threshold <= 0) return 100
  return Math.max(0, Math.min(99, Math.floor((xp / threshold) * 100)))
}

/**
 * The Learning Progress figure for a level state — the same number the
 * "1,240 / 2,000 safety points" line beside it is made of.
 */
export function learningProgress(state) {
  return state?.learningPercentage ?? 0
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
  if (state.isMaxLevel) return `${(MAX_XP - state.totalXP).toLocaleString()} points to full Guardian`
  return `${state.xpToNext.toLocaleString()} points to ${state.nextLevelName}`
}

// The fuller sentence under a progress bar. Never names a Level 5.
export function progressHint(state) {
  if (state.isMaxXP) return 'Guardian · maximum AI License level reached'
  if (state.isMaxLevel) return `${(MAX_XP - state.totalXP).toLocaleString()} points to a complete Guardian record`
  return `${state.xpToNext.toLocaleString()} points to Level ${state.level + 1} · ${state.nextLevelName}`
}

// ---- level-up celebration (shown once, never on a refresh) ------------------
// The server tells us a threshold was crossed; this remembers which levels have
// already been celebrated on this device so re-opening or refreshing the
// results screen never replays the animation.

// Namespaced per employee, for the same reason as the retry lock in
// lib/retryLock.js: two employees can sign in to the same browser, and a shared
// key meant the second one to reach Level 2 never saw their own celebration —
// the first one had already spent it.
const KEY_PREFIX = 'aip-celebrated-levels'

function celebratedKey() {
  const id = currentUser()?.id
  return id ? `${KEY_PREFIX}:${id}` : KEY_PREFIX
}

function readCelebrated() {
  try {
    const raw = JSON.parse(localStorage.getItem(celebratedKey()))
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
    localStorage.setItem(celebratedKey(), JSON.stringify([...seen, level]))
  } catch {
    /* storage unavailable (private mode) — celebrating twice is the worst case */
  }
  return true
}
