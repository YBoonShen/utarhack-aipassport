// Training quiz modal — matches Figma frames "Training • Q1-Q3 • Unanswered/Correct/Incorrect"
// A6: every FIRST attempt is recorded server-side (/api/quiz/answer); retrying in
// the UI never changes the recorded score, and the Results screen shows the real one.
import { useState } from 'react'
import { apiPost } from '../api.js'

export const QUESTIONS = [
  {
    q: 'Which of these is safe to paste into a public AI tool?',
    options: ['The customer’s IC number', 'The department name, "Engineering"', 'A colleague’s home address', 'A customer’s phone number'],
    correct: 1,
  },
  {
    q: 'A customer complaint email contains a name and phone number. What should you do before summarising it with AI?',
    options: ['Paste it in exactly as received', 'Let the Smart Gateway mask personal details first', 'Only remove the phone number', 'Ask the customer for permission first'],
    correct: 1,
  },
  {
    q: 'The Smart Gateway just replaced a name in your prompt with [MASKED-NAME]. What does this mean?',
    options: ['Your prompt failed to send', 'A personal detail was protected before leaving your device', 'The AI tool rejected your prompt', 'You need to restart the app'],
    correct: 1,
  },
]

export default function TrainingQuiz({ onClose, onComplete }) {
  const [step, setStep] = useState(0)
  const [selected, setSelected] = useState(null)
  const [answered, setAnswered] = useState(false)
  const [results, setResults] = useState(null) // final server-side results
  const q = QUESTIONS[step]
  const pct = Math.round(((step + (answered ? 1 : 0)) / QUESTIONS.length) * 100)

  async function pick(i) {
    if (answered) return
    setSelected(i)
    setAnswered(true)
    try {
      await apiPost('/quiz/answer', { question: step, picked: i, correct: i === q.correct })
    } catch { /* offline demo still walks through */ }
  }

  async function next() {
    if (step + 1 < QUESTIONS.length) {
      setStep(step + 1)
      setSelected(null)
      setAnswered(false)
    } else {
      let r = null
      try { r = await fetch('/api/quiz').then(x => x.json()) } catch { /* offline */ }
      setResults(r || { attempted: QUESTIONS.length, correct: null, answers: {}, pointsEarned: 0 })
    }
  }

  // Results screen — real first-attempt score, wrong answers in red
  if (results) {
    const total = QUESTIONS.length
    const score = results.correct ?? '—'
    const pctScore = results.correct != null ? Math.round((results.correct / total) * 100) : null
    return (
      <div className="fixed inset-0 bg-navy-dark/60 flex items-center justify-center p-6 z-50">
        <div className="bg-cream border-[3px] border-navy rounded-2xl max-w-md w-full overflow-hidden">
          <div className="bg-navy px-6 py-5 text-center">
            <p className="text-white font-bold text-lg">Lesson Results</p>
            <p className="text-gold text-3xl font-bold mt-2">
              {score}/{total}{pctScore != null && <span className="text-base font-medium"> · {pctScore}%</span>}
            </p>
            <p className="text-slate-300 text-xs mt-1">first-attempt score · {results.pointsEarned} points earned</p>
          </div>
          <div className="p-6">
            <div className="flex flex-col gap-2">
              {QUESTIONS.map((question, i) => {
                const a = results.answers?.[i]
                const ok = a?.correct
                return (
                  <div key={i} className={`rounded-lg border px-4 py-2.5 text-sm ${ok ? 'border-emerald-500 bg-emerald-50 text-emerald-900' : 'border-red-500 bg-red-50 text-red-900'}`}>
                    <span className="font-bold mr-1.5">{ok ? '✓' : '✕'}</span>
                    Q{i + 1}: {question.q.slice(0, 52)}…
                    {!ok && a && (
                      <p className="text-xs mt-1 text-red-700">
                        Your answer: “{question.options[a.picked]}” · Correct: “{question.options[question.correct]}”
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
            <p className="text-[11px] text-gray-500 mt-3">
              Scores count on first attempt only — reviewing wrong answers is how the stamp is earned.
            </p>
            <button
              onClick={() => onComplete(results)}
              className="mt-4 bg-gold hover:bg-gold-dark text-navy font-bold px-6 py-2.5 rounded-full text-sm w-full"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-navy-dark/60 flex items-center justify-center p-6 z-50">
      <div className="bg-cream border-[3px] border-navy rounded-2xl max-w-md w-full overflow-hidden">
        <div className="bg-navy px-6 py-4 flex items-center justify-between">
          <div>
            <p className="text-white font-bold text-sm">Spotting Personal Data in Prompts</p>
            <p className="text-gold text-[11px]">Question {step + 1} of {QUESTIONS.length}</p>
          </div>
          <button onClick={onClose} className="text-slate-300 hover:text-white text-sm">✕</button>
        </div>
        <div className="h-1.5 bg-[#1c3572]">
          <div className="h-1.5 bg-gold transition-all" style={{ width: `${pct}%` }} />
        </div>

        <div className="p-6">
          <p className="text-navy font-bold text-[15px] mb-4">{q.q}</p>
          <div className="flex flex-col gap-2.5">
            {q.options.map((opt, i) => {
              let style = 'border-[#d8cfae] bg-white'
              if (answered) {
                if (i === q.correct) style = 'border-emerald-600 bg-emerald-50'
                else if (i === selected) style = 'border-red-600 bg-red-50'
                else style = 'border-[#d8cfae] bg-white opacity-60'
              }
              return (
                <button
                  key={i}
                  onClick={() => pick(i)}
                  disabled={answered}
                  className={`text-left text-sm px-4 py-3 rounded-xl border-2 ${style}`}
                >
                  {opt}
                  {answered && i === q.correct && <span className="ml-2 text-emerald-700 font-bold">✓ Correct</span>}
                  {answered && i === selected && i !== q.correct && <span className="ml-2 text-red-700 font-bold">✕ Incorrect</span>}
                </button>
              )
            })}
          </div>

          {answered && (
            <button onClick={next} className="mt-5 bg-gold hover:bg-gold-dark text-navy font-bold px-6 py-2.5 rounded-full text-sm w-full">
              {step + 1 < QUESTIONS.length ? 'Next question →' : 'See results →'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
