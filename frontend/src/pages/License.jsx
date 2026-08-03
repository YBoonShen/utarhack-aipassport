// 01 Employee · My AI License — matches Figma frame "01 Employee • My AI License"
// Live data: profile (points, stamps, monthly stats) comes from the backend.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api.js'
import { MODULES, MODULE_LIST } from '../lib/trainingModules.js'
import { retryStatus } from '../lib/retryLock.js'
import { levelState, barXP, nextLevelLabel } from '../lib/levels.js'

// Stamp title -> module id, used for any stamp that doesn't carry a moduleId of
// its own, so every stamp's "View training" still opens a real module at Q1.
const STAMP_MODULE = {
  ...Object.fromEntries(MODULE_LIST.map(m => [m.stampTitle, m.id])),
  // Legacy passport stamps predate the current module library — each maps to
  // the closest module that still exists.
  'DATA PRIVACY': 1,
  'SAFE PROMPTS': 2,
  'AI BASICS': 3,
}

function stampModuleId(s) {
  return s.moduleId ?? STAMP_MODULE[s.title] ?? null
}

const fallbackProfile = {
  name: 'Tan Jia Yin', dept: 'Engineering', licenseNo: 'AIP-2026-004173', issued: '02 Jan 2026',
  level: 2, levelName: 'Navigator', points: 1240, target: 2000, streakDays: 21,
  promptsProtected: 47, itemsMasked: 12, trainingCompleted: false, moduleCompletions: {}, trainingProgress: {},
  stamps: [
    { title: 'AI BASICS', moduleId: 3, score: 'PASSED · 100%', date: '04 JAN 2026', shape: 'circle', color: '#078b6c' },
    { title: 'DATA PRIVACY', moduleId: 1, score: 'PASSED · 100%', date: '11 JAN 2026', shape: 'square', color: '#d92d20' },
    { title: 'SAFE PROMPTS', moduleId: 2, score: 'PASSED · 92%', date: '25 JAN 2026', shape: 'circle', color: '#365fd9' },
  ],
}

const stampRotations = ['rotate-3', '-rotate-6', 'rotate-2', 'rotate-1', '-rotate-2']

const lockedStamps = [
  { title: ['PDPA &', 'COMPLIANCE'], shape: 'circle', rotate: '-rotate-2' },
  { title: ['HANDLING', 'CUSTOMER DATA'], shape: 'square', rotate: 'rotate-1' },
  { title: ['ADVANCED', 'AI ETHICS'], shape: 'circle', rotate: '-rotate-3' },
]

// Passport-style seal — matches Figma "Training Stamp" (double ink ring with
// TRAINING VERIFIED · title · result · date · AI PASSPORT · OFFICIAL).
function InkStamp({ s, onClick }) {
  const round = s.shape === 'circle' ? 'rounded-full' : 'rounded-[12px]'
  const outer = s.shape === 'circle' ? 'w-[180px] h-[180px]' : 'w-[180px] h-[150px]'
  const inner = s.shape === 'circle' ? 'w-[154px] h-[154px]' : 'w-[154px] h-[124px]'
  return (
    <button
      onClick={onClick}
      className={`${s.rotate} ${outer} border-[2.5px] ${round} flex items-center justify-center cursor-pointer hover:scale-105 transition-transform shrink-0`}
      style={{ borderColor: s.color }}
    >
      <div
        className={`${inner} border-[1.5px] ${round} flex flex-col items-center justify-center text-center px-2`}
        style={{ borderColor: s.color, color: s.color }}
      >
        <p className="font-semibold text-[8px] tracking-[0.8px]">TRAINING VERIFIED</p>
        <p className="font-bold text-[16px] tracking-[1px] mt-1.5">{s.title}</p>
        <p className="font-semibold text-[12px] mt-1.5">{s.score}</p>
        <p className="font-medium text-[11px] tracking-[0.5px] mt-1">{s.date}</p>
        <p className="font-semibold text-[8px] tracking-[0.6px] mt-1.5">AI PASSPORT · OFFICIAL</p>
      </div>
    </button>
  )
}

// Matches Figma "Active Overlay / Stamp detail popover" (2nd/3rd stamp variants)
// "View training" opens this stamp's own module at Question 1 — never a shared
// default — unless that module's 24h retry lock is still running.
function StampPopover({ s, completions, progress, onClose }) {
  const moduleId = stampModuleId(s)
  const mod = moduleId ? MODULES[moduleId] : null
  const hasQuestions = Boolean(mod?.questions?.length)
  const lock = retryStatus(moduleId, completions?.[moduleId])
  const record = progress?.[moduleId] || null
  return (
    <div className="fixed inset-0 bg-navy-dark/40 flex items-center justify-center p-4 sm:p-6 z-50" onClick={onClose}>
      <div
        className="bg-white border-[1.5px] rounded-[20px] shadow-[0px_10px_30px_rgba(0,0,0,0.22)] w-full max-w-[480px] p-5 sm:p-7 max-h-[90vh] overflow-y-auto"
        style={{ borderColor: s.color }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: `${s.color}1a`, border: `2px solid ${s.color}` }}>
            <span className="font-bold text-2xl" style={{ color: s.color }}>✓</span>
          </div>
          <div>
            <p className="font-semibold text-[11px]" style={{ color: s.color }}>TRAINING STAMP · COMPLETED</p>
            <p className="text-navy-header font-bold text-xl mt-0.5">{s.title}</p>
          </div>
        </div>
        <p className="text-[#667085] text-sm mt-4">{s.score.replace('PASSED · ', 'Passed ')}&nbsp;&nbsp;·&nbsp;&nbsp;Completed {s.date}</p>
        <p className="text-gold-brand font-medium text-sm mt-2">
          {record
            ? `${record.pointsEarned} of ${record.modulePoints} XP earned  ·  best result counts`
            : 'Safety points earned  ·  Added to ongoing safety score'}
        </p>
        <p className="text-[#667085] text-[13.5px] mt-3">
          {hasQuestions
            ? lock.locked
              ? `Retaking ${mod.title} unlocks in ${lock.remainingLabel} — available ${lock.availableLabel}.`
              : `Opens ${mod.title} at Question 1.`
            : 'This module is not available yet — browse the full training list instead.'}
        </p>
        {record && record.pointsEarned >= record.modulePoints && (
          <p className="text-[#667085] text-[12px] mt-1.5">
            You already hold the full {record.modulePoints} XP for this module — retaking it is revision, not extra XP.
          </p>
        )}
        <div className="flex flex-wrap gap-3 mt-6">
          {hasQuestions && lock.locked ? (
            <Link to={`/training/results/${moduleId}`} className="bg-chip border border-navy-header/25 text-[#667085] font-semibold text-sm px-6 h-12 rounded-full inline-flex items-center justify-center">
              Locked · {lock.remainingLabel}
            </Link>
          ) : hasQuestions ? (
            <Link to={`/training/quiz/${moduleId}`} className="bg-gold-brand hover:bg-gold text-navy-header font-semibold text-sm px-6 h-12 rounded-full inline-flex items-center justify-center">
              View training →
            </Link>
          ) : (
            <Link to="/training/modules" className="bg-gold-brand hover:bg-gold text-navy-header font-semibold text-sm px-6 h-12 rounded-full inline-flex items-center justify-center">
              View training →
            </Link>
          )}
          <button onClick={onClose} className="bg-[#fffefa] border-[1.5px] border-navy-header text-navy-header font-semibold text-sm px-6 h-12 rounded-full cursor-pointer">
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

function LockedStamp({ s }) {
  const round = s.shape === 'circle' ? 'rounded-full' : 'rounded-[12px]'
  const size = s.shape === 'circle' ? 'w-[180px] h-[180px]' : 'w-[180px] h-[150px]'
  return (
    <div className={`${s.rotate} ${size} border-2 border-dashed border-[#d8d0b4] opacity-70 ${round} flex flex-col items-center justify-center text-center shrink-0`}>
      {s.title.map(line => <p key={line} className="text-[#c2b59a] font-semibold text-[13px] tracking-[0.5px] leading-snug">{line}</p>)}
    </div>
  )
}

export default function License() {
  const [profile, setProfile] = useState(fallbackProfile)
  const [openStamp, setOpenStamp] = useState(null)

  useEffect(() => {
    let alive = true
    const load = () => api.get('/profile').then(p => alive && setProfile(p)).catch(() => {})
    load()
    const t = setInterval(load, 5000)
    return () => { alive = false; clearInterval(t) }
  }, [])

  // One level calculation for the whole card — band, bar and labels all come
  // from lib/levels.js, so the passport can never disagree with the backend.
  const lvl = levelState(profile)
  const identityFields = [
    ['NAME', profile.name],
    ['DEPARTMENT', profile.dept],
    ['LICENSE NO.', profile.licenseNo],
    ['DATE ISSUED', profile.issued],
    ['LICENSE CLASS', `Level ${lvl.level} · ${lvl.levelName}`],
    ['TOTAL XP', `${lvl.totalXP.toLocaleString()} XP`],
  ]
  const earnedStamps = profile.stamps.map((s, i) => ({ ...s, rotate: stampRotations[i % stampRotations.length] }))

  return (
    <div className="max-w-[1440px] mx-auto px-4 lg:px-10 py-6 lg:py-8">
      <h1 className="text-[26px] lg:text-[30px] font-bold text-navy-header">My AI License</h1>
      <p className="text-[#667085] text-sm mt-1.5 mb-6">Your access, training and safe-use progress — in one trusted record.</p>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_436px] gap-4 lg:gap-6 items-stretch">
        {/* Digital AI Passport */}
        <div className="bg-white border-2 border-navy-header rounded-[18px] overflow-hidden flex flex-col">
          <div className="bg-navy-header min-h-14 sm:h-14 flex items-center justify-between gap-3 px-4 sm:px-6 py-2 sm:py-0 shrink-0">
            <p className="text-gold-brand font-bold text-[11px] sm:text-sm tracking-[1.4px]">DIGITAL AI LICENSE · EMPLOYEE PASSPORT</p>
            <p className="text-white font-semibold text-[11px] shrink-0">MYS&nbsp;&nbsp;·&nbsp;&nbsp;AIP</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-6 sm:gap-7 px-4 sm:px-7 py-6 flex-1">
            <div className="bg-[#f1eddf] border border-gold-brand rounded-[14px] w-[170px] shrink-0 mx-auto sm:mx-0 flex flex-col items-center pt-12 pb-6">
              <div className="w-[88px] h-[88px] rounded-full bg-[#d8d0b4] flex items-center justify-center">
                <p className="text-navy-header font-bold text-2xl">JY</p>
              </div>
              <p className="text-navy-header font-semibold text-sm mt-2.5">TAN JIA YIN</p>
              <p className="text-[#667085] font-medium text-[10px] tracking-[0.8px] mt-1.5">EMPLOYEE · E-217</p>
            </div>
            <div className="flex-1 min-w-0 pt-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 lg:gap-x-14 gap-y-4 max-w-[606px]">
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
          <div className="bg-[#fcfaf3] border-t border-[#e5dec7] px-4 sm:px-7 py-4 shrink-0">
            <div className="flex flex-wrap justify-between gap-x-4 gap-y-1">
              <p className="text-[#8a7d56] font-semibold text-[10px] tracking-wide">
                {lvl.isMaxLevel ? 'MAXIMUM LICENSE LEVEL · GUARDIAN' : `PROGRESS TO LEVEL ${lvl.level + 1} · ${lvl.nextLevelName.toUpperCase()}`}
              </p>
              <p className="text-[#667085] font-medium text-[11px]">{nextLevelLabel(lvl)}</p>
            </div>
            {/* The bar fills across the CURRENT band (e.g. 501 → 2,000 for a
                Navigator), not across the whole 0 → 8,000 system. */}
            <div className="h-2.5 rounded-full bg-[#e5dec7] mt-2.5">
              <div className="h-2.5 rounded-full bg-gold-brand transition-all duration-700" style={{ width: `${lvl.progressPercentage}%` }} />
            </div>
            <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 mt-2">
              <p className="text-navy-header font-medium text-[11px]">Level {lvl.level} · {lvl.levelName}</p>
              <p className="text-navy-header font-semibold text-xs">{barXP(lvl).toLocaleString()} / {lvl.nextLevelXP.toLocaleString()} XP</p>
            </div>
          </div>
        </div>

        {/* Side rail */}
        <div className="flex flex-col gap-4">
          <div className="bg-navy-header rounded-[16px] p-5 sm:p-6">
            <p className="text-gold-brand font-bold text-[11px] tracking-[1.32px]">THIS MONTH</p>
            <div className="flex gap-10 sm:gap-16 mt-3">
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
                <p className="text-[#078b6c] font-bold text-[11px] tracking-[1.1px]">
                  ✓ TRAINING COMPLETE · {(profile.trainingProgress?.[1]?.pointsEarned ?? MODULES[1].points)} XP EARNED
                </p>
                <p className="text-navy-header font-semibold text-[19px] mt-2">Spotting personal data in prompts</p>
                <p className="text-[#667085] text-[13px] mt-2">Next: Safe AI Tool Selection&nbsp;&nbsp;·&nbsp;&nbsp;available 18 Jul</p>
                <div className="flex-1" />
                <Link to="/training" className="border border-navy-header text-navy-header font-semibold text-sm w-[188px] h-12 rounded-full flex items-center justify-center hover:bg-chip ml-auto lg:ml-0">
                  View training
                </Link>
              </>
            ) : (
              <>
                <p className="text-[#8a7d56] font-bold text-[11px] tracking-[1.1px]">NEXT TRAINING · +{MODULES[1].points} XP</p>
                <p className="text-navy-header font-semibold text-[19px] mt-2">Spotting personal data in prompts</p>
                <p className="text-[#667085] text-[13px] mt-2">5-minute lesson&nbsp;&nbsp;·&nbsp;&nbsp;3-question quiz</p>
                <div className="flex-1" />
                <Link to="/training" className="bg-gold-brand hover:bg-gold text-navy-header font-semibold text-sm w-[188px] h-12 rounded-full flex items-center justify-center ml-auto lg:ml-0">
                  Start lesson&nbsp;&nbsp;→
                </Link>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Training Stamps */}
      <div className="flex items-end justify-between gap-4 mt-9">
        <div>
          <h2 className="text-[22px] font-bold text-navy-header">Training Stamps</h2>
          <p className="text-[#667085] text-xs mt-1">Complete a module to add a verified stamp to your passport.</p>
        </div>
        <Link to="/training" className="text-[#365fd9] font-semibold text-xs shrink-0">View training&nbsp;&nbsp;→</Link>
      </div>
      <div className="bg-white border border-[#d8d0b4] rounded-[16px] mt-4 px-4 sm:px-8 py-8 flex items-center justify-center lg:justify-between flex-wrap gap-6">
        {earnedStamps.map(s => <InkStamp key={s.title} s={s} onClick={() => setOpenStamp(s)} />)}
        {lockedStamps.map(s => <LockedStamp key={s.title[0]} s={s} />)}
      </div>

      {openStamp && (
        <StampPopover
          s={openStamp}
          completions={profile.moduleCompletions}
          progress={profile.trainingProgress}
          onClose={() => setOpenStamp(null)}
        />
      )}
    </div>
  )
}
