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
import { levelState, nextLevelLabel, progressHint } from '../lib/levels.js'

const playable = module => (module?.questionCount || 0) > 0

function statusLabel(module, done) {
  if (done) return '✓ COMPLETED'
  if (!playable(module)) return 'ASSIGNED · CONTENT COMING SOON'
  return 'AVAILABLE NOW'
}

export default function Training() {
  const [profile, setProfile] = useState({
    points: 1240, target: 2000, level: 2, levelName: 'Navigator',
    stamps: [{}, {}, {}], trainingCompleted: false, completedModules: [], trainingProgress: {},
  })
  // Answered-question count for the module in progress, so the quiz bar reports
  // the employee's real position instead of a fixed fraction.
  const [answered, setAnswered] = useState(null)
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

  const completed = profile.completedModules || []
  const progress = profile.trainingProgress || {}
  // Only modules this employee actually has count towards their progress — a
  // module completed before it was unpublished must not inflate the ratio.
  const completedHere = modules.filter(m => completed.includes(m.id))
  // Current = the first module still outstanding; everything else is upcoming.
  const current = modules.find(m => !completed.includes(m.id)) || modules[0] || null
  const currentRecord = current ? progress[current.id] || null : null
  const currentDone = Boolean(currentRecord?.completed) || (current ? completed.includes(current.id) : false)
  const upcoming = modules.filter(m => m.id !== current?.id)
  const currentId = current?.id ?? null
  const currentPlayable = playable(current)

  useEffect(() => {
    setAnswered(null)
    if (!currentId || !currentPlayable) return
    let alive = true
    api.get(`/quiz/results?module=${currentId}`)
      .then(r => alive && setAnswered(r.attempted ?? 0))
      .catch(() => {})
    return () => { alive = false }
  }, [currentId, currentPlayable])

  const lvl = levelState(profile)
  const questionsDone = currentDone ? current?.questionCount ?? 0 : Math.min(answered ?? 0, current?.questionCount ?? 0)
  const quizPct = current?.questionCount ? Math.round((questionsDone / current.questionCount) * 100) : 0

  const kpis = [
    {
      label: 'CURRENT MODULE',
      value: !current ? 'None assigned' : currentDone ? 'Completed' : '1 in progress',
      dark: true,
    },
    { label: 'COMPLETED', value: `${completedHere.length} of ${modules.length} modules` },
    { label: 'TOTAL XP', value: `${lvl.totalXP.toLocaleString()} XP` },
    { label: 'NEXT LEVEL', value: lvl.isMaxXP ? 'Max level' : nextLevelLabel(lvl) },
  ]
  // The learning path is how much of this employee's assigned library is
  // finished — one entry per unique module, so redoing a module never moves it.
  const pathPct = modules.length ? Math.round((completedHere.length / modules.length) * 100) : 0

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

      {!current ? (
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
            <div className="bg-card border border-sand rounded-[16px] p-5 lg:p-6 lg:pt-5">
              <span className={`inline-block text-xs font-semibold px-4 py-1.5 rounded-full ${currentDone ? 'bg-green-soft text-green' : 'bg-[#edf2ff] text-navy'}`}>
                {currentDone ? '✓ COMPLETED' : 'IN PROGRESS'}
              </span>
              <p className="text-navy font-bold text-[22px] lg:text-[26px] mt-3.5">{current.title}</p>
              <p className="text-ink text-base mt-2 max-w-[790px]">{current.subtitle}</p>
              <div className="flex flex-wrap gap-2.5 mt-4">
                <span className="bg-chip text-slate2 text-xs font-semibold px-4 py-1.5 rounded-full">{current.minutes}-minute lesson</span>
                <span className="bg-chip text-slate2 text-xs font-semibold px-4 py-1.5 rounded-full">{current.questionCount} questions</span>
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
                  <div className="h-2.5 rounded-full bg-gold transition-all duration-700" style={{ width: `${quizPct}%` }} />
                </div>
                <p className="text-navy text-sm font-semibold shrink-0">{questionsDone} of {current.questionCount}</p>
                {currentPlayable ? (
                  <Link
                    to={currentDone ? `/training/results/${current.id}` : `/training/quiz/${current.id}`}
                    className="bg-gold hover:bg-gold-dark text-navy font-semibold text-[15px] px-5 h-12 rounded-full flex items-center shrink-0 ml-auto lg:ml-0"
                  >
                    {currentDone ? 'View results →' : 'Resume training →'}
                  </Link>
                ) : (
                  <span className="bg-chip text-slate2 font-semibold text-[15px] px-5 h-12 rounded-full flex items-center shrink-0 ml-auto lg:ml-0">
                    Content coming soon
                  </span>
                )}
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
                {completedHere.length} module{completedHere.length === 1 ? '' : 's'} completed&nbsp;&nbsp;·&nbsp;&nbsp;{profile.trainingXP ?? 0} XP from training
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
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-5">
              {upcoming.map(u => {
                const record = progress[u.id]
                const done = completed.includes(u.id)
                const open = playable(u)
                const Card = open ? Link : 'div'
                const cardProps = open ? { to: done ? `/training/results/${u.id}` : `/training/quiz/${u.id}` } : {}
                return (
                  <Card
                    key={u.id}
                    {...cardProps}
                    className={`bg-card border border-sand rounded-[16px] p-5 block ${open ? 'hover:border-navy' : ''}`}
                  >
                    <p className="text-gold text-xs font-semibold">{statusLabel(u, done)}</p>
                    <p className="text-navy font-bold text-[21px] mt-2">{u.title}</p>
                    <p className="text-ink text-[15px] mt-2">{u.subtitle}</p>
                    <div className="flex flex-wrap items-end justify-between gap-3 mt-5">
                      <p className="text-slate2 text-[13px] font-medium">
                        {u.minutes} min · {u.questionCount} questions ·{' '}
                        {done ? `${record?.pointsEarned ?? 0} / ${u.points} XP earned` : `+${u.points} XP`}
                      </p>
                      <span
                        className={`text-xs font-semibold px-4 py-1.5 rounded-full ${
                          !open ? 'bg-chip text-slate2' : done ? 'bg-green-soft text-green' : 'bg-gold text-navy'
                        }`}
                      >
                        {!open ? 'Coming soon' : done ? 'Redo · improve only' : 'Start module →'}
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
        Training is assigned by role and risk signals. Completed modules add a stamp to your AI Passport. Each module
        contributes its best result to your XP once — retaking one can raise that result, never duplicate it.
      </p>
    </div>
  )
}
