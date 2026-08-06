// Employee directory — the people training can be assigned to, and the
// departments a department-wide assignment resolves through.
//
// Mirrors frontend/src/lib/employees.js (same ids, same department codes). The
// admin picker runs off the frontend copy for rendering; every assignment is
// resolved again here before it is written, so a tampered request can never
// name an employee or a department the directory does not have. That is the
// half that actually decides who gets a training — the browser only proposes.
//
// Privacy-minimised on purpose: employee ids and role data, no names.

export const DEPARTMENTS = [
  { code: 'Eng', name: 'Engineering' },
  { code: 'Sales', name: 'Sales' },
  { code: 'Finance', name: 'Finance' },
  { code: 'Mkt', name: 'Marketing' },
  { code: 'HR', name: 'Human Resources' },
  { code: 'Ops', name: 'Operations' },
]

// Mutable on purpose — see registerEmployee() at the bottom. The seeded rows
// are the organisation as it stands before anybody signs up; new starters are
// appended to this same array, because "who is a real employee" has to be one
// list. Everything that imports EMPLOYEES shares this reference.
export const EMPLOYEES = [
  { id: 'E-217', initials: 'JY', dept: 'Eng', xp: 1240 },
  { id: 'S-044', initials: 'MW', dept: 'Sales', xp: 980 },
  { id: 'F-102', initials: 'SK', dept: 'Finance', xp: 430 },
  { id: 'M-083', initials: 'NL', dept: 'Mkt', xp: 1105 },
  { id: 'H-011', initials: 'PL', dept: 'HR', xp: 385 },
  { id: 'O-031', initials: 'RT', dept: 'Ops', xp: 1420 },
  { id: 'E-198', initials: 'AR', dept: 'Eng', xp: 2680 },
]

// The demo employee — the one with a full seeded passport (stamps, streak,
// counters). Any other directory id can sign in too; they simply start empty.
export const DEFAULT_EMPLOYEE_ID = 'E-217'

export function departmentName(code) {
  return DEPARTMENTS.find(d => d.code === code)?.name || code
}

export function isDepartment(code) {
  return DEPARTMENTS.some(d => d.code === code)
}

export function employeeById(id) {
  return EMPLOYEES.find(e => e.id === id) || null
}

/** Everyone currently in a department. May legitimately be empty. */
export function employeesInDepartment(code) {
  return EMPLOYEES.filter(e => e.dept === code)
}

// ---- new starters ----------------------------------------------------------
//
// An account created through the sign-up form belongs to somebody the seeded
// directory has never heard of, and that matters more than it looks: store.js
// resolves an unknown employee id back to DEFAULT_EMPLOYEE_ID, so without a
// directory entry every new sign-up would open Tan Jia Yin's passport — their
// history, their level, their training. Registering them here is what makes a
// new account a genuinely separate person.

// First letter of the department code, which is the convention the seeded ids
// already follow (E-217 Engineering, S-044 Sales, F-102 Finance…).
const DEPT_PREFIX = { Eng: 'E', Sales: 'S', Finance: 'F', Mkt: 'M', HR: 'H', Ops: 'O' }

// Seeded ids run in the low hundreds; new starters begin at 300 so a generated
// id is never mistaken for one of the demo records.
const FIRST_NEW_NUMBER = 300

/** The next free employee id in a department, e.g. `E-300`, then `E-301`. */
export function nextEmployeeId(dept = 'Eng') {
  const prefix = DEPT_PREFIX[dept] || DEPT_PREFIX.Eng
  const used = new Set(EMPLOYEES.map(e => e.id))
  let n = FIRST_NEW_NUMBER
  while (used.has(`${prefix}-${n}`)) n++
  return `${prefix}-${n}`
}

/**
 * Add an employee to the directory, or return the existing record.
 *
 * Idempotent, because it runs both when an account is created and again for
 * every stored account when the server restarts. It never overwrites a seeded
 * record: a sign-up cannot rewrite an existing employee's department.
 */
export function registerEmployee({ id, initials, dept = 'Eng', xp = 0 }) {
  const employeeId = String(id || '').trim().toUpperCase()
  if (!employeeId) return null
  const existing = employeeById(employeeId)
  if (existing) return existing
  const record = {
    id: employeeId,
    initials: String(initials || employeeId.slice(0, 2)).toUpperCase().slice(0, 2),
    dept: isDepartment(dept) ? dept : 'Eng',
    xp,
  }
  EMPLOYEES.push(record)
  return record
}

// employeeIdFromEmail() used to live here: it read the email's local part and
// returned whichever directory employee it looked like, falling back to the demo
// employee. That *was* the sign-in — type `e-198@abcd.com`, be E-198 — and it is
// deleted rather than kept as a fallback, because a function that turns an
// unauthenticated string into an employee identity has no safe caller. Who signs
// in is resolved from the proven account in accounts.js and nowhere else.
