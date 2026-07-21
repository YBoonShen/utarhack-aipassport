// 04 Employee · Training Dashboard — matches Figma frame "04 Employee • Training Dashboard"
// Live data: miles/stamps come from the backend profile.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api.js'
import { MODULE_LIST } from '../lib/trainingModules.js'

const availableFrom = { 2: 'AVAILABLE 18 JUL 2026', 3: 'AVAILABLE 25 JUL 2026' }

export default function Training() {
  const [profile, setProfile] = useState({ points: 1240, target: 2000, stamps: [{}, {}, {}], trainingCompleted: false, completedModules: [] })

  useEffect(() => {
    api.get('/profile').then(setProfile).catch(() => {})
  }, [])

  const completed = profile.completedModules || []
  const upcoming = MODULE_LIST.filter(m => m.id !== 1)

  const done = profile.trainingCompleted
  const kpis = [
    { label: 'CURRENT MODULE', value: done ? 'Completed today' : '1 in progress', dark: true },
    { label: 'COMPLETED', value: `${profile.stamps.length} stamps earned` },
    { label: 'SAFETY MILES', value: `${profile.points.toLocaleString()} miles` },
    { label: 'NEXT LEVEL', value: `${(profile.target - profile.points).toLocaleString()} miles to go` },
  ]
  const pathPct = done ? 100 : 67

  return (
    <div className="max-w-[1400px] mx-auto px-10 py-7">
      <h1 className="text-[32px] font-bold text-navy">Training</h1>
      <p className="text-slate2 text-base mt-1">Build practical AI safety habits with short, role-relevant modules.</p>

      <div className="grid grid-cols-4 gap-5 mt-4">
        {kpis.map(k => (
          <div key={k.label} className={`rounded-[14px] px-4 py-3 border ${k.dark ? 'bg-navy border-navy' : 'bg-card border-sand'}`}>
            <p className={`text-xs font-semibold ${k.dark ? 'text-gold' : 'text-slate2'}`}>{k.label}</p>
            <p className={`text-[22px] font-bold mt-1.5 ${k.dark ? 'text-white' : 'text-navy'}`}>{k.value}</p>
          </div>
        ))}
      </div>

      <h2 className="text-[22px] font-bold text-navy mt-7 mb-3">Current training</h2>
      <div className="grid grid-cols-[1fr_456px] gap-6 items-stretch">
        <div className="bg-card border border-sand rounded-[16px] p-6 pt-5">
          <span className={`inline-block text-xs font-semibold px-4 py-1.5 rounded-full ${done ? 'bg-green-soft text-green' : 'bg-[#edf2ff] text-navy'}`}>
            {done ? '✓ COMPLETED' : 'IN PROGRESS'}
          </span>
          <p className="text-navy font-bold text-[26px] mt-3.5">Spotting Personal Data in Prompts</p>
          <p className="text-ink text-base mt-2 max-w-[790px]">
            Learn to identify names, identifiers, contact details and customer records before they reach an AI tool.
          </p>
          <div className="flex gap-2.5 mt-4">
            <span className="bg-chip text-slate2 text-xs font-semibold px-4 py-1.5 rounded-full">5-minute lesson</span>
            <span className="bg-chip text-slate2 text-xs font-semibold px-4 py-1.5 rounded-full">3 questions</span>
            <span className="bg-green-soft text-green text-xs font-semibold px-4 py-1.5 rounded-full">+150 miles</span>
          </div>
          <div className="flex items-center gap-4 mt-6">
            <p className="text-slate2 text-[13px] font-semibold shrink-0">Quiz progress</p>
            <div className="h-2.5 rounded-full bg-chip flex-1 max-w-[476px]">
              <div className="h-2.5 rounded-full bg-gold transition-all duration-700" style={{ width: done ? '100%' : '33%' }} />
            </div>
            <p className="text-navy text-sm font-semibold shrink-0">{done ? '3 of 3' : '1 of 3'}</p>
            <Link
              to={done ? '/training/results/1' : '/training/quiz/1'}
              className="bg-gold hover:bg-gold-dark text-navy font-semibold text-[15px] px-5 h-12 rounded-full flex items-center shrink-0"
            >
              {done ? 'View results →' : 'Resume training →'}
            </Link>
          </div>
        </div>

        <div className="bg-navy rounded-[16px] p-6">
          <p className="text-gold text-xs font-semibold">YOUR LEARNING PROGRESS</p>
          <p className="text-white text-[44px] font-bold mt-2">{pathPct}%</p>
          <p className="text-white text-base mt-1">Level 2 learning path complete</p>
          <div className="h-3 rounded-full bg-navy-track mt-4">
            <div className="h-3 rounded-full bg-gold transition-all duration-700" style={{ width: `${pathPct}%` }} />
          </div>
          <p className="text-white text-sm font-medium mt-3">{profile.stamps.length} modules completed&nbsp;&nbsp;·&nbsp;&nbsp;21-day safe streak</p>
          <div className="bg-navy-mid rounded-[10px] px-3 py-2 mt-4">
            <p className="text-white text-[13px] font-medium">
              {done ? 'Next module: Safe AI Tool Selection · 18 Jul' : 'Next stamp unlocks at 1,390 miles'}
            </p>
          </div>
        </div>
      </div>

      <h2 className="text-[22px] font-bold text-navy mt-8 mb-3">Upcoming training</h2>
      <div className="grid grid-cols-2 gap-5">
        {upcoming.map(u => {
          const done = completed.includes(u.id)
          return (
            <Link key={u.id} to={done ? `/training/results/${u.id}` : `/training/quiz/${u.id}`} className="bg-card border border-sand rounded-[16px] p-5 hover:border-navy">
              <p className="text-gold text-xs font-semibold">{done ? '✓ COMPLETED' : availableFrom[u.id]}</p>
              <p className="text-navy font-bold text-[21px] mt-2">{u.title}</p>
              <p className="text-ink text-[15px] mt-2">{u.subtitle}</p>
              <div className="flex items-end justify-between mt-5">
                <p className="text-slate2 text-[13px] font-medium">{u.minutes} min · 3 questions · +{u.points} miles</p>
                <span className={`text-xs font-semibold px-4 py-1.5 rounded-full ${done ? 'bg-green-soft text-green' : 'bg-gold text-navy'}`}>
                  {done ? 'Redo' : 'Start module →'}
                </span>
              </div>
            </Link>
          )
        })}
      </div>

      <p className="text-slate2 text-[13px] mt-6">
        Training is assigned by role and risk signals. Completed modules add a stamp to your AI Passport.
      </p>
    </div>
  )
}
