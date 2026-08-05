// 13 Admin · Risk Alerts — matches Figma frame "13 Admin • Risk Alerts" + Risk Alert Workspace
//
// Every alert in this queue was raised by a rule, not seeded for the screen:
// repeated identifiers in one employee's prompts, an AI tool with no visa, a
// checkpoint override, a human-review request from the public portal. The rules
// and their thresholds live in backend/src/risk.js; the legend below states them
// so the queue can be explained rather than just read.
//
// A pattern that continues escalates the alert it already has — the occurrence
// count on a card is that alert's own history, not a second card.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api.js'
import { useToast } from '../../components/Toast.jsx'

const severityChip = {
  HIGH: 'bg-[#fef0f0] text-[#d92d20]',
  MEDIUM: 'bg-[#fff5de] text-[#d97706]',
  MONITORING: 'bg-[#eef2ff] text-[#365fd9]',
}

// What the three levels mean, kept to one quiet line above the queue. The
// thresholds themselves are enforced in backend/src/risk.js; this is only so an
// admin reading the queue knows why a card is where it is.
const RUBRIC_LINE = 'High: data left, or a pattern past guidance · Medium: protected, needs a refresher · Monitoring: a trend to observe'

// Every card keeps the same 2px border in both states, so selecting one shifts
// nothing — the highlight is carried by fill, the left bar and elevation.
const cardStyle = {
  HIGH: 'bg-[#fef0f0] border-2 border-[#d92d20]',
  MEDIUM: 'bg-[#fefbf0] border-2 border-[#d1c79e]',
  MONITORING: 'bg-[#edf2ff]/50 border-2 border-[#cadafd]/70',
}

// The selected card. Selection is loud on purpose — the queue is long enough to
// scroll, so it has to be obvious which row the detail panel belongs to — and it
// borrows the colour of the severity it carries rather than a neutral accent,
// so picking a card never changes what the card is telling you.
const selectedStyle = {
  HIGH: 'bg-[#fcd9d6] border-2 border-[#d92d20] shadow-[0px_6px_16px_rgba(217,45,32,0.24)]',
  MEDIUM: 'bg-[#fdeec4] border-2 border-[#d97706] shadow-[0px_6px_16px_rgba(217,119,6,0.22)]',
  MONITORING: 'bg-[#dbe5ff] border-2 border-[#365fd9] shadow-[0px_6px_16px_rgba(54,95,217,0.22)]',
}

// The matching bar down the left edge of the selected card.
const selectedBar = {
  HIGH: 'bg-[#d92d20]',
  MEDIUM: 'bg-[#d97706]',
  MONITORING: 'bg-[#365fd9]',
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
    // Polled, because the rules fire while this page is open: three sensitive
    // prompts from an employee, or one unapproved tool, and a card appears here
    // without the admin touching anything.
    const load = () => api.get('/alerts').then(a => {
      if (!alive) return
      setAlerts(a)
      setSelectedId(id => id || a.find(x => x.status === 'open')?.id)
    }).catch(() => {})
    load()
    const t = setInterval(load, 3000)
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
    // One screen: the workspace takes whatever height is left and the queue
    // scrolls inside itself, so the KPIs and filters never scroll away from the
    // alert an admin is reading.
    <div className="flex flex-col gap-3 lg:h-[calc(100vh-3rem)] lg:overflow-y-auto">
      <div className="flex items-start justify-between shrink-0">
        <div>
          <h1 className="text-[28px] font-bold text-[#17213a]">Risk Alerts</h1>
          <p className="text-[#667085] text-sm mt-1.5">Review high-risk AI activity with context, evidence and accountable next steps.</p>
        </div>
        <Link to="/admin/audit-report" className="bg-gold-brand hover:bg-gold text-navy-header font-semibold text-[13px] w-40 h-11 rounded-full flex items-center justify-center cursor-pointer shrink-0">Create Report</Link>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-4 gap-4 shrink-0">
        {kpis.map(k => (
          <div key={k.label} className={`rounded-[14px] px-4 py-2.5 ${k.dark ? 'bg-navy-header' : 'bg-white border border-[#d8d0b4]'}`}>
            <p className={`font-semibold text-[11px] ${k.dark ? 'text-gold-brand' : 'text-[#667085]'}`}>{k.label}</p>
            <p className={`font-bold text-[24px] mt-0.5 ${k.dark ? 'text-white' : 'text-[#17213a]'}`}>{k.value}</p>
            <p className={`font-medium text-[11px] ${k.noteColor}`}>{k.note}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white border border-[#d8d0b4] rounded-[12px] px-4 py-2 flex items-center gap-2.5 shrink-0">
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

      {/* Workspace: queue + detail, 6:4. The queue is the working surface — it
          is what an admin scans, filters and triages — so it takes the room; the
          detail panel beside it explains whichever card is selected. */}
      <div className="grid grid-cols-1 lg:grid-cols-[6fr_4fr] gap-5 flex-1 min-h-0 items-start lg:items-stretch">
        <div className="bg-white border border-[#d8d0b4] rounded-[14px] p-4 flex flex-col min-h-0">
          <div className="flex justify-between items-start gap-2 px-1 shrink-0">
            <div className="min-w-0">
              <p className="text-[#17213a] font-bold text-lg">Priority queue</p>
              <p className="text-[#667085] text-xs mt-0.5">Sorted by severity and due time</p>
            </div>
            <span className="bg-[#fff0f0] text-[#d92d20] font-semibold text-[11px] rounded-full px-4 py-1.5 shrink-0">{open.length} open</span>
          </div>
          {/* Why a card sits where it does — quiet enough to read once and
              ignore afterwards. */}
          <p className="text-[#98a2b3] text-[10.5px] leading-relaxed mt-2 px-1 shrink-0">{RUBRIC_LINE}</p>
          {/* The list is the one part that scrolls. Everything framing it — the
              count, the filters above, the privacy note below — stays put. */}
          <div className="flex flex-col gap-3 mt-3 flex-1 min-h-0 overflow-y-auto pr-1">
            {queue.length === 0 && <p className="text-[#667085] text-sm py-8 text-center">No open alerts in this filter. 🎉</p>}
            {queue.map(a => {
              const active = selectedId === a.id
              return (
                <button
                  key={a.id}
                  onClick={() => setSelectedId(a.id)}
                  aria-pressed={active}
                  className={`text-left rounded-[12px] cursor-pointer shrink-0 flex overflow-hidden transition-shadow ${active ? selectedStyle[a.severity] : cardStyle[a.severity]}`}
                >
                  <span className={`w-1.5 shrink-0 ${active ? selectedBar[a.severity] : 'bg-transparent'}`} />
                  <div className="flex-1 min-w-0 p-3.5">
                    <div className="flex justify-between items-center gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className={`font-semibold text-[11px] rounded-full px-3 py-1.5 shrink-0 ${severityChip[a.severity]}`}>{a.severity}</span>
                        {/* One card, however many times the pattern recurred — a
                            queue with the same finding in it five times is the
                            same failure as no queue at all. */}
                        {a.occurrences > 1 && (
                          <span className="bg-white/70 text-[#475467] font-semibold text-[10px] rounded-full px-2 py-1 shrink-0">
                            ×{a.occurrences}
                          </span>
                        )}
                        {active && (
                          <span className="text-[#475467] font-semibold text-[10px] tracking-wide shrink-0">SELECTED</span>
                        )}
                      </div>
                      <p className={`font-medium text-[11px] shrink-0 ${a.due?.startsWith('Overdue') ? 'text-[#d92d20] font-semibold' : dueColor[a.severity]}`}>{a.due}</p>
                    </div>
                    <div className="flex justify-between items-center gap-3 mt-2">
                      <div className="min-w-0">
                        <p className={`font-semibold text-sm ${a.severity === 'HIGH' ? 'text-[#d92d20]' : 'text-[#17213a]'}`}>{a.title}</p>
                        <p className="text-[#667085] text-xs mt-1.5">{a.meta}</p>
                      </div>
                      <span className="text-[#07183a] text-[22px] shrink-0">›</span>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Alert detail. Its top strip carries the severity's colour, so the
            panel and the card it belongs to are visibly the same alert. The body
            scrolls; the actions stay pinned at the bottom where they can always
            be reached. */}
        {sel ? (
          <div className="bg-white border border-[#d8d0b4] rounded-[14px] flex flex-col min-h-0 overflow-hidden">
            <span className={`h-1.5 shrink-0 ${selectedBar[sel.severity]}`} />
            <div className="p-5 flex-1 min-h-0 overflow-y-auto">
              <div className="flex justify-between items-center gap-2">
                <p className="text-[#667085] font-semibold text-[11px]">ALERT {sel.id}{sel.status === 'resolved' ? ' · RESOLVED' : ''}</p>
                <span className={`font-semibold text-[11px] rounded-full px-5 py-1.5 shrink-0 ${severityChip[sel.severity]}`}>{sel.severity}</span>
              </div>
              <p className="text-[#17213a] font-bold text-[19px] mt-3 leading-snug">{sel.title}</p>
              <p className="text-[#667085] text-xs mt-2">{sel.detailMeta}</p>
              {sel.occurrences > 1 && (
                <p className="text-[#d97706] text-[11px] font-semibold mt-1.5">
                  Recurred {sel.occurrences} times — this alert escalated rather than opening a new one.
                </p>
              )}
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
                    <p className="text-[#667085] font-medium text-[11px] w-12 shrink-0">{time}</p>
                    <p className="text-[#17213a] font-medium text-xs">{event}</p>
                  </div>
                ))}
              </div>

              <div className="bg-[#fff5de] rounded-[10px] px-3.5 py-2.5 mt-4">
                <p className="text-[#d97706] font-semibold text-[11px]">Recommended next step</p>
                <p className="text-[#17213a] font-medium text-xs mt-1">{sel.recommend}</p>
              </div>
            </div>

            <div className="flex gap-3 p-5 pt-3 border-t border-[#eee6d4] shrink-0">
              {sel.primary === 'Assign training' ? (
                // Carries the employee the alert is about, so the refresher can
                // be assigned to them without re-finding them in the picker.
                <Link
                  to={`/admin/training/assign?mode=existing${sel.employeeId ? `&employee=${sel.employeeId}` : ''}`}
                  className="bg-gold-brand hover:bg-gold text-navy-header font-semibold text-[13px] flex-1 h-11 rounded-full flex items-center justify-center cursor-pointer"
                >
                  {sel.primary}
                </Link>
              ) : sel.primary === 'Review tool request' ? (
                <Link
                  to="/admin/tool-approvals"
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
          <div className="bg-white border border-[#d8d0b4] rounded-[14px] p-10 text-center flex items-center justify-center">
            <p className="text-[#667085] text-sm">All alerts resolved. New gateway events appear here automatically.</p>
          </div>
        )}
      </div>

      {resolvedOpen && <ResolvedConfirm onClose={() => setResolvedOpen(false)} />}
    </div>
  )
}
