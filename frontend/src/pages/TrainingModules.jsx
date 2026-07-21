// 04A Employee · All Modules — matches Figma frame "04A Employee • All Modules"
// Live: completed state per module reads /api/profile.completedModules.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api.js'
import { MODULE_LIST } from '../lib/trainingModules.js'

const rowMeta = {
  1: { desc: 'Identify and remove personal information before it reaches an AI tool.', color: '#0a204f' },
  2: { desc: 'Choose approved tools and write a request an admin can approve.', color: '#0a204f' },
  3: { desc: 'Know when a person must review and explain an AI-assisted outcome.', color: '#0a204f' },
}

export default function TrainingModules() {
  const [completed, setCompleted] = useState([])

  useEffect(() => {
    api.get('/profile').then(p => setCompleted(p.completedModules || [])).catch(() => {})
  }, [])

  return (
    <div className="max-w-[1440px] mx-auto px-10 py-8">
      <h1 className="text-[30px] font-bold text-navy-header">All Training Modules</h1>
      <p className="text-[#667085] text-sm mt-2 max-w-[900px]">
        Complete modules to earn safety points, stamps and unlock AI tools. Every module ends with a type-your-own practice.
      </p>

      <div className="flex flex-col gap-4 mt-6">
        {MODULE_LIST.map((m, i) => {
          const done = completed.includes(m.id)
          return (
            <Link
              key={m.id}
              to={done ? `/training/results/${m.id}` : `/training/quiz/${m.id}`}
              className="bg-white border border-[#e0e0e5] rounded-[16px] h-[104px] px-6 flex items-center gap-4 hover:border-navy-header"
            >
              <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg shrink-0 ${done ? 'bg-[#328768]' : 'bg-navy-header'}`}>
                {done ? '✓' : i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-navy-header font-bold text-lg">{m.title}</p>
                <p className="text-[#667085] text-[13.5px] mt-1">{rowMeta[m.id]?.desc}</p>
                <p className="text-gold-brand font-medium text-[12.5px] mt-1.5">3 questions · +{m.points} points</p>
              </div>
              {done ? (
                <span className="bg-[#e7f1ec] border border-[#328768] text-[#19533e] font-semibold text-sm h-11 px-5 rounded-full inline-flex items-center shrink-0">
                  ✓ Completed · Redo
                </span>
              ) : (
                <span className="bg-gold-brand text-navy-header font-semibold text-sm h-11 px-5 rounded-full inline-flex items-center shrink-0">
                  Start module →
                </span>
              )}
            </Link>
          )
        })}

        <div className="bg-[#f5f5f7] border border-[#e0e0e5] rounded-[16px] h-[104px] px-6 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-[#ccccd1] flex items-center justify-center text-white font-bold text-lg shrink-0">4</div>
          <div className="flex-1 min-w-0">
            <p className="text-[#667085] font-bold text-lg">Advanced AI Ethics</p>
            <p className="text-[#667085] text-[13.5px] mt-1">Bias, fairness and accountability in day-to-day AI use.</p>
            <p className="text-[#9999a1] font-medium text-[12.5px] mt-1.5">Coming soon</p>
          </div>
          <span className="bg-[#e5e5eb] text-[#667085] font-semibold text-sm h-11 px-5 rounded-full inline-flex items-center shrink-0">Locked</span>
        </div>
      </div>
    </div>
  )
}
