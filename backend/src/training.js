// The training library seed and the rules a module has to satisfy.
//
// This is the authoritative question set. The employee lesson pages add
// presentation to it (the helper text, worked example and feedback lines in
// frontend/src/lib/trainingModules.js are keyed by module id + question index),
// but the question text, the answers and which one is correct all come from
// here — so a question an admin edits is the question an employee is asked.
//
// Shape is deliberately document-friendly: each record is a Firestore
// trainingModules/{id} document, questions included.

/** Hard ceiling on questions per module — enforced here, not only in the UI. */
export const MAX_QUESTIONS = 40

const mcq = (question, answers, correct = 0) => ({ type: 'mcq', question, answers, correct })
const practice = question => ({ type: 'practice', question, answers: [], correct: null })

// Ids 1–3 also have illustrated lesson content on the employee side, which is
// why they are flagged `builtin`. Their questions still live here.
export function seedLibrary() {
  return [
    {
      id: 1,
      title: 'Spotting Personal Data in Prompts',
      subtitle: 'Learn to identify and remove personal information before using an AI tool.',
      points: 150, minutes: 5, status: 'live', audience: 'everyone', builtin: true,
      assigned: 303, done: 78,
      questions: [
        mcq('Which part of this prompt contains personal data?', [
          'The customer’s name and identity number',
          'The instruction to summarise the complaint',
          'The request to suggest a reply',
          'Nothing — an internal prompt is always private',
        ]),
        mcq('What should you do before sending a customer case to an AI tool?', [
          'Remove or mask identifiers and keep only the necessary context',
          'Send the full record because the tool is approved',
          'Remove the name but keep the phone number and identity number',
          'Paste the full record, then delete the conversation later',
        ]),
        practice('Write your own safe version of the prompt.'),
      ],
    },
    {
      id: 2,
      title: 'Safe AI Tool Selection',
      subtitle: 'Learn how to choose and request AI tools safely.',
      points: 180, minutes: 6, status: 'live', audience: 'everyone', builtin: true,
      assigned: 210, done: 54,
      questions: [
        mcq('A teammate shares an unapproved free AI tool. What do you do first?', [
          'Request approval through AI Passport before putting any company data in it',
          'Start using it — free tools are always fine for work',
          'Use it only for small tasks without telling anyone',
          'Ask the teammate to send you their login',
        ]),
        mcq('Which factor matters MOST when deciding if an AI tool is safe for a task?', [
          'What data it will receive and whether the vendor protects it',
          'How popular the tool is on social media',
          'Whether it has a nice interface',
          'Whether it is free',
        ]),
        practice('Write a tool request that states the task and the data it will touch.'),
      ],
    },
    {
      id: 3,
      title: 'Human Review in AI Decisions',
      subtitle: 'Learn when people can question an AI-assisted decision.',
      points: 200, minutes: 6, status: 'live', audience: 'everyone', builtin: true,
      assigned: 96, done: 30,
      questions: [
        mcq('A rejected job applicant was ranked by AI. What is their right?', [
          'To be told AI was involved and to request a human review',
          'No rights — the AI decision is final',
          'To see other applicants’ personal data',
          'To re-take the AI test unlimited times',
        ]),
        mcq('When must a human review an AI-assisted decision before it is final?', [
          'When the decision meaningfully affects a person — e.g. hiring, credit, discipline',
          'Only when the AI itself asks for review',
          'Never — review slows the process down',
          'Only for decisions about company revenue',
        ]),
        practice('Explain to a rejected applicant that AI was involved in screening.'),
      ],
    },
    // Draft and genuinely empty — assigning it is blocked until it has questions.
    {
      id: 4,
      title: 'Advanced AI Ethics',
      subtitle: 'Bias, fairness and accountability in day-to-day AI use.',
      points: 220, minutes: 8, status: 'draft', audience: 'assigned', builtin: false,
      assigned: 0, done: 0,
      questions: [],
    },
    // Draft with real content — publish it and assign it to see the whole chain
    // work on a module the employee has never had before.
    {
      id: 5,
      title: 'AI Tools at Work: Staying Compliant & Safe',
      subtitle: 'Choose approved tools and keep company data out of them.',
      points: 150, minutes: 6, status: 'draft', audience: 'assigned', builtin: false,
      assigned: 0, done: 0,
      questions: [
        mcq('Which part of this prompt contains personal data?', [
          'The customer’s name and IC number',
          'The instruction to summarise',
          'The request to reply',
          'Nothing — internal is always private',
        ]),
        mcq('An approved tool asks you to paste a customer list. What do you do?', [
          'Mask the identifiers and paste only the columns the task needs',
          'Paste it — the tool is approved, so anything goes',
          'Paste it and delete the chat afterwards',
          'Email the list to yourself first',
        ]),
        practice('Write your own safe version of the prompt.'),
      ],
    },
  ]
}

// ---- validation ------------------------------------------------------------
// Everything a module or a question has to satisfy before it is stored. The
// admin UI checks the same rules for immediate feedback; these are the ones
// that actually decide, because a request can reach the API without the UI.

/** Cleans one question, or returns null if it cannot be saved. */
export function normaliseQuestion(raw) {
  if (!raw || typeof raw !== 'object') return null
  const question = String(raw.question ?? '').trim()
  if (!question) return null
  const type = raw.type === 'practice' ? 'practice' : 'mcq'
  if (type === 'practice') return { type, question, answers: [], correct: null }

  const answers = (Array.isArray(raw.answers) ? raw.answers : [])
    .map(a => String(a ?? '').trim())
    .filter(Boolean)
    .slice(0, 8)
  // A multiple-choice question that cannot be got wrong is not an assessment.
  if (answers.length < 2) return null
  const correct = Number.isInteger(raw.correct) && raw.correct >= 0 && raw.correct < answers.length ? raw.correct : 0
  return { type, question, answers, correct }
}

/**
 * Cleans a whole question set. Returns { questions } or { error } — the error
 * is written for the admin to read, because it is what the API sends back.
 */
export function normaliseQuestions(list) {
  if (!Array.isArray(list)) return { error: 'Questions must be a list.' }
  if (list.length > MAX_QUESTIONS) {
    return { error: `A training module can hold at most ${MAX_QUESTIONS} questions. This one has ${list.length}.` }
  }
  const questions = []
  for (const [i, raw] of list.entries()) {
    const q = normaliseQuestion(raw)
    if (!q) return { error: `Question ${i + 1} is incomplete. Add the question text, and at least two answers for a multiple-choice question.` }
    questions.push(q)
  }
  return { questions }
}

/** Why this module cannot be assigned yet, or null when it can. */
export function moduleIssue(module) {
  if (!module || !module.title) return 'This training could not be found. Pick a training from the library and try again.'
  if (!module.questions?.length) return 'This training has no questions yet. Add at least one question before assigning it.'
  if (module.status !== 'live') return 'This training is a draft. Publish it before assigning it.'
  return null
}
