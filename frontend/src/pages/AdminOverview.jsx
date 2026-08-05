// 11 Admin · Governance Overview — matches Figma frame "11 Admin • Governance Overview"
// Live data: KPIs and the audit log poll the backend, so employee activity
// (masked prompts, quiz completions) appears here in near-real time.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api.js'

// Department chart: a plausible weekly baseline plus live prompts from the
// audit log (each masked prompt for a department grows its bar). `abbr`
// matches the dept code used in audit events (Eng / Fin / Sales / Mkt / HR).
const deptConfig = [
  { name: 'Engineering', abbr: 'Eng', base: 420, color: '#0b2457' },
  { name: 'Sales', abbr: 'Sales', base: 350, color: '#173976' },
  { name: 'Finance', abbr: 'Fin', base: 210, color: '#d9b32c' },
  { name: 'Marketing', abbr: 'Mkt', base: 180, color: '#365fd9' },
  { name: 'HR', abbr: 'HR', base: 90, color: '#98a2b3' },
]
// The tallest bar as a share of the chart area, not a pixel count: the chart
// grows and shrinks with the viewport so the whole Overview fits one screen,
// and 85% leaves room for the value printed above each bar.
const MAX_BAR_PCT = 85

// Alert card styling by severity — data itself is live from /api/alerts
const alertStyle = {
  HIGH: { card: 'bg-[#fff0f0] border-[rgba(217,45,32,0.8)]', text: 'text-[#d92d20]', dot: 'bg-[#d92d20]' },
  MEDIUM: { card: 'bg-[#fff5de] border-[rgba(217,119,6,0.8)]', text: 'text-[#d97706]', dot: 'bg-[#d97706]' },
  MONITORING: { card: 'bg-[#eef2ff] border-[#cadafd]', text: 'text-[#365fd9]', dot: 'bg-[#365fd9]' },
}

const cols = 'grid grid-cols-[72px_90px_100px_110px_112px_1fr]'
// Rows in the Overview's audit preview. The full log is one click away, so this
// is capped at what fits rather than at what exists — and three is what the
// header above it costs. Three newest rows still show the log moving, which is
// the only job this preview has; reading it is what /admin/audit-log is for.
const AUDIT_PREVIEW = 3

export default function AdminOverview() {
  const [stats, setStats] = useState({ promptsToday: 312, maskedToday: 58, openAlerts: 3, avgLicense: 2.1 })
  const [events, setEvents] = useState([])
  const [alerts, setAlerts] = useState([])

  useEffect(() => {
    let alive = true
    const load = () => {
      api.get('/stats').then(s => alive && setStats(s)).catch(() => {})
      api.get('/audit').then(a => alive && setEvents(a.events)).catch(() => {})
      api.get('/alerts').then(a => alive && setAlerts(a.filter(x => x.status === 'open'))).catch(() => {})
    }
    load()
    const t = setInterval(load, 3000)
    return () => { alive = false; clearInterval(t) }
  }, [])

  // Live department totals = weekly baseline + this session's audit events
  const deptData = deptConfig.map(d => ({ ...d, value: d.base + events.filter(e => e.dept === d.abbr).length }))
  const maxVal = Math.max(...deptData.map(d => d.value))

  return (
    // One screen, no scrolling: the page is a column the height of the admin
    // main area, and the only part that flexes is the chart row. Everything an
    // admin needs to see at a glance is therefore always on screen — below lg
    // the sidebar stacks on top, so the fixed height is lifted and the page
    // scrolls as normal.
    <div className="flex flex-col gap-3 lg:h-[calc(100vh-3rem)] lg:overflow-y-auto">
      <div className="flex items-start justify-between shrink-0">
        <div>
          <h1 className="text-[28px] font-bold text-navy-header">Overview</h1>
          {/* The page's thesis, in the slot the old "Company-wide AI usage"
              caption already occupied — so it states what the system is FOR and
              proves it with the live count, without costing a pixel of height.
              An admin landing here reads the outcome before the instruments.

              One line, and the same `text-sm mt-1.5` every other admin page
              uses: it was the only subtitle in the console set in text-xs and
              the only one capped at 560px, so it wrapped to two lines and sat a
              size below its neighbours — on the one page whose whole layout is
              built to fit a single screen. */}
          <p className="text-[#667085] text-sm mt-1.5">
            Every prompt is checked before it leaves the browser —{' '}
            <span className="text-navy-header font-semibold">{stats.maskedToday} sensitive items</span> masked today
            across {stats.promptsToday} prompts.
          </p>
        </div>
        <Link to="/admin/audit-report" className="bg-gold-brand hover:bg-gold text-navy-header font-semibold text-[13px] px-11 h-[46px] rounded-full flex items-center cursor-pointer">
          Export audit report&nbsp;&nbsp;↓
        </Link>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-4 gap-3 shrink-0">
        <div className="bg-navy-header rounded-[14px] px-5 py-4">
          <p className="text-gold-brand font-semibold text-[10px] tracking-[1px]">PROMPTS PROTECTED TODAY</p>
          <div className="flex items-baseline gap-3 mt-2">
            <p className="text-white font-bold text-[30px]">{stats.promptsToday}</p>
            <p className="text-[#a7f3d0] font-medium text-[11px]">▲ 8%</p>
          </div>
        </div>
        <div className="bg-white rounded-[14px] px-5 py-4">
          <p className="text-[#8a7d56] font-semibold text-[10px] tracking-[1px]">ITEMS MASKED TODAY</p>
          <div className="flex items-baseline gap-3 mt-2">
            <p className="text-navy-header font-bold text-[30px]">{stats.maskedToday}</p>
            <p className="text-[#667085] font-medium text-[11px]">12 fewer than yesterday</p>
          </div>
        </div>
        <div className="bg-[#fff0f0] border border-[rgba(217,45,32,0.3)] rounded-[14px] px-5 py-4">
          <p className="text-[#d92d20] font-semibold text-[10px] tracking-[1px]">ACTIVE RISK ALERTS</p>
          <div className="flex items-baseline gap-3 mt-2">
            <p className="text-[#d92d20] font-bold text-[30px]">{stats.openAlerts}</p>
            <p className="text-[#d92d20] font-medium text-[11px]">Needs review</p>
          </div>
        </div>
        <div className="bg-white rounded-[14px] px-5 py-4">
          {/* Same number the credential card calls ACCESS LEVEL — one label for
              one thing, whichever side of the product is reading it. */}
          <p className="text-[#8a7d56] font-semibold text-[10px] tracking-[1px]">AVG ACCESS LEVEL</p>
          <div className="flex items-baseline gap-3 mt-2">
            {/* /api/stats derives this from the employee's live level, so a
                training completion moves it while the demo is running. */}
            <p className="text-navy-header font-bold text-[30px]">{stats.avgLicense}</p>
            <p className="text-[#078b6c] font-medium text-[11px]">▲ from 1.6</p>
          </div>
        </div>
      </div>

      {/* Usage chart + risk alerts — the flexible row. It takes whatever height
          is left over, so the audit log below it never falls off the screen. */}
      <div className="grid grid-cols-[1fr_438px] gap-4 flex-1 min-h-0">
        <div className="bg-white border border-[#d8d0b4] rounded-[16px] p-5 flex flex-col min-h-0">
          <p className="text-navy-header font-semibold text-[15px] shrink-0">AI usage by department · prompts this week</p>
          <div className="flex items-end justify-around flex-1 min-h-[150px] mt-4">
            {deptData.map(d => (
              <div key={d.name} className="flex flex-col items-center justify-end h-full">
                <p className="text-navy-header font-semibold text-xs mb-1.5">{d.value}</p>
                <div
                  className="w-[72px] rounded-[8px] transition-all duration-500"
                  style={{ height: `${Math.round((d.value / maxVal) * MAX_BAR_PCT)}%`, backgroundColor: d.color }}
                />
                <p className="text-[#667085] font-medium text-[11px] mt-2">{d.name}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white border border-[#d8d0b4] rounded-[16px] p-4 flex flex-col min-h-0">
          <div className="flex justify-between items-center px-0.5 shrink-0">
            <p className="text-navy-header font-semibold text-[15px]">Risk alerts</p>
            <p className="text-[#d92d20] font-semibold text-[11px]">{stats.openAlerts} open</p>
          </div>
          <div className="flex flex-col gap-2.5 mt-3.5 flex-1 min-h-0 overflow-y-auto">
            {alerts.slice(0, 3).map(a => {
              const s = alertStyle[a.severity] || alertStyle.MEDIUM
              return (
                <div key={a.id} className={`border rounded-[11px] px-3 py-2.5 flex gap-2.5 ${s.card}`}>
                  <span className={`w-3 h-3 rounded-full mt-0.5 shrink-0 ${s.dot}`} />
                  <div>
                    <p className={`font-semibold text-[11px] ${s.text}`}>{a.severity.charAt(0) + a.severity.slice(1).toLowerCase()} · {a.title}</p>
                    <p className="text-[#667085] text-[10px] mt-0.5">{a.meta}</p>
                    <Link to="/admin/risk-alerts" className="text-[#365fd9] font-medium text-[10px] mt-0.5 inline-block">{a.primary}&nbsp;&nbsp;→</Link>
                  </div>
                </div>
              )
            })}
          </div>
          {/* The other thing waiting on an admin. /api/stats already counted it;
              until now nothing rendered it, so pending approvals were only
              discoverable by opening the Tool Approvals screen. */}
          {stats.pendingApprovals > 0 && (
            <Link
              to="/admin/tool-approvals"
              className="mt-3 flex items-center justify-between border-t border-[#eee6d4] pt-3 px-0.5 text-[11px] shrink-0"
            >
              <span className="text-[#667085]">
                {stats.pendingApprovals} tool request{stats.pendingApprovals === 1 ? '' : 's'} awaiting a decision
              </span>
              <span className="text-[#365fd9] font-medium">Review&nbsp;&nbsp;→</span>
            </Link>
          )}
        </div>
      </div>

      {/* Live audit log — the newest few events. This is a preview, so it says
          so and links to the full log rather than growing off the screen. */}
      <div className="bg-white border border-[#d8d0b4] rounded-[16px] p-4 shrink-0">
        <div className="flex justify-between items-center px-0.5">
          <p className="text-navy-header font-semibold text-[15px]">Live audit log</p>
          <div className="flex items-center gap-3">
            <p className="text-[#078b6c] font-medium text-[10px]">●&nbsp;&nbsp;live</p>
            <Link to="/admin/audit-log" className="text-[#365fd9] font-medium text-[10px]">
              View all {events.length}&nbsp;&nbsp;→
            </Link>
          </div>
        </div>
        <div className={`${cols} bg-navy-header rounded-[9px] text-gold-brand font-semibold text-[10px] tracking-[0.6px] px-3.5 py-2 mt-2.5`}>
          <p>TIME</p><p>USER</p><p>DEPT</p><p>TOOL</p><p>ACTION</p><p>MASKED PROMPT · STORED VERSION</p>
        </div>
        {events.slice(0, AUDIT_PREVIEW).map((e, i) => (
          <div key={e.id} className={`${cols} text-[#475467] text-[10px] px-3.5 py-2.5 ${i % 2 === 0 ? 'bg-[#fcfaf3]' : 'bg-white'}`}>
            <p>{e.time}</p><p>{e.user}</p><p>{e.dept}</p><p>{e.tool}</p><p>{e.action}</p><p className="truncate pr-2">{e.record}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
