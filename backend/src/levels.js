// AI License levels — the single source of truth for level thresholds on the
// server. Every place that needs a level, a band or a progress percentage calls
// levelFor(); nothing recomputes thresholds on its own.
//
//   Level 1 · Trainee        0 – 500
//   Level 2 · Navigator    501 – 2,000
//   Level 3 · Ambassador 2,001 – 4,000
//   Level 4 · Guardian   4,001 – 8,000   ← maximum. There is no Level 5.
//
// The frontend mirror is frontend/src/lib/levels.js — the same table, so the UI
// can still render a level for its offline fallback profile. Change one, change
// both (same arrangement as RETRY_LOCK_* in store.js / lib/retryLock.js).

export const LEVELS = [
  { level: 1, name: 'Trainee', min: 0, max: 500 },
  { level: 2, name: 'Navigator', min: 501, max: 2000 },
  { level: 3, name: 'Ambassador', min: 2001, max: 4000 },
  { level: 4, name: 'Guardian', min: 4001, max: 8000 },
]

export const MAX_LEVEL = LEVELS[LEVELS.length - 1].level
export const MAX_XP = LEVELS[LEVELS.length - 1].max

// Benefits announced when a level is reached (used by the level-up notification).
export const LEVEL_BENEFITS = {
  1: 'Approved everyday tools · non-personal data only',
  2: 'ChatGPT and Gemini · internal non-personal data',
  3: 'GitHub Copilot · source code scope',
  4: 'Full approved toolset · mentor and endorse for your team',
}

/**
 * Level state for a total XP figure.
 *
 * `stickyLevel` keeps a level that was already earned: a later points penalty
 * (e.g. a gateway override) never demotes an employee, it only slows the climb
 * to the next level. Pass 0 for a pure, non-sticky calculation.
 *
 * Returns:
 *   level, levelName        — the band the employee is in
 *   totalXP                 — accumulated XP
 *   currentLevelXP          — XP the current band starts at (bar's 0%)
 *   nextLevelXP             — XP the current band ends at (bar's 100%)
 *   nextLevelName           — the level unlocked past nextLevelXP (null at max)
 *   xpToNext                — XP still needed to cross into the next level
 *   progressPercentage      — progress *within* the current band, 0–100
 *   isMaxLevel              — true at Level 4 (no further level exists)
 *   isMaxXP                 — true once the 8,000 XP ceiling is reached
 */
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
    // The next level unlocks one point past the band ceiling (2,000 is still
    // Navigator, 2,001 is Ambassador) — so "to go" counts to max + 1.
    xpToNext: next ? Math.max(0, band.max + 1 - xp) : 0,
    progressPercentage,
    isMaxLevel: band.level === MAX_LEVEL,
    isMaxXP,
  }
}
