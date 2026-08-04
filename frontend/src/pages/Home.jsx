// 00H Employee · Home — the "Your progress" section: AI Passport card + Recent activity.
// Both cards are live. The passport card reads /api/profile; recent activity is the
// employee's own notification feed, which is where every tracked action already lands.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, currentUser } from '../lib/api.js'
import { levelState, barXP, progressHint } from '../lib/levels.js'
import { useNotifications } from '../components/notificationsStore.jsx'

// Shown for the moment before /api/profile answers, and if it never does.
const fallbackProfile = {
  name: 'Tan Jia Yin', level: 2, levelName: 'Navigator', points: 1240, target: 2000,
  promptsProtected: 47, itemsMasked: 12, streakDays: 21,
}

// Recent activity is the notification feed rendered compactly, so the icon set is
// keyed by the categories addNotification() already writes — one per category,
// matching the four rows this card was designed around.
const activityStyle = {
  'SMART GATEWAY': { icon: '●', color: 'text-[#328768]' }, // a prompt was protected
  TRAINING: { icon: '✓', color: 'text-gold-brand' },       // a module was completed
  'VISA UPDATE': { icon: '◐', color: 'text-navy' },        // a tool request moved
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

const quickLinks = [
  ['My AI License →', '/license'],
  ['All training modules →', '/training/modules'],
  ['My Visas →', '/visas'],
  ['Decision transparency →', '/transparency'],
]

export default function Home() {
  const [profile, setProfile] = useState(fallbackProfile)
  const firstName = (currentUser()?.name || profile.name).split(' ')[0]

  // The provider already polls /api/notifications every 4s for the whole app and
  // only does so for an employee session, so this card follows the employee's own
  // feed with no second request and no chance of showing someone else's activity.
  const { items } = useNotifications() || { items: [] }

  useEffect(() => {
    let alive = true
    const load = () => api.get('/profile').then(p => alive && setProfile(p)).catch(() => {})
    load()
    // Polled on the same cadence as the feed: a protected prompt moves both the
    // counters below and the activity beside them, and one going stale while the
    // other updates would look broken.
    const t = setInterval(load, 4000)
    return () => { alive = false; clearInterval(t) }
  }, [])

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

      <p className="text-[#667085] font-semibold text-[13px] mt-6">Quick access</p>
      <div className="flex flex-wrap gap-3.5 mt-3">
        {quickLinks.map(([label, to]) => (
          <Link key={to} to={to} className="bg-[#fffefa] border-[1.5px] border-navy-header text-navy-header font-semibold text-sm px-6 h-[52px] rounded-full inline-flex items-center hover:bg-chip">
            {label}
          </Link>
        ))}
      </div>

      <p className="text-[#667085] font-semibold text-[13px] mt-8">Your progress</p>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.2fr] gap-4 lg:gap-6 mt-3">
        <div className="bg-navy-header rounded-[16px] p-5 lg:p-7">
          <p className="text-gold-brand font-semibold text-[11px]">YOUR AI PASSPORT</p>
          <p className="text-white font-bold text-[26px] mt-2.5">Level {lvl.level} · {lvl.levelName}</p>
          <p className="text-[#cbd5e1] text-sm mt-2">{barXP(lvl).toLocaleString()} / {lvl.nextLevelXP.toLocaleString()} XP</p>
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
                      {a.action && (
                        <Link to={a.action.to} className="text-[#2e5ccc] font-semibold text-[12.5px] mt-1 inline-flex items-center hover:underline">
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
