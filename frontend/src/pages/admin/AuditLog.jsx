// 14 Admin · Audit Log — matches Figma frame "14 Admin • Audit Log"
// Live: events from /api/events (Gateway sends appear at the top);
// search + action filter work client-side; Export CSV downloads a real file.
import { useEffect, useMemo, useState } from 'react'
import { apiGet } from '../../api.js'

const chip = {
  MASKED: 'bg-emerald-100 text-emerald-800', ALERT: 'bg-red-100 text-red-800',
  REDIRECTED: 'bg-amber-100 text-amber-800', CLEAN: 'bg-indigo-100 text-indigo-800',
}

export default function AuditLog() {
  const [events, setEvents] = useState([])
  const [search, setSearch] = useState('')
  const [action, setAction] = useState('All')

  useEffect(() => {
    apiGet('/events').then(setEvents).catch(() => {})
  }, [])

  const shown = useMemo(() => {
    const q = search.toLowerCase()
    return events.filter(r =>
      (action === 'All' || r.s === action) &&
      (!q || [r.u, r.d, r.tool, r.text].join(' ').toLowerCase().includes(q))
    )
  }, [events, search, action])

  function exportCsv() {
    const header = 'time,user,dept,tool,action,masked_prompt'
    const rows = shown.map(r => [r.t, r.u, r.d, r.tool, r.s, `"${r.text.replace(/"/g, '""')}"`].join(','))
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'aipassport-audit-log.csv'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <>
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-navy">Audit Log</h1>
          <p className="text-gray-500 text-sm">Full history of prompts checked by the Smart Gateway.</p>
        </div>
        <button onClick={exportCsv} className="border-2 border-dashed border-gold-dark rounded-xl p-1.5">
          <span className="block bg-gold text-navy font-bold text-sm px-5 py-2 rounded-lg">Export CSV</span>
        </button>
      </div>

      <div className="flex gap-3 mt-5">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by user, tool, department…"
          className="bg-card border-2 border-[#d8cfae] rounded-lg px-4 py-2 text-sm outline-none flex-1"
        />
        <select
          value={action}
          onChange={e => setAction(e.target.value)}
          className="bg-card border-2 border-[#d8cfae] rounded-lg px-4 py-2 text-sm outline-none"
        >
          {['All', 'MASKED', 'ALERT', 'REDIRECTED', 'CLEAN'].map(o => (
            <option key={o} value={o}>{o === 'All' ? 'All actions' : o.charAt(0) + o.slice(1).toLowerCase()}</option>
          ))}
        </select>
      </div>

      <div className="bg-card border-2 border-[#d8cfae] rounded-2xl p-6 mt-5">
        <div className="flex justify-between mb-3">
          <p className="font-bold text-navy text-sm">{shown.length} event{shown.length !== 1 && 's'}</p>
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
            {shown.map((r, i) => (
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
