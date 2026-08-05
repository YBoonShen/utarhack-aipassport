// 04A Employee · All Modules — matches Figma frame "04A Employee • All Modules".
// This is where "View all training" lands: every module assigned to this
// employee, unfinished ones first and completed ones after, read from the same
// server records the Training dashboard reads. Modules assigned to somebody
// else never appear here, and the server refuses them even by direct URL.
//
// Each module arrives from /api/training/mine carrying this employee's own
// progress on it, and useAssignedModules keeps that snapshot fresh. The page
// used to fetch /api/profile alongside it and cross-reference two lists by id,
// which is a second copy of the same fact and one more thing to fall out of
// step; there is now one source for both the ordering and the labels.
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAssignedModules } from '../lib/useTraining.js'
import { TRAINING_STATUS } from '../lib/terms.js'
import { playable, moduleState, moduleHref, orderUpcoming } from '../lib/trainingProgress.js'
import BackLink from '../components/BackLink.jsx'

export default function TrainingModules() {
  const { modules, loaded } = useAssignedModules()

  // In-progress first, then untouched, then completed — the same ordering the
  // Training dashboard applies, from the same server-reported progress, so the
  // two lists never disagree about what state a module is in. Completed modules
  // stay listed: this is where a redo is started from.
  const ordered = useMemo(() => orderUpcoming(modules, null), [modules])
  const doneCount = modules.filter(m => m.progress?.completed).length

  return (
    <div className="max-w-[1440px] mx-auto px-4 lg:px-10 py-6 lg:py-8">
      <BackLink to="/training">Back to Training</BackLink>
      <h1 className="text-[26px] lg:text-[30px] font-bold text-navy-header mt-3">All Training Modules</h1>
      <p className="text-[#667085] text-sm mt-2 max-w-[900px]">
        Every module assigned to you, upcoming and completed. Complete modules to earn safety points, stamps and unlock AI tools.
        Each module contributes its best result to your total safety points — retaking one can only raise that contribution.
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
          // Every state comes from the module's own server-reported progress,
          // so this list and the Training dashboard label the same module the
          // same way.
          const state = moduleState(m)
          const done = state === 'completed'
          const started = state === 'inProgress'
          const record = m.progress || {}
          const open = playable(m)
          const Card = open ? Link : 'div'
          const cardProps = open ? { to: moduleHref(m) } : {}
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
                    ? `${record.pointsEarned ?? 0} / ${m.points} points earned${record.attempts > 1 ? ` · ${record.attempts} attempts` : ''}`
                    : started
                      ? `${Math.min(record.attempted, m.questionCount)} of ${m.questionCount} answered · +${m.points} points`
                      : `+${m.points} points`}
                </p>
              </div>
              {!open ? (
                <span className="bg-[#e5e5eb] text-[#667085] font-semibold text-sm h-11 px-5 rounded-full inline-flex items-center shrink-0 ml-auto sm:ml-0">
                  {TRAINING_STATUS.unavailable}
                </span>
              ) : done ? (
                <span className="bg-[#e7f1ec] border border-[#328768] text-[#19533e] font-semibold text-sm h-11 px-5 rounded-full inline-flex items-center shrink-0 ml-auto sm:ml-0">
                  {record.pointsEarned >= m.points ? '✓ Full points · Revise' : `✓ ${TRAINING_STATUS.completed} · Improve`}
                </span>
              ) : started ? (
                <span className="bg-gold-brand text-navy-header font-semibold text-sm h-11 px-5 rounded-full inline-flex items-center shrink-0 ml-auto sm:ml-0">
                  Resume module →
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
