// 04 Employee · Training Dashboard — matches Figma frame "04 Employee • Training Dashboard"
// Live data: miles/stamps come from the backend profile.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api.js'
import { MODULES, MODULE_LIST } from '../lib/trainingModules.js'
import { levelState, nextLevelLabel, progressHint } from '../lib/levels.js'

const availableFrom = { 2: 'AVAILABLE 18 JUL 2026', 3: 'AVAILABLE 25 JUL 2026' }

export default function Training() {
  const [profile, setProfile] = useState({
    points: 1240, target: 2000, level: 2, levelName: 'Navigator',
    stamps: [{}, {}, {}], trainingCompleted: false, completedModules: [], trainingProgress: {},
  })

  useEffect(() => {
    api.get('/profile').then(setProfile).catch(() => {})
  }, [])

  const completed = profile.completedModules || []
  const progress = profile.trainingProgress || {}
  const upcoming = MODULE_LIST.filter(m => m.id !== 1)
  const current = MODULES[1]
  const currentRecord = progress[1] || null

  const done = profile.trainingCompleted
  const lvl = levelState(profile)
  const kpis = [
    { label: 'CURRENT MODULE', value: done ? 'Completed' : '1 in progress', dark: true },
    { label: 'COMPLETED', value: `${completed.length} of ${MODULE_LIST.length} modules` },
    { label: 'TOTAL XP', value: `${lvl.totalXP.toLocaleString()} XP` },
    { label: 'NEXT LEVEL', value: lvl.isMaxXP ? 'Max level' : nextLevelLabel(lvl) },
  ]
  // The learning path is how much of the module library is finished — one entry
  // per unique module, so redoing a module never moves it.
  const pathPct = Math.round((completed.length / MODULE_LIST.length) * 100)

  return (
    <div className="max-w-[1400px] mx-auto px-4 lg:px-10 py-6 lg:py-7">
      <h1 className="text-[26px] lg:text-[32px] font-bold text-navy">Training</h1>
      <p className="text-slate2 text-base mt-1">Build practical AI safety habits with short, role-relevant modules.</p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-5 mt-4">
        {kpis.map(k => (
          <div key={k.label} className={`rounded-[14px] px-4 py-3 border ${k.dark ? 'bg-navy border-navy' : 'bg-card border-sand'}`}>
            <p className={`text-xs font-semibold ${k.dark ? 'text-gold' : 'text-slate2'}`}>{k.label}</p>
            <p className={`text-[22px] font-bold mt-1.5 ${k.dark ? 'text-white' : 'text-navy'}`}>{k.value}</p>
          </div>
        ))}
      </div>

      <h2 className="text-[22px] font-bold text-navy mt-7 mb-3">Current training</h2>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_456px] gap-4 lg:gap-6 items-stretch">
        <div className="bg-card border border-sand rounded-[16px] p-5 lg:p-6 lg:pt-5">
          <span className={`inline-block text-xs font-semibold px-4 py-1.5 rounded-full ${done ? 'bg-green-soft text-green' : 'bg-[#edf2ff] text-navy'}`}>
            {done ? '✓ COMPLETED' : 'IN PROGRESS'}
          </span>
          <p className="text-navy font-bold text-[22px] lg:text-[26px] mt-3.5">Spotting Personal Data in Prompts</p>
          <p className="text-ink text-base mt-2 max-w-[790px]">
            Learn to identify names, identifiers, contact details and customer records before they reach an AI tool.
          </p>
          <div className="flex flex-wrap gap-2.5 mt-4">
            <span className="bg-chip text-slate2 text-xs font-semibold px-4 py-1.5 rounded-full">{current.minutes}-minute lesson</span>
            <span className="bg-chip text-slate2 text-xs font-semibold px-4 py-1.5 rounded-full">{current.questions.length} questions</span>
            <span className="bg-green-soft text-green text-xs font-semibold px-4 py-1.5 rounded-full">
              {currentRecord?.completed ? `${currentRecord.pointsEarned} / ${current.points} XP earned` : `+${current.points} XP`}
            </span>
          </div>
          {currentRecord?.completed && (
            <p className="text-slate2 text-[13px] mt-3">
              {currentRecord.pointsEarned >= current.points
                ? 'You hold the full XP for this module — retaking it is revision and adds nothing further.'
                : `Retaking it can raise this module's XP up to ${current.points}. Only the improvement is added.`}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-4 mt-6">
            <p className="text-slate2 text-[13px] font-semibold shrink-0">Quiz progress</p>
            <div className="h-2.5 rounded-full bg-chip flex-1 min-w-[120px] max-w-[476px]">
              <div className="h-2.5 rounded-full bg-gold transition-all duration-700" style={{ width: done ? '100%' : '33%' }} />
            </div>
            <p className="text-navy text-sm font-semibold shrink-0">{done ? '3 of 3' : '1 of 3'}</p>
            <Link
              to={done ? '/training/results/1' : '/training/quiz/1'}
              className="bg-gold hover:bg-gold-dark text-navy font-semibold text-[15px] px-5 h-12 rounded-full flex items-center shrink-0 ml-auto lg:ml-0"
            >
              {done ? 'View results →' : 'Resume training →'}
            </Link>
          </div>
        </div>

        <div className="bg-navy rounded-[16px] p-5 lg:p-6">
          <p className="text-gold text-xs font-semibold">YOUR LEARNING PROGRESS</p>
          <p className="text-white text-[44px] font-bold mt-2">{pathPct}%</p>
          <p className="text-white text-base mt-1">Level {lvl.level} learning path complete</p>
          <div className="h-3 rounded-full bg-navy-track mt-4">
            <div className="h-3 rounded-full bg-gold transition-all duration-700" style={{ width: `${pathPct}%` }} />
          </div>
          <p className="text-white text-sm font-medium mt-3">
            {completed.length} module{completed.length === 1 ? '' : 's'} completed&nbsp;&nbsp;·&nbsp;&nbsp;{profile.trainingXP ?? 0} XP from training
          </p>
          <div className="bg-navy-mid rounded-[10px] px-3 py-2 mt-4">
            <p className="text-white text-[13px] font-medium">{progressHint(lvl)}</p>
          </div>
        </div>
      </div>

      <h2 className="text-[22px] font-bold text-navy mt-8 mb-3">Upcoming training</h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-5">
        {upcoming.map(u => {
          const record = progress[u.id]
          const done = completed.includes(u.id)
          return (
            <Link key={u.id} to={done ? `/training/results/${u.id}` : `/training/quiz/${u.id}`} className="bg-card border border-sand rounded-[16px] p-5 hover:border-navy">
              <p className="text-gold text-xs font-semibold">{done ? '✓ COMPLETED' : availableFrom[u.id]}</p>
              <p className="text-navy font-bold text-[21px] mt-2">{u.title}</p>
              <p className="text-ink text-[15px] mt-2">{u.subtitle}</p>
              <div className="flex flex-wrap items-end justify-between gap-3 mt-5">
                <p className="text-slate2 text-[13px] font-medium">
                  {u.minutes} min · {u.questions.length} questions ·{' '}
                  {done ? `${record?.pointsEarned ?? 0} / ${u.points} XP earned` : `+${u.points} XP`}
                </p>
                <span className={`text-xs font-semibold px-4 py-1.5 rounded-full ${done ? 'bg-green-soft text-green' : 'bg-gold text-navy'}`}>
                  {done ? 'Redo · improve only' : 'Start module →'}
                </span>
              </div>
            </Link>
          )
        })}
      </div>

      <p className="text-slate2 text-[13px] mt-6">
        Training is assigned by role and risk signals. Completed modules add a stamp to your AI Passport. Each module
        contributes its best result to your XP once — retaking one can raise that result, never duplicate it.
      </p>
    </div>
  )
}
