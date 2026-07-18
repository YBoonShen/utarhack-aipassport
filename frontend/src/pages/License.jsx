// 01 Employee · My AI License — built to match Figma frame "01 Employee • My AI License"
// Live: profile (points/level/streak/counters) from /api/profile; leaderboard from /api/leaderboard.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiGet } from '../api.js'
import Leaderboard from '../components/Leaderboard.jsx'

const FALLBACK = {
  name: 'Tan Jia Yin', dept: 'Engineering', level: 2, points: 1240, target: 2000,
  streakDays: 21, promptsProtected: 47, itemsMasked: 12,
}
const LICENSE_NO = 'AIP-2026-004173'
const ISSUED = '02 Jan 2026'

const stamps = [
  { name: 'AI BASICS', score: 'PASSED · 92%', date: '04 JAN 2026', color: '#0f766e', shape: 'round' },
  { name: 'DATA PRIVACY', score: 'PASSED · 100%', date: '11 JAN 2026', color: '#b91c1c', shape: 'rect' },
  { name: 'SAFE PROMPTS', score: 'PASSED · 87%', date: '25 JAN 2026', color: '#1d4ed8', shape: 'round' },
]
const lockedStamps = ['PDPA & COMPLIANCE', 'HANDLING CUSTOMER DATA', 'ADVANCED AI ETHICS']

function Stamp({ s }) {
  const base = 'flex flex-col items-center justify-center text-center p-2 -rotate-3'
  const style = { borderColor: s.color, color: s.color }
  return s.shape === 'round' ? (
    <div className={`${base} w-32 h-32 rounded-full border-4`} style={style}>
      <div className="w-[104px] h-[104px] rounded-full border flex flex-col items-center justify-center" style={style}>
        <p className="text-[11px] font-bold tracking-wide">{s.name}</p>
        <p className="text-[10px]">{s.score}</p>
        <p className="text-[9px] font-mono">{s.date}</p>
      </div>
    </div>
  ) : (
    <div className={`${base} w-36 h-24 rounded-lg border-4 rotate-3`} style={style}>
      <p className="text-[11px] font-bold tracking-wide">{s.name}</p>
      <p className="text-[10px]">{s.score}</p>
      <p className="text-[9px] font-mono">{s.date}</p>
    </div>
  )
}

export default function License() {
  const [user, setUser] = useState(FALLBACK)

  useEffect(() => {
    apiGet('/profile').then(setUser).catch(() => {})
  }, [])

  const isAmbassador = user.level >= 3
  const levelName = isAmbassador ? 'Level 3 · Ambassador' : 'Level 2 · Navigator'
  const pct = Math.min(100, (user.points / user.target) * 100)

  return (
    <div className="max-w-[1360px] mx-auto px-10 py-8">
      <h1 className="text-3xl font-bold text-navy">My AI License</h1>
      <p className="text-gray-500 text-sm mt-1 mb-6">Your access, training and safe-use progress — in one trusted record.</p>

      {isAmbassador && (
        <div className="mb-5 bg-navy border-2 border-gold rounded-2xl px-6 py-4 flex items-center justify-between">
          <p className="text-white font-bold">🎉 Level 3 · Ambassador unlocked — new tool visas are now available to you.</p>
          <Link to="/visas" className="bg-gold hover:bg-gold-dark text-navy font-bold px-5 py-2 rounded-full text-sm shrink-0">
            View new visas →
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
        {/* Passport card */}
        <div className="bg-card border-[3px] border-navy rounded-2xl overflow-hidden">
          <div className="bg-navy flex justify-between items-center px-6 py-4">
            <p className="text-gold text-sm font-bold tracking-[0.2em]">DIGITAL AI LICENSE · EMPLOYEE PASSPORT</p>
            <p className="text-slate-200 font-mono text-xs tracking-widest">MYS · AIP</p>
          </div>
          <div className="p-8 flex gap-8">
            <div className="w-40 shrink-0 text-center">
              <div className="w-40 h-44 rounded-xl bg-[#e9e2cf] border-2 border-gold-dark flex flex-col items-center justify-center">
                <div className="w-20 h-20 rounded-full bg-gold/80 flex items-center justify-center text-navy font-bold text-2xl">JY</div>
                <p className="mt-3 text-xs font-bold text-navy tracking-wide">{user.name.toUpperCase()}</p>
                <p className="text-[10px] text-[#8a7f60] tracking-wide">EMPLOYEE · E-217</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-12 gap-y-5 flex-1">
              <Field label="NAME" value={user.name} />
              <Field label="DEPARTMENT" value={user.dept} />
              <Field label="LICENSE NO." value={LICENSE_NO} mono />
              <Field label="DATE ISSUED" value={ISSUED} />
              <Field label="LICENSE CLASS" value={levelName} />
              <Field label="SAFETY POINTS" value={`${user.points.toLocaleString()} pts`} />
              <div className="col-span-2">
                <span className="inline-block bg-blue-50 text-navy text-xs px-3 py-1.5 rounded-full border border-blue-200">
                  ✓ Unlocked: ChatGPT, Gemini{isAmbassador && ', GitHub Copilot'} · Internal non-personal data
                </span>
              </div>
            </div>
          </div>
          <div className="px-8 pb-6">
            <div className="flex justify-between text-[11px] font-bold tracking-wider text-[#8a7f60] mb-2">
              <span>{isAmbassador ? 'LEVEL 3 · AMBASSADOR ACHIEVED' : 'PROGRESS TO LEVEL 3 · AMBASSADOR'}</span>
              <span>{isAmbassador ? 'top license class' : `${Math.max(0, user.target - user.points)} points to go`}</span>
            </div>
            <div className="h-2.5 rounded-full bg-[#e9e2cf]">
              <div className="h-2.5 rounded-full bg-gold" style={{ width: `${pct}%` }} />
            </div>
            <div className="flex justify-between text-xs text-gray-500 mt-2">
              <span>{levelName}</span>
              <span className="font-bold text-navy">{user.points.toLocaleString()} / {user.target.toLocaleString()} safety points</span>
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-5">
          <div className="bg-navy rounded-2xl p-6 text-white">
            <p className="text-gold text-xs font-bold tracking-[0.18em] mb-4">THIS MONTH</p>
            <div className="flex gap-10">
              <div><p className="text-4xl font-bold">{user.promptsProtected}</p><p className="text-xs text-slate-300">prompts protected</p></div>
              <div><p className="text-4xl font-bold">{user.itemsMasked}</p><p className="text-xs text-slate-300">items masked</p></div>
            </div>
            <div className={`mt-4 rounded-lg px-4 py-2.5 text-xs ${user.streakDays > 0 ? 'bg-[#1c3572] text-emerald-200' : 'bg-red-900/50 text-red-200'}`}>
              {user.streakDays > 0 ? `✓ No unsafe prompts for ${user.streakDays} days` : 'Clean streak reset — rebuild it with safe prompts'}
            </div>
          </div>
          <div className="bg-card border-2 border-[#d8cfae] rounded-2xl p-6">
            <p className="text-[#8a7f60] text-xs font-bold tracking-[0.18em]">NEXT TRAINING · +150 POINTS</p>
            <p className="text-navy font-bold text-lg mt-3">Spotting personal data in prompts</p>
            <p className="text-gray-500 text-sm mt-1">5-minute lesson · 3-question quiz</p>
            <Link to="/training" className="inline-block mt-5 bg-gold hover:bg-gold-dark text-navy font-bold px-6 py-2.5 rounded-full text-sm">
              Start lesson →
            </Link>
          </div>
          <Leaderboard compact />
        </div>
      </div>

      {/* Stamps */}
      <div className="mt-10">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-xl font-bold text-navy">Training Stamps</h2>
            <p className="text-gray-500 text-sm">Complete a module to add a verified stamp to your passport.</p>
          </div>
          <Link to="/training" className="text-sm text-navy font-medium">View training →</Link>
        </div>
        <div className="mt-4 bg-card border-2 border-[#d8cfae] rounded-2xl p-8 flex items-center gap-12 flex-wrap">
          {stamps.map(s => <Stamp key={s.name} s={s} />)}
          {lockedStamps.map(n => (
            <div key={n} className="w-32 h-32 rounded-full border-2 border-dashed border-[#8a7f60]/40 flex items-center justify-center text-center p-4">
              <p className="text-[10px] text-[#8a7f60]/60 font-medium">{n}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function Field({ label, value, mono }) {
  return (
    <div>
      <p className="text-[10px] font-bold tracking-[0.15em] text-[#8a7f60]">{label}</p>
      <p className={`text-navy font-bold ${mono ? 'font-mono' : ''} mt-0.5`}>{value}</p>
    </div>
  )
}
