// Training assignment records — the single store every admin entry point writes
// through (Training modules → Assign, Assign Training, Employees → Assign
// Training). One record per confirmed assignment; an employee is never written
// twice for the same training, so re-assigning creates no duplicate records.
//
// Persisted to localStorage so assignments survive a refresh, matching the rest
// of the demo's client-side state.
import { departmentName, employeesInDepartment } from './employees.js'

const KEY = 'aip-training-assignments'

// record: { id, trainingKey, trainingId, trainingTitle, type: 'employee' | 'department',
//           department, employeeIds: string[], assignedAt: ISO }

function read() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY))
    return Array.isArray(raw) ? raw : []
  } catch {
    return []
  }
}

function write(records) {
  try {
    localStorage.setItem(KEY, JSON.stringify(records))
  } catch {
    /* storage unavailable — assignments stay for this session only */
  }
}

// Modules created in the session have no library id yet, so fall back to title.
export function trainingKeyOf(training) {
  return String(training?.id ?? training?.title ?? '')
}

export function getAssignments() {
  return read().sort((a, b) => b.assignedAt.localeCompare(a.assignedAt))
}

export function assignedEmployeeIds(training) {
  const key = trainingKeyOf(training)
  const ids = new Set()
  for (const r of read()) {
    if (r.trainingKey === key) r.employeeIds.forEach(id => ids.add(id))
  }
  return ids
}

// Resolves the employees a selection targets, and splits them into the ones who
// would actually be newly assigned and the ones who already have this training.
export function resolveRecipients({ training, type, department, employeeIds = [] }) {
  const targeted = type === 'department'
    ? employeesInDepartment(department).map(e => e.id)
    : [...new Set(employeeIds)]
  const already = assignedEmployeeIds(training)
  return {
    targeted,
    duplicates: targeted.filter(id => already.has(id)),
    fresh: targeted.filter(id => !already.has(id)),
  }
}

// Writes one record for the employees that don't already have this training.
// Returns null when there is nothing new to assign.
export function addAssignment({ training, type, department, employeeIds = [] }) {
  const { targeted, duplicates, fresh } = resolveRecipients({ training, type, department, employeeIds })
  if (fresh.length === 0) return null

  const record = {
    id: `AS-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
    trainingKey: trainingKeyOf(training),
    trainingId: training?.id ?? null,
    trainingTitle: training.title,
    type,
    department: type === 'department' ? department : null,
    employeeIds: fresh,
    assignedAt: new Date().toISOString(),
  }
  write([...read(), record])
  return { record, assigned: fresh.length, duplicates: duplicates.length, targeted: targeted.length }
}

// Shared wording so every entry point reports an assignment the same way.
export function assignmentSummary(result) {
  const who = result.record.type === 'department'
    ? `${departmentName(result.record.department)} department`
    : `${result.assigned} selected employee${result.assigned === 1 ? '' : 's'}`
  const skipped = result.duplicates > 0
    ? ` ${result.duplicates} employee${result.duplicates === 1 ? ' already had' : 's already had'} this training and ${result.duplicates === 1 ? 'was' : 'were'} skipped.`
    : ''
  return `"${result.record.trainingTitle}" was assigned to the ${who}. They will see it in their training list and get a notification.${skipped}`
}

export function clearAssignments() {
  write([])
}
