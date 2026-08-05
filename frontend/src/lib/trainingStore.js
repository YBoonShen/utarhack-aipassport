// Client-side view of the training library and its assignment records.
//
// The records themselves live on the server (backend/src/store.js). This file
// holds one cached snapshot of them, keeps it fresh while a page is open, and
// hands mutations straight through to the API. Nothing here is a second source
// of truth: every write returns the server's version of the library and the
// cache is replaced with it, so what an admin sees after publishing is what the
// server will tell the employee.
//
// Two snapshots, because the two sides are allowed to see different things:
//   • `library`   — the admin's view: every module, questions included.
//   • `mine`      — one employee's view: only what they are actually assigned.
// An employee never receives the admin snapshot, so the module list on their
// screen cannot be widened by editing anything in the browser.
import { api, currentUser } from './api.js'
import { departmentName } from './employees.js'

const empty = {
  library: [],        // admin: full module records
  assignments: [],    // admin: assignment records
  mine: [],           // employee: modules assigned to me
  myAssignments: [],
  employeeId: null,
  loaded: false,
  maxQuestions: 40,
}

let snapshot = empty
const listeners = new Set()

function publish(next) {
  snapshot = { ...snapshot, ...next }
  listeners.forEach(fn => fn(snapshot))
}

export function getSnapshot() {
  return snapshot
}

export function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** Re-reads whichever slice this session is entitled to. */
export async function refreshTraining() {
  const user = currentUser()
  if (!user) return snapshot
  try {
    if (user.role === 'admin') {
      const data = await api.get('/training/library')
      publish({
        library: data.modules || [],
        assignments: data.assignments || [],
        maxQuestions: data.maxQuestions || 40,
        loaded: true,
      })
    } else {
      const data = await api.get('/training/mine')
      publish({
        mine: data.modules || [],
        myAssignments: data.assignments || [],
        employeeId: data.employeeId || user.id,
        loaded: true,
      })
    }
  } catch {
    // Backend unreachable — keep the last good snapshot rather than emptying
    // the screen. `loaded` stays as it was, so a first load still reads as
    // "still loading" instead of "you have no training".
  }
  return snapshot
}

/** Clears the cache on sign-out so the next session never sees the last one's. */
export function clearTraining() {
  snapshot = empty
  listeners.forEach(fn => fn(snapshot))
}

// ---- admin mutations -------------------------------------------------------
// Each returns { ok, module } or { ok: false, error } — the error is the
// server's sentence, written for the admin to read, so call sites show it
// rather than inventing their own wording.

async function write(call) {
  try {
    const result = await call()
    await refreshTraining()
    return { ok: true, ...result }
  } catch (err) {
    return { ok: false, error: err.body?.error || 'That change could not be saved. Please try again.' }
  }
}

export function createModule(draft) {
  return write(() => api.post('/training/modules', draft))
}

export function saveModule(id, patch) {
  return write(() => api.put(`/training/modules/${id}`, patch))
}

export function setModuleStatus(id, status) {
  return write(() => api.post(`/training/modules/${id}/status`, { status }))
}

export function assignModule({ moduleId, type, department, employeeIds }) {
  return write(() => api.post('/training/assignments', { moduleId, type, department, employeeIds }))
}

// ---- reads -----------------------------------------------------------------

export function moduleById(id) {
  const key = Number(id)
  return snapshot.library.find(m => m.id === key) || snapshot.mine.find(m => m.id === key) || null
}

/** Everyone assigned this module — used to flag "already assigned" in pickers. */
export function assignedEmployeeIds(moduleId) {
  const key = Number(moduleId)
  const ids = new Set()
  for (const r of snapshot.assignments) {
    if (r.moduleId === key) r.employeeIds.forEach(id => ids.add(id))
  }
  return ids
}

/** Total employees on a module: the standing rollout figure plus live records. */
export function assignedCount(module) {
  if (!module) return 0
  return module.assignedTotal ?? (module.assigned || 0) + assignedEmployeeIds(module.id).size
}

// A training can only be assigned when it exists, has questions and is live.
// Mirrors moduleIssue() on the server, which is the check that actually decides.
export function trainingIssue(module) {
  if (!module || !module.title) return 'This training could not be found. Pick a training from the library and try again.'
  if (!module.questionCount) return 'This training has no questions yet. Add at least one question before assigning it.'
  if (module.status !== 'live') return 'This training is a draft. Publish it before assigning it.'
  return null
}

/** Shared wording so every entry point reports an assignment the same way. */
export function assignmentSummary(result) {
  const who = result.record.type === 'department'
    ? `${departmentName(result.record.department)} department`
    : `${result.assigned} selected employee${result.assigned === 1 ? '' : 's'}`
  const skipped = result.duplicates > 0
    ? ` ${result.duplicates} employee${result.duplicates === 1 ? ' already had' : 's already had'} this training and ${result.duplicates === 1 ? 'was' : 'were'} skipped.`
    : ''
  return `"${result.record.moduleTitle}" was assigned to the ${who}. They see it in their training list straight away and get a notification with a link into it.${skipped}`
}
