// Level-up celebration — shown once, the moment the backend reports that a
// threshold was crossed. It reuses the AI Passport look (navy card, gold seal,
// dashed stamp ring) rather than introducing a new visual language.
//
// Only rendered when the server said levelUp AND lib/levels.js celebrateOnce()
// has not already fired for that level, so a page refresh never replays it.
import { Link } from 'react-router-dom'
import { LEVELS, MAX_XP } from '../lib/levels.js'

const BENEFITS = {
  2: 'You can now access the benefits associated with this AI literacy level — ChatGPT and Gemini for internal, non-personal work.',
  3: 'Ambassadors unlock GitHub Copilot and the source-code scope, and can vouch for safe tool use in their team.',
  4: 'Guardians hold the full approved toolset and can mentor and endorse safe AI use across the organisation.',
}

const SEAL = { 2: '🎉', 3: '🎉', 4: '🛡️' }

export default function LevelUpOverlay({ level, levelName, totalXP, onClose }) {
  const band = LEVELS[level - 1] || LEVELS[0]
  const isMax = level === LEVELS.length

  return (
    <div className="fixed inset-0 bg-navy-dark/60 flex items-center justify-center p-4 sm:p-6 z-[80]" onClick={onClose}>
      <div
        className="aip-rise-in bg-navy border-2 border-gold-brand rounded-[22px] shadow-[0px_18px_50px_rgba(0,0,0,0.4)] w-full max-w-[460px] p-6 sm:p-8 text-center max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <p className="text-gold-brand font-bold text-[11px] tracking-[1.6px]">AI LICENSE · LEVEL UP</p>

        <div className="aip-stamp-in relative w-[152px] h-[152px] mx-auto mt-5">
          <div className="aip-glow absolute inset-0 rounded-full" />
          <svg width="152" height="152" viewBox="0 0 152 152" className="absolute inset-0">
            <circle cx="76" cy="76" r="73" fill="none" stroke="#d9b32c" strokeWidth="2.5" strokeDasharray="7 5" />
            <circle cx="76" cy="76" r="60" fill="none" stroke="#d9b32c" strokeWidth="1.5" />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[26px] leading-none">{SEAL[level] || '🎉'}</span>
            <p className="text-gold-brand font-bold text-[13px] tracking-[1px] mt-1.5">LEVEL {level}</p>
            <p className="text-white font-bold text-[19px] leading-tight mt-0.5">{levelName}</p>
          </div>
        </div>

        <p className="text-white font-bold text-[26px] mt-6">You are now a {levelName}.</p>
        <p className="text-[#cbd5e1] text-sm mt-2.5">{BENEFITS[level] || 'Your AI License class has been upgraded.'}</p>

        <div className="bg-navy-mid rounded-[14px] px-4 py-3.5 mt-5 text-left">
          <div className="flex justify-between gap-3">
            <p className="text-gold-brand font-semibold text-[11px]">TOTAL SAFETY POINTS</p>
            <p className="text-white font-semibold text-[11px]">{totalXP.toLocaleString()} points</p>
          </div>
          <div className="flex justify-between gap-3 mt-2">
            <p className="text-[#cbd5e1] text-[11px]">{isMax ? 'Progression ceiling' : `${band.name} band`}</p>
            <p className="text-[#cbd5e1] text-[11px]">
              {isMax ? `${MAX_XP.toLocaleString()} points · maximum level` : `${band.min.toLocaleString()} – ${band.max.toLocaleString()} points`}
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mt-6">
          <button onClick={onClose} className="border border-gold-brand text-gold-brand font-semibold text-sm flex-1 h-12 rounded-full cursor-pointer hover:bg-navy-mid">
            Keep going
          </button>
          <Link to="/license" className="bg-gold-brand hover:bg-gold text-navy font-semibold text-sm flex-1 h-12 rounded-full flex items-center justify-center">
            View my license →
          </Link>
        </div>
      </div>
    </div>
  )
}
