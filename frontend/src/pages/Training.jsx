// 04 Employee · Training Dashboard — matches Figma frame "04 Employee • Training Dashboard"
// Live data: miles/stamps come from the backend profile; the module list comes
// from the server's assignment records, filtered to what an admin has actually
// published and assigned to THIS employee. Nothing on this page counts, or
// shows, a module the employee does not have.
//
// A module is open the moment it is published and assigned. It used to be
// possible for an assigned module to sit permanently on "content coming soon",
// because playability was decided by whether the frontend happened to ship
// hard-coded lesson content for that id — an admin-authored module never
// qualified, however many questions it had. Playability now follows the
// questions the module actually holds.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api.js'
import { useAssignedModules } from '../lib/useTraining.js'
import { levelState, barXP, nextLevelLabel, progressHint, learningProgress } from '../lib/levels.js'
import { TRAINING_STATUS } from '../lib/terms.js'
import {
  playable, moduleState, moduleStatusLabel, moduleAction, moduleHref,
  pickCurrentModule, orderUpcoming, completedModules, allComplete,
} from '../lib/trainingProgress.js'

export default function Training() {
  // Zeroed, not the demo employee's figures. This used to open on 1,240 points
  // and Level 2 · Navigator for everyone, so a Trainee with no history was shown
  // a stranger's licence for the moment before /api/profile answered — and kept
  // it if the call failed. An unanswered profile now shows nothing rather than
  // something wrong; levelState() derives Level 1 from 0 points.
  const [profile, setProfile] = useState({
    points: 0, level: 0, stamps: [], trainingCompleted: false, completedModules: [], trainingProgress: {},
  })
  const { modules, loaded } = useAssignedModules()

  useEffect(() => {
    let alive = true
    const load = () => api.get('/profile').then(p => alive && setProfile(p)).catch(() => {})
    load()
    // Polled so a completion recorded in another tab (or on the quiz page) is
    // reflected here without a manual reload.
    const t = setInterval(load, 5000)
    return () => { alive = false; clearInterval(t) }
  }, [])

  // Every module now carries this employee's own progress from the server
  // (/api/training/mine), and the trainingStore polls it on the same cadence as
  // the profile above. The page therefore needs no per-module fetch of its own:
  // it used to ask /quiz/results for the one module it had already guessed was
  // current, which is why a part-finished module further down the list could
  // never become the current one.
  const lvl = levelState(profile)
  const current = pickCurrentModule(modules)
  const upcoming = orderUpcoming(modules, current?.id ?? null)
  const finished = completedModules(modules)
  const finishedAll = allComplete(modules)
  const currentState = current ? moduleState(current) : null

  const questionsDone = Math.min(current?.progress?.attempted ?? 0, current?.questionCount ?? 0)
  const quizPct = current?.questionCount ? Math.round((questionsDone / current.questionCount) * 100) : 0

  const currentKpi = modules.length === 0
    ? (loaded ? 'None assigned' : '—')
    : finishedAll
      ? 'All complete'
      : currentState === 'unavailable'
        ? TRAINING_STATUS.unavailable
        : currentState === 'inProgress'
          ? TRAINING_STATUS.inProgress
          : TRAINING_STATUS.notStarted

  const kpis = [
    { label: 'CURRENT MODULE', value: currentKpi, dark: true },
    { label: 'COMPLETED', value: `${finished.length} of ${modules.length} modules` },
    { label: 'SAFETY POINTS', value: `${lvl.totalXP.toLocaleString()} pts` },
    { label: 'NEXT LEVEL', value: lvl.isMaxXP ? 'Max level' : nextLevelLabel(lvl) },
  ]

  // Learning progress: current safety points against the points that unlock the
  // next level (lib/levels.js). It is the same arithmetic as the
  // "1,240 / 2,000 safety points" line printed underneath it, so the two can be
  // checked against each other — and it moves with the points the backend
  // actually holds rather than with a count this page derives for itself.
  const pathPct = learningProgress(lvl)

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

      {modules.length === 0 ? (
        <div className="bg-card border border-sand rounded-[16px] p-6 lg:p-8 mt-7 text-center">
          {/* "Still loading" and "you have nothing" are different facts and are
              never shown as the same sentence. */}
          <p className="text-navy font-bold text-[22px]">{loaded ? 'No training assigned yet' : 'Loading your training…'}</p>
          <p className="text-ink text-[15px] mt-2 max-w-[560px] mx-auto">
            {loaded
              ? 'Your administrator has not assigned any modules to you. New training appears here automatically as soon as it is assigned to you or to your department.'
              : 'Fetching the modules assigned to you.'}
          </p>
        </div>
      ) : (
        <>
          <h2 className="text-[22px] font-bold text-navy mt-7 mb-3">Current training</h2>
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_456px] gap-4 lg:gap-6 items-stretch">
            {/* A completed module is never the current one. When every assigned
                module is finished this card says so, instead of putting the
                first module back under a "Current training" heading with a
                ✓ Completed chip on it. Redoing one is done from All training
                modules, which is the action offered here. */}
            {!current ? (
              <div className="bg-card border border-sand rounded-[16px] p-5 lg:p-6 lg:pt-5">
                <span className="inline-block text-xs font-semibold px-4 py-1.5 rounded-full bg-green-soft text-green">
                  ✓ {TRAINING_STATUS.completed}
                </span>
                <p className="text-navy font-bold text-[22px] lg:text-[26px] mt-3.5">All your training is complete</p>
                <p className="text-ink text-base mt-2 max-w-[790px]">
                  You have finished all {modules.length} module{modules.length === 1 ? '' : 's'} assigned to you. New training
                  appears here as soon as your administrator assigns it to you or to your department.
                </p>
                <div className="flex flex-wrap items-center gap-4 mt-6">
                  <p className="text-slate2 text-[13px] font-medium flex-1 min-w-[200px]">
                    Retaking a module can raise its points, never duplicate them.
                  </p>
                  <Link
                    to="/training/modules"
                    className="bg-gold hover:bg-gold-dark text-navy font-semibold text-[15px] px-5 h-12 rounded-full flex items-center shrink-0 ml-auto lg:ml-0"
                  >
                    View all training →
                  </Link>
                </div>
              </div>
            ) : (
              <div className="bg-card border border-sand rounded-[16px] p-5 lg:p-6 lg:pt-5">
                <span className="inline-block text-xs font-semibold px-4 py-1.5 rounded-full bg-[#edf2ff] text-navy">
                  {moduleStatusLabel(current)}
                </span>
                <p className="text-navy font-bold text-[22px] lg:text-[26px] mt-3.5">{current.title}</p>
                <p className="text-ink text-base mt-2 max-w-[790px]">{current.subtitle}</p>
                <div className="flex flex-wrap gap-2.5 mt-4">
                  <span className="bg-chip text-slate2 text-xs font-semibold px-4 py-1.5 rounded-full">{current.minutes}-minute lesson</span>
                  <span className="bg-chip text-slate2 text-xs font-semibold px-4 py-1.5 rounded-full">{current.questionCount} questions</span>
                  <span className="bg-green-soft text-green text-xs font-semibold px-4 py-1.5 rounded-full">+{current.points} points</span>
                </div>
                <div className="flex flex-wrap items-center gap-4 mt-6">
                  <p className="text-slate2 text-[13px] font-semibold shrink-0">Quiz progress</p>
                  <div className="h-2.5 rounded-full bg-chip flex-1 min-w-[120px] max-w-[476px]">
                    <div className="h-2.5 rounded-full bg-gold transition-all duration-700" style={{ width: `${quizPct}%` }} />
                  </div>
                  <p className="text-navy text-sm font-semibold shrink-0">{questionsDone} of {current.questionCount}</p>
                  {playable(current) ? (
                    <Link
                      to={moduleHref(current)}
                      className="bg-gold hover:bg-gold-dark text-navy font-semibold text-[15px] px-5 h-12 rounded-full flex items-center shrink-0 ml-auto lg:ml-0"
                    >
                      {currentState === 'inProgress' ? 'Resume training →' : 'Start training →'}
                    </Link>
                  ) : (
                    <span className="bg-chip text-slate2 font-semibold text-[15px] px-5 h-12 rounded-full flex items-center shrink-0 ml-auto lg:ml-0">
                      Content coming soon
                    </span>
                  )}
                </div>
              </div>
            )}

            <div className="bg-navy rounded-[16px] p-5 lg:p-6">
              <p className="text-gold text-xs font-semibold">YOUR LEARNING PROGRESS</p>
              <p className="text-white text-[44px] font-bold mt-2">{pathPct}%</p>
              <p className="text-white text-base mt-1">
                {lvl.isMaxXP
                  ? 'Maximum safety points reached'
                  : `Toward Level ${lvl.level + 1} · ${lvl.nextLevelName}`}
              </p>
              <div className="h-3 rounded-full bg-navy-track mt-4">
                <div className="h-3 rounded-full bg-gold transition-all duration-700" style={{ width: `${pathPct}%` }} />
              </div>
              {/* The two numbers the percentage above is made of, so it can be
                  checked rather than taken on trust. */}
              <p className="text-white text-sm font-medium mt-3">
                {barXP(lvl).toLocaleString()} / {lvl.nextLevelXP.toLocaleString()} safety points&nbsp;&nbsp;·&nbsp;&nbsp;{finished.length} of {modules.length} module{modules.length === 1 ? '' : 's'} completed
              </p>
              <div className="bg-navy-mid rounded-[10px] px-3 py-2 mt-4">
                <p className="text-white text-[13px] font-medium">{progressHint(lvl)}</p>
              </div>
            </div>
          </div>

          {/* Heading and its action share one row: the section title on the left,
              the secondary "see everything" action on the right, where every
              other list action on the employee side sits. */}
          <div className="flex flex-wrap items-center justify-between gap-3 mt-8 mb-3">
            <h2 className="text-[22px] font-bold text-navy">Upcoming training</h2>
            <Link
              to="/training/modules"
              className="border border-navy text-navy font-semibold text-sm px-5 h-11 rounded-full inline-flex items-center hover:bg-chip focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
            >
              View all training →
            </Link>
          </div>

          {upcoming.length === 0 ? (
            <div className="bg-card border border-sand rounded-[16px] p-5">
              <p className="text-navy font-semibold text-[15px]">Nothing else is queued for you</p>
              <p className="text-slate2 text-[13px] mt-1">
                {modules.length === 1
                  ? 'This is the only module assigned to you right now. New training appears here as soon as it is assigned.'
                  : 'You have opened every module assigned to you. Use View all training to revisit a completed one.'}
              </p>
            </div>
          ) : (
            /* Ordered by real state: unfinished attempts first (most recently
               worked on first), then untouched modules in library order, then
               completed ones. With nothing started this is exactly the library
               order — the ordering only reacts once there is progress. */
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-5">
              {upcoming.map(u => {
                const state = moduleState(u)
                const open = playable(u)
                const done = state === 'completed'
                const started = state === 'inProgress'
                const Card = open ? Link : 'div'
                const cardProps = open ? { to: moduleHref(u) } : {}
                return (
                  <Card
                    key={u.id}
                    {...cardProps}
                    className={`bg-card border border-sand rounded-[16px] p-5 block ${open ? 'hover:border-navy' : ''}`}
                  >
                    <p className={`text-xs font-semibold ${done ? 'text-green' : 'text-gold'}`}>
                      {done ? `✓ ${TRAINING_STATUS.completed.toUpperCase()}` : moduleStatusLabel(u).toUpperCase()}
                    </p>
                    <p className="text-navy font-bold text-[21px] mt-2">{u.title}</p>
                    <p className="text-ink text-[15px] mt-2">{u.subtitle}</p>
                    {/* An attempt in progress shows where it stopped, so the
                        card and the Resume button agree on what "resume" means. */}
                    {started && (
                      <div className="flex items-center gap-3 mt-3.5">
                        <div className="h-1.5 rounded-full bg-chip flex-1 min-w-0">
                          <div
                            className="h-1.5 rounded-full bg-gold transition-all duration-700"
                            style={{ width: `${Math.round((Math.min(u.progress.attempted, u.questionCount) / u.questionCount) * 100)}%` }}
                          />
                        </div>
                        <p className="text-slate2 text-[12px] font-semibold shrink-0">
                          {Math.min(u.progress.attempted, u.questionCount)} of {u.questionCount}
                        </p>
                      </div>
                    )}
                    <div className="flex flex-wrap items-end justify-between gap-3 mt-5">
                      <p className="text-slate2 text-[13px] font-medium">
                        {u.minutes} min · {u.questionCount} questions ·{' '}
                        {done ? `${u.progress.pointsEarned} / ${u.points} points earned` : `+${u.points} points`}
                      </p>
                      <span
                        className={`text-xs font-semibold px-4 py-1.5 rounded-full ${
                          !open ? 'bg-chip text-slate2' : done ? 'bg-green-soft text-green' : 'bg-gold text-navy'
                        }`}
                      >
                        {moduleAction(u)}
                      </span>
                    </div>
                  </Card>
                )
              })}
            </div>
          )}
        </>
      )}

      <p className="text-slate2 text-[13px] mt-6">
        Training is assigned by role and risk signals. Completed modules add a certification to your AI Passport. Each module
        contributes its best result to your safety points once — retaking one can raise that result, never duplicate it.
      </p>
    </div>
  )
}
