// 13 Admin · Risk Alerts — matches Figma frame "13 Admin • Risk Alerts"
// Live: alerts from /api/alerts (same source as Overview + sidebar badge);
// Resolve really resolves and every count drops together (A4). New alerts
// arrive here from the public Transparency portal (A3) and Gateway overrides (A1).
import { useEffect, useState } from 'react'
import { apiGet, apiPost } from '../../api.js'
import { useToast, DEMO_NOTE } from '../../components/Toast.jsx'

const style = { red: 'bg-red-50 border-red-500 text-red-800', amber: 'bg-amber-50 border-amber-500 text-amber-800', slate: 'bg-slate-100 border-slate-400 text-slate-700' }

export default function RiskAlerts() {
  const [alerts, setAlerts] = useState([])
  const [filter, setFilter] = useState('All')
  const toast = useToast()

  useEffect(() => {
    apiGet('/alerts').then(setAlerts).catch(() => {})
  }, [])

  async function resolve(id) {
    const open = await apiPost(`/alerts/${id}/resolve`)
    setAlerts(open)
    toast('Alert resolved — counts updated everywhere.')
  }

  const count = lvl => alerts.filter(a => a.level === lvl).length
  const tabs = [
    { key: 'All', label: `All (${alerts.length})` },
    { key: 'High', label: `High (${count('High')})` },
    { key: 'Medium', label: `Medium (${count('Medium')})` },
    { key: 'Low', label: `Low (${count('Low')})` },
  ]
  const shown = filter === 'All' ? alerts : alerts.filter(a => a.level === filter)

  return (
    <>
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-navy">Risk Alerts</h1>
          <p className="text-gray-500 text-sm">Items that need a human decision, ranked by severity.</p>
        </div>
      </div>

      <div className="flex gap-2 mt-5">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setFilter(t.key)}
            className={`text-xs font-bold px-4 py-2 rounded-full border-2 ${filter === t.key ? 'bg-navy text-white border-navy' : 'border-[#d8cfae] text-navy'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3 mt-5">
        {shown.map(a => (
          <div key={a.id} className={`rounded-xl border px-5 py-4 flex items-center justify-between ${style[a.color]}`}>
            <div>
              <p className="text-sm font-bold">{a.level}: {a.title}</p>
              <p className="text-xs text-gray-600 mt-0.5">{a.sub}</p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <button onClick={() => toast(DEMO_NOTE)} className="text-xs text-blue-700 font-medium">{a.action}</button>
              <button onClick={() => resolve(a.id)} className="bg-gold hover:bg-gold-dark text-navy text-xs font-bold px-4 py-2 rounded-full">
                Resolve
              </button>
            </div>
          </div>
        ))}
        {shown.length === 0 && (
          <div className="bg-card border-2 border-[#d8cfae] rounded-2xl p-10 text-center text-gray-500 text-sm">
            ✓ No open alerts in this category — all clear.
          </div>
        )}
      </div>
    </>
  )
}
