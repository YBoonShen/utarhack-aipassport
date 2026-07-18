// 11 Admin · Governance Overview — matches Figma frame "11 Admin • Governance Overview"
// Live: KPI cards (/api/stats), risk alerts + audit log share the same backend
// source as the other admin pages, so every number agrees (A4/B6).
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiGet } from '../api.js'
import { useToast, DEMO_NOTE } from '../components/Toast.jsx'

const chip = {
  MASKED: 'bg-emerald-100 text-emerald-800', ALERT: 'bg-red-100 text-red-800',
  REDIRECTED: 'bg-amber-100 text-amber-800', CLEAN: 'bg-indigo-100 text-indigo-800',
}
const alertStyle = { red: 'bg-red-50 border-red-500 text-red-800', amber: 'bg-amber-50 border-amber-500 text-amber-800', slate: 'bg-slate-100 border-slate-400 text-slate-700' }

// Bar chart: demo data except Engineering, which tracks the live counter.
const staticDepts = [
  { name: 'Sales', v: 350 }, { name: 'Finance', v: 210, alert: true }, { name: 'Marketing', v: 180 }, { name: 'HR', v: 90 },
]

export default function AdminOverview() {
  const [stats, setStats] = useState(null)
  const [alerts, setAlerts] = useState([])
  const [events, setEvents] = useState([])
  const toast = useToast()

  useEffect(() => {
    apiGet('/stats').then(setStats).catch(() => {})
    apiGet('/alerts').then(setAlerts).catch(() => {})
    apiGet('/events').then(setEvents).catch(() => {})
  }, [])

  const depts = [{ name: 'Engineering', v: stats?.engineeringPrompts ?? 420 }, ...staticDepts]
  const maxV = Math.max(...depts.map(d => d.v))

  return (
    <>
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold text-navy">Overview</h1>
            <p className="text-gray-500 text-sm">Company-wide AI usage · updated live</p>
          </div>
          <button onClick={() => toast(DEMO_NOTE)} className="border-2 border-dashed border-gold-dark rounded-xl p-1.5">
            <span className="block bg-gold text-navy font-bold text-sm px-5 py-2 rounded-lg">One-Click Audit Report (PDF)</span>
          </button>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-4 gap-5 mt-6">
          <div className="bg-navy rounded-2xl p-5 text-white">
            <p className="text-gold text-[10px] font-bold tracking-wider">PROMPTS PROTECTED TODAY</p>
            <p className="text-4xl font-bold mt-2">{stats?.promptsToday ?? '—'} <span className="text-emerald-300 text-sm font-medium">▲ 8%</span></p>
          </div>
          <Stat label="ITEMS MASKED TODAY" value={stats?.maskedToday ?? '—'} />
          <div className="bg-card border-2 border-red-600 rounded-2xl p-5">
            <p className="text-red-700 text-[10px] font-bold tracking-wider">ACTIVE RISK ALERTS</p>
            <p className="text-4xl font-bold text-red-700 mt-2">{stats?.activeAlerts ?? '—'} <span className="text-sm font-medium">needs review</span></p>
          </div>
          <Stat label="AVG LICENSE LEVEL" value={stats?.avgLevel ?? '—'} extra="▲ from 1.6" />
        </div>

        <div className="grid grid-cols-[1fr_400px] gap-5 mt-5">
          {/* Bar chart */}
          <div className="bg-card border-2 border-[#d8cfae] rounded-2xl p-6">
            <p className="font-bold text-navy text-sm mb-6">AI usage by department (prompts this week)</p>
            <div className="flex items-end gap-8 h-56 border-b-2 border-[#d8cfae] px-4">
              {depts.map(d => (
                <div key={d.name} className="flex flex-col items-center gap-1 flex-1 justify-end h-full">
                  <p className="text-xs font-bold" style={{ color: d.alert ? '#b8912a' : '#12275a' }}>{d.v}</p>
                  <div className="w-full rounded-t-md" style={{ height: `${(d.v / maxV) * 85}%`, background: d.alert ? '#b8912a' : '#12275a' }} />
                </div>
              ))}
            </div>
            <div className="flex gap-8 px-4 mt-2">
              {depts.map(d => (
                <div key={d.name} className="flex-1 text-center">
                  <p className="text-xs text-gray-500">{d.name}</p>
                  {d.alert && <p className="text-[10px] text-red-700">2 alerts</p>}
                </div>
              ))}
            </div>
          </div>

          {/* Risk alerts — same source as the Risk Alerts page */}
          <div className="bg-card border-2 border-[#d8cfae] rounded-2xl p-6">
            <div className="flex justify-between mb-4">
              <p className="font-bold text-navy text-sm">Risk alerts</p>
              <Link to="/admin/risk-alerts" className="text-xs text-navy font-medium">View all →</Link>
            </div>
            {alerts.slice(0, 3).map(a => (
              <div key={a.id} className={`rounded-xl border px-4 py-3 mb-3 ${alertStyle[a.color]}`}>
                <p className="text-sm font-bold">{a.level}: {a.title}</p>
                <p className="text-xs text-gray-600 mt-0.5">{a.sub}</p>
                <Link to="/admin/risk-alerts" className="text-xs text-blue-700 mt-1 inline-block">{a.action}</Link>
              </div>
            ))}
          </div>
        </div>

        {/* Audit log — live from /api/events */}
        <div className="bg-card border-2 border-[#d8cfae] rounded-2xl p-6 mt-5">
          <div className="flex justify-between mb-3">
            <p className="font-bold text-navy text-sm">Live audit log</p>
            <p className="text-xs text-emerald-700">● live</p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-navy text-gold text-[11px] tracking-wider">
                {['TIME', 'USER', 'DEPT', 'TOOL', 'ACTION', 'MASKED PROMPT (STORED VERSION)'].map(h => (
                  <th key={h} className="text-left px-3 py-2 first:rounded-l-lg last:rounded-r-lg">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {events.slice(0, 6).map((r, i) => (
                <tr key={i} className="border-b border-[#eee5cf] last:border-0">
                  <td className="px-3 py-2.5">{r.t}</td>
                  <td className="px-3">{r.u}</td>
                  <td className="px-3">{r.d}</td>
                  <td className="px-3">{r.tool}</td>
                  <td className="px-3"><span className={`text-[11px] font-bold px-3 py-1 rounded-full ${chip[r.s]}`}>{r.s}</span></td>
                  <td className="px-3 font-mono text-xs text-gray-600">{r.text}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
    </>
  )
}

function Stat({ label, value, extra }) {
  return (
    <div className="bg-card border-2 border-[#d8cfae] rounded-2xl p-5">
      <p className="text-[#8a7f60] text-[10px] font-bold tracking-wider">{label}</p>
      <p className="text-4xl font-bold text-navy mt-2">{value} {extra && <span className="text-emerald-700 text-sm font-medium">{extra}</span>}</p>
    </div>
  )
}
