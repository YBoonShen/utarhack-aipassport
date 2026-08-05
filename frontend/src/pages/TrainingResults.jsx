// Training results — matches Figma frame "Training • Results"
// This is the performance/evaluation screen: it is reached only after every
// question has been answered, and it is the one place a retry is offered.
// A retry is locked for 24h after the evaluation (see lib/retryLock.js).
// moduleId comes from the route so M1/M2/M3 all land on this same results page.
import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { api } from '../lib/api.js'
import { buildLesson } from '../lib/lesson.js'
import { useAssignedModules } from '../lib/useTraining.js'
import { pickCurrentModule } from '../lib/trainingProgress.js'
import { clearCompletion, recordCompletion, retryStatus, RETRY_LOCK_HOURS } from '../lib/retryLock.js'
import { levelState, barXP, nextLevelLabel, celebrateOnce } from '../lib/levels.js'
import LevelUpOverlay from '../components/LevelUpOverlay.jsx'

function ScoreRing({ correct, total }) {
  const r = 78
  const c = 2 * Math.PI * r
  const pct = Math.round((correct / total) * 100)
  return (
    <div className="relative w-[178px] h-[178px] shrink-0">
      <svg width="178" height="178" viewBox="0 0 178 178" className="-rotate-90">
        <circle cx="89" cy="89" r={r} fill="none" stroke="#f5f2e5" strokeWidth="14" />
        <circle cx="89" cy="89" r={r} fill="none" stroke="#d5a71f" strokeWidth="14" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - correct / total)} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <p className="text-navy font-bold text-[42px] leading-none">{correct}/{total}</p>
        <p className={`font-semibold text-base mt-1.5 ${pct === 100 ? 'text-green' : 'text-[#d97706]'}`}>{pct}%</p>
      </div>
    </div>
  )
}

function Stamp({ title }) {
  const [line1, line2] = title.split(' ').reduce(
    (lines, word) => {
      const i = lines[0].length <= lines[1].length ? 0 : 1
      lines[i] = lines[i] ? `${lines[i]} ${word}` : word
      return lines
    },
    ['', '']
  )
  return (
    <div className="relative w-[94px] h-[94px] shrink-0">
      <svg width="94" height="94" viewBox="0 0 94 94">
        <circle cx="47" cy="47" r="45" fill="none" stroke="#d5a71f" strokeWidth="2.5" strokeDasharray="6 4" />
        <circle cx="47" cy="47" r="36" fill="none" stroke="#d5a71f" strokeWidth="1.5" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <p className="text-gold font-bold text-xs leading-tight">{line1}<br />{line2}</p>
      </div>
    </div>
  )
}

function evaluate(pct) {
  if (pct === 100) return { chip: '✓ PASSED', title: 'Excellent work', body: 'You answered every question correctly and demonstrated safe handling of personal and customer data.' }
  if (pct >= 67) return { chip: '✓ PASSED', title: 'Passed — solid understanding', body: 'You got most of the assessment right. Review the questions you missed below, then retake it later to sharpen your instincts.' }
  return { chip: '✓ COMPLETED', title: 'Needs another pass', body: 'You finished the assessment but missed more than one question. Read the lesson again and retake it when the retry unlocks.' }
}

export default function TrainingResults() {
  const { moduleId: moduleIdParam } = useParams()
  const moduleId = Number(moduleIdParam) || 1
  const navigate = useNavigate()

  // The module is read through the same access-checked route the quiz uses, so
  // the results of a training somebody else was assigned cannot be opened here
  // either.
  const [module, setModule] = useState(null)
  const [denied, setDenied] = useState(false)
  useEffect(() => {
    let alive = true
    setDenied(false)
    api.get(`/training/mine/${moduleId}`)
      .then(m => alive && setModule(m))
      .catch(() => alive && setDenied(true))
    return () => { alive = false }
  }, [moduleId])

  // Zeroed, not the demo employee's 1,390 points at Level 2 — the licence
  // progress card on this page was showing those to every employee for the
  // moment before /api/profile answered, immediately after they had been told
  // what they just earned. levelState() derives Level 1 from 0 points.
  const [profile, setProfile] = useState({ points: 0, level: 0, completedModules: [] })
  const [results, setResults] = useState({ correct: 0, total: 0, pointsEarned: 0, answers: {}, module: null })
  const [serverCompletedAt, setServerCompletedAt] = useState(null)
  const [now, setNow] = useState(Date.now())
  const [retrying, setRetrying] = useState(false)

  // The level-up arrives once, in the navigation state set by the quiz page.
  // celebrateOnce() then makes sure each level is celebrated a single time on
  // this device — refreshing this page (which keeps the history state) or
  // coming back to it later never replays the overlay.
  const levelUp = useLocation().state?.levelUp || null
  const [celebrating, setCelebrating] = useState(false)
  useEffect(() => {
    if (levelUp?.to && celebrateOnce(levelUp.to)) setCelebrating(true)
  }, [levelUp])

  const load = useCallback(() => {
    api.get('/profile').then(setProfile).catch(() => {})
    api.get(`/quiz/results?module=${moduleId}`).then(r => {
      if (r.attempted > 0) setResults(r)
      setServerCompletedAt(r.completedAt || null)
      // Keep the local mirror in step with the server, so the lock survives a
      // refresh or a re-login on this device.
      if (r.completedAt) recordCompletion(moduleId, r.completedAt)
    }).catch(() => {})
  }, [moduleId])

  useEffect(() => { load() }, [load])

  // Ticks the "available in …" countdown and flips the button on at the boundary.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const lock = retryStatus(moduleId, serverCompletedAt, now)

  // The employee's own module list, so "next" is a module they actually have
  // rather than whatever id happens to come after this one.
  const { modules: assigned } = useAssignedModules()
  const mod = buildLesson(module)

  if (denied) {
    return (
      <div className="max-w-[1320px] mx-auto px-4 lg:px-10 pt-8 pb-10">
        <div className="bg-card border border-sand rounded-[18px] p-8 max-w-[620px]">
          <p className="text-gold text-[10px] font-semibold tracking-[1px]">NOT ASSIGNED TO YOU</p>
          <p className="text-navy font-bold text-[22px] mt-2">You don’t have access to this training</p>
          <p className="text-slate2 text-sm mt-2.5">
            This module is either not published yet, or it was assigned to other employees. Everything assigned to you
            is on your training list.
          </p>
          <Link to="/training/modules" className="border border-navy text-navy text-[13px] font-semibold px-6 h-12 rounded-full inline-flex items-center mt-6 hover:bg-chip">
            ←&nbsp;&nbsp;All training modules
          </Link>
        </div>
      </div>
    )
  }
  if (!mod) {
    return <p className="max-w-[1320px] mx-auto px-4 lg:px-10 pt-8 pb-10 text-slate2 text-sm">Loading your results…</p>
  }

  const questionLabels = mod.questions.map(q => q.stepTitle)
  const total = mod.questions.length || results.total
  const correct = Math.min(results.correct, total)
  const scorePct = total ? Math.round((correct / total) * 100) : 0

  // XP summary. `record` is this module's stored progression record, so these
  // numbers are rebuilt from the server on a later visit too — not just in the
  // moment the assessment was submitted.
  const record = results.module
  const xpGained = record ? record.lastXpGained : results.pointsEarned
  const bestPoints = record ? record.pointsEarned : results.pointsEarned
  const previousPoints = record ? record.pointsEarned - record.lastXpGained : 0
  const outcome = record?.lastOutcome || 'first'
  const lvl = levelState(profile)
  const verdict = evaluate(scorePct)
  const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  // The next module this employee has, not the next id in the library — an id
  // they were never assigned would be a dead end. Picked with the same helper
  // the Training dashboard and the Home card use, so "next" here is the module
  // those screens will actually be showing when the employee arrives.
  const nextModule = pickCurrentModule(assigned.filter(m => m.id !== moduleId))

  async function retry() {
    if (lock.locked || retrying) return
    setRetrying(true)
    try {
      await api.post('/quiz/retry', { module: moduleId })
    } catch (err) {
      // The server still considers it locked — trust it over the local mirror.
      if (err.status === 423 && err.body?.completedAt) {
        recordCompletion(moduleId, err.body.completedAt)
        setServerCompletedAt(err.body.completedAt)
        setRetrying(false)
        return
      }
      /* offline — the local lock already expired, so let the retry through */
    }
    clearCompletion(moduleId)
    navigate(`/training/quiz/${moduleId}`)
  }

  return (
    <div className="max-w-[1320px] mx-auto px-4 lg:px-10 pt-6 lg:pt-8 pb-10">
      <div className="flex flex-col sm:flex-row items-start justify-between gap-3">
        <div>
          <h1 className="text-[26px] lg:text-[32px] font-bold text-navy">Training complete ✓</h1>
          <p className="text-slate2 text-base mt-1">Your results are ready. Review your score, rewards and progress toward the next license level.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-1.5 shrink-0">
          <span className="bg-green-soft text-green text-xs font-semibold px-6 py-2 rounded-full">{verdict.chip}</span>
          <span className={`text-xs font-semibold px-5 py-2 rounded-full ${xpGained > 0 ? 'bg-gold text-navy' : 'bg-chip text-slate2 border border-sand'}`}>
            {xpGained > 0 ? `+${xpGained} points` : 'NO NEW POINTS'}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_416px] gap-4 lg:gap-6 mt-6 items-stretch">
        {/* Score card */}
        <div className="bg-card border border-sand rounded-[18px] p-5 lg:p-7 lg:pt-5">
          <p className="text-gold text-xs font-semibold">MODULE RESULT</p>
          <p className="text-navy font-bold text-2xl mt-2">{mod.title}</p>
          <p className="text-slate2 text-sm mt-1.5">Completed {today}</p>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6 sm:gap-8 mt-6">
            <ScoreRing correct={correct} total={total} />
            <div>
              <p className="text-navy font-bold text-[22px]">{verdict.title}</p>
              <p className="text-ink text-base mt-2 max-w-[450px]">{verdict.body}</p>
            </div>
          </div>

          <p className="text-slate2 text-xs font-semibold mt-8">QUESTION PROGRESS · FULL ASSESSMENT</p>
          <div className="flex flex-col gap-2.5 mt-3">
            {questionLabels.map((label, i) => {
              const ok = results.answers?.[i]?.correct !== false
              return (
                <div key={label} className={`flex items-center gap-3.5 rounded-[10px] px-2.5 h-[42px] ${i % 2 === 0 ? 'bg-[#edf2ff]' : 'bg-card'}`}>
                  <span className="w-[30px] h-[30px] rounded-full bg-navy text-white text-xs font-semibold flex items-center justify-center shrink-0">{i + 1}</span>
                  <p className="text-navy text-sm font-medium">{label}</p>
                  {ok ? (
                    <p className="ml-auto text-green text-[13px] font-semibold pr-2">✓ Correct</p>
                  ) : (
                    <p className="ml-auto text-[#d92d20] text-[13px] font-semibold pr-2">✕ Missed</p>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Rewards card */}
        <div className="bg-navy rounded-[18px] p-5 lg:p-6">
          <p className="text-gold text-xs font-semibold">REWARDS &amp; LICENSE PROGRESS</p>
          <p className="text-white font-bold text-[42px] mt-2 leading-none">{xpGained > 0 ? `+${xpGained}` : '+0'}</p>
          <p className="text-white text-[15px] mt-2">
            {outcome === 'first' && 'Points earned · added to your total'}
            {outcome === 'improved' && 'Points improvement · only the difference is added'}
            {outcome === 'unchanged' && 'Points · your best result already counts'}
          </p>

          {/* The anti-farm rule, stated plainly to the employee (§8). */}
          <div className="bg-[#132e66] rounded-[12px] px-4 py-3 mt-4">
            {outcome === 'first' ? (
              <p className="text-white text-[13px]">
                This module now contributes <span className="font-semibold">{bestPoints} of {mod.points} points</span> to your AI License.
              </p>
            ) : outcome === 'improved' ? (
              <>
                <p className="text-white text-[13px]">
                  Previous best <span className="font-semibold">{previousPoints} points</span> → new best{' '}
                  <span className="font-semibold">{bestPoints} points</span>
                </p>
                <p className="text-[#cbd5e1] text-[12px] mt-1">
                  +{xpGained} points improvement added — not {previousPoints} + {record?.lastAttemptPoints ?? bestPoints}.
                </p>
              </>
            ) : (
              <>
                <p className="text-white text-[13px]">
                  Your best score remains <span className="font-semibold">{bestPoints} points</span>.
                </p>
                <p className="text-[#cbd5e1] text-[12px] mt-1">
                  This attempt scored {record?.lastAttemptPoints ?? 0} points, so no additional points were earned.
                </p>
              </>
            )}
          </div>

          <div className="bg-[#132e66] rounded-[14px] p-5 mt-4 flex items-center gap-4">
            <Stamp title={mod.stampTitle} />
            <div>
              <p className="text-white font-semibold text-base">Training stamp {outcome === 'first' ? 'earned' : 'updated'}</p>
              <p className="text-white text-sm mt-1.5">Added to your AI Passport<br />{today}</p>
            </div>
          </div>

          <p className="text-gold text-xs font-semibold mt-5">LICENSE PROGRESS</p>
          <p className="text-white font-bold text-xl mt-1.5">
            Level {lvl.level} · {lvl.levelName}
          </p>
          <p className="text-white text-[15px] mt-0.5">{barXP(lvl).toLocaleString()} / {lvl.nextLevelXP.toLocaleString()} safety points</p>
          {/* Progress inside the current band, so a Navigator is measured
              against 2,000 — not against the far-away 8,000 ceiling. */}
          <div className="h-3 rounded-full bg-navy-track mt-3.5">
            <div className="h-3 rounded-full bg-gold transition-all duration-700" style={{ width: `${lvl.progressPercentage}%` }} />
          </div>
          <p className="text-white text-sm mt-2.5">
            {lvl.isMaxXP ? 'MAX LEVEL · Guardian' : `${nextLevelLabel(lvl)}${lvl.isMaxLevel ? '' : ` · Level ${lvl.level + 1}`}`}
          </p>

          <div className="bg-[#132e66] rounded-[12px] px-3.5 py-2 mt-5">
            <p className="text-gold text-[11px] font-semibold">{nextModule ? `NEXT: ${nextModule.title.toUpperCase()}` : 'MORE MODULES COMING SOON'}</p>
            {nextModule && <p className="text-white text-sm mt-0.5">{nextModule.minutes}-minute lesson · +{nextModule.points} points</p>}
          </div>
        </div>
      </div>

      <div className="bg-[#edf2ff] rounded-[14px] px-5 py-3.5 mt-6">
        <p className="text-navy text-sm font-semibold">What you demonstrated</p>
        <p className="text-slate2 text-sm mt-1">{mod.steps.join(' · ')} — the safe-use habits this module builds</p>
      </div>

      {/* Evaluation + retry — the only place a retry is offered */}
      <div className="bg-card border border-sand rounded-[18px] p-5 lg:p-6 mt-6">
        <p className="text-gold text-xs font-semibold">EVALUATION</p>
        <p className="text-navy font-bold text-xl mt-1.5">
          {scorePct}% · {correct} of {total} correct
        </p>
        <div className="h-px bg-sand my-5" />
        <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
          <div className="flex-1 min-w-0 sm:min-w-[300px]">
            <p className="text-navy font-semibold text-sm">{lock.locked ? 'Retry locked' : 'Retry available'}</p>
            <p className="text-slate2 text-[13px] mt-1">
              {lock.locked
                ? `You can retake this assessment in ${lock.remainingLabel} — available ${lock.availableLabel}.`
                : bestPoints >= mod.points
                  ? `Retaking restarts the assessment from Question 1. You already hold the full ${mod.points} points, so this is revision — your stamp and points stay as they are.`
                  : `Retaking restarts the assessment from Question 1. Your stamp and ${bestPoints} points stay; only a better result adds points, up to ${mod.points}.`}
            </p>
            <p className="text-slate2 text-xs mt-1.5">
              A retry unlocks {RETRY_LOCK_HOURS} hours after each evaluation, so there is time to review the lesson first.
            </p>
          </div>
          <button
            onClick={retry}
            disabled={lock.locked || retrying}
            className={`text-[15px] font-semibold px-8 h-12 rounded-full shrink-0 ml-auto sm:ml-0 ${
              lock.locked || retrying
                ? 'bg-chip text-slate2 border border-sand cursor-not-allowed'
                : 'bg-gold hover:bg-gold-dark text-navy cursor-pointer'
            }`}
          >
            {lock.locked ? `Locked · ${lock.remainingLabel}` : retrying ? 'Starting…' : 'Retry assessment ↻'}
          </button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 mt-6">
        <Link to="/training" className="border border-navy text-navy text-[15px] font-semibold w-full sm:w-[220px] h-12 rounded-full flex items-center justify-center hover:bg-chip">
          Back to Training
        </Link>
        <Link to="/license" className="bg-gold hover:bg-gold-dark text-navy text-[15px] font-semibold w-full sm:w-[260px] h-12 rounded-full flex items-center justify-center">
          View My License →
        </Link>
      </div>

      {celebrating && (
        <LevelUpOverlay
          level={levelUp.to}
          levelName={levelUp.levelName}
          totalXP={levelUp.totalXP ?? profile.points}
          onClose={() => setCelebrating(false)}
        />
      )}
    </div>
  )
}
