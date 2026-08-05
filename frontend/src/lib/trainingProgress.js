// How the training screens read a module's state, pick the current one, and
// order the rest.
//
// All of it works off `module.progress`, which /api/training/mine attaches to
// every module from the server's own records (moduleProgressFor in
// backend/src/store.js). Nothing here decides anything for itself — it sorts
// and labels what the server reported.
//
// It lives in one file because three screens have to agree. The Training
// dashboard, the Home "continue training" card and the results screen's "next
// module" each used to pick a module with their own copy of
// `modules.find(m => !completed.includes(m.id))`, which:
//
//   • ignored progress entirely, so a module the employee was two questions
//     into was passed over in favour of an untouched one earlier in the library;
//   • fell back to `modules[0]` when everything was finished, which put a
//     completed module under a "Current training" heading;
//   • could disagree between two screens the moment either drifted.

import { TRAINING_STATUS } from './terms.js'

/** A module can be opened the moment it has questions. */
export const playable = module => (module?.questionCount || 0) > 0

/**
 * One module's state as a single word.
 *
 * 'unavailable' — published to this employee but with no questions yet
 * 'completed'   — settled at least once; redoing it can only raise the result
 * 'inProgress'  — answers recorded for an attempt that has not been settled
 * 'notStarted'  — assigned and untouched
 */
export function moduleState(module) {
  if (!playable(module)) return 'unavailable'
  const p = module?.progress
  if (p?.completed) return 'completed'
  if (p?.inProgress) return 'inProgress'
  return 'notStarted'
}

/** The employee-facing label for that state (one vocabulary, lib/terms.js). */
export function moduleStatusLabel(module) {
  return TRAINING_STATUS[moduleState(module)] ?? TRAINING_STATUS.notStarted
}

/** The action a card offers, matching the state it is in. */
export function moduleAction(module) {
  switch (moduleState(module)) {
    case 'unavailable': return TRAINING_STATUS.unavailable
    case 'completed': return 'Redo · improve only'
    case 'inProgress': return 'Resume module →'
    default: return 'Start module →'
  }
}

/** Where a card opens: results for a finished module, the quiz otherwise. */
export function moduleHref(module) {
  if (!playable(module)) return null
  return module.progress?.completed
    ? `/training/results/${module.id}`
    : `/training/quiz/${module.id}`
}

// Latest activity first. A module with no recorded activity sorts last, and
// ties keep the library's own order (Array.prototype.sort is stable).
function byRecentActivity(a, b) {
  const at = a.progress?.lastActivityAt || ''
  const bt = b.progress?.lastActivityAt || ''
  if (at === bt) return 0
  if (!at) return 1
  if (!bt) return -1
  return bt.localeCompare(at)
}

/**
 * The module the employee is actually working on.
 *
 *   1. the unfinished attempt they touched most recently;
 *   2. otherwise the first module they have not started, in library order;
 *   3. otherwise null — everything assigned is complete, which is a state of
 *      its own and not "module 1 again".
 *
 * A completed module is never returned, even if it is currently being redone:
 * a redo is started deliberately from All Training Modules, and surfacing it as
 * "current training" would put finished work back in front of the employee.
 */
export function pickCurrentModule(modules = []) {
  const open = modules.filter(m => playable(m) && !m.progress?.completed)
  const started = open.filter(m => m.progress?.inProgress).sort(byRecentActivity)
  if (started.length) return started[0]
  if (open.length) return open[0]
  // Nothing playable is outstanding. If some assigned module has no questions
  // yet, it is still the honest "next" thing to show.
  return modules.find(m => !m.progress?.completed) || null
}

/**
 * Everything except the current module, in the order the employee needs:
 * unfinished attempts first (most recent first), then untouched modules in
 * library order, then completed ones.
 *
 * With nothing started this is exactly the library order the page had before —
 * the ordering only reacts once there is progress to react to.
 */
export function orderUpcoming(modules = [], currentId = null) {
  const rank = m => {
    const state = moduleState(m)
    if (state === 'inProgress') return 0
    if (state === 'completed') return 3
    if (state === 'unavailable') return 2
    return 1
  }
  return modules
    .filter(m => m.id !== currentId)
    .map((m, i) => ({ m, i })) // keep library order as the tie-break
    .sort((a, b) => {
      const byRank = rank(a.m) - rank(b.m)
      if (byRank) return byRank
      // Within the in-progress group, most recently worked on first.
      if (rank(a.m) === 0) {
        const recent = byRecentActivity(a.m, b.m)
        if (recent) return recent
      }
      return a.i - b.i
    })
    .map(({ m }) => m)
}

/** Modules assigned to this employee that they have finished. */
export function completedModules(modules = []) {
  return modules.filter(m => m.progress?.completed)
}

/** True once every assigned module is finished (and there is at least one). */
export function allComplete(modules = []) {
  return modules.length > 0 && modules.every(m => m.progress?.completed)
}
