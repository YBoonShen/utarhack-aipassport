// Derived employee-profile tests — run with `npm test` (backend).
//
// These pin the fields the employee screens read but do not own: the AI Safety
// Score, the answer record a paused quiz is resumed from, and the per-module
// completion count the admin list shows.
//
// The failure they exist to prevent is a screen inventing a number the server
// never sent. Every one of these was previously a literal in the browser: the
// licence card rendered a fixed 80 · Excellent for every employee because
// /api/profile carried no safety field at all, the quiz page could not redraw an
// attempt because only the verdict was stored and not the answer, and the admin
// module list printed a completion COUNT with a "%" after it.
//
// Note: these tests exercise the real store, so they reset it — running them
// clears any saved demo state in backend/data/progress.json.
import assert from 'node:assert/strict'
import {
  resetStore, setSessionEmployee, safetyFor, publicProfile, answerQuiz, quizResults,
  completeTraining, recordOverride, modulesForEmployee, publicModule, moduleById,
  createModule, assignTraining, retryTraining,
} from './store.js'
import { levelFor } from './levels.js'

let passed = 0
function test(name, fn) {
  resetStore()
  fn()
  passed++
  console.log(`  ✓ ${name}`)
}

// Answers every question in a module correctly, then settles it.
function pass(moduleId) {
  const total = moduleById(moduleId).questions.length
  for (let i = 0; i < total; i++) answerQuiz(moduleId, i, true, 0)
  return completeTraining(moduleId)
}

// ---- the AI Safety Score ---------------------------------------------------

test('the score is served with the profile, not invented by the browser', () => {
  const profile = publicProfile(setSessionEmployee('E-217'))
  assert.ok(profile.safety, 'profile carries a safety object')
  assert.equal(typeof profile.safety.score, 'number')
  assert.ok(['Excellent', 'Good', 'Fair', 'At risk'].includes(profile.safety.grade))
})

test('an employee with no history is not "at risk" — they have no record either way', () => {
  const safety = safetyFor(setSessionEmployee('F-102'))
  assert.equal(safety.score, 60)
  assert.equal(safety.grade, 'Good')
  assert.equal(safety.overrides, 0)
})

test('two employees get their own score, not the last one to sign in', () => {
  const demo = safetyFor(setSessionEmployee('E-217')) // 21-day streak
  const fresh = safetyFor(setSessionEmployee('F-102')) // no history
  assert.notEqual(demo.score, fresh.score)
  assert.equal(demo.streakDays, 21)
  assert.equal(fresh.streakDays, 0)
})

test('completing assigned training raises the score', () => {
  setSessionEmployee('E-217')
  const before = safetyFor().score
  pass(1)
  const after = safetyFor()
  assert.ok(after.score > before, `${after.score} > ${before}`)
  assert.equal(after.modulesCompleted, 1)
  assert.equal(after.modulesAssigned, modulesForEmployee('E-217').length)
})

test('an override is the one thing that pulls it down', () => {
  setSessionEmployee('E-217')
  const before = safetyFor().score
  recordOverride({ prompt: 'send the original anyway' })
  const after = safetyFor()
  assert.ok(after.score < before, `${after.score} < ${before}`)
  assert.equal(after.overrides, 1)
  // The override resets the streak too, so both contributions fall together.
  assert.equal(after.streakDays, 0)
})

test('the score never leaves 0–100 however many overrides are recorded', () => {
  setSessionEmployee('E-217')
  for (let i = 0; i < 12; i++) recordOverride({ prompt: 'again' })
  const safety = safetyFor()
  assert.equal(safety.score, 0)
  assert.equal(safety.grade, 'At risk')
})

test('training assigned to somebody else never counts against you', () => {
  setSessionEmployee('E-217')
  pass(1)
  const before = safetyFor()
  // A module published and assigned to a different employee entirely.
  const { module } = createModule({
    title: 'Finance-only refresher', points: 100, minutes: 4,
    questions: [{ type: 'mcq', question: 'Q1?', answers: ['a', 'b'], correct: 0 }],
  })
  assignTraining({ moduleId: module.id, type: 'employee', employeeIds: ['F-102'] })
  const after = safetyFor(setSessionEmployee('E-217'))
  assert.equal(after.score, before.score)
  assert.equal(after.modulesAssigned, before.modulesAssigned)
})

test('training assigned to YOU and not yet done is outstanding, and the score says so', () => {
  setSessionEmployee('E-217')
  pass(1)
  const before = safetyFor()
  const { module } = createModule({
    title: 'New mandatory refresher', points: 100, minutes: 4,
    questions: [{ type: 'mcq', question: 'Q1?', answers: ['a', 'b'], correct: 0 }],
  })
  assignTraining({ moduleId: module.id, type: 'employee', employeeIds: ['E-217'] })
  const after = safetyFor(setSessionEmployee('E-217'))
  assert.equal(after.modulesAssigned, before.modulesAssigned + 1)
  assert.ok(after.score < before.score, 'outstanding assigned training shows in the score')
  // …and finishing it puts the score back above where it started.
  pass(module.id)
  assert.ok(safetyFor().score > before.score)
})

// ---- resuming an attempt ---------------------------------------------------

test('the chosen answer is recorded, not only whether it was right', () => {
  setSessionEmployee('E-217')
  answerQuiz(1, 0, false, 3)
  const { answers } = quizResults(1)
  assert.equal(answers[0].correct, false)
  assert.equal(answers[0].selected, 3, 'the page can redraw which option was picked')
})

test('a practice answer records no option index', () => {
  setSessionEmployee('E-217')
  answerQuiz(1, 2, true, null)
  assert.equal(quizResults(1).answers[2].selected, null)
})

test('answers are final — re-answering cannot change a recorded one', () => {
  setSessionEmployee('E-217')
  answerQuiz(1, 0, false, 3)
  answerQuiz(1, 0, true, 0) // a refresh, a double-click, a replayed request
  const { answers, correct } = quizResults(1)
  assert.equal(answers[0].selected, 3)
  assert.equal(answers[0].correct, false)
  assert.equal(correct, 0)
})

test('a part-finished attempt survives to be resumed', () => {
  setSessionEmployee('E-217')
  answerQuiz(1, 0, true, 0)
  answerQuiz(1, 1, false, 2)
  const results = quizResults(1)
  assert.equal(results.attempted, 2)
  assert.equal(results.total, 3)
  // Q3 is the first with no answer — where the quiz page puts the employee back.
  assert.equal(results.answers[2], undefined)
})

// ---- per-module completion count -------------------------------------------

test('a module reports completions as a count, alongside its assignee count', () => {
  const before = publicModule(moduleById(1))
  setSessionEmployee('E-217')
  pass(1)
  const after = publicModule(moduleById(1))
  assert.equal(after.doneTotal, before.doneTotal + 1)
  assert.ok(after.doneTotal <= after.assignedTotal, 'never more completions than assignees')
})

test('one employee completing a module does not count for another', () => {
  setSessionEmployee('E-217')
  pass(1)
  const afterFirst = publicModule(moduleById(1)).doneTotal
  setSessionEmployee('F-102')
  const unchanged = publicModule(moduleById(1)).doneTotal
  assert.equal(unchanged, afterFirst)
})

test('retaking a module does not count as a second completion', () => {
  setSessionEmployee('E-217')
  pass(1)
  const once = publicModule(moduleById(1)).doneTotal
  pass(1) // same attempt settled again
  assert.equal(publicModule(moduleById(1)).doneTotal, once)
})

// ---- learning progress -----------------------------------------------------
// current safety points ÷ the points that unlock the next level, × 100.

test('learning progress is points over the next level threshold', () => {
  assert.equal(levelFor(1240).learningPercentage, 62) // 1240 / 2000
  assert.equal(levelFor(250).learningPercentage, 50) //  250 /  500
  assert.equal(levelFor(6000).learningPercentage, 75) // 6000 / 8000
})

test('it is the same arithmetic as the "x / y safety points" line beside it', () => {
  for (const xp of [0, 137, 499, 500, 1240, 2000, 3999, 6000]) {
    const s = levelFor(xp)
    const shown = Math.min(s.totalXP, s.nextLevelXP) // barXP()
    const expected = Math.max(0, Math.min(99, Math.floor((shown / s.nextLevelXP) * 100)))
    assert.equal(s.learningPercentage, s.isMaxXP ? 100 : expected, `at ${xp} points`)
  }
})

test('no level below the ceiling ever reports 100% complete', () => {
  // 1,999 of 2,000 is 99.95% — rounding it to 100 would tell a Navigator their
  // level is finished while they are still in it.
  assert.equal(levelFor(1999).learningPercentage, 99)
  assert.equal(levelFor(3999).learningPercentage, 99)
  assert.equal(levelFor(7999).learningPercentage, 99)
  for (let xp = 0; xp <= 8000; xp += 7) {
    const s = levelFor(xp)
    if (!s.isMaxXP) assert.notEqual(s.learningPercentage, 100, `${xp} points reported 100%`)
  }
})

test('crossing a level resets the figure into the new band', () => {
  assert.equal(levelFor(499).level, 1)
  assert.equal(levelFor(499).learningPercentage, 99)
  const promoted = levelFor(500)
  assert.equal(promoted.level, 2)
  assert.equal(promoted.learningPercentage, 25) // 500 / 2000
})

test('only the XP ceiling reads 100%, and it cannot exceed it', () => {
  assert.equal(levelFor(8000).learningPercentage, 100)
  assert.equal(levelFor(99999).learningPercentage, 100)
})

test('the profile carries the figure the page renders', () => {
  const profile = publicProfile(setSessionEmployee('E-217'))
  assert.equal(profile.learningPercentage, levelFor(profile.points, profile.level).learningPercentage)
})

// ---- per-module progress, as the training screens order and label by --------

test('every assigned module carries this employee\'s own progress', () => {
  setSessionEmployee('E-217')
  for (const m of modulesForEmployee('E-217')) {
    assert.ok(m.progress, `${m.title} carries progress`)
    assert.equal(m.progress.completed, false)
    assert.equal(m.progress.inProgress, false)
    assert.equal(m.progress.attempted, 0)
  }
})

test('answering marks a module in progress and stamps when', () => {
  setSessionEmployee('E-217')
  answerQuiz(3, 0, true, 0)
  const m = modulesForEmployee('E-217').find(x => x.id === 3)
  assert.equal(m.progress.attempted, 1)
  assert.equal(m.progress.inProgress, true)
  assert.equal(m.progress.completed, false)
  assert.ok(m.progress.lastActivityAt, 'the answer is timestamped')
})

test('the most recently answered module is identifiable, whatever its library position', () => {
  setSessionEmployee('E-217')
  answerQuiz(1, 0, true, 0)
  answerQuiz(3, 0, true, 0) // module 3 touched after module 1
  const mods = modulesForEmployee('E-217')
  const started = mods.filter(m => m.progress.inProgress)
    .sort((a, b) => b.progress.lastActivityAt.localeCompare(a.progress.lastActivityAt))
  assert.equal(started[0].id, 3, 'the latest attempt wins, not the lowest id')
})

test('a completed module is never in progress, even while being redone', () => {
  setSessionEmployee('E-217')
  pass(1)
  let m = modulesForEmployee('E-217').find(x => x.id === 1)
  assert.equal(m.progress.completed, true)
  assert.equal(m.progress.inProgress, false)

  retryTraining(1)
  answerQuiz(1, 0, true, 0) // a redo underway
  m = modulesForEmployee('E-217').find(x => x.id === 1)
  assert.equal(m.progress.completed, true, 'still completed')
  assert.equal(m.progress.inProgress, false, 'a redo is not unfinished work')
})

test('a module another employee finished is untouched for this one', () => {
  setSessionEmployee('E-217')
  pass(1)
  const other = modulesForEmployee('F-102').find(m => m.id === 1)
  assert.equal(other.progress.completed, false)
  assert.equal(other.progress.attempted, 0)
})

resetStore()
console.log(`\n${passed} profile tests passed`)
