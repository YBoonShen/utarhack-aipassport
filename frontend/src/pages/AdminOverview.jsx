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
const MAX_BAR = 178 // px height of the tallest bar

// Alert card styling by severity — data itself is live from /api/alerts
const alertStyle = {
  HIGH: { card: 'bg-[#fff0f0] border-[rgba(217,45,32,0.8)]', text: 'text-[#d92d20]', dot: 'bg-[#d92d20]' },
  MEDIUM: { card: 'bg-[#fff5de] border-[rgba(217,119,6,0.8)]', text: 'text-[#d97706]', dot: 'bg-[#d97706]' },
  MONITORING: { card: 'bg-[#eef2ff] border-[#cadafd]', text: 'text-[#365fd9]', dot: 'bg-[#365fd9]' },
}

const cols = 'grid grid-cols-[72px_90px_100px_110px_112px_1fr]'

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
    <div>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[28px] font-bold text-navy-header">Overview</h1>
          <p className="text-[#667085] text-xs mt-1">Company-wide AI usage · refreshed live</p>
        </div>
        <Link to="/admin/audit-report" className="bg-gold-brand hover:bg-gold text-navy-header font-semibold text-[13px] px-11 h-[46px] rounded-full flex items-center cursor-pointer">
          Export audit report&nbsp;&nbsp;↓
        </Link>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-4 gap-3 mt-5">
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
          <p className="text-[#8a7d56] font-semibold text-[10px] tracking-[1px]">AVG LICENSE LEVEL</p>
          <div className="flex items-baseline gap-3 mt-2">
            <p className="text-navy-header font-bold text-[30px]">2.1</p>
            <p className="text-[#078b6c] font-medium text-[11px]">▲ from 1.6</p>
          </div>
        </div>
      </div>

      {/* Usage chart + risk alerts */}
      <div className="grid grid-cols-[1fr_438px] gap-4 mt-4">
        <div className="bg-white border border-[#d8d0b4] rounded-[16px] p-5">
          <p className="text-navy-header font-semibold text-[15px]">AI usage by department · prompts this week</p>
          <div className="flex items-end justify-around h-[230px] mt-6">
            {deptData.map(d => (
              <div key={d.name} className="flex flex-col items-center justify-end">
                <p className="text-navy-header font-semibold text-xs mb-1.5">{d.value}</p>
                <div className="w-[72px] rounded-[8px] transition-all duration-500" style={{ height: `${Math.round((d.value / maxVal) * MAX_BAR)}px`, backgroundColor: d.color }} />
                <p className="text-[#667085] font-medium text-[11px] mt-2">{d.name}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white border border-[#d8d0b4] rounded-[16px] p-4">
          <div className="flex justify-between items-center px-0.5">
            <p className="text-navy-header font-semibold text-[15px]">Risk alerts</p>
            <p className="text-[#d92d20] font-semibold text-[11px]">{stats.openAlerts} open</p>
          </div>
          <div className="flex flex-col gap-2.5 mt-3.5">
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
        </div>
      </div>

      {/* Live audit log */}
      <div className="bg-white border border-[#d8d0b4] rounded-[16px] p-4 mt-4">
        <div className="flex justify-between items-center px-0.5">
          <p className="text-navy-header font-semibold text-[15px]">Live audit log</p>
          <p className="text-[#078b6c] font-medium text-[10px]">●&nbsp;&nbsp;live</p>
        </div>
        <div className={`${cols} bg-navy-header rounded-[9px] text-gold-brand font-semibold text-[10px] tracking-[0.6px] px-3.5 py-2.5 mt-3`}>
          <p>TIME</p><p>USER</p><p>DEPT</p><p>TOOL</p><p>ACTION</p><p>MASKED PROMPT · STORED VERSION</p>
        </div>
        {events.slice(0, 5).map((e, i) => (
          <div key={e.id} className={`${cols} text-[#475467] text-[10px] px-3.5 py-3.5 ${i % 2 === 0 ? 'bg-[#fcfaf3]' : 'bg-white'}`}>
            <p>{e.time}</p><p>{e.user}</p><p>{e.dept}</p><p>{e.tool}</p><p>{e.action}</p><p className="truncate pr-2">{e.record}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
