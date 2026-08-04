// 04A Employee · All Modules — matches Figma frame "04A Employee • All Modules".
// This is where "View all training" lands: every module assigned to this
// employee, outstanding ones first and completed ones after, read from the same
// server records the Training dashboard reads. Modules assigned to somebody
// else never appear here, and the server refuses them even by direct URL.
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api.js'
import { useAssignedModules } from '../lib/useTraining.js'

export default function TrainingModules() {
  const [completed, setCompleted] = useState([])
  // moduleId -> progress record (best score + XP this module contributes).
  const [progress, setProgress] = useState({})
  const { modules, loaded } = useAssignedModules()

  useEffect(() => {
    api.get('/profile').then(p => {
      setCompleted(p.completedModules || [])
      setProgress(p.trainingProgress || {})
    }).catch(() => {})
  }, [])

  // Outstanding first, completed after — the order the employee needs, without
  // hiding anything they have already passed.
  const ordered = useMemo(() => {
    const outstanding = modules.filter(m => !completed.includes(m.id))
    const finished = modules.filter(m => completed.includes(m.id))
    return [...outstanding, ...finished]
  }, [modules, completed])
  const doneCount = modules.filter(m => completed.includes(m.id)).length

  return (
    <div className="max-w-[1440px] mx-auto px-4 lg:px-10 py-6 lg:py-8">
      <Link to="/training" className="text-[#667085] hover:text-navy-header font-semibold text-[13px] inline-flex items-center">
        ←&nbsp;&nbsp;Back to Training
      </Link>
      <h1 className="text-[26px] lg:text-[30px] font-bold text-navy-header mt-3">All Training Modules</h1>
      <p className="text-[#667085] text-sm mt-2 max-w-[900px]">
        Every module assigned to you, upcoming and completed. Complete modules to earn XP, stamps and unlock AI tools.
        Each module contributes its best result to your total XP — retaking one can only raise that contribution.
      </p>
      {modules.length > 0 && (
        <p className="text-navy-header font-semibold text-[13px] mt-3">
          {doneCount} of {modules.length} completed
        </p>
      )}

      <div className="flex flex-col gap-4 mt-6">
        {ordered.length === 0 && (
          <div className="bg-white border border-[#e0e0e5] rounded-[16px] px-6 py-8 text-center">
            <p className="text-navy-header font-bold text-lg">
              {loaded ? 'No modules assigned to you yet' : 'Loading your modules…'}
            </p>
            <p className="text-[#667085] text-[13.5px] mt-2 max-w-[560px] mx-auto">
              {loaded
                ? 'Training is assigned by your administrator, to you directly or to your whole department. Anything assigned to you shows up here straight away.'
                : 'Fetching the modules assigned to you.'}
            </p>
            <Link
              to="/training"
              className="bg-gold-brand hover:bg-gold text-navy-header font-semibold text-sm h-11 px-6 rounded-full inline-flex items-center mt-5"
            >
              Back to Training
            </Link>
          </div>
        )}

        {ordered.map((m, i) => {
          const done = completed.includes(m.id)
          const record = progress[m.id]
          // Open the moment it has questions — no separate content flag to fall
          // out of step with the module an admin actually published.
          const open = (m.questionCount || 0) > 0
          const Card = open ? Link : 'div'
          const cardProps = open ? { to: done ? `/training/results/${m.id}` : `/training/quiz/${m.id}` } : {}
          return (
            <Card
              key={m.id}
              {...cardProps}
              className={`bg-white border border-[#e0e0e5] rounded-[16px] min-h-[104px] sm:h-[104px] px-4 sm:px-6 py-4 sm:py-0 flex flex-col sm:flex-row items-start sm:items-center gap-4 ${
                open ? 'hover:border-navy-header' : ''
              }`}
            >
              <div
                className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg shrink-0 ${
                  done ? 'bg-[#328768]' : open ? 'bg-navy-header' : 'bg-[#ccccd1]'
                }`}
              >
                {done ? '✓' : i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-navy-header font-bold text-lg">{m.title}</p>
                <p className="text-[#667085] text-[13.5px] mt-1">{m.subtitle}</p>
                <p className="text-gold-brand font-medium text-[12.5px] mt-1.5">
                  {m.questionCount} questions ·{' '}
                  {done
                    ? `${record?.pointsEarned ?? 0} / ${m.points} XP earned${record?.attempts > 1 ? ` · ${record.attempts} attempts` : ''}`
                    : `+${m.points} XP`}
                </p>
              </div>
              {!open ? (
                <span className="bg-[#e5e5eb] text-[#667085] font-semibold text-sm h-11 px-5 rounded-full inline-flex items-center shrink-0 ml-auto sm:ml-0">
                  Coming soon
                </span>
              ) : done ? (
                <span className="bg-[#e7f1ec] border border-[#328768] text-[#19533e] font-semibold text-sm h-11 px-5 rounded-full inline-flex items-center shrink-0 ml-auto sm:ml-0">
                  {record && record.pointsEarned >= m.points ? '✓ Full XP · Revise' : '✓ Completed · Improve'}
                </span>
              ) : (
                <span className="bg-gold-brand text-navy-header font-semibold text-sm h-11 px-5 rounded-full inline-flex items-center shrink-0 ml-auto sm:ml-0">
                  Start module →
                </span>
              )}
            </Card>
          )
        })}
      </div>
    </div>
  )
}
