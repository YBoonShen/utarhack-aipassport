// 13 Admin · Risk Alerts — matches Figma frame "13 Admin • Risk Alerts" + Risk Alert Workspace
// Live: alerts come from /api/alerts (override and human-review events appear
// here in real time); Resolve really closes an alert everywhere.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api.js'
import { useToast } from '../../components/Toast.jsx'

const severityChip = {
  HIGH: 'bg-[#fef0f0] text-[#d92d20]',
  MEDIUM: 'bg-[#fff5de] text-[#d97706]',
  MONITORING: 'bg-[#eef2ff] text-[#365fd9]',
}

const cardStyle = {
  HIGH: 'bg-[#fef0f0] border-2 border-[#d92d20]',
  MEDIUM: 'bg-[#fefbf0] border border-[#d1c79e]',
  MONITORING: 'bg-[#edf2ff]/50 border-2 border-[#cadafd]/70',
}

const dueColor = {
  HIGH: 'text-[#d92d20]',
  MEDIUM: 'text-[#d97706]',
  MONITORING: 'text-[#365fd9]',
}

// Matches Figma "Overlay / Alert resolved" — checkmark, kicker, heading, body, Done.
function ResolvedConfirm({ onClose }) {
  return (
    <div className="fixed inset-0 bg-navy-dark/50 flex items-center justify-center p-6 z-50" onClick={onClose}>
      <div className="bg-white border-[1.5px] border-[#c7b887] rounded-[20px] shadow-[0px_18px_24px_rgba(3,10,31,0.22)] w-full max-w-[560px] p-7" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-[#e9f8f2] border-2 border-[#078b6c] flex items-center justify-center text-[#078b6c] text-2xl shrink-0">✓</div>
          <div>
            <p className="text-[#078b6c] font-bold text-xs tracking-wide">ALERT RESOLVED</p>
            <p className="text-[#17213a] font-bold text-xl mt-0.5">Risk alert marked resolved</p>
          </div>
        </div>
        <p className="text-[#667085] text-sm mt-4">The action and reviewer are recorded in the audit trail. The alert moves to &quot;Resolved&quot;.</p>
        <button onClick={onClose} className="bg-gold-brand hover:bg-gold text-navy-header font-semibold text-sm w-full h-12 rounded-full mt-6 cursor-pointer">
          Done
        </button>
      </div>
    </div>
  )
}

export default function RiskAlerts() {
  const [alerts, setAlerts] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [filter, setFilter] = useState('All')
  const [resolvedOpen, setResolvedOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [includeResolved, setIncludeResolved] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const toast = useToast()

  useEffect(() => {
    let alive = true
    const load = () => api.get('/alerts').then(a => {
      if (!alive) return
      setAlerts(a)
      setSelectedId(id => id || a.find(x => x.status === 'open')?.id)
    }).catch(() => {})
    load()
    const t = setInterval(load, 4000)
    return () => { alive = false; clearInterval(t) }
  }, [])

  const open = alerts.filter(a => a.status === 'open')
  const count = sev => open.filter(a => a.severity === sev).length
  const queue = (includeResolved ? alerts : open).filter(a =>
    (filter === 'All' || a.severity === filter) &&
    (search.trim() === '' || `${a.title} ${a.meta}`.toLowerCase().includes(search.trim().toLowerCase()))
  )
  const sel = alerts.find(a => a.id === selectedId)

  const kpis = [
    { label: 'OPEN ALERTS', value: open.length, note: `${open.length - count('MONITORING')} active · ${count('MONITORING')} monitoring`, dark: true, noteColor: 'text-[#fff0f0]' },
    { label: 'HIGH SEVERITY', value: count('HIGH'), note: 'Review within 4 hours', noteColor: 'text-[#d92d20]' },
    { label: 'MEDIAN RESPONSE', value: '38 min', note: '↓ 12 min this month', noteColor: 'text-[#078b6c]' },
    { label: 'RESOLVED SAFELY', value: '96%', note: 'No raw data retained', noteColor: 'text-[#078b6c]' },
  ]

  async function resolve() {
    if (!sel) return
    try {
      const fresh = await api.post(`/alerts/${sel.id}/resolve`)
      setAlerts(fresh)
      const next = fresh.find(a => a.status === 'open')
      setSelectedId(next?.id ?? null)
      setResolvedOpen(true)
    } catch { /* offline */ }
  }

  return (
    <div>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[28px] font-bold text-[#17213a]">Risk Alerts</h1>
          <p className="text-[#667085] text-sm mt-1.5">Review high-risk AI activity with context, evidence and accountable next steps.</p>
        </div>
        <Link to="/admin/audit-report" className="bg-gold-brand hover:bg-gold text-navy-header font-semibold text-[13px] w-40 h-11 rounded-full flex items-center justify-center cursor-pointer">Create Report</Link>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-4 gap-4 mt-6">
        {kpis.map(k => (
          <div key={k.label} className={`rounded-[14px] px-4 py-3 ${k.dark ? 'bg-navy-header' : 'bg-white border border-[#d8d0b4]'}`}>
            <p className={`font-semibold text-[11px] ${k.dark ? 'text-gold-brand' : 'text-[#667085]'}`}>{k.label}</p>
            <p className={`font-bold text-[26px] mt-1 ${k.dark ? 'text-white' : 'text-[#17213a]'}`}>{k.value}</p>
            <p className={`font-medium text-[11px] mt-0.5 ${k.noteColor}`}>{k.note}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white border border-[#d8d0b4] rounded-[12px] px-4 py-2 mt-5 flex items-center gap-2.5">
        <div className="bg-[#fffcef] border border-[#d8d0b4] rounded-[9px] h-10 w-[326px] flex items-center px-2.5 gap-2">
          <span className="text-[#667085] text-[17px]">⌕</span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search alert, user or department"
            className="flex-1 bg-transparent outline-none text-xs text-[#17213a] placeholder-[#667085]"
          />
          {search && <button onClick={() => setSearch('')} className="text-[#667085] text-sm cursor-pointer px-1">×</button>}
        </div>
        {[['All', open.length], ['HIGH', count('HIGH')], ['MEDIUM', count('MEDIUM')], ['MONITORING', count('MONITORING')]].map(([f, n]) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`h-11 px-5 rounded-full font-semibold text-[13px] cursor-pointer ${filter === f ? 'bg-navy-header text-white' : 'border-[1.5px] border-navy-header text-navy-header hover:bg-chip'}`}
          >
            {f === 'All' ? 'All' : f.charAt(0) + f.slice(1).toLowerCase()} · {n}
          </button>
        ))}
        <div className="flex-1" />
        <div className="relative">
          <button onClick={() => setMoreOpen(o => !o)} className={`border-[1.5px] border-navy-header font-semibold text-[13px] h-11 px-8 rounded-full cursor-pointer ${includeResolved ? 'bg-navy-header text-white' : 'text-navy-header hover:bg-chip'}`}>More filters</button>
          {moreOpen && (
            <div className="absolute right-0 top-12 z-20 bg-white border border-[#d8d0b4] rounded-[10px] shadow-[0px_8px_20px_rgba(0,0,0,0.12)] py-2 w-56">
              <label className="flex items-center gap-3 px-4 py-2 cursor-pointer hover:bg-chip">
                <input type="checkbox" checked={includeResolved} onChange={e => setIncludeResolved(e.target.checked)} className="w-4 h-4 accent-navy-header" />
                <span className="text-[13px] text-[#17213a]">Include resolved alerts</span>
              </label>
              <button onClick={() => { setFilter('All'); setSearch(''); setIncludeResolved(false); setMoreOpen(false) }} className="block w-full text-left px-4 py-2 text-[13px] text-[#365fd9] font-semibold cursor-pointer hover:bg-chip">
                Reset all filters
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Workspace: queue + detail */}
      <div className="grid grid-cols-[1fr_412px] gap-5 mt-5 items-start">
        <div className="bg-white border border-[#d8d0b4] rounded-[14px] p-4">
          <div className="flex justify-between items-start px-1">
            <div>
              <p className="text-[#17213a] font-bold text-lg">Priority queue</p>
              <p className="text-[#667085] text-xs mt-0.5">Sorted by severity and due time</p>
            </div>
            <span className="bg-[#fff0f0] text-[#d92d20] font-semibold text-[11px] rounded-full px-5 py-1.5">{open.length} open</span>
          </div>
          <div className="flex flex-col gap-3.5 mt-4">
            {queue.length === 0 && <p className="text-[#667085] text-sm py-8 text-center">No open alerts in this filter. 🎉</p>}
            {queue.map(a => (
              <button
                key={a.id}
                onClick={() => setSelectedId(a.id)}
                className={`text-left rounded-[12px] p-3.5 cursor-pointer ${cardStyle[a.severity]} ${selectedId === a.id ? 'ring-2 ring-navy-header/30' : ''}`}
              >
                <div className="flex justify-between items-center">
                  <span className={`font-semibold text-[11px] rounded-full px-4 py-1.5 ${severityChip[a.severity]}`}>{a.severity}</span>
                  <p className={`font-medium text-[11px] ${dueColor[a.severity]}`}>{a.due}</p>
                </div>
                <div className="flex justify-between items-center mt-2">
                  <div>
                    <p className={`font-semibold text-sm ${a.severity === 'HIGH' ? 'text-[#d92d20]' : 'text-[#17213a]'}`}>{a.title}</p>
                    <p className="text-[#667085] text-xs mt-1.5">{a.meta}</p>
                  </div>
                  <span className="text-[#07183a] text-[22px]">›</span>
                </div>
              </button>
            ))}
          </div>
          <div className="bg-[#eef2ff] rounded-[10px] px-3.5 py-4 mt-4">
            <p className="text-[#365fd9] font-medium text-xs">ⓘ Alerts show masked evidence only. Raw prompt text is never stored.</p>
          </div>
        </div>

        {/* Alert detail */}
        {sel ? (
          <div className="bg-white border border-[#d8d0b4] rounded-[14px] p-5">
            <div className="flex justify-between items-center">
              <p className="text-[#667085] font-semibold text-[11px]">ALERT {sel.id}{sel.status === 'resolved' ? ' · RESOLVED' : ''}</p>
              <span className={`font-semibold text-[11px] rounded-full px-6 py-1.5 ${severityChip[sel.severity]}`}>{sel.severity}</span>
            </div>
            <p className="text-[#17213a] font-bold text-[19px] mt-3 leading-snug">{sel.title}</p>
            <p className="text-[#667085] text-xs mt-2">{sel.detailMeta}</p>
            <div className="h-px bg-[#d8d0b4] my-3.5" />
            <p className="text-[#667085] font-semibold text-[10px]">WHAT HAPPENED</p>
            <p className="text-[#17213a] text-[13px] mt-2 leading-relaxed">{sel.what}</p>

            <div className="border border-[#078b6c] rounded-[10px] px-3.5 py-2.5 mt-4">
              <p className="text-[#667085] font-semibold text-[10px]">MASKED EVIDENCE</p>
              <p className="text-[#17213a] font-medium text-xs mt-1.5">{sel.evidence}</p>
              <p className="text-[#078b6c] text-[10px] mt-1">{sel.evidenceNote}</p>
            </div>

            <p className="text-[#667085] font-semibold text-[10px] mt-5">RESPONSE TIMELINE</p>
            <div className="mt-2.5">
              {sel.timeline.map(([time, event], i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="flex flex-col items-center pt-1">
                    <span className={`w-3 h-3 rounded-full ${i === sel.timeline.length - 1 ? 'bg-white border-2 border-[#d8d0b4]' : 'bg-[#078b6c]'}`} />
                    {i < sel.timeline.length - 1 && <span className="w-0.5 h-6 bg-[#d8d0b4]" />}
                  </div>
                  <p className="text-[#667085] font-medium text-[11px] w-12">{time}</p>
                  <p className="text-[#17213a] font-medium text-xs">{event}</p>
                </div>
              ))}
            </div>

            <div className="bg-[#fff5de] rounded-[10px] px-3.5 py-2.5 mt-4">
              <p className="text-[#d97706] font-semibold text-[11px]">Recommended next step</p>
              <p className="text-[#17213a] font-medium text-xs mt-1">{sel.recommend}</p>
            </div>

            <div className="flex gap-3 mt-5">
              {sel.primary === 'Assign training' ? (
                <Link
                  to="/admin/training/assign"
                  className="bg-gold-brand hover:bg-gold text-navy-header font-semibold text-[13px] flex-1 h-11 rounded-full flex items-center justify-center cursor-pointer"
                >
                  {sel.primary}
                </Link>
              ) : (
                <button
                  onClick={() => toast(`${sel.primary} — action recorded for ${sel.id}`)}
                  className="bg-gold-brand hover:bg-gold text-navy-header font-semibold text-[13px] flex-1 h-11 rounded-full cursor-pointer"
                >
                  {sel.primary}
                </button>
              )}
              <button
                onClick={resolve}
                disabled={sel.status !== 'open'}
                className="border-[1.5px] border-navy-header text-navy-header font-semibold text-[13px] flex-1 h-11 rounded-full cursor-pointer hover:bg-chip disabled:opacity-50"
              >
                {sel.status === 'open' ? 'Resolve alert' : 'Resolved ✓'}
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-white border border-[#d8d0b4] rounded-[14px] p-10 text-center">
            <p className="text-[#667085] text-sm">All alerts resolved. New gateway events appear here automatically.</p>
          </div>
        )}
      </div>

      {resolvedOpen && <ResolvedConfirm onClose={() => setResolvedOpen(false)} />}
    </div>
  )
}
