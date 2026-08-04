// Turns a stored training module into the lesson the quiz and results screens
// render.
//
// The questions, the answers and which one is correct come from the module
// record — the same record the admin edits — so a question an admin changed is
// the question the employee is asked. The illustrated extras (worked example,
// tip, feedback lines, step names) live in trainingModules.js for the three
// modules that shipped with them, and are merged in here by position.
//
// This is what fixes the module that could never be opened: a module used to be
// playable only if trainingModules.js happened to contain content for its id,
// so anything an admin authored showed "content coming soon" forever no matter
// how many questions it had. Playability now follows the questions themselves.
import { MODULES } from './trainingModules.js'

const DEFAULT_HELPER = 'Select the best answer. You can change it before continuing.'
const DEFAULT_PRACTICE_TIP = 'Keep the task, drop the person — no names, IC numbers, phone numbers or account details.'
const DEFAULT_PLACEHOLDER = 'Write the prompt you would actually send: the task and the context it needs, nothing that identifies anyone.'

// Stamp wording for admin-created modules, so a new module still earns a real
// stamp. Mirrors stampFor() in backend/src/store.js.
function stampTitle(module) {
  const builtin = MODULES[module.id]
  if (builtin) return builtin.stampTitle
  const words = String(module.title || 'Training').replace(/[^\w\s]/g, ' ').split(/\s+/).filter(Boolean)
  return words.slice(0, 2).join(' ').toUpperCase() || 'TRAINING'
}

function stepName(question, index) {
  const words = String(question.question || '').split(/\s+/).filter(Boolean)
  return question.type === 'practice' ? 'Practice' : words.slice(0, 2).join(' ') || `Step ${index + 1}`
}

/**
 * @param module a module record with a `questions` array (from /training/mine/:id)
 * @returns the lesson shape both training screens read, or null with no questions
 */
export function buildLesson(module) {
  if (!module || !Array.isArray(module.questions) || module.questions.length === 0) return null
  const builtin = MODULES[module.id]

  const questions = module.questions.map((q, i) => {
    const rich = builtin?.questions?.[i]
    // The illustrated extras only fit the question they were written for. If an
    // admin has edited the text, the worked example and the feedback lines are
    // dropped rather than shown against a question they no longer describe.
    const matches = rich && (rich.type === q.type) && (q.type === 'practice' || rich.q === q.question)

    if (q.type === 'practice') {
      return {
        type: 'practice',
        stepTitle: (matches && rich.stepTitle) || 'Rewrite safely',
        prompt: (matches && rich.prompt) || q.question,
        tip: (matches && rich.tip) || DEFAULT_PRACTICE_TIP,
        placeholder: (matches && rich.placeholder) || DEFAULT_PLACEHOLDER,
      }
    }
    return {
      type: 'mcq',
      stepTitle: (matches && rich.stepTitle) || stepName(q, i),
      q: q.question,
      helper: (matches && rich.helper) || DEFAULT_HELPER,
      example: matches ? rich.example : null,
      tip: matches ? rich.tip : null,
      options: q.answers,
      correct: q.correct,
      correctMsg: (matches && rich.correctMsg) || '✓  Correct — that is the safe choice.',
      incorrectMsg: (matches && rich.incorrectMsg) || '×  Not quite — review the correct answer highlighted above.',
    }
  })

  return {
    id: module.id,
    title: module.title,
    subtitle: module.subtitle,
    minutes: module.minutes,
    points: module.points,
    stampTitle: stampTitle(module),
    steps: questions.map(q => q.stepTitle),
    questions,
  }
}
