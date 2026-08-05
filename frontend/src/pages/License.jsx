// 01 Employee · My AI License — matches Figma frame "01 Employee • My AI License"
// Live data: profile (points, stamps, monthly stats) comes from the backend.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api.js'
import { MODULE_LIST } from '../lib/trainingModules.js'
import { retryStatus } from '../lib/retryLock.js'
import { levelState, barXP, nextLevelLabel, levelBenefit } from '../lib/levels.js'
import { useAssignedModules } from '../lib/useTraining.js'
import { pickCurrentModule } from '../lib/trainingProgress.js'
import InfoPopover, { InfoList, InfoNote } from '../components/InfoPopover.jsx'

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

// What the card shows before /api/profile answers, and if it never does.
//
// This was previously the demo employee's whole passport — their name, licence
// number, 1,240 points, 21-day streak and three earned stamps — which every
// other employee's licence rendered until the real one arrived, and kept if the
// call failed. A licence showing somebody else's stamps is worse than a licence
// showing none, so the blank state is now genuinely blank: em-dashes where a
// value is not known yet, and no stamps at all.
const fallbackProfile = {
  name: '—', dept: '—', licenseNo: '—', issued: '—',
  level: 0, points: 0, streakDays: 0,
  promptsProtected: 0, itemsMasked: 0, trainingCompleted: false,
  moduleCompletions: {}, trainingProgress: {}, completedModules: [],
  // Derived by the server (safetyFor in backend/src/store.js) — never a literal
  // here, which is what made every passport read 80 · Excellent.
  safety: { score: 0, grade: 'Good' },
  stamps: [],
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
function StampPopover({ s, completions, progress, assigned, onClose }) {
  const moduleId = stampModuleId(s)
  // The module as the SERVER describes it for this employee, not the static
  // lesson content that ships with the frontend. Deciding "can this be opened"
  // from lib/trainingModules.js meant a stamp earned on an admin-authored
  // module always said "not available yet" — the module had questions, they
  // just were not in a file the browser was compiled with. It also offered
  // "View training" for modules the employee is no longer assigned, which the
  // server then refused with a 403.
  const mod = assigned?.find(m => m.id === moduleId) || null
  const hasQuestions = (mod?.questionCount || 0) > 0
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
            ? `${record.pointsEarned} of ${record.modulePoints} points earned  ·  best result counts`
            : 'Safety points earned  ·  Added to ongoing safety score'}
        </p>
        <p className="text-[#667085] text-[13.5px] mt-3">
          {hasQuestions
            ? lock.locked
              ? `Retaking ${mod.title} unlocks in ${lock.remainingLabel} — available ${lock.availableLabel}.`
              : `Opens ${mod.title} at Question 1.`
            // A stamp outlives the assignment that earned it: the module can be
            // unpublished, or reassigned to somebody else, after it was passed.
            // The stamp stays on the passport either way — it records something
            // that happened — but the button has to stop offering a module the
            // server will refuse.
            : 'This module is not on your training list at the moment, so it cannot be reopened. Your stamp and its points stay on your passport.'}
        </p>
        {record && record.pointsEarned >= record.modulePoints && (
          <p className="text-[#667085] text-[12px] mt-1.5">
            You already hold the full {record.modulePoints} points for this module — retaking it is revision, not extra points.
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

// Personal AI Safety Score — the employee mirror of the admin risk score.
// A circular progress ring on the navy card; grows with safe streak, training
// and level progress, and drops sharply if the gateway is overridden.
const gradeColor = { Excellent: '#34d399', Good: '#d9b32c', Fair: '#f0a13b', 'At risk': '#f87171' }

function SafetyRing({ safety }) {
  const size = 132, stroke = 11, r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const frac = Math.min(1, Math.max(0, safety.score / 100))
  const color = gradeColor[safety.grade] || '#d9b32c'
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#1f3b7a" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={circ * (1 - frac)}
          style={{ transition: 'stroke-dashoffset 800ms ease, stroke 400ms' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <p className="text-white font-bold text-[34px] leading-none">{safety.score}</p>
        <p className="text-[10px] text-[#a9b6d6] tracking-[0.5px]">/ 100</p>
        <p className="font-bold text-[11px] tracking-[0.6px] mt-1" style={{ color }}>{safety.grade.toUpperCase()}</p>
      </div>
    </div>
  )
}

// What the safety card is explaining, in the employee's words.
//
// Every line below is a statement the code actually supports, and nothing else:
//   • the three figures      — db.profile.promptsProtected / itemsMasked /
//                              streakDays, moved by recordPromptEvent()
//   • what gets masked       — the detector rules the admin's controls enable
//                              (server.js runDetection)
//   • the override penalty   — recordOverride(): streak reset to 0 and 20
//                              safety points deducted, which is already the
//                              wording of the notification it sends
//   • training               — completeTraining(): XP plus a passport stamp
//
// There is deliberately no formula, weighting, threshold or percentage here:
// the codebase does not define one, so stating one would be inventing it.
const SAFETY_INFO = [
  {
    heading: 'What the system records',
    lines: [
      ['Prompts protected', 'every prompt the Smart Gateway checked before it left your browser.'],
      ['Items masked', 'the personal, customer or financial details it replaced with masked tokens — which categories are checked is set by your administrator.'],
      ['Safe streak', 'consecutive days with no unsafe prompt.'],
    ],
  },
  {
    heading: 'What moves them',
    lines: [
      ['Letting the gateway mask and send', 'costs you nothing — a protected prompt is the system working.'],
      ['Sending the original anyway', 'at a checkpoint resets your safe streak to zero and deducts 20 safety points. You are notified when this happens.'],
      ['Completing assigned training', 'adds safety points and a training stamp to your passport.'],
    ],
  },
]

function SafetyInfo() {
  return (
    <InfoPopover label="About your AI Safety Score" title="About your AI Safety Score" side="right">
      <p className="text-[#667085] text-[13px] mt-2 leading-relaxed">
        It stands for how safely you have been using AI at work. It is your own record only — nothing about your
        colleagues or your department goes into it.
      </p>
      {SAFETY_INFO.map(section => (
        <InfoList key={section.heading} heading={section.heading} items={section.lines} />
      ))}
      <InfoNote title="Keeping it healthy">
        Send through the Smart Gateway and let it mask what it finds, don&rsquo;t override a checkpoint, and finish the
        training assigned to you.
      </InfoNote>
    </InfoPopover>
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
  // The same cached snapshot the Training pages read — only the modules an
  // admin has actually published and assigned to THIS employee.
  const { modules: assigned, loaded: assignedLoaded } = useAssignedModules()

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
  // The passport's own initials — profile.initials for a signed-in employee,
  // otherwise derived from the name rather than defaulting to the demo one.
  const initials = profile.initials
    || String(profile.name || '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()
    || '—'

  // Picked with the shared helper, so the licence names the same module the
  // Training dashboard and the Home card are showing — and, like them, prefers
  // an attempt already in progress over an untouched one further down the list.
  const nextTraining = pickCurrentModule(assigned)
  const trainingPointsEarned = Object.values(profile.trainingProgress || {})
    .reduce((sum, r) => sum + (r.pointsEarned || 0), 0)

  const identityFields = [
    ['NAME', profile.name],
    ['DEPARTMENT', profile.dept],
    ['LICENSE NO.', profile.licenseNo],
    ['DATE ISSUED', profile.issued],
    ['LICENSE CLASS', `Level ${lvl.level} · ${lvl.levelName}`],
    ['SAFETY POINTS', `${lvl.totalXP.toLocaleString()} pts`],
  ]
  const earnedStamps = profile.stamps.map((s, i) => ({ ...s, rotate: stampRotations[i % stampRotations.length] }))
  const safety = profile.safety || fallbackProfile.safety

  return (
    <div className="max-w-[1440px] mx-auto px-4 lg:px-10 py-6 lg:py-8">
      <div className="flex items-center gap-2">
        <h1 className="text-[26px] lg:text-[30px] font-bold text-navy-header">My AI License</h1>
        <InfoPopover label="About your AI License" title="About your AI License" tone="light">
          <p className="text-[#667085] text-[13px] mt-2 leading-relaxed">
            Your AI License is your level in the AI Passport — how far your safe-use record has taken you, and which AI
            tools that level lets you request.
          </p>
          <InfoList
            heading="The four levels"
            items={[
              ['Level 1 · Trainee', levelBenefit(1)],
              ['Level 2 · Navigator', levelBenefit(2)],
              ['Level 3 · Ambassador', levelBenefit(3)],
              ['Level 4 · Guardian', levelBenefit(4)],
            ]}
          />
          <InfoNote title="How you move up">
            Safety points, earned by completing assigned training and using AI safely. Enough points move you to the
            next level; a level you have reached is never taken away.
          </InfoNote>
        </InfoPopover>
      </div>
      <p className="text-[#667085] text-sm mt-1.5 mb-6">Your access, training and safe-use progress — in one trusted record.</p>

      {/* The side rail was a flat 436px from lg up, which left the passport card
          about 480px on a 1280 laptop — not enough for its two-column identity
          grid, so the licence number and dates wrapped mid-value. The rail now
          takes a narrower share until xl, and minmax(0,1fr) lets the left column
          actually shrink instead of being held open by its own content. */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_436px] gap-4 lg:gap-6 items-stretch">
        {/* Digital AI Passport */}
        <div className="bg-white border-2 border-navy-header rounded-[18px] overflow-hidden flex flex-col">
          <div className="bg-navy-header min-h-14 sm:h-14 flex items-center justify-between gap-3 px-4 sm:px-6 py-2 sm:py-0 shrink-0">
            <p className="text-gold-brand font-bold text-[11px] sm:text-sm tracking-[1.4px]">DIGITAL AI LICENSE · EMPLOYEE PASSPORT</p>
            <p className="text-white font-semibold text-[11px] shrink-0">MYS&nbsp;&nbsp;·&nbsp;&nbsp;AIP</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-6 sm:gap-7 px-4 sm:px-7 py-6 flex-1">
            {/* The photo panel is the same passport it sits on: it was showing
                JY / TAN JIA YIN / E-217 for every employee, beside a NAME field
                two columns away that was already correct. */}
            <div className="bg-[#f1eddf] border border-gold-brand rounded-[14px] w-[170px] shrink-0 mx-auto sm:mx-0 flex flex-col items-center pt-12 pb-6">
              <div className="w-[88px] h-[88px] rounded-full bg-[#d8d0b4] flex items-center justify-center">
                <p className="text-navy-header font-bold text-2xl">{initials}</p>
              </div>
              <p className="text-navy-header font-semibold text-sm mt-2.5 text-center px-2 break-words">{String(profile.name || '—').toUpperCase()}</p>
              <p className="text-[#667085] font-medium text-[10px] tracking-[0.8px] mt-1.5">EMPLOYEE · {profile.id || '—'}</p>
            </div>
            <div className="flex-1 min-w-0 pt-2">
              {/* The 56px column gap only once there is width for it (xl), so a
                  laptop spends that space on the values themselves. */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 xl:gap-x-14 gap-y-4 max-w-[606px]">
                {identityFields.map(([label, value]) => (
                  <div key={label}>
                    <p className="text-[#8a7d56] font-semibold text-[10px] tracking-[1px]">{label}</p>
                    <p className="text-navy-header font-semibold text-base mt-0.5">{value}</p>
                  </div>
                ))}
              </div>
              {/* One fixed line per level, from lib/levels.js — the same
                  sentence the level-up notification announces. Everyone holding
                  this level reads exactly this; nothing here is personalised. */}
              <div className="bg-[#eef2ff] rounded-[8px] px-3 py-1.5 mt-5 inline-block max-w-full">
                <p className="text-[#365fd9] font-medium text-xs">
                  ✓&nbsp;&nbsp;Level {lvl.level} unlocked: {levelBenefit(lvl.level)}
                </p>
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
              <p className="text-navy-header font-semibold text-xs">{barXP(lvl).toLocaleString()} / {lvl.nextLevelXP.toLocaleString()} safety points</p>
            </div>
          </div>
        </div>

        {/* Side rail */}
        <div className="flex flex-col gap-4">
          <div className="bg-navy-header rounded-[16px] p-6">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <p className="text-gold-brand font-bold text-[11px] tracking-[1.32px] truncate">AI SAFETY SCORE</p>
                <SafetyInfo />
              </div>
              <span className="text-[#9fb0d4] text-[10px] flex items-center gap-1.5 shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-[#34d399]" />live
              </span>
            </div>
            {/* 8dp grid: 24px between the ring and the figures beside it, 16px
                between the figures and the streak chip under them. */}
            <div className="flex items-center gap-6 mt-4">
              <SafetyRing safety={safety} />
              <div className="flex-1 flex flex-col gap-4">
                <div className="flex gap-8">
                  <div>
                    <p className="text-white font-bold text-[28px] leading-none">{profile.promptsProtected}</p>
                    <p className="text-[#cbd5e1] text-[11px] mt-1.5">prompts protected</p>
                  </div>
                  <div>
                    <p className="text-white font-bold text-[28px] leading-none">{profile.itemsMasked}</p>
                    <p className="text-[#cbd5e1] text-[11px] mt-1.5">items masked</p>
                  </div>
                </div>
                <div className="bg-[#173976] rounded-[10px] px-3 py-2">
                  <p className="text-[#a7f3d0] font-medium text-xs">✓&nbsp;&nbsp;No unsafe prompts for {profile.streakDays} days</p>
                </div>
              </div>
            </div>
          </div>
          {/* Next training — this employee's own next outstanding module.
              The card was hard-wired to module 1: it announced "Spotting
              personal data in prompts · 5-minute lesson · 3-question quiz" and
              "Next: Safe AI Tool Selection · available 18 Jul" on every
              passport, including employees assigned neither, and its button
              opened the Training dashboard rather than the module it had just
              named. It now reads the same assigned-module snapshot the Training
              pages read, and opens that module. */}
          <div className="bg-white border border-[#d8d0b4] rounded-[16px] p-6 flex-1 flex flex-col">
            {nextTraining ? (
              <>
                <p className="text-[#8a7d56] font-bold text-[11px] tracking-[1.1px]">NEXT TRAINING · +{nextTraining.points} POINTS</p>
                <p className="text-navy-header font-semibold text-[19px] mt-2">{nextTraining.title}</p>
                <p className="text-[#667085] text-[13px] mt-2">
                  {nextTraining.minutes}-minute lesson&nbsp;&nbsp;·&nbsp;&nbsp;{nextTraining.questionCount}-question quiz
                </p>
                <div className="flex-1" />
                {/* flex-1 above only donates height the card actually has
                    spare; this margin guarantees the action is never crowded
                    against the text when the card is short. */}
                <Link
                  to={nextTraining.questionCount > 0 ? `/training/quiz/${nextTraining.id}` : '/training'}
                  className="bg-gold-brand hover:bg-gold text-navy-header font-semibold text-sm w-full sm:w-[188px] h-12 rounded-full flex items-center justify-center ml-auto lg:ml-0 mt-7"
                >
                  Start lesson&nbsp;&nbsp;→
                </Link>
              </>
            ) : assignedLoaded && assigned.length > 0 ? (
              <>
                <p className="text-[#078b6c] font-bold text-[11px] tracking-[1.1px]">
                  ✓ TRAINING COMPLETE · {trainingPointsEarned} POINTS EARNED
                </p>
                <p className="text-navy-header font-semibold text-[19px] mt-2">
                  {assigned.length} module{assigned.length === 1 ? '' : 's'} finished
                </p>
                <p className="text-[#667085] text-[13px] mt-2">
                  Nothing outstanding. New training appears here as soon as it is assigned to you.
                </p>
                <div className="flex-1" />
                <Link to="/training" className="border border-navy-header text-navy-header font-semibold text-sm w-full sm:w-[188px] h-12 rounded-full flex items-center justify-center hover:bg-chip ml-auto lg:ml-0 mt-7">
                  View training
                </Link>
              </>
            ) : (
              <>
                <p className="text-[#8a7d56] font-bold text-[11px] tracking-[1.1px]">NEXT TRAINING</p>
                <p className="text-navy-header font-semibold text-[19px] mt-2">
                  {assignedLoaded ? 'No training assigned yet' : 'Loading your training…'}
                </p>
                <p className="text-[#667085] text-[13px] mt-2">
                  {assignedLoaded
                    ? 'Modules appear here as soon as your administrator assigns one to you or to your department.'
                    : 'Fetching the modules assigned to you.'}
                </p>
                <div className="flex-1" />
                <Link to="/training" className="border border-navy-header text-navy-header font-semibold text-sm w-full sm:w-[188px] h-12 rounded-full flex items-center justify-center hover:bg-chip ml-auto lg:ml-0 mt-7">
                  View training
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
        {/* py/-my pair: a comfortable touch target, same position on the page. */}
        <Link to="/training" className="text-[#365fd9] font-semibold text-xs shrink-0 py-3 -my-3 inline-flex items-center">View training&nbsp;&nbsp;→</Link>
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
          assigned={assigned}
          onClose={() => setOpenStamp(null)}
        />
      )}
    </div>
  )
}
