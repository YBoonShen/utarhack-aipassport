// Training library, assignment and access tests — run with `npm test` (backend).
//
// These pin the rules that decide who can open a training. The failure they
// exist to prevent is the one that made an assigned module unopenable and an
// unassigned one reachable: an employee's list and the access check have to be
// the same fact, derived from the same records, or the two drift apart and the
// UI starts disagreeing with what the server will allow.
//
// Note: these tests exercise the real store, so they reset it — running them
// clears any saved demo state in backend/data/progress.json.
import assert from 'node:assert/strict'
import {
  db, resetStore, setSessionEmployee, createModule, updateModule, setModuleStatus,
  assignTraining, modulesForEmployee, canAccessModule, notificationsFor, moduleById,
  quizResults, answerQuiz, completeTraining, MAX_QUESTIONS,
} from './store.js'
import { normaliseQuestions } from './training.js'

let passed = 0
function test(name, fn) {
  resetStore()
  fn()
  passed++
  console.log(`  ✓ ${name}`)
}

const mcq = n => ({ type: 'mcq', question: `Q${n}?`, answers: ['right', 'wrong'], correct: 0 })
const questions = n => Array.from({ length: n }, (_, i) => mcq(i + 1))

// ---- the question limit ----------------------------------------------------

test(`a module can hold exactly ${MAX_QUESTIONS} questions`, () => {
  const result = createModule({ title: 'Full module', points: 100, minutes: 5, questions: questions(MAX_QUESTIONS) })
  assert.equal(result.ok, true)
  assert.equal(result.module.questionCount, MAX_QUESTIONS)
})

test(`question ${MAX_QUESTIONS + 1} is refused with a readable reason`, () => {
  const result = createModule({ title: 'Too big', points: 100, minutes: 5, questions: questions(MAX_QUESTIONS + 1) })
  assert.equal(result.ok, false)
  assert.match(result.error, /at most 40 questions/)
})

test('the limit is enforced on edit, not only on create', () => {
  const { module } = createModule({ title: 'Editable', points: 100, minutes: 5, questions: questions(2) })
  const over = updateModule(module.id, { questions: questions(MAX_QUESTIONS + 1) })
  assert.equal(over.ok, false)
  // The refused edit changed nothing.
  assert.equal(moduleById(module.id).questions.length, 2)
})

test('editing is still allowed at the limit', () => {
  const { module } = createModule({ title: 'At the limit', points: 100, minutes: 5, questions: questions(MAX_QUESTIONS) })
  const edited = questions(MAX_QUESTIONS)
  edited[0] = { type: 'mcq', question: 'Reworded?', answers: ['a', 'b'], correct: 1 }
  const result = updateModule(module.id, { questions: edited })
  assert.equal(result.ok, true)
  assert.equal(moduleById(module.id).questions[0].question, 'Reworded?')
  assert.equal(moduleById(module.id).questions[0].correct, 1)
})

test('a multiple-choice question with one answer is refused', () => {
  const { error } = normaliseQuestions([{ type: 'mcq', question: 'Only one?', answers: ['yes'] }])
  assert.match(error, /at least two answers/)
})

test('a question with no text is refused', () => {
  const { error } = normaliseQuestions([{ type: 'mcq', question: '   ', answers: ['a', 'b'] }])
  assert.match(error, /Question 1 is incomplete/)
})

// ---- assignment ------------------------------------------------------------

test('an assigned module appears for that employee and nobody else', () => {
  const { module } = createModule({ title: 'Assigned only', points: 100, minutes: 5, questions: questions(2) })
  const result = assignTraining({ moduleId: module.id, type: 'employee', employeeIds: ['E-217'] })
  assert.equal(result.ok, true)
  assert.equal(result.assigned, 1)

  assert.ok(modulesForEmployee('E-217').some(m => m.id === module.id))
  assert.ok(!modulesForEmployee('E-198').some(m => m.id === module.id))
})

test('an unassigned employee is refused by the access check, not just the list', () => {
  const { module } = createModule({ title: 'Private', points: 100, minutes: 5, questions: questions(2) })
  assignTraining({ moduleId: module.id, type: 'employee', employeeIds: ['E-217'] })

  assert.equal(canAccessModule('E-217', module.id).ok, true)
  const refused = canAccessModule('E-198', module.id)
  assert.equal(refused.ok, false)
  assert.equal(refused.reason, 'not_assigned')
})

test('a department assignment reaches every member of that department', () => {
  const { module } = createModule({ title: 'Eng only', points: 100, minutes: 5, questions: questions(2) })
  const result = assignTraining({ moduleId: module.id, type: 'department', department: 'Eng' })
  assert.equal(result.ok, true)
  // Engineering holds E-217 and E-198 in the directory.
  assert.deepEqual([...result.record.employeeIds].sort(), ['E-198', 'E-217'])
  assert.equal(canAccessModule('E-198', module.id).ok, true)
  assert.equal(canAccessModule('S-044', module.id).ok, false)
})

test('an empty department assigns nothing rather than an empty record', () => {
  const { module } = createModule({ title: 'Nobody', points: 100, minutes: 5, questions: questions(1) })
  // Every seeded department has members, so an unknown code stands in for one
  // that resolves to nobody — the point is that it writes no record.
  const result = assignTraining({ moduleId: module.id, type: 'department', department: 'Nowhere' })
  assert.equal(result.ok, false)
  assert.equal(db.assignments.length, 0)
})

test('an unknown employee id assigns nothing', () => {
  const { module } = createModule({ title: 'Ghost', points: 100, minutes: 5, questions: questions(1) })
  const result = assignTraining({ moduleId: module.id, type: 'employee', employeeIds: ['NOT-A-PERSON'] })
  assert.equal(result.ok, false)
  assert.equal(db.assignments.length, 0)
})

test('a module with no questions cannot be assigned', () => {
  // Module 4 ships as an empty draft.
  setModuleStatus(4, 'live')
  const result = assignTraining({ moduleId: 4, type: 'employee', employeeIds: ['E-217'] })
  assert.equal(result.ok, false)
  assert.match(result.error, /no questions yet/)
})

test('re-assigning the same training creates no duplicate record', () => {
  const { module } = createModule({ title: 'Once', points: 100, minutes: 5, questions: questions(1) })
  assignTraining({ moduleId: module.id, type: 'employee', employeeIds: ['E-217'] })
  const again = assignTraining({ moduleId: module.id, type: 'employee', employeeIds: ['E-217'] })
  assert.equal(again.ok, false)
  assert.equal(db.assignments.length, 1)
})

test('assigning to a mixed group only records the employees who are new to it', () => {
  const { module } = createModule({ title: 'Mixed', points: 100, minutes: 5, questions: questions(1) })
  assignTraining({ moduleId: module.id, type: 'employee', employeeIds: ['E-217'] })
  const second = assignTraining({ moduleId: module.id, type: 'employee', employeeIds: ['E-217', 'E-198'] })
  assert.equal(second.ok, true)
  assert.equal(second.assigned, 1)
  assert.equal(second.duplicates, 1)
  assert.deepEqual(second.record.employeeIds, ['E-198'])
})

// ---- notifications ---------------------------------------------------------

test('only the assigned employee is notified, and the notification opens the module', () => {
  const { module } = createModule({ title: 'Notify me', points: 100, minutes: 5, questions: questions(2) })
  assignTraining({ moduleId: module.id, type: 'employee', employeeIds: ['E-217'] })

  const theirs = notificationsFor('E-217').filter(n => n.key === `assign:${module.id}`)
  assert.equal(theirs.length, 1)
  assert.equal(theirs[0].action.to, `/training/quiz/${module.id}`)
  assert.equal(notificationsFor('E-198').filter(n => n.key === `assign:${module.id}`).length, 0)
})

test('a repeated assignment cannot produce a second notification', () => {
  const { module } = createModule({ title: 'Once only', points: 100, minutes: 5, questions: questions(1) })
  assignTraining({ moduleId: module.id, type: 'employee', employeeIds: ['E-217'] })
  assignTraining({ moduleId: module.id, type: 'employee', employeeIds: ['E-217'] })
  assert.equal(notificationsFor('E-217').filter(n => n.key === `assign:${module.id}`).length, 1)
})

// ---- publish / hide --------------------------------------------------------

test('hiding a module removes it from the employee list but keeps the assignment', () => {
  const { module } = createModule({ title: 'Hideable', points: 100, minutes: 5, questions: questions(1) })
  assignTraining({ moduleId: module.id, type: 'employee', employeeIds: ['E-217'] })

  setModuleStatus(module.id, 'draft')
  assert.ok(!modulesForEmployee('E-217').some(m => m.id === module.id))
  assert.equal(canAccessModule('E-217', module.id).reason, 'not_published')

  setModuleStatus(module.id, 'live')
  assert.ok(modulesForEmployee('E-217').some(m => m.id === module.id))
})

// ---- scoring follows the module ---------------------------------------------

test('an assessment is scored out of the module’s real question count', () => {
  const { module } = createModule({ title: 'Five questions', points: 200, minutes: 5, questions: questions(5) })
  assignTraining({ moduleId: module.id, type: 'employee', employeeIds: ['E-217'] })
  setSessionEmployee('E-217')

  assert.equal(quizResults(module.id).total, 5)
  for (let i = 0; i < 5; i++) answerQuiz(module.id, i, true)
  const result = completeTraining(module.id)
  assert.equal(result.total, 5)
  assert.equal(result.award.pointsEarned, 200) // the module's own value, not a constant
})

test('two employees keep separate progress on the same module', () => {
  const { module } = createModule({ title: 'Shared', points: 100, minutes: 5, questions: questions(2) })
  assignTraining({ moduleId: module.id, type: 'department', department: 'Eng' })

  setSessionEmployee('E-217')
  answerQuiz(module.id, 0, true)
  answerQuiz(module.id, 1, true)
  completeTraining(module.id)
  assert.equal(db.employees['E-217'].trainingProgress[module.id].completed, true)

  setSessionEmployee('E-198')
  assert.equal(quizResults(module.id).attempted, 0)
  assert.equal(db.employees['E-198'].trainingProgress[module.id], undefined)
})

// ---- the standing curriculum ------------------------------------------------

test('published everyone-modules reach every employee without an assignment', () => {
  // Modules 1–3 ship as the standing curriculum.
  assert.equal(canAccessModule('S-044', 1).ok, true)
  assert.ok(modulesForEmployee('S-044').some(m => m.id === 1))
})

test('a draft module is closed to everyone, assigned or not', () => {
  setModuleStatus(1, 'draft')
  assert.equal(canAccessModule('E-217', 1).ok, false)
  assert.equal(canAccessModule('E-217', 1).reason, 'not_published')
})

resetStore()
console.log(`\n${passed} training tests passed`)
