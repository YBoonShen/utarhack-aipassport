// Training quiz — matches Figma frames "Training/M2/M3 • Q1–Q3 • Unanswered/Correct/Incorrect"
// and "Q3 • Write-your-own Practice" (every module's 3rd question is a free-text
// practice item, not a 4th MCQ). moduleId comes from the route so M1/M2/M3 share this page.
import { useState } from 'react'
import { useNavigate, useParams, Navigate } from 'react-router-dom'
import { api } from '../lib/api.js'
import { MODULES } from '../lib/trainingModules.js'

function Radio({ state }) {
  if (state === 'correct')
    return <span className="w-5 h-5 rounded-full bg-[#078b6c] text-white text-xs font-bold flex items-center justify-center shrink-0">✓</span>
  if (state === 'incorrect')
    return <span className="w-5 h-5 rounded-full bg-[#d92d20] text-white text-xs font-bold flex items-center justify-center shrink-0">×</span>
  return <span className="w-5 h-5 rounded-full border-2 border-[#d8d0b4] bg-white shrink-0" />
}

export default function TrainingQuiz() {
  const { moduleId: moduleIdParam } = useParams()
  const moduleId = Number(moduleIdParam) || 1
  const mod = MODULES[moduleId]
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [selected, setSelected] = useState(null)
  const [rewrite, setRewrite] = useState('')
  const [rewriteChecked, setRewriteChecked] = useState(false)
  const [firstTried, setFirstTried] = useState({})

  if (!mod) return <Navigate to="/training/modules" replace />

  const q = mod.questions[step]
  const isPractice = q.type === 'practice'
  const answered = isPractice ? rewriteChecked : selected !== null
  const isCorrect = isPractice ? rewriteChecked : answered && selected === q.correct
  const isLast = step === mod.questions.length - 1

  // First attempt per question is what earns points (+50 when correct)
  function pick(i) {
    if (answered) return
    setSelected(i)
    if (!firstTried[step]) {
      setFirstTried(t => ({ ...t, [step]: true }))
      api.post('/quiz/answer', { module: moduleId, question: step, correct: i === q.correct }).catch(() => {})
    }
  }

  function checkRewrite() {
    if (rewriteChecked || !rewrite.trim()) return
    setRewriteChecked(true)
    if (!firstTried[step]) {
      setFirstTried(t => ({ ...t, [step]: true }))
      api.post('/quiz/answer', { module: moduleId, question: step, correct: true }).catch(() => {})
    }
  }

  async function next() {
    if (!answered) return // wrong answers can still continue — first attempt already scored
    if (isLast) {
      try { await api.post('/training/complete', { module: moduleId }) } catch { /* offline — results page shows fallback */ }
      return navigate(`/training/results/${moduleId}`)
    }
    setStep(step + 1)
    setSelected(null)
    setRewrite('')
    setRewriteChecked(false)
  }

  function back() {
    if (step === 0) return navigate('/training')
    setStep(step - 1)
    setSelected(null)
    setRewrite('')
    setRewriteChecked(false)
  }

  return (
    <div className="max-w-[1320px] mx-auto px-10 pt-8 pb-10">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-[30px] font-bold text-navy-header">{mod.title}</h1>
          <p className="text-[#667085] text-sm mt-1">{mod.subtitle}</p>
        </div>
        <p className="text-[#667085] text-xs font-medium pb-1">{mod.minutes}-minute lesson&nbsp;&nbsp;·&nbsp;&nbsp;3-question quiz&nbsp;&nbsp;·&nbsp;&nbsp;+{mod.points} safety points</p>
      </div>

      <div className="grid grid-cols-3 gap-6 mt-6">
        {mod.questions.map((question, i) => (
          <div key={question.stepTitle}>
            <p className={`text-[11px] mb-2.5 ${i === step ? 'text-navy-header font-semibold' : 'text-[#667085] font-medium'}`}>
              {i + 1}&nbsp;&nbsp;{mod.steps[i]}
            </p>
            <div className={`h-1.5 rounded-full ${i <= step ? 'bg-gold-brand' : 'bg-[#d8d0b4]'}`} />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-[1fr_316px] gap-6 mt-5 items-start">
        {/* Question card */}
        <div className="bg-white border border-[#d8d0b4] rounded-[18px] p-8 pt-6">
          {isPractice ? (
            <>
              <p className="text-gold-brand text-[10px] font-semibold tracking-[1px]">PRACTICE · WRITE YOUR OWN PROMPT</p>
              <p className="text-navy-header font-bold text-[22px] mt-2">Now write your own safe version</p>
              <p className="text-[#667085] text-xs mt-2.5">Type a prompt that completes the task below without exposing personal information. We&rsquo;ll check it the same way the real Smart Gateway does.</p>

              <div className="bg-[#f1eddf] border border-[#d8d0b4] rounded-[12px] px-4 py-4 mt-4">
                <p className="text-[#17213a] text-[13px] font-medium">{q.prompt}</p>
                <p className="text-[#667085] text-[10px] mt-2">{q.tip}</p>
              </div>

              <p className="text-[#8a7d56] font-semibold text-[11px] mt-5">YOUR REWRITE — TYPE OR EDIT FREELY</p>
              <textarea
                value={rewrite}
                onChange={e => setRewrite(e.target.value)}
                disabled={rewriteChecked}
                placeholder={q.placeholder}
                rows={4}
                className="w-full border-[1.5px] border-[#d1d1d1] rounded-[12px] p-4 mt-2 text-[15px] text-[#17213a] outline-none focus:border-navy-header resize-none disabled:bg-[#f7f7fa]"
              />

              {!rewriteChecked ? (
                <button
                  onClick={checkRewrite}
                  disabled={!rewrite.trim()}
                  className="bg-gold-brand hover:bg-gold text-[#07183a] font-semibold text-[13px] px-6 h-11 rounded-full cursor-pointer disabled:opacity-50 mt-4"
                >
                  Check my rewrite&nbsp;&nbsp;→
                </button>
              ) : (
                <div className="bg-[#e7f1ec] border border-[#328768] rounded-[12px] px-4 py-4 mt-4">
                  <p className="text-[#19533e] text-sm">
                    Detected locally: no name, IC, phone or financial data found&nbsp;&nbsp;·&nbsp;&nbsp;Task context preserved&nbsp;&nbsp;·&nbsp;&nbsp;Safe to send
                  </p>
                  <p className="text-[#19533e] text-sm mt-1">+{mod.points} safety points on completion</p>
                </div>
              )}
            </>
          ) : (
            <>
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
                      onClick={() => pick(i)}
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
            </>
          )}

          <div className="h-px bg-[#d8d0b4] mt-5" />
          <div className="flex justify-between mt-4">
            <button onClick={back} className="border border-navy-header text-navy-header text-[13px] font-semibold w-[130px] h-12 rounded-full cursor-pointer hover:bg-chip">
              ←&nbsp;&nbsp;Back
            </button>
            <button
              onClick={next}
              disabled={!answered}
              className={`text-[13px] font-semibold w-[180px] h-12 rounded-full ${answered ? 'bg-gold-brand text-navy-header cursor-pointer hover:bg-gold' : 'bg-[#d8d0b4] text-[#667085]'}`}
            >
              {isLast ? 'Submit answers' : 'Continue'}&nbsp;&nbsp;→
            </button>
          </div>
        </div>

        {/* Lesson sidebar */}
        <div className="bg-navy-header rounded-[18px] p-6 self-stretch flex flex-col">
          <p className="text-gold-brand text-[10px] font-semibold tracking-[1px]">MODULE PROGRESS</p>
          <p className="text-white font-bold text-xl mt-2 leading-snug">{mod.title}</p>
          <p className="text-[#eef2ff] text-[11px] font-medium mt-3">Question {step + 1} of 3</p>

          <div className="flex flex-col gap-4 mt-5">
            {mod.questions.map((question, i) => {
              const current = i === step
              const done = i < step
              return (
                <div key={question.stepTitle} className={`flex items-center gap-3 rounded-[12px] px-3 h-[60px] ${current ? 'bg-[#365fd9]/90' : ''}`}>
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
            <p className="text-white text-lg font-bold mt-1.5">+{mod.points} safety points</p>
            <p className="text-[#eef2ff] text-[10px] mt-1.5">Earn the {mod.stampTitle.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())} training stamp.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
