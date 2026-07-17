// Training quiz — matches Figma frames "Training • Q1–Q3 • Unanswered/Correct/Incorrect"
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api.js'

const questions = [
  {
    step: 'Identify',
    stepTitle: 'Identify personal data',
    q: 'Which part of this prompt contains personal data?',
    helper: 'Select the best answer. You can change it before continuing.',
    example: '“Summarise the complaint from [CUSTOMER NAME], ID [ID NUMBER], and suggest a reply.”',
    tip: 'Tip: direct identifiers can identify a specific person.',
    options: [
      'The customer’s name and identity number',
      'The instruction to summarise the complaint',
      'The request to suggest a reply',
      'Nothing — an internal prompt is always private',
    ],
    correct: 0,
    correctMsg: '✓  Correct — the customer’s name and identity number are personal data.',
    incorrectMsg: '×  Not quite — both the customer’s name and identity number must be protected.',
  },
  {
    step: 'Protect',
    stepTitle: 'Protect the prompt',
    q: 'What should you do before sending a customer case to an AI tool?',
    helper: 'Choose the action that protects the customer while keeping the prompt useful.',
    example: 'You need help summarising a complaint that includes a customer name, phone number and order ID.',
    tip: 'Use only the minimum information required for the task.',
    options: [
      'Remove or mask identifiers and keep only the necessary context',
      'Send the full record because the tool is approved',
      'Remove the name but keep the phone number and identity number',
      'Paste the full record, then delete the conversation later',
    ],
    correct: 0,
    correctMsg: '✓  Correct — mask identifiers and keep only the context the task needs.',
    incorrectMsg: '×  Not quite — an approved tool still requires identifiers to be removed or masked.',
  },
  {
    step: 'Rewrite',
    stepTitle: 'Rewrite safely',
    q: 'Which rewritten prompt is safest to send?',
    helper: 'Choose the version that keeps the task useful without exposing personal information.',
    example: 'Original task: a customer reports a delayed delivery and needs a neutral reply.',
    tip: 'A general reply does not require the person’s identity or contact details.',
    options: [
      'Draft a neutral reply about a delayed delivery. Do not include personal identifiers.',
      'Draft a reply using [CUSTOMER NAME], [PHONE NUMBER] and the full account record.',
      'Upload the entire email chain and let the AI decide what is relevant.',
      'Include the identity number so the complaint can be confirmed.',
    ],
    correct: 0,
    correctMsg: '✓  Correct — the task context is enough; personal identifiers are unnecessary.',
    incorrectMsg: '×  Not quite — keep the useful task context, but remove every personal identifier.',
  },
]

function Radio({ state }) {
  // state: 'idle' | 'correct' | 'incorrect'
  if (state === 'correct')
    return <span className="w-5 h-5 rounded-full bg-[#078b6c] text-white text-xs font-bold flex items-center justify-center shrink-0">✓</span>
  if (state === 'incorrect')
    return <span className="w-5 h-5 rounded-full bg-[#d92d20] text-white text-xs font-bold flex items-center justify-center shrink-0">×</span>
  return <span className="w-5 h-5 rounded-full border-2 border-[#d8d0b4] bg-white shrink-0" />
}

export default function TrainingQuiz() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [selected, setSelected] = useState(null)
  const q = questions[step]
  const answered = selected !== null
  const isCorrect = answered && selected === q.correct
  const isLast = step === questions.length - 1

  async function next() {
    if (!isCorrect) return
    if (isLast) {
      try { await api.post('/training/complete') } catch { /* offline — results page shows fallback */ }
      return navigate('/training/results')
    }
    setStep(step + 1)
    setSelected(null)
  }

  function back() {
    if (step === 0) return navigate('/training')
    setStep(step - 1)
    setSelected(null)
  }

  return (
    <div className="max-w-[1320px] mx-auto px-10 pt-8 pb-10">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-[30px] font-bold text-navy-header">Spotting Personal Data in Prompts</h1>
          <p className="text-[#667085] text-sm mt-1">Learn to identify and remove personal information before using an AI tool.</p>
        </div>
        <p className="text-[#667085] text-xs font-medium pb-1">5-minute lesson&nbsp;&nbsp;·&nbsp;&nbsp;3-question quiz&nbsp;&nbsp;·&nbsp;&nbsp;+150 safety points</p>
      </div>

      <div className="grid grid-cols-3 gap-6 mt-6">
        {questions.map((question, i) => (
          <div key={question.step}>
            <p className={`text-[11px] mb-2.5 ${i === step ? 'text-navy-header font-semibold' : 'text-[#667085] font-medium'}`}>
              {i + 1}&nbsp;&nbsp;{question.step}
            </p>
            <div className={`h-1.5 rounded-full ${i <= step ? 'bg-gold-brand' : 'bg-[#d8d0b4]'}`} />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-[1fr_316px] gap-6 mt-5 items-start">
        {/* Question card */}
        <div className="bg-white border border-[#d8d0b4] rounded-[18px] p-8 pt-6">
          <p className="text-gold-brand text-[10px] font-semibold tracking-[1px]">QUESTION {step + 1} OF 3</p>
          <p className="text-navy-header font-bold text-[22px] mt-2">{q.q}</p>
          <p className="text-[#667085] text-xs mt-2.5">{q.helper}</p>

          <div className="bg-[#f1eddf] border border-[#d8d0b4] rounded-[12px] px-4 py-4 mt-4">
            <p className="text-[#17213a] text-[13px] font-medium">{q.example}</p>
            <p className="text-[#667085] text-[10px] mt-2">{q.tip}</p>
          </div>

          <div className="flex flex-col gap-3 mt-5">
            {q.options.map((opt, i) => {
              let cls = 'bg-white border border-[#d8d0b4]'
              let radio = 'idle'
              if (answered) {
                if (i === q.correct) { cls = 'bg-[#e9f8f2] border-2 border-[#078b6c]'; radio = 'correct' }
                else if (i === selected) { cls = 'bg-[#fff0f0] border-2 border-[#d92d20]'; radio = 'incorrect' }
              }
              return (
                <button
                  key={i}
                  onClick={() => !answered && setSelected(i)}
                  disabled={answered}
                  className={`flex items-center gap-4 text-left rounded-[12px] px-4 h-[60px] cursor-pointer ${cls}`}
                >
                  <Radio state={radio} />
                  <span className="text-[#17213a] text-[13px] font-medium">{opt}</span>
                </button>
              )
            })}
          </div>

          {answered && (
            <div className={`mt-4 rounded-[8px] border px-3.5 py-3 ${isCorrect ? 'bg-[#e9f8f2] border-[#078b6c]' : 'bg-[#fff0f0] border-[#d92d20]'}`}>
              <p className={`text-xs font-medium ${isCorrect ? 'text-[#078b6c]' : 'text-[#d92d20]'}`}>
                {isCorrect ? q.correctMsg : q.incorrectMsg}
              </p>
            </div>
          )}

          <div className="h-px bg-[#d8d0b4] mt-5" />
          <div className="flex justify-between mt-4">
            <button onClick={back} className="border border-navy-header text-navy-header text-[13px] font-semibold w-[130px] h-12 rounded-full cursor-pointer hover:bg-chip">
              ←&nbsp;&nbsp;Back
            </button>
            {answered && !isCorrect ? (
              <button onClick={() => setSelected(null)} className="bg-gold-brand text-[#17213a] text-[13px] font-semibold w-[180px] h-12 rounded-full cursor-pointer hover:bg-gold">
                Try again&nbsp;&nbsp;↻
              </button>
            ) : (
              <button
                onClick={next}
                disabled={!isCorrect}
                className={`text-[13px] font-semibold w-[180px] h-12 rounded-full ${isCorrect ? 'bg-gold-brand text-navy-header cursor-pointer hover:bg-gold' : 'bg-[#d8d0b4] text-[#667085]'}`}
              >
                {isLast ? 'Submit answers' : 'Continue'}&nbsp;&nbsp;→
              </button>
            )}
          </div>
        </div>

        {/* Lesson sidebar */}
        <div className="bg-navy-header rounded-[18px] p-6 self-stretch flex flex-col">
          <p className="text-gold-brand text-[10px] font-semibold tracking-[1px]">MODULE PROGRESS</p>
          <p className="text-white font-bold text-xl mt-2 leading-snug">Spotting Personal Data in Prompts</p>
          <p className="text-[#eef2ff] text-[11px] font-medium mt-3">Question {step + 1} of 3</p>

          <div className="flex flex-col gap-4 mt-5">
            {questions.map((question, i) => {
              const current = i === step
              const done = i < step
              return (
                <div key={question.step} className={`flex items-center gap-3 rounded-[12px] px-3 h-[60px] ${current ? 'bg-[#365fd9]/90' : ''}`}>
                  <span className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${current ? 'bg-gold-brand text-navy-header' : 'bg-[#07183a] border border-[#365fd9] text-[#eef2ff]'}`}>
                    {done ? '✓' : i + 1}
                  </span>
                  <div>
                    <p className={`text-[11px] ${current ? 'text-white font-semibold' : 'text-[#eef2ff] font-medium'}`}>{question.stepTitle}</p>
                    <p className={`text-[9px] ${current ? 'text-[#eef2ff]' : 'text-[#667085]'}`}>{current ? 'Current' : done ? 'Done' : 'Next'}</p>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="bg-[#07183a] rounded-[12px] px-4 py-3 mt-8">
            <p className="text-[#e9f8f2] text-[11px] font-medium">✓&nbsp;&nbsp;Progress saves automatically</p>
            <p className="text-[#eef2ff] text-[9px] mt-1">Return anytime without losing answers.</p>
          </div>

          <div className="bg-[#365fd9] rounded-[14px] px-4 py-4 mt-6">
            <p className="text-gold-brand text-[9px] font-semibold">COMPLETE ALL 3</p>
            <p className="text-white text-lg font-bold mt-1.5">+150 safety points</p>
            <p className="text-[#eef2ff] text-[10px] mt-1.5">Earn the Personal Data training stamp.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
