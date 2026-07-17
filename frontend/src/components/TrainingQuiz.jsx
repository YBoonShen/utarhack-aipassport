// Training quiz modal — matches Figma frames "Training • Q1-Q3 • Unanswered/Correct/Incorrect"
import { useState } from 'react'

const questions = [
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
  const q = questions[step]
  const pct = Math.round(((step + (answered ? 1 : 0)) / questions.length) * 100)

  function pick(i) {
    if (answered) return
    setSelected(i)
    setAnswered(true)
  }

  function next() {
    if (step + 1 < questions.length) {
      setStep(step + 1)
      setSelected(null)
      setAnswered(false)
    } else {
      onComplete()
    }
  }

  return (
    <div className="fixed inset-0 bg-navy-dark/60 flex items-center justify-center p-6 z-50">
      <div className="bg-cream border-[3px] border-navy rounded-2xl max-w-md w-full overflow-hidden">
        <div className="bg-navy px-6 py-4 flex items-center justify-between">
          <div>
            <p className="text-white font-bold text-sm">Spotting Personal Data in Prompts</p>
            <p className="text-gold text-[11px]">Question {step + 1} of {questions.length}</p>
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
              {step + 1 < questions.length ? 'Next question →' : 'Finish lesson →'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
