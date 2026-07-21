// Training results — matches Figma frame "Training • Results"
// Live data: license progress reflects the points credited on completion.
// moduleId comes from the route so M1/M2/M3 all land on this same results page.
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../lib/api.js'
import { MODULES } from '../lib/trainingModules.js'

function ScoreRing({ correct, total }) {
  const r = 78
  const c = 2 * Math.PI * r
  const pct = Math.round((correct / total) * 100)
  return (
    <div className="relative w-[178px] h-[178px] shrink-0">
      <svg width="178" height="178" viewBox="0 0 178 178" className="-rotate-90">
        <circle cx="89" cy="89" r={r} fill="none" stroke="#f5f2e5" strokeWidth="14" />
        <circle cx="89" cy="89" r={r} fill="none" stroke="#d5a71f" strokeWidth="14" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - correct / total)} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <p className="text-navy font-bold text-[42px] leading-none">{correct}/{total}</p>
        <p className={`font-semibold text-base mt-1.5 ${pct === 100 ? 'text-green' : 'text-[#d97706]'}`}>{pct}%</p>
      </div>
    </div>
  )
}

function Stamp({ title }) {
  const [line1, line2] = title.split(' ').reduce(
    (lines, word) => {
      const i = lines[0].length <= lines[1].length ? 0 : 1
      lines[i] = lines[i] ? `${lines[i]} ${word}` : word
      return lines
    },
    ['', '']
  )
  return (
    <div className="relative w-[94px] h-[94px] shrink-0">
      <svg width="94" height="94" viewBox="0 0 94 94">
        <circle cx="47" cy="47" r="45" fill="none" stroke="#d5a71f" strokeWidth="2.5" strokeDasharray="6 4" />
        <circle cx="47" cy="47" r="36" fill="none" stroke="#d5a71f" strokeWidth="1.5" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <p className="text-gold font-bold text-xs leading-tight">{line1}<br />{line2}</p>
      </div>
    </div>
  )
}

export default function TrainingResults() {
  const { moduleId: moduleIdParam } = useParams()
  const moduleId = Number(moduleIdParam) || 1
  const mod = MODULES[moduleId] || MODULES[1]
  const questionLabels = mod.questions.map(q => q.stepTitle)

  const [profile, setProfile] = useState({ points: 1390, target: 2000 })
  const [results, setResults] = useState({ correct: 3, total: 3, pointsEarned: mod.points, answers: {} })

  useEffect(() => {
    api.get('/profile').then(setProfile).catch(() => {})
    api.get(`/quiz/results?module=${moduleId}`).then(r => { if (r.attempted > 0) setResults(r) }).catch(() => {})
  }, [moduleId])

  const toGo = profile.target - profile.points
  const pct = Math.round((profile.points / profile.target) * 100)
  const allCorrect = results.correct === results.total
  const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  const nextModule = MODULES[moduleId + 1]

  return (
    <div className="max-w-[1320px] mx-auto px-10 pt-8 pb-10">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[32px] font-bold text-navy">Training complete</h1>
          <p className="text-slate2 text-base mt-1">Your results are ready. Review your score, rewards and progress toward the next license level.</p>
        </div>
        <span className="bg-green-soft text-green text-xs font-semibold px-6 py-2 rounded-full mt-1.5">
          {allCorrect ? '✓ PASSED' : '✓ COMPLETED'}
        </span>
      </div>

      <div className="grid grid-cols-[1fr_416px] gap-6 mt-6 items-stretch">
        {/* Score card */}
        <div className="bg-card border border-sand rounded-[18px] p-7 pt-5">
          <p className="text-gold text-xs font-semibold">MODULE RESULT</p>
          <p className="text-navy font-bold text-2xl mt-2">{mod.title}</p>
          <p className="text-slate2 text-sm mt-1.5">Completed {today}</p>

          <div className="flex items-center gap-8 mt-6">
            <ScoreRing correct={results.correct} total={results.total} />
            <div>
              <p className="text-navy font-bold text-[22px]">{allCorrect ? 'Excellent work' : 'Module complete'}</p>
              <p className="text-ink text-base mt-2 max-w-[450px]">
                {allCorrect
                  ? 'You answered every question correctly and demonstrated safe handling of personal and customer data.'
                  : `You got ${results.correct} of ${results.total} right on the first try. Points are earned for first-attempt answers — retry lessons any time to sharpen your instincts.`}
              </p>
            </div>
          </div>

          <p className="text-slate2 text-xs font-semibold mt-8">QUESTION PROGRESS · FIRST ATTEMPT</p>
          <div className="flex flex-col gap-2.5 mt-3">
            {questionLabels.map((label, i) => {
              const ok = results.answers?.[i]?.correct !== false
              return (
                <div key={label} className={`flex items-center gap-3.5 rounded-[10px] px-2.5 h-[42px] ${i % 2 === 0 ? 'bg-[#edf2ff]' : 'bg-card'}`}>
                  <span className="w-[30px] h-[30px] rounded-full bg-navy text-white text-xs font-semibold flex items-center justify-center shrink-0">{i + 1}</span>
                  <p className="text-navy text-sm font-medium">{label}</p>
                  {ok ? (
                    <p className="ml-auto text-green text-[13px] font-semibold pr-2">✓ Correct</p>
                  ) : (
                    <p className="ml-auto text-[#d92d20] text-[13px] font-semibold pr-2">✕ First try missed</p>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Rewards card */}
        <div className="bg-navy rounded-[18px] p-6">
          <p className="text-gold text-xs font-semibold">REWARDS &amp; LICENSE PROGRESS</p>
          <p className="text-white font-bold text-[42px] mt-2 leading-none">+{results.pointsEarned}</p>
          <p className="text-white text-[15px] mt-2">safety miles earned · first-attempt answers</p>

          <div className="bg-[#132e66] rounded-[14px] p-5 mt-4 flex items-center gap-4">
            <Stamp title={mod.stampTitle} />
            <div>
              <p className="text-white font-semibold text-base">Training stamp earned</p>
              <p className="text-white text-sm mt-1.5">Added to your AI Passport<br />{today}</p>
            </div>
          </div>

          <p className="text-gold text-xs font-semibold mt-5">LICENSE PROGRESS</p>
          <p className="text-white font-bold text-xl mt-1.5">{profile.points.toLocaleString()} / {profile.target.toLocaleString()} miles</p>
          <div className="h-3 rounded-full bg-navy-track mt-3.5">
            <div className="h-3 rounded-full bg-gold transition-all duration-700" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-white text-sm mt-2.5">{toGo.toLocaleString()} miles to Level 3 · Ambassador</p>

          <div className="bg-[#132e66] rounded-[12px] px-3.5 py-2 mt-5">
            <p className="text-gold text-[11px] font-semibold">{nextModule ? `NEXT: ${nextModule.title.toUpperCase()}` : 'MORE MODULES COMING SOON'}</p>
            {nextModule && <p className="text-white text-sm mt-0.5">{nextModule.minutes}-minute lesson · +{nextModule.points} safety points</p>}
          </div>
        </div>
      </div>

      <div className="bg-[#edf2ff] rounded-[14px] px-5 py-3.5 mt-6">
        <p className="text-navy text-sm font-semibold">What you demonstrated</p>
        <p className="text-slate2 text-sm mt-1">{mod.steps.join(' · ')} — the safe-use habits this module builds</p>
      </div>

      <div className="flex gap-4 mt-6">
        <Link to="/training" className="border border-navy text-navy text-[15px] font-semibold w-[220px] h-12 rounded-full flex items-center justify-center hover:bg-chip">
          Back to Training
        </Link>
        <Link to="/license" className="bg-gold hover:bg-gold-dark text-navy text-[15px] font-semibold w-[260px] h-12 rounded-full flex items-center justify-center">
          View My License →
        </Link>
      </div>
    </div>
  )
}
