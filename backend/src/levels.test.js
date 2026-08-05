// Level table + XP progression tests — run with `npm test` (backend).
// Covers the level bands, the progress-bar maths, and the anti-farm rule that a
// module can only ever contribute its BEST result to total XP.
//
// Note: these tests exercise the real store, so they reset it — running them
// clears any saved demo progression in backend/data/progress.json.
import assert from 'node:assert/strict'
import { levelFor, MAX_XP } from './levels.js'
import {
  db, resetStore, answerQuiz, completeTraining, retryTraining, quizResults,
  applyPoints, progressionSummary, trainingXP,
} from './store.js'

let passed = 0
function test(name, fn) {
  fn()
  passed++
  console.log(`  ✓ ${name}`)
}

// ---- level bands -----------------------------------------------------------

test('band boundaries map to the four levels', () => {
  assert.equal(levelFor(0).level, 1)
  assert.equal(levelFor(499).level, 1)
  assert.equal(levelFor(1999).level, 2)
  assert.equal(levelFor(3999).level, 3)
  assert.equal(levelFor(7999).level, 4)
  assert.equal(levelFor(8000).level, 4)
  assert.equal(levelFor(99999).level, 4) // no Level 5
})

// The rule the bands exist for: a threshold reached is a level held, not the
// last point of the level below it.
test('a threshold reached is the next level immediately', () => {
  assert.equal(levelFor(500).level, 2)
  assert.equal(levelFor(2000).level, 3)
  assert.equal(levelFor(4000).level, 4)
})

test('band names', () => {
  assert.equal(levelFor(0).levelName, 'Trainee')
  assert.equal(levelFor(500).levelName, 'Navigator')
  assert.equal(levelFor(2000).levelName, 'Ambassador')
  assert.equal(levelFor(4000).levelName, 'Guardian')
})

test('1,250 points reports the Level 2 band, not a share of 8,000', () => {
  const s = levelFor(1250)
  assert.equal(s.level, 2)
  assert.equal(s.currentLevelXP, 500)
  assert.equal(s.nextLevelXP, 2000)
  assert.equal(s.nextLevelName, 'Ambassador')
  assert.equal(s.xpToNext, 750) // 2,000 unlocks Ambassador
  assert.equal(s.progressPercentage, 50) // half way through the band, not 15%
  assert.equal(s.isMaxLevel, false)
})

// The bar must fill exactly as the next level is reached — 0% at the threshold
// below, 100% at the threshold above.
test('the bar spans the band it is drawn for', () => {
  assert.equal(levelFor(500).progressPercentage, 0)
  assert.equal(levelFor(1999).progressPercentage, 100) // rounds to full at the top
  assert.equal(levelFor(2000).progressPercentage, 0) // …and resets into Ambassador
})

test('Guardian at the ceiling is 100% and maxed', () => {
  const s = levelFor(MAX_XP)
  assert.equal(s.level, 4)
  assert.equal(s.progressPercentage, 100)
  assert.equal(s.isMaxLevel, true)
  assert.equal(s.isMaxXP, true)
  assert.equal(s.nextLevelName, null)
  assert.equal(s.xpToNext, 0)
})

test('an earned level is sticky through a penalty', () => {
  assert.equal(levelFor(400, 2).level, 2)
  assert.equal(levelFor(400, 2).progressPercentage, 0) // clamped, never negative
})

// ---- training XP -----------------------------------------------------------

function takeModule(moduleId, correctCount, total = 3) {
  for (let i = 0; i < total; i++) answerQuiz(moduleId, i, i < correctCount)
  return completeTraining(moduleId)
}

// A retry is normally locked for 24h; the tests reach past the lock the same way
// a real retry does once the clock has run out.
function unlock(moduleId) {
  delete db.profile.moduleCompletions[moduleId]
  const r = retryTraining(moduleId)
  assert.equal(r.ok, true)
}

test('Case A — first completion awards the module points', () => {
  resetStore()
  const before = db.profile.points
  const res = takeModule(1, 3) // module 1 is worth 150
  assert.equal(res.award.xpGained, 150)
  assert.equal(res.award.pointsEarned, 150)
  assert.equal(res.award.outcome, 'first')
  assert.equal(db.profile.points, before + 150)
  assert.equal(db.profile.completedModules.includes(1), true)
})

test('Case B — a better redo adds only the difference', () => {
  resetStore()
  takeModule(1, 1) // 1/3 of 150 = 50
  assert.equal(trainingXP(), 50)
  const total = db.profile.points

  unlock(1)
  const res = takeModule(1, 3) // 150
  assert.equal(res.award.previousPoints, 50)
  assert.equal(res.award.pointsEarned, 150)
  assert.equal(res.award.xpGained, 100) // the improvement only, not 50 + 150
  assert.equal(res.award.outcome, 'improved')
  assert.equal(db.profile.points, total + 100)
  assert.equal(trainingXP(), 150)
})

test('Case C — an identical redo changes nothing', () => {
  resetStore()
  takeModule(1, 3)
  const total = db.profile.points

  unlock(1)
  const res = takeModule(1, 3)
  assert.equal(res.award.xpGained, 0)
  assert.equal(res.award.outcome, 'unchanged')
  assert.equal(db.profile.points, total)
})

test('Case D — a worse redo keeps the best contribution', () => {
  resetStore()
  takeModule(1, 3) // 150
  const total = db.profile.points

  unlock(1)
  const res = takeModule(1, 1) // 50 this time
  assert.equal(res.award.attemptPoints, 50)
  assert.equal(res.award.pointsEarned, 150) // best kept
  assert.equal(res.award.xpGained, 0)
  assert.equal(db.profile.points, total)
  assert.equal(db.profile.trainingProgress[1].bestScorePct, 100)
})

test('farming the same module 10 times cannot inflate XP', () => {
  resetStore()
  takeModule(1, 3)
  const total = db.profile.points
  for (let i = 0; i < 10; i++) {
    unlock(1)
    takeModule(1, 3)
  }
  assert.equal(db.profile.points, total)
  assert.equal(trainingXP(), 150)
  const summary = progressionSummary()
  assert.equal(summary.modules[0].attempts, 11) // attempts are visible…
  assert.equal(summary.modules[0].pointsEarned, 150) // …but XP is not multiplied
})

test('re-submitting the same attempt is a no-op', () => {
  resetStore()
  takeModule(1, 3)
  const total = db.profile.points
  const again = completeTraining(1) // duplicate POST — no new attempt in between
  assert.equal(again.duplicate, true)
  assert.equal(db.profile.points, total)
  assert.equal(db.profile.trainingProgress[1].attempts, 1)
})

test('Case E — crossing a threshold reports a level-up exactly once', () => {
  resetStore()
  db.profile.activityXP = 450
  applyPoints(0)
  db.profile.level = 1 // start this scenario as a Trainee
  applyPoints(0)
  assert.equal(db.profile.level, 1)

  const res = takeModule(1, 2) // 2/3 of 150 = 100 → 550 XP
  assert.equal(db.profile.points, 550)
  assert.equal(res.levelUp.to, 2)
  assert.equal(res.levelUp.levelName, 'Navigator')

  // Reading the results again never reports a second level-up.
  assert.equal(quizResults(1).progression.level, 2)
  unlock(1)
  const same = takeModule(1, 2)
  assert.equal(same.levelUp, null)
})

test('Case F — several modules sum their best contributions', () => {
  resetStore()
  db.profile.activityXP = 0
  applyPoints(0)
  takeModule(1, 3) // 150
  takeModule(2, 3) // 180
  takeModule(3, 3) // 200
  assert.equal(trainingXP(), 530)
  assert.equal(db.profile.points, 530)
  assert.equal(db.profile.level, 2)
  assert.equal(progressionSummary().modulesCompleted, 3)
})

test('Case G — XP past the ceiling never creates a Level 5', () => {
  resetStore()
  db.profile.activityXP = 8000
  applyPoints(0)
  assert.equal(db.profile.level, 4)
  takeModule(1, 3)
  assert.equal(db.profile.level, 4)
  assert.equal(db.profile.progressPercentage, 100)
  assert.equal(db.profile.isMaxXP, true)
})

test('total XP is always activity XP + best training XP', () => {
  resetStore()
  takeModule(2, 2) // 2/3 of 180 = 120
  assert.equal(db.profile.points, db.profile.activityXP + trainingXP())
})

resetStore()
console.log(`\n${passed} progression tests passed`)
