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

// Demo sign-in: the email's local part selects which directory employee you
// are, so a reviewer can sign in as E-217, then as E-198, and see that an
// assignment reached exactly one of them. `e-198@abcd.com` and `e198@abcd.com`
// both work; anything unrecognised is the default demo employee.
export function employeeIdFromEmail(email) {
  const local = String(email || '').split('@')[0].trim().toUpperCase()
  if (!local) return DEFAULT_EMPLOYEE_ID
  const exact = EMPLOYEES.find(e => e.id === local)
  if (exact) return exact.id
  const compact = local.replace(/[^A-Z0-9]/g, '')
  const loose = EMPLOYEES.find(e => e.id.replace('-', '') === compact)
  return loose ? loose.id : DEFAULT_EMPLOYEE_ID
}
