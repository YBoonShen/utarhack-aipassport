// AI License levels — the single source of truth for level thresholds on the
// server. Every place that needs a level, a band or a progress percentage calls
// levelFor(); nothing recomputes thresholds on its own.
//
//   Level 1 · Trainee        0 –   499
//   Level 2 · Navigator    500 – 1,999
//   Level 3 · Ambassador 2,000 – 3,999
//   Level 4 · Guardian   4,000 – 8,000   ← maximum. There is no Level 5.
//
// `max` is the EXCLUSIVE top of the band, which is the same number as the next
// level's threshold: reaching exactly 500 is Navigator, not the last point of
// Trainee. That is also the number the progress bar counts up to, so a bar
// reading "1,244 / 2,000" fills when Ambassador is actually reached.
//
// The frontend mirror is frontend/src/lib/levels.js — the same table, so the UI
// can still render a level for its offline fallback profile. Change one, change
// both (same arrangement as RETRY_LOCK_* in store.js / lib/retryLock.js).

export const LEVELS = [
  { level: 1, name: 'Trainee', min: 0, max: 500 },
  { level: 2, name: 'Navigator', min: 500, max: 2000 },
  { level: 3, name: 'Ambassador', min: 2000, max: 4000 },
  { level: 4, name: 'Guardian', min: 4000, max: 8000 },
]

export const MAX_LEVEL = LEVELS[LEVELS.length - 1].level
export const MAX_XP = LEVELS[LEVELS.length - 1].max

// Benefits announced when a level is reached (used by the level-up notification).
//
// These are the AI License gates the register actually enforces, not a
// description of them: level 1 reaches the free models on the approved
// assistants (`tier: 'free'` in db.orgTools), level 2 reaches the paid ones
// (`minLevel: 2` on those models) and unlocks tool access requests
// (REQUEST_MIN_LEVEL below), level 3 reaches GitHub Copilot and level 4 the
// development tools (`minLevel: 4`). Change a gate in the register and this
// line has to move with it — it is what the employee is told they earned.
export const LEVEL_BENEFITS = {
  1: 'Free ChatGPT, Gemini and Claude models · non-personal data only',
  2: 'Paid models on approved tools · request access to new AI tools',
  3: 'GitHub Copilot · request the Kimi free models',
  4: 'Codex, Claude Code and Kimi K3 · full approved toolset',
}

/**
 * The AI License level an employee needs before they may ask for a new AI tool.
 *
 * Level 1 has no tool request feature at all: a Trainee has the approved free
 * assistants and the training that moves them on, and asking them to evaluate a
 * vendor before they have finished the core AI-safety modules is the wrong way
 * round. The employee's AI Tools page, the request API and the admin queue all
 * read this one number.
 */
export const REQUEST_MIN_LEVEL = 2

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
 *   learningPercentage      — total XP as a share of the next level's threshold
 *   isMaxLevel              — true at Level 4 (no further level exists)
 *   isMaxXP                 — true once the 8,000 XP ceiling is reached
 *
 * progressPercentage and learningPercentage answer two different questions and
 * are deliberately both kept:
 *   • progressPercentage — "how far through Level 2 am I?"  (xp - min) / span.
 *     A newly promoted Navigator reads 0%.
 *   • learningPercentage — "how far am I toward the points that unlock the next
 *     level?"  xp / max. This is the figure the Learning Progress card shows,
 *     and it is the same arithmetic as the "1,240 / 2,000 safety points" line
 *     printed beside every progress bar — so the percentage can be checked
 *     against the two numbers next to it instead of being taken on trust.
 */
export function levelFor(totalXP, stickyLevel = 0) {
  const xp = Math.max(0, Math.round(Number(totalXP) || 0))
  // `< max`, not `<=`: max is the next level's threshold, so hitting it exactly
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
    // The next level unlocks AT the band ceiling (2,000 is Ambassador), so
    // "to go" counts to max exactly.
    xpToNext: next ? Math.max(0, band.max - xp) : 0,
    progressPercentage,
    learningPercentage: learningPercentageFor(xp, band.max, isMaxXP),
    isMaxLevel: band.level === MAX_LEVEL,
    isMaxXP,
  }
}

/**
 * Learning progress: current safety points ÷ the points that unlock the next
 * level, × 100.
 *
 * Floored rather than rounded, and held at 99 until the threshold is actually
 * crossed. That is the level-up boundary: 1,999 of 2,000 points rounds to 100%
 * but is not a level-up, and a bar sitting on "100% complete" while the
 * employee is still a Navigator is the one thing this number must never say.
 * 100 is reserved for the XP ceiling, where there is genuinely nothing left.
 */
function learningPercentageFor(xp, threshold, isMaxXP) {
  if (isMaxXP) return 100
  if (!threshold || threshold <= 0) return 100
  const raw = (xp / threshold) * 100
  return Math.max(0, Math.min(99, Math.floor(raw)))
}
