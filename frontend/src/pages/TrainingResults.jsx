// Training results — matches Figma frame "Training • Results"
// Live data: license progress reflects the +150 points credited on completion.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api.js'

const questionResults = [
  { n: 1, label: 'Recognising direct identifiers', highlight: true },
  { n: 2, label: 'Choosing the safest prompt', highlight: false },
  { n: 3, label: 'Protecting customer data', highlight: true },
]

function ScoreRing() {
  const r = 78
  const c = 2 * Math.PI * r
  return (
    <div className="relative w-[178px] h-[178px] shrink-0">
      <svg width="178" height="178" viewBox="0 0 178 178" className="-rotate-90">
        <circle cx="89" cy="89" r={r} fill="none" stroke="#f5f2e5" strokeWidth="14" />
        <circle cx="89" cy="89" r={r} fill="none" stroke="#d5a71f" strokeWidth="14" strokeLinecap="round" strokeDasharray={c} strokeDashoffset="0" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <p className="text-navy font-bold text-[42px] leading-none">3/3</p>
        <p className="text-green font-semibold text-base mt-1.5">100%</p>
      </div>
    </div>
  )
}

function Stamp() {
  return (
    <div className="relative w-[94px] h-[94px] shrink-0">
      <svg width="94" height="94" viewBox="0 0 94 94">
        <circle cx="47" cy="47" r="45" fill="none" stroke="#d5a71f" strokeWidth="2.5" strokeDasharray="6 4" />
        <circle cx="47" cy="47" r="36" fill="none" stroke="#d5a71f" strokeWidth="1.5" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <p className="text-gold font-bold text-xs leading-tight">SAFE<br />PROMPTS</p>
      </div>
    </div>
  )
}

export default function TrainingResults() {
  const [profile, setProfile] = useState({ points: 1390, target: 2000 })

  useEffect(() => {
    api.get('/profile').then(setProfile).catch(() => {})
  }, [])

  const toGo = profile.target - profile.points
  const pct = Math.round((profile.points / profile.target) * 100)
  const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })

  return (
    <div className="max-w-[1320px] mx-auto px-10 pt-8 pb-10">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[32px] font-bold text-navy">Training complete</h1>
          <p className="text-slate2 text-base mt-1">Your results are ready. Review your score, rewards and progress toward the next license level.</p>
        </div>
        <span className="bg-green-soft text-green text-xs font-semibold px-6 py-2 rounded-full mt-1.5">✓ PASSED</span>
      </div>

      <div className="grid grid-cols-[1fr_416px] gap-6 mt-6 items-stretch">
        {/* Score card */}
        <div className="bg-card border border-sand rounded-[18px] p-7 pt-5">
          <p className="text-gold text-xs font-semibold">MODULE RESULT</p>
          <p className="text-navy font-bold text-2xl mt-2">Spotting Personal Data in Prompts</p>
          <p className="text-slate2 text-sm mt-1.5">Completed {today}</p>

          <div className="flex items-center gap-8 mt-6">
            <ScoreRing />
            <div>
              <p className="text-navy font-bold text-[22px]">Excellent work</p>
              <p className="text-ink text-base mt-2 max-w-[450px]">
                You answered every question correctly and demonstrated safe handling of personal and customer data.
              </p>
            </div>
          </div>

          <p className="text-slate2 text-xs font-semibold mt-8">QUESTION PROGRESS</p>
          <div className="flex flex-col gap-2.5 mt-3">
            {questionResults.map(qr => (
              <div key={qr.n} className={`flex items-center gap-3.5 rounded-[10px] px-2.5 h-[42px] ${qr.highlight ? 'bg-[#edf2ff]' : 'bg-card'}`}>
                <span className="w-[30px] h-[30px] rounded-full bg-navy text-white text-xs font-semibold flex items-center justify-center shrink-0">{qr.n}</span>
                <p className="text-navy text-sm font-medium">{qr.label}</p>
                <p className="ml-auto text-green text-[13px] font-semibold pr-2">✓ Correct</p>
              </div>
            ))}
          </div>
        </div>

        {/* Rewards card */}
        <div className="bg-navy rounded-[18px] p-6">
          <p className="text-gold text-xs font-semibold">REWARDS &amp; LICENSE PROGRESS</p>
          <p className="text-white font-bold text-[42px] mt-2 leading-none">+150</p>
          <p className="text-white text-[15px] mt-2">safety miles earned</p>

          <div className="bg-[#132e66] rounded-[14px] p-5 mt-4 flex items-center gap-4">
            <Stamp />
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
            <p className="text-gold text-[11px] font-semibold">NEXT: SAFE AI TOOL SELECTION</p>
            <p className="text-white text-sm mt-0.5">Available 18 Jul 2026</p>
          </div>
        </div>
      </div>

      <div className="bg-[#edf2ff] rounded-[14px] px-5 py-3.5 mt-6">
        <p className="text-navy text-sm font-semibold">What you demonstrated</p>
        <p className="text-slate2 text-sm mt-1">Identify sensitive data · choose a safe prompt · use masking before sending information to an AI tool</p>
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
