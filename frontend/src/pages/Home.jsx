// 00H Employee · Home — matches Figma frame "00H Employee • Home".
//
// Three quick actions across the top, then quick access, then "Your progress":
// the AI Passport card and Recent activity. Everything on the page is live —
// the passport card and the counters read /api/profile, the quick actions read
// the employee's assigned training, their own visa requests and their own audit
// events, and recent activity is the employee's notification feed.
//
// The quick actions are three separate workflows, not three views of one:
// continue the training you were given → manage the AI tools you may use → look
// at what the system recorded for you. None of them repeats the Chrome
// extension, which does the masking itself inside the AI tool.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, currentUser } from '../lib/api.js'
import { levelState, barXP, progressHint } from '../lib/levels.js'
import { useNotifications } from '../components/notificationsStore.jsx'
import { useAssignedModules } from '../lib/useTraining.js'
import { playable, pickCurrentModule, allComplete } from '../lib/trainingProgress.js'
import { actionText } from '../lib/activity.js'
import InfoPopover, { InfoList, InfoNote } from '../components/InfoPopover.jsx'
import {
  TOOL_ACCESS_PATH, TOOL_ACCESS_CATEGORY, LEGACY_TOOL_ACCESS_CATEGORY,
  PENDING_STATUSES, ACCESS_STATUS,
} from '../lib/terms.js'

// Shown for the moment before /api/profile answers, and if it never does.
// Zeroed, not the demo employee's figures. This was 'Tan Jia Yin', Level 2 and
// 1,240 points, so every employee's home page opened on somebody else's licence
// and counters for the moment before /api/profile answered — and kept them if
// the call failed. The greeting falls back to the signed-in user's own name.
const fallbackProfile = {
  name: '', level: 0, points: 0,
  promptsProtected: 0, itemsMasked: 0, streakDays: 0,
}

// Recent activity is the notification feed rendered compactly, so the icon set is
// keyed by the categories addNotification() already writes — one per category,
// matching the four rows this card was designed around.
const activityStyle = {
  'SMART GATEWAY': { icon: '●', color: 'text-[#328768]' }, // a prompt was protected
  TRAINING: { icon: '✓', color: 'text-gold-brand' },       // a module was completed
  [TOOL_ACCESS_CATEGORY]: { icon: '◐', color: 'text-navy' },        // a tool request moved
  // Same row, written before the rename and still sitting in persisted feeds.
  [LEGACY_TOOL_ACCESS_CATEGORY]: { icon: '◐', color: 'text-navy' },
  MILESTONE: { icon: '★', color: 'text-[#328768]' },       // a level or streak
}
const defaultStyle = { icon: '•', color: 'text-navy' }

// The feed stores a display stamp ("Today · 09:30", "Yesterday · 17:45",
// "16 Jul 2026 · 15:42"). This column is narrow, so it keeps the part that
// actually distinguishes one entry from another, and passes anything in an
// unexpected shape straight through rather than mangling it.
function shortWhen(time) {
  const stamp = String(time || '')
  if (stamp.startsWith('Today · ')) return stamp.slice(8)
  if (stamp.startsWith('Yesterday')) return 'Yesterday'
  const [date] = stamp.split(' · ')
  const parts = date.split(' ')
  return parts.length >= 2 ? `${parts[0]} ${parts[1]}` : date
}

const ACTIVITY_SHOWN = 4

export default function Home() {
  const [profile, setProfile] = useState(fallbackProfile)
  const [visaRequests, setVisaRequests] = useState([])
  const [myEvents, setMyEvents] = useState([])
  const user = currentUser()
  // The signed-in session names the greeting; the profile is the fallback and
  // "there" covers the moment before either has arrived.
  const firstName = String(user?.name || profile.name || '').split(' ')[0] || 'there'

  // The provider already polls /api/notifications every 4s for the whole app and
  // only does so for an employee session, so this card follows the employee's own
  // feed with no second request and no chance of showing someone else's activity.
  const { items } = useNotifications() || { items: [] }

  // The same cached snapshot the Training pages read: only the modules an admin
  // has actually assigned to THIS employee.
  const { modules, loaded: trainingLoaded } = useAssignedModules()

  useEffect(() => {
    let alive = true
    const load = () => {
      api.get('/profile').then(p => alive && setProfile(p)).catch(() => {})
      api.get('/visas').then(r => alive && setVisaRequests(r)).catch(() => {})
      // Server-scoped to the signed-in employee — see /api/activity/mine.
      api.get('/activity/mine').then(a => alive && setMyEvents(a.events || [])).catch(() => {})
    }
    load()
    // Polled on the same cadence as the feed: a protected prompt moves the
    // counters, the activity card and the feed at once, and one going stale
    // while the others update would look broken.
    const t = setInterval(load, 4000)
    return () => { alive = false; clearInterval(t) }
  }, [])

  // ---- 1 · Continue training ------------------------------------------------
  // Picked with the same helper the Training dashboard uses, from the same
  // server-reported per-module progress, so the two screens always name and
  // open the same module. They previously each carried their own copy of
  // "first module not in completedModules", which ignored progress and fell
  // back to modules[0] once everything was finished — so a fully-trained
  // employee was invited to "continue" a module they had already passed.
  const current = pickCurrentModule(modules)
  const finishedAll = allComplete(modules)
  const questionCount = current?.questionCount ?? 0
  const questionsDone = Math.min(current?.progress?.attempted ?? 0, questionCount)

  const trainingCard = () => {
    if (!current) {
      if (finishedAll) {
        return {
          title: 'All your training is complete',
          desc: `You have finished all ${modules.length} module${modules.length === 1 ? '' : 's'} assigned to you. New training appears here as soon as it is assigned.`,
          button: 'View all training →', to: '/training/modules',
        }
      }
      return {
        // "Still loading" and "you have nothing" are different facts and are
        // never shown as the same sentence.
        title: trainingLoaded ? 'No training assigned yet' : 'Loading your training…',
        desc: trainingLoaded
          ? 'New modules appear here as soon as your administrator assigns one to you or to your department.'
          : 'Fetching the modules assigned to you.',
        button: 'View training →', to: '/training',
      }
    }
    if (!playable(current)) {
      return {
        title: current.title,
        desc: 'Assigned to you. The questions for this module have not been published yet.',
        button: 'View training →', to: '/training',
      }
    }
    return {
      title: current.title,
      desc: `${questionsDone} of ${questionCount} question${questionCount === 1 ? '' : 's'} answered · +${current.points} points on completion.`,
      button: questionsDone > 0 ? 'Resume training →' : 'Start module →',
      to: `/training/quiz/${current.id}`,
    }
  }

  // ---- 2 · AI tools ---------------------------------------------------------
  // Only this employee's own requests. /api/visas serves the whole queue for the
  // admin console, so the filter is what makes the card personal — and there is
  // no fallback to somebody else's request when the employee has none.
  const myRequests = visaRequests.filter(r => r.requester === user?.id)
  const pending = myRequests.filter(r => PENDING_STATUSES.includes(r.status))

  const toolsCard = pending.length > 0
    ? {
        title: pending.length === 1
          ? `${pending[0].tool} · ${ACCESS_STATUS.pending}`
          : `${pending.length} requests ${ACCESS_STATUS.pending.toLowerCase()}`,
        desc: 'Your request is with IT and Compliance. See the tools you are approved for while you wait.',
      }
    : {
        title: 'Your approved AI tools',
        desc: 'Which AI tools you may use and with what data — and how to request access to another one.',
      }

  // ---- 3 · My AI activity ---------------------------------------------------
  // The employee's own audit events. Nothing is padded out when there are none:
  // an empty history says so.
  const latestEvent = myEvents[0] || null
  const activityCard = latestEvent
    ? {
        title: actionText(latestEvent),
        desc: `${latestEvent.tool} · ${latestEvent.time}. ${myEvents.length} event${myEvents.length === 1 ? '' : 's'} recorded on your account.`,
      }
    : {
        title: 'No activity recorded yet',
        desc: 'Prompts the Smart Gateway checks, training you finish and tools you request are recorded here as they happen.',
      }

  // One card carries the filled gold action, the other two an outline: training
  // is what the employee is actually being asked to do, and three equally loud
  // buttons made the row read as three choices rather than one next step.
  const quickActions = [
    { kicker: 'CONTINUE TRAINING', kickerColor: 'text-gold-brand', primary: true, ...trainingCard() },
    { kicker: 'AI TOOLS', kickerColor: 'text-navy', ...toolsCard, button: 'View AI tools →', to: TOOL_ACCESS_PATH },
    { kicker: 'MY AI ACTIVITY', kickerColor: 'text-[#19533e]', ...activityCard, button: 'View my activity →', to: '/activity' },
  ]

  // Newest first — the server unshifts each new notification, so feed order is
  // already chronological. Deleted entries are the employee's own choice to hide
  // and are respected here exactly as they are on the Notifications page.
  const activity = (items || []).filter(n => !n.deleted).slice(0, ACTIVITY_SHOWN)

  // Progress within the current level band (lib/levels.js), not a share of the
  // whole 0 → 8,000 system.
  const lvl = levelState(profile)

  return (
    <div className="max-w-[1440px] mx-auto px-4 lg:px-10 py-6 lg:py-8">
      <h1 className="text-[26px] lg:text-[30px] font-bold text-navy-header">Good morning, {firstName}</h1>
      <p className="text-[#667085] text-[15px] mt-1.5">Here&rsquo;s what needs your attention today.</p>

      {/* Where you stand, before what to do about it. The passport card lower
          down still owns the detail; this is the one-line answer to "what level
          am I and how far along am I", which previously took a scroll to find. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mt-4">
        <span className="bg-navy-header text-white font-semibold text-[12.5px] rounded-full px-3.5 py-1.5">
          AI License · Level {lvl.level} · {lvl.levelName}
        </span>
        <span className="text-[#667085] text-[13px]">
          {barXP(lvl).toLocaleString()} / {lvl.nextLevelXP.toLocaleString()} safety points · {progressHint(lvl)}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6 mt-6">
        {quickActions.map(c => (
          <div key={c.kicker} className="bg-white border border-[#e0e0e5] rounded-[16px] p-6 flex flex-col">
            <p className={`font-semibold text-[11px] ${c.kickerColor}`}>{c.kicker}</p>
            <p className="text-navy-header font-bold text-lg mt-2.5">{c.title}</p>
            <p className="text-[#667085] text-[13.5px] mt-2.5 flex-1">{c.desc}</p>
            {/* ml-auto puts the action on the right on phones, like the
                upcoming-training cards; lg:ml-0 restores the desktop position. */}
            <Link
              to={c.to}
              className={`font-semibold text-sm px-5 h-11 rounded-full inline-flex items-center justify-center mt-5 w-fit ml-auto lg:ml-0 ${
                c.primary
                  ? 'bg-gold-brand hover:bg-gold text-navy-header'
                  : 'border-[1.5px] border-navy-header text-navy-header hover:bg-chip'
              }`}
            >
              {c.button}
            </Link>
          </div>
        ))}
      </div>

      <p className="text-[#667085] font-semibold text-[13px] mt-8">Your progress</p>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.2fr] gap-4 lg:gap-6 mt-3">
        <div className="bg-navy-header rounded-[16px] p-5 lg:p-7">
          <div className="flex items-center gap-2">
            <p className="text-gold-brand font-semibold text-[11px]">YOUR AI PASSPORT</p>
            <InfoPopover label="About your AI Passport" title="About your AI Passport">
              <p className="text-[#667085] text-[13px] mt-2 leading-relaxed">
                Your AI Passport is the whole record of how you use AI at work — your licence level, the training you
                have finished, and your safe-use history. It travels with you the way a passport does.
              </p>
              <InfoList
                heading="What is in it"
                items={[
                  ['AI License', 'your level (Trainee → Guardian) and which AI tools it unlocks.'],
                  ['Safety points', 'earned by finishing training and using AI safely. They are what move your level.'],
                  ['Certifications', 'one per module you complete, added to your record.'],
                  ['AI Safety Score', 'your safe-use standing — prompts protected, items masked, safe streak.'],
                ]}
              />
              <InfoNote title="How it grows">
                Complete the training assigned to you and send prompts through the Smart Gateway. Both add safety
                points, and enough points move you to the next AI License level.
              </InfoNote>
            </InfoPopover>
          </div>
          <p className="text-white font-bold text-[26px] mt-2.5">Level {lvl.level} · {lvl.levelName}</p>
          <p className="text-[#cbd5e1] text-sm mt-2">{barXP(lvl).toLocaleString()} / {lvl.nextLevelXP.toLocaleString()} safety points</p>
          <div className="h-2.5 rounded-full bg-[#213866] mt-3">
            <div className="h-2.5 rounded-full bg-gold-brand transition-all duration-700" style={{ width: `${lvl.progressPercentage}%` }} />
          </div>
          <p className="text-[#cbd5e1] text-[13px] mt-2.5">{progressHint(lvl)}</p>
          <div className="grid grid-cols-3 mt-6">
            <div>
              <p className="text-white font-bold text-[22px]">{profile.promptsProtected}</p>
              <p className="text-[#cbd5e1] text-xs mt-1">prompts protected</p>
            </div>
            <div>
              <p className="text-white font-bold text-[22px]">{profile.itemsMasked}</p>
              <p className="text-[#cbd5e1] text-xs mt-1">items masked</p>
            </div>
            <div>
              <p className="text-white font-bold text-[22px]">{profile.streakDays} days</p>
              <p className="text-[#cbd5e1] text-xs mt-1">safe streak</p>
            </div>
          </div>
          <Link to="/license" className="bg-gold-brand hover:bg-gold text-navy-header font-semibold text-sm px-5 h-11 rounded-full inline-flex items-center justify-center mt-6 w-fit ml-auto lg:ml-0">
            View my license →
          </Link>
        </div>

        <div className="bg-white border border-[#e0e0e5] rounded-[16px] p-6">
          <p className="text-navy-header font-bold text-lg">Recent activity</p>
          {activity.length === 0 ? (
            <p className="text-[#667085] text-[13.5px] mt-4">
              No activity yet. Protected prompts, completed training and tool decisions will appear here.
            </p>
          ) : (
            <div className="flex flex-col gap-4 mt-4">
              {activity.map(a => {
                const s = activityStyle[a.category] || defaultStyle
                return (
                  <div key={a.id} className="flex items-center gap-3.5">
                    <div className={`w-9 h-9 rounded-full bg-[#f2f5fa] flex items-center justify-center text-[15px] shrink-0 ${s.color}`}>{s.icon}</div>
                    <div className="flex-1 min-w-0">
                      {/* Clamped, not restyled: real titles and bodies are longer
                          than the four placeholders this card was built with, and
                          letting them wrap freely would break the row rhythm. */}
                      <p className="text-navy-header font-semibold text-[15px] truncate">{a.title}</p>
                      <p className="text-[#667085] text-[13.5px] mt-0.5 line-clamp-2">{a.body}</p>
                      {/* The same quick action the notification carries — new
                          training is one click from the home page too. */}
                      {/* py/-my pair: a 43px touch target on a phone without
                          moving the row — the link itself is only 19px tall. */}
                      {a.action && (
                        <Link to={a.action.to} className="text-[#2e5ccc] font-semibold text-[12.5px] mt-1 py-3 -my-3 inline-flex items-center hover:underline">
                          {a.action.label} →
                        </Link>
                      )}
                    </div>
                    <p className="text-[#667085] text-xs shrink-0">{shortWhen(a.time)}</p>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
