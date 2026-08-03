// Shared employee directory — the single set of employee records used by the
// admin Employees table and by Assign Training's recipient picker. Moved out of
// Employees.jsx so assignment never keeps its own parallel copy of the people.
// Privacy-minimised, exactly as the Figma directory shows it: employee IDs and
// role data only, no names.

export const EMPLOYEES = [
  { avatar: 'JY', id: 'E-217', dept: 'Eng', level: 'L2', training: 92, protectedCount: 47, alerts: 0, status: 'On track' },
  { avatar: 'MW', id: 'S-044', dept: 'Sales', level: 'L2', training: 80, protectedCount: 38, alerts: 1, status: 'Refresher' },
  { avatar: 'SK', id: 'F-102', dept: 'Finance', level: 'L1', training: 60, protectedCount: 26, alerts: 2, status: 'Support due' },
  { avatar: 'NL', id: 'M-083', dept: 'Mkt', level: 'L2', training: 87, protectedCount: 32, alerts: 0, status: 'On track' },
  { avatar: 'PL', id: 'H-011', dept: 'HR', level: 'L1', training: 72, protectedCount: 18, alerts: 1, status: 'Review' },
  { avatar: 'RT', id: 'O-031', dept: 'Ops', level: 'L2', training: 84, protectedCount: 29, alerts: 0, status: 'On track' },
  { avatar: 'AR', id: 'E-198', dept: 'Eng', level: 'L3', training: 100, protectedCount: 52, alerts: 0, status: 'Ambassador' },
]

// The 6 departments the Employees KPI card counts. `code` is what the records
// carry; `name` is the label shown in assignment confirmations
// ("Department: Marketing").
export const DEPARTMENTS = [
  { code: 'Eng', name: 'Engineering' },
  { code: 'Sales', name: 'Sales' },
  { code: 'Finance', name: 'Finance' },
  { code: 'Mkt', name: 'Marketing' },
  { code: 'HR', name: 'Human Resources' },
  { code: 'Ops', name: 'Operations' },
]

export const DEPARTMENT_CODES = DEPARTMENTS.map(d => d.code)

export function departmentName(code) {
  return DEPARTMENTS.find(d => d.code === code)?.name || code
}

// A department can legitimately have no current members — callers must handle
// the empty list rather than assuming at least one recipient.
export function employeesInDepartment(code) {
  return EMPLOYEES.filter(e => e.dept === code)
}

export function employeeById(id) {
  return EMPLOYEES.find(e => e.id === id) || null
}
