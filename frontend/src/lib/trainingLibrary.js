// Admin training library — one record per module the admin can publish and
// assign. Ids 1–3 are the real employee modules defined in trainingModules.js
// (same ids, same titles, question count read straight from the content), so an
// assignment always points at a training that has a Q1 to open. 4–5 are drafts
// that exist only on the admin side.
import { MODULES, MODULE_LIST } from './trainingModules.js'

const fromModule = (id, extra) => ({
  id,
  title: MODULES[id].title,
  questions: MODULES[id].questions.length,
  points: MODULES[id].points,
  minutes: MODULES[id].minutes,
  status: 'live',
  ...extra,
})

export const TRAINING_LIBRARY = [
  ...MODULE_LIST.map(m => fromModule(m.id, { assigned: { 1: 303, 2: 210, 3: 96 }[m.id] || 0, done: { 1: 78, 2: 54, 3: 30 }[m.id] || 0 })),
  // Draft, and still empty — assigning it must be blocked until it has questions.
  { id: 4, title: 'Advanced AI Ethics', questions: 0, points: 220, minutes: 8, status: 'draft', assigned: 0, done: 0 },
  { id: 5, title: 'AI Tools at Work: Staying Compliant & Safe', questions: 3, points: 150, minutes: 6, status: 'draft', assigned: 0, done: 0 },
]

export function trainingById(id) {
  return TRAINING_LIBRARY.find(t => t.id === id) || null
}

// A training can only be assigned when it exists and actually has questions.
export function trainingIssue(training) {
  if (!training || !training.title) return 'This training could not be found. Pick a training from the library and try again.'
  if (!training.questions) return 'This training has no questions yet. Add at least one question before assigning it.'
  return null
}
