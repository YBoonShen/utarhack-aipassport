// 00H Employee · Home — matches Figma frame "00H Employee • Home"
// Live: today cards, license progress and counters read /api/profile + /api/visas.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, currentUser } from '../lib/api.js'

const fallbackProfile = {
  name: 'Tan Jia Yin', level: 2, levelName: 'Navigator', points: 1240, target: 2000,
  promptsProtected: 47, itemsMasked: 12, streakDays: 21, trainingCompleted: false,
}

const activity = [
  { icon: '●', color: 'text-[#328768]', title: 'Prompt protected', desc: 'Payment email — name, IC and amount masked', when: '2h ago' },
  { icon: '✓', color: 'text-gold-brand', title: 'Training completed', desc: 'Spotting Personal Data · +150 points', when: 'Yesterday' },
  { icon: '◐', color: 'text-navy', title: 'Tool requested', desc: 'SummarizerX · under review', when: '2 days ago' },
  { icon: '★', color: 'text-[#328768]', title: 'Stamp earned', desc: 'Data Privacy added to your passport', when: '11 Jan' },
]

export default function Home() {
  const [profile, setProfile] = useState(fallbackProfile)
  const [visaRequest, setVisaRequest] = useState(null)
  const firstName = (currentUser()?.name || profile.name).split(' ')[0]

  useEffect(() => {
    let alive = true
    api.get('/profile').then(p => alive && setProfile(p)).catch(() => {})
    api.get('/visas').then(rs => {
      const mine = rs.find(r => r.requester === currentUser()?.id) || rs.find(r => r.tool === 'SummarizerX')
      if (alive) setVisaRequest(mine)
    }).catch(() => {})
    return () => { alive = false }
  }, [])

  const pct = Math.min(100, Math.round((profile.points / profile.target) * 100))

  const todayCards = [
    {
      kicker: 'FINISH TRAINING', kickerColor: 'text-gold-brand',
      title: profile.trainingCompleted ? 'Spotting Personal Data · Done' : 'Spotting Personal Data',
      desc: profile.trainingCompleted ? 'Nice work — the Data Privacy stamp was added to your passport.' : 'Module 1 · finish the quiz to earn the Data Privacy stamp.',
      button: profile.trainingCompleted ? 'View training →' : 'Resume training →', to: profile.trainingCompleted ? '/training' : '/training/quiz/1',
    },
    {
      kicker: 'TOOL APPROVAL', kickerColor: 'text-navy',
      title: visaRequest ? `${visaRequest.tool} · ${visaRequest.status === 'APPROVED' ? 'Approved' : 'Under review'}` : 'No pending requests',
      desc: visaRequest ? 'Your request is with IT and Compliance. Typical decision: 3 working days.' : 'Apply for a new AI tool visa any time from My Visas.',
      button: 'View my visas →', to: '/visas',
    },
    {
      kicker: 'PROTECTED THIS WEEK', kickerColor: 'text-[#19533e]',
      title: `${profile.itemsMasked} items masked`,
      desc: 'Last: a payment email — name, IC number and amount were masked before sending.',
      button: 'Open AI assistant →', to: '/gateway',
    },
  ]

  const quickLinks = [
    ['My AI License →', '/license'],
    ['All training modules →', '/training/modules'],
    ['My Visas →', '/visas'],
    ['Decision transparency →', '/transparency'],
  ]

  return (
    <div className="max-w-[1440px] mx-auto px-10 py-8">
      <h1 className="text-[30px] font-bold text-navy-header">Good morning, {firstName}</h1>
      <p className="text-[#667085] text-[15px] mt-1.5">Here&rsquo;s what needs your attention today.</p>

      <div className="grid grid-cols-3 gap-6 mt-6">
        {todayCards.map(c => (
          <div key={c.kicker} className="bg-white border border-[#e0e0e5] rounded-[16px] p-6 flex flex-col">
            <p className={`font-semibold text-[11px] ${c.kickerColor}`}>{c.kicker}</p>
            <p className="text-navy-header font-bold text-lg mt-2.5">{c.title}</p>
            <p className="text-[#667085] text-[13.5px] mt-2.5 flex-1">{c.desc}</p>
            <Link to={c.to} className="bg-gold-brand hover:bg-gold text-navy-header font-semibold text-sm px-5 h-11 rounded-full inline-flex items-center justify-center mt-5 w-fit">
              {c.button}
            </Link>
          </div>
        ))}
      </div>

      <p className="text-[#667085] font-semibold text-[13px] mt-8">Quick access</p>
      <div className="flex flex-wrap gap-3.5 mt-3">
        {quickLinks.map(([label, to]) => (
          <Link key={to} to={to} className="bg-[#fffefa] border-[1.5px] border-navy-header text-navy-header font-semibold text-sm px-6 h-[52px] rounded-full inline-flex items-center hover:bg-chip">
            {label}
          </Link>
        ))}
      </div>

      <p className="text-[#667085] font-semibold text-[13px] mt-8">Your progress</p>
      <div className="grid grid-cols-[1fr_1.2fr] gap-6 mt-3">
        <div className="bg-navy-header rounded-[16px] p-7">
          <p className="text-gold-brand font-semibold text-[11px]">YOUR AI PASSPORT</p>
          <p className="text-white font-bold text-[26px] mt-2.5">Level {profile.level} · {profile.levelName}</p>
          <p className="text-[#cbd5e1] text-sm mt-2">{profile.points.toLocaleString()} / {profile.target.toLocaleString()} safety points</p>
          <div className="h-2.5 rounded-full bg-[#213866] mt-3">
            <div className="h-2.5 rounded-full bg-gold-brand transition-all duration-700" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-[#cbd5e1] text-[13px] mt-2.5">
            {profile.level >= 3 ? 'Level 3 · Ambassador — advanced tools unlocked' : 'Level 3 · Advanced training coming soon'}
          </p>
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
          <Link to="/license" className="bg-gold-brand hover:bg-gold text-navy-header font-semibold text-sm px-5 h-11 rounded-full inline-flex items-center justify-center mt-6 w-fit">
            View my license →
          </Link>
        </div>

        <div className="bg-white border border-[#e0e0e5] rounded-[16px] p-6">
          <p className="text-navy-header font-bold text-lg">Recent activity</p>
          <div className="flex flex-col gap-4 mt-4">
            {activity.map((a, i) => (
              <div key={i} className="flex items-center gap-3.5">
                <div className={`w-9 h-9 rounded-full bg-[#f2f5fa] flex items-center justify-center text-[15px] shrink-0 ${a.color}`}>{a.icon}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-navy-header font-semibold text-[15px]">{a.title}</p>
                  <p className="text-[#667085] text-[13.5px] mt-0.5">{a.desc}</p>
                </div>
                <p className="text-[#667085] text-xs shrink-0">{a.when}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
