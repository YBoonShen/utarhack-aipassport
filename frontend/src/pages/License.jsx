// 01 Employee · My AI License — matches Figma frame "01 Employee • My AI License"
// Live data: profile (points, stamps, monthly stats) comes from the backend.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api.js'
import Leaderboard from '../components/Leaderboard.jsx'

const fallbackProfile = {
  name: 'Tan Jia Yin', dept: 'Engineering', licenseNo: 'AIP-2026-004173', issued: '02 Jan 2026',
  level: 2, levelName: 'Navigator', points: 1240, target: 2000, streakDays: 21,
  promptsProtected: 47, itemsMasked: 12, trainingCompleted: false,
  stamps: [
    { title: 'AI BASICS', score: 'PASSED · 92%', date: '04 JAN 2026', shape: 'circle', color: '#078b6c' },
    { title: 'DATA PRIVACY', score: 'PASSED · 100%', date: '11 JAN 2026', shape: 'square', color: '#d92d20' },
    { title: 'SAFE PROMPTS', score: 'PASSED · 87%', date: '25 JAN 2026', shape: 'circle', color: '#365fd9' },
  ],
}

const stampRotations = ['rotate-3', '-rotate-6', 'rotate-2', 'rotate-1', '-rotate-2']

const lockedStamps = [
  { title: ['PDPA &', 'COMPLIANCE'], shape: 'circle', rotate: '-rotate-2' },
  { title: ['HANDLING', 'CUSTOMER DATA'], shape: 'square', rotate: 'rotate-1' },
  { title: ['ADVANCED', 'AI ETHICS'], shape: 'circle', rotate: '-rotate-3' },
]

function InkStamp({ s }) {
  const round = s.shape === 'circle' ? 'rounded-full' : 'rounded-[8px]'
  const size = s.shape === 'circle' ? 'w-[154px] h-[154px]' : 'w-[154px] h-[132px]'
  return (
    <div className={`${s.rotate} ${size} border-[3px] ${round} flex items-center justify-center`} style={{ borderColor: s.color }}>
      <div
        className={`${s.shape === 'circle' ? 'w-[134px] h-[134px]' : 'w-[134px] h-[113px]'} border-[1.5px] ${round} flex flex-col items-center justify-center text-center`}
        style={{ borderColor: s.color, color: s.color }}
      >
        <p className="font-bold text-xs tracking-[0.96px]">{s.title}</p>
        <p className="font-medium text-[11px] mt-1.5">{s.score}</p>
        <p className="font-medium text-[10px] mt-1.5 tracking-[0.4px]">{s.date}</p>
      </div>
    </div>
  )
}

function LockedStamp({ s }) {
  const round = s.shape === 'circle' ? 'rounded-full' : 'rounded-[8px]'
  const size = s.shape === 'circle' ? 'w-[142px] h-[142px]' : 'w-[154px] h-[126px]'
  return (
    <div className={`${s.rotate} ${size} border-2 border-dashed border-[#d8d0b4] opacity-70 ${round} flex flex-col items-center justify-center text-center`}>
      {s.title.map(line => <p key={line} className="text-[#d8d0b4] font-medium text-[11px] leading-snug">{line}</p>)}
    </div>
  )
}

export default function License() {
  const [profile, setProfile] = useState(fallbackProfile)

  useEffect(() => {
    let alive = true
    const load = () => api.get('/profile').then(p => alive && setProfile(p)).catch(() => {})
    load()
    const t = setInterval(load, 5000)
    return () => { alive = false; clearInterval(t) }
  }, [])

  const pointsToGo = profile.target - profile.points
  const pct = Math.round((profile.points / profile.target) * 100)
  const identityFields = [
    ['NAME', profile.name],
    ['DEPARTMENT', profile.dept],
    ['LICENSE NO.', profile.licenseNo],
    ['DATE ISSUED', profile.issued],
    ['LICENSE CLASS', `Level ${profile.level} · ${profile.levelName}`],
    ['SAFETY POINTS', `${profile.points.toLocaleString()} pts`],
  ]
  const earnedStamps = profile.stamps.map((s, i) => ({ ...s, rotate: stampRotations[i % stampRotations.length] }))

  return (
    <div className="max-w-[1440px] mx-auto px-10 py-8">
      <h1 className="text-[30px] font-bold text-navy-header">My AI License</h1>
      <p className="text-[#667085] text-sm mt-1.5 mb-6">Your access, training and safe-use progress — in one trusted record.</p>

      <div className="grid grid-cols-[1fr_436px] gap-6 items-stretch">
        {/* Digital AI Passport */}
        <div className="bg-white border-2 border-navy-header rounded-[18px] overflow-hidden flex flex-col">
          <div className="bg-navy-header h-14 flex items-center justify-between px-6 shrink-0">
            <p className="text-gold-brand font-bold text-sm tracking-[1.4px]">DIGITAL AI LICENSE · EMPLOYEE PASSPORT</p>
            <p className="text-white font-semibold text-[11px]">MYS&nbsp;&nbsp;·&nbsp;&nbsp;AIP</p>
          </div>
          <div className="flex gap-7 px-7 py-6 flex-1">
            <div className="bg-[#f1eddf] border border-gold-brand rounded-[14px] w-[170px] shrink-0 flex flex-col items-center pt-12 pb-6">
              <div className="w-[88px] h-[88px] rounded-full bg-[#d8d0b4] flex items-center justify-center">
                <p className="text-navy-header font-bold text-2xl">JY</p>
              </div>
              <p className="text-navy-header font-semibold text-sm mt-2.5">TAN JIA YIN</p>
              <p className="text-[#667085] font-medium text-[10px] tracking-[0.8px] mt-1.5">EMPLOYEE · E-217</p>
            </div>
            <div className="flex-1 pt-2">
              <div className="grid grid-cols-2 gap-x-14 gap-y-4 max-w-[606px]">
                {identityFields.map(([label, value]) => (
                  <div key={label}>
                    <p className="text-[#8a7d56] font-semibold text-[10px] tracking-[1px]">{label}</p>
                    <p className="text-navy-header font-semibold text-base mt-0.5">{value}</p>
                  </div>
                ))}
              </div>
              <div className="inline-block bg-[#eef2ff] rounded-[8px] px-3 py-1.5 mt-5">
                <p className="text-[#365fd9] font-medium text-xs">✓&nbsp;&nbsp;Unlocked: ChatGPT, Gemini · Internal non-personal data</p>
              </div>
            </div>
          </div>
          <div className="bg-[#fcfaf3] border-t border-[#e5dec7] px-7 py-4 shrink-0">
            <div className="flex justify-between">
              <p className="text-[#8a7d56] font-semibold text-[10px] tracking-wide">PROGRESS TO LEVEL 3 · AMBASSADOR</p>
              <p className="text-[#667085] font-medium text-[11px]">{pointsToGo.toLocaleString()} points to go</p>
            </div>
            <div className="h-2.5 rounded-full bg-[#e5dec7] mt-2.5">
              <div className="h-2.5 rounded-full bg-gold-brand transition-all duration-700" style={{ width: `${pct}%` }} />
            </div>
            <div className="flex justify-between mt-2">
              <p className="text-navy-header font-medium text-[11px]">Level {profile.level} · {profile.levelName}</p>
              <p className="text-navy-header font-semibold text-xs">{profile.points.toLocaleString()} / {profile.target.toLocaleString()} safety points</p>
            </div>
          </div>
        </div>

        {/* Side rail */}
        <div className="flex flex-col gap-4">
          <div className="bg-navy-header rounded-[16px] p-6">
            <p className="text-gold-brand font-bold text-[11px] tracking-[1.32px]">THIS MONTH</p>
            <div className="flex gap-16 mt-3">
              <div>
                <p className="text-white font-bold text-[30px]">{profile.promptsProtected}</p>
                <p className="text-[#cbd5e1] text-xs mt-1">prompts protected</p>
              </div>
              <div>
                <p className="text-white font-bold text-[30px]">{profile.itemsMasked}</p>
                <p className="text-[#cbd5e1] text-xs mt-1">items masked</p>
              </div>
            </div>
            <div className="inline-block bg-[#173976] rounded-[10px] px-3 py-2 mt-4">
              <p className="text-[#a7f3d0] font-medium text-xs">✓&nbsp;&nbsp;No unsafe prompts for {profile.streakDays} days</p>
            </div>
          </div>
          <div className="bg-white border border-[#d8d0b4] rounded-[16px] p-6 flex-1 flex flex-col">
            {profile.trainingCompleted ? (
              <>
                <p className="text-[#078b6c] font-bold text-[11px] tracking-[1.1px]">✓ TRAINING COMPLETE · +150 POINTS EARNED</p>
                <p className="text-navy-header font-semibold text-[19px] mt-2">Spotting personal data in prompts</p>
                <p className="text-[#667085] text-[13px] mt-2">Next: Safe AI Tool Selection&nbsp;&nbsp;·&nbsp;&nbsp;available 18 Jul</p>
                <div className="flex-1" />
                <Link to="/training" className="border border-navy-header text-navy-header font-semibold text-sm w-[188px] h-12 rounded-full flex items-center justify-center hover:bg-chip">
                  View training
                </Link>
              </>
            ) : (
              <>
                <p className="text-[#8a7d56] font-bold text-[11px] tracking-[1.1px]">NEXT TRAINING · +150 POINTS</p>
                <p className="text-navy-header font-semibold text-[19px] mt-2">Spotting personal data in prompts</p>
                <p className="text-[#667085] text-[13px] mt-2">5-minute lesson&nbsp;&nbsp;·&nbsp;&nbsp;3-question quiz</p>
                <div className="flex-1" />
                <Link to="/training/quiz" className="bg-gold-brand hover:bg-gold text-navy-header font-semibold text-sm w-[188px] h-12 rounded-full flex items-center justify-center">
                  Start lesson&nbsp;&nbsp;→
                </Link>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Training Stamps */}
      <div className="flex items-end justify-between mt-9">
        <div>
          <h2 className="text-[22px] font-bold text-navy-header">Training Stamps</h2>
          <p className="text-[#667085] text-xs mt-1">Complete a module to add a verified stamp to your passport.</p>
        </div>
        <Link to="/training" className="text-[#365fd9] font-semibold text-xs">View training&nbsp;&nbsp;→</Link>
      </div>
      <div className="bg-white border border-[#d8d0b4] rounded-[16px] mt-4 px-8 py-8 flex items-center justify-between flex-wrap gap-6">
        {earnedStamps.map(s => <InkStamp key={s.title} s={s} />)}
        {lockedStamps.map(s => <LockedStamp key={s.title[0]} s={s} />)}
      </div>

      {/* Leaderboard — proposal §5.1 (levels, points and leaderboard) */}
      <div className="grid grid-cols-2 gap-5 mt-6">
        <Leaderboard compact />
        <div />
      </div>
    </div>
  )
}
