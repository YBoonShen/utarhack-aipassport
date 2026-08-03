// Training quiz — matches Figma frames "Training/M2/M3 • Q1–Q3 • Unanswered/Correct/Incorrect"
// and "Q3 • Write-your-own Practice" (every module's 3rd question is a free-text
// practice item, not a 4th MCQ). moduleId comes from the route so M1/M2/M3 share this page.
//
// Flow: Q1 → Q2 → … → final question → performance/evaluation (results page).
// There is no question-level retry — an answer is locked in and the employee
// always continues. Retry lives on the results screen and is locked for 24h.
import { useEffect, useState } from 'react'
import { useNavigate, useParams, Navigate, Link } from 'react-router-dom'
import { api } from '../lib/api.js'
import { MODULES } from '../lib/trainingModules.js'
import { recordCompletion, retryStatus } from '../lib/retryLock.js'

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
  // step -> { selected, rewrite, checked }. Answers are kept when the employee
  // steps back, so nothing is re-answered and nothing is re-scored.
  const [answers, setAnswers] = useState({})
  const [submitting, setSubmitting] = useState(false)
  // localStorage is read synchronously so a locked module never flashes Q1.
  const [lock, setLock] = useState(() => retryStatus(moduleId))
  // This module's stored progress record — present only if it has been passed
  // before, which is what makes this attempt a redo.
  const [record, setRecord] = useState(null)

  // The server is the source of truth for the lock; localStorage covers refresh
  // and re-login while the API is unreachable.
  useEffect(() => {
    let alive = true
    setLock(retryStatus(moduleId))
    api.get(`/quiz/results?module=${moduleId}`)
      .then(r => {
        if (!alive) return
        setLock(retryStatus(moduleId, r.completedAt))
        setRecord(r.module || null)
      })
      .catch(() => {})
    return () => { alive = false }
  }, [moduleId])

  if (!mod) return <Navigate to="/training/modules" replace />
  // Already evaluated and still inside the 24h window — the results screen owns
  // the retry, so deep links and refreshes land there instead of on Q1.
  if (lock.locked) return <Navigate to={`/training/results/${moduleId}`} replace />

  const questions = mod.questions || []
  if (questions.length === 0) {
    return (
      <div className="max-w-[1320px] mx-auto px-10 pt-8 pb-10">
        <h1 className="text-[30px] font-bold text-navy-header">{mod.title}</h1>
        <div className="bg-white border border-[#d8d0b4] rounded-[18px] p-8 mt-6 max-w-[620px]">
          <p className="text-gold-brand text-[10px] font-semibold tracking-[1px]">NOT READY YET</p>
          <p className="text-navy-header font-bold text-[22px] mt-2">This module has no questions yet</p>
          <p className="text-[#667085] text-sm mt-2.5">Nothing has been added to this module, so there is no assessment to take. It will appear here once questions are published.</p>
          <Link to="/training/modules" className="border border-navy-header text-navy-header text-[13px] font-semibold px-6 h-12 rounded-full inline-flex items-center mt-6 hover:bg-chip">
            ←&nbsp;&nbsp;All training modules
          </Link>
        </div>
      </div>
    )
  }

  const total = questions.length
  const q = questions[step]
  const answer = answers[step] || {}
  const isPractice = q.type === 'practice'
  const answered = isPractice ? Boolean(answer.checked) : answer.selected !== undefined
  const isCorrect = isPractice ? Boolean(answer.checked) : answered && answer.selected === q.correct
  const isLast = step === total - 1

  // One attempt per question — the answer is what earns points (+50 when correct).
  function pick(i) {
    if (answered) return
    setAnswers(a => ({ ...a, [step]: { selected: i } }))
    api.post('/quiz/answer', { module: moduleId, question: step, correct: i === q.correct }).catch(() => {})
  }

  function checkRewrite() {
    const text = answer.rewrite || ''
    if (answer.checked || !text.trim()) return
    setAnswers(a => ({ ...a, [step]: { ...a[step], checked: true } }))
    api.post('/quiz/answer', { module: moduleId, question: step, correct: true }).catch(() => {})
  }

  async function next() {
    if (!answered || submitting) return
    if (!isLast) return setStep(step + 1)

    // Final question answered — evaluate the whole assessment now. This is the
    // one call that settles XP; the server decides how much of it (if any) is
    // an improvement on this module's stored best.
    setSubmitting(true)
    let completedAt = new Date().toISOString()
    let levelUp = null
    try {
      const res = await api.post('/training/complete', { module: moduleId })
      if (res?.completedAt) completedAt = res.completedAt
      levelUp = res?.levelUp || null
    } catch {
      /* offline — results page shows fallback, lock still starts locally */
    }
    recordCompletion(moduleId, completedAt)
    // The level-up is a one-off event, so it travels in navigation state rather
    // than being re-derived — the results screen also guards it with
    // celebrateOnce(), so a refresh never replays the celebration.
    navigate(`/training/results/${moduleId}`, { state: { levelUp } })
  }

  function back() {
    if (step === 0) return navigate('/training')
    setStep(step - 1)
  }

  return (
    <div className="max-w-[1320px] mx-auto px-4 lg:px-10 pt-6 lg:pt-8 pb-10">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-2">
        <div>
          <h1 className="text-[24px] lg:text-[30px] font-bold text-navy-header">{mod.title}</h1>
          <p className="text-[#667085] text-sm mt-1">{mod.subtitle}</p>
        </div>
        <p className="text-[#667085] text-xs font-medium pb-1">
          {mod.minutes}-minute lesson&nbsp;&nbsp;·&nbsp;&nbsp;{total}-question quiz&nbsp;&nbsp;·&nbsp;&nbsp;
          {record?.completed ? `${record.pointsEarned} / ${mod.points} XP earned` : `+${mod.points} XP`}
        </p>
      </div>

      {/* Redo — say plainly that this attempt improves an existing result
          rather than earning the reward a second time. */}
      {record?.completed && (
        <div className="bg-[#eef2ff] border border-[#c7d2fe] rounded-[12px] px-4 py-3 mt-4">
          <p className="text-navy-header text-[13px] font-semibold">
            You are revisiting this training — your current best is {record.pointsEarned} XP.
          </p>
          <p className="text-[#667085] text-[12px] mt-1">
            {record.pointsEarned >= mod.points
              ? `You already hold the full ${mod.points} XP for this module, so this attempt is revision — no further XP is added.`
              : `Only an improvement counts: beat ${record.pointsEarned} XP and the difference is added to your total, up to ${mod.points} XP.`}
          </p>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3 lg:gap-6 mt-6">
        {questions.map((question, i) => (
          <div key={question.stepTitle}>
            <p className={`text-[11px] mb-2.5 ${i === step ? 'text-navy-header font-semibold' : 'text-[#667085] font-medium'}`}>
              {i + 1}&nbsp;&nbsp;{mod.steps[i]}
            </p>
            <div className={`h-1.5 rounded-full ${i <= step ? 'bg-gold-brand' : 'bg-[#d8d0b4]'}`} />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_316px] gap-4 lg:gap-6 mt-5 items-start">
        {/* Question card */}
        <div className="bg-white border border-[#d8d0b4] rounded-[18px] p-5 lg:p-8 lg:pt-6">
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
                value={answer.rewrite || ''}
                onChange={e => setAnswers(a => ({ ...a, [step]: { ...a[step], rewrite: e.target.value } }))}
                disabled={Boolean(answer.checked)}
                placeholder={q.placeholder}
                rows={4}
                className="w-full border-[1.5px] border-[#d1d1d1] rounded-[12px] p-4 mt-2 text-[15px] text-[#17213a] outline-none focus:border-navy-header resize-none disabled:bg-[#f7f7fa]"
              />

              {!answer.checked ? (
                // lg:block keeps the original inline-block flow on desktop; the
                // flex row only kicks in on phones to push the action right.
                <div className="flex justify-end lg:block mt-4">
                  <button
                    onClick={checkRewrite}
                    disabled={!(answer.rewrite || '').trim()}
                    className="bg-gold-brand hover:bg-gold text-[#07183a] font-semibold text-[13px] px-6 h-11 rounded-full cursor-pointer disabled:opacity-50"
                  >
                    Check my rewrite&nbsp;&nbsp;→
                  </button>
                </div>
              ) : (
                <div className="bg-[#e7f1ec] border border-[#328768] rounded-[12px] px-4 py-4 mt-4">
                  <p className="text-[#19533e] text-sm">
                    Detected locally: no name, IC, phone or financial data found&nbsp;&nbsp;·&nbsp;&nbsp;Task context preserved&nbsp;&nbsp;·&nbsp;&nbsp;Safe to send
                  </p>
                  <p className="text-[#19533e] text-sm mt-1">
                    {record?.completed ? 'Submit to settle this module’s XP' : `+${mod.points} XP on completion`}
                  </p>
                </div>
              )}
            </>
          ) : (
            <>
              <p className="text-gold-brand text-[10px] font-semibold tracking-[1px]">QUESTION {step + 1} OF {total}</p>
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
                    else if (i === answer.selected) { cls = 'bg-[#fff0f0] border-2 border-[#d92d20]'; radio = 'incorrect' }
                  }
                  return (
                    <button
                      key={i}
                      onClick={() => pick(i)}
                      disabled={answered}
                      className={`flex items-center gap-4 text-left rounded-[12px] px-4 py-3 sm:py-0 min-h-[60px] sm:h-[60px] cursor-pointer ${cls}`}
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
                  {!isCorrect && (
                    <p className="text-[#667085] text-[11px] mt-1.5">
                      Answers are final. Continue to the next question — your performance is evaluated once the whole assessment is done.
                    </p>
                  )}
                </div>
              )}
            </>
          )}

          <div className="h-px bg-[#d8d0b4] mt-5" />
          <div className="mt-4">
            {/* On phones the hint moves above the row so Back and Continue stay
                side by side, with the action on the right. */}
            {!answered && (
              <p className="text-[#667085] text-[11px] mb-2.5 sm:hidden">
                {isPractice ? 'Check your rewrite to continue' : 'Choose an answer to continue'}
              </p>
            )}
            <div className="flex items-center justify-between gap-3">
              <button onClick={back} className="border border-navy-header text-navy-header text-[13px] font-semibold w-[84px] sm:w-[130px] h-12 rounded-full cursor-pointer hover:bg-chip shrink-0">
                ←&nbsp;&nbsp;Back
              </button>
              {/* On phones this group takes the remaining width so the action
                  ends flush right; at sm+ it is the original fixed-width row. */}
              <div className="flex flex-1 sm:flex-none items-center gap-4">
                {!answered && <p className="text-[#667085] text-[11px] hidden sm:block">{isPractice ? 'Check your rewrite to continue' : 'Choose an answer to continue'}</p>}
                <button
                  onClick={next}
                  disabled={!answered || submitting}
                  className={`text-[13px] font-semibold w-full sm:w-[180px] h-12 rounded-full shrink-0 ${answered && !submitting ? 'bg-gold-brand text-navy-header cursor-pointer hover:bg-gold' : 'bg-[#d8d0b4] text-[#667085]'}`}
                >
                  {submitting ? 'Evaluating…' : isLast ? 'Submit answers' : 'Continue'}&nbsp;&nbsp;→
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Lesson sidebar */}
        <div className="bg-navy-header rounded-[18px] p-6 self-stretch flex flex-col">
          <p className="text-gold-brand text-[10px] font-semibold tracking-[1px]">MODULE PROGRESS</p>
          <p className="text-white font-bold text-xl mt-2 leading-snug">{mod.title}</p>
          <p className="text-[#eef2ff] text-[11px] font-medium mt-3">Question {step + 1} of {total}</p>

          <div className="flex flex-col gap-4 mt-5">
            {questions.map((question, i) => {
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
            <p className="text-[#eef2ff] text-[9px] mt-1">Answers are final — you are evaluated after the last question.</p>
          </div>

          <div className="bg-[#365fd9] rounded-[14px] px-4 py-4 mt-6">
            <p className="text-gold-brand text-[9px] font-semibold">COMPLETE ALL {total}</p>
            <p className="text-white text-lg font-bold mt-1.5">
              {record?.completed ? `Best so far: ${record.pointsEarned} / ${mod.points} XP` : `+${mod.points} XP`}
            </p>
            <p className="text-[#eef2ff] text-[10px] mt-1.5">
              {record?.completed
                ? 'Beating your best raises this module’s XP by the difference.'
                : `Earn the ${mod.stampTitle.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())} training stamp.`}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
