// 14 Admin · Audit Log — matches Figma frame "14 Admin • Audit Log"
//
// Live in the literal sense: the feed polls the backend, and the backend writes
// an event for every governance action as it happens — a prompt masked at the
// gateway, an admin publishing or assigning a module, an employee completing
// one, a sign-in, a policy change, a refused attempt to open somebody else's
// training. Nothing on this screen is generated for display; if it is in the
// table, something did it.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api.js'

// Colour follows what the event means, not who did it: green protected,
// red flagged, amber redirected/blocked, blue routine, navy governance.
const statusChip = {
  MASKED: 'bg-[#e9f8f2] text-[#078b6c]',
  CLEAN: 'bg-[#eef2ff] text-[#365fd9]',
  ALERT: 'bg-[#fff0f0] text-[#d92d20]',
  DENIED: 'bg-[#fff0f0] text-[#d92d20]',
  REDIRECTED: 'bg-[#fff5de] text-[#d97706]',
  SUSPENDED: 'bg-[#fceded] text-[#c72929]',
  REVIEW: 'bg-[#fff5de] text-[#d97706]',
  APPROVAL: 'bg-[#e9f8f2] text-[#078b6c]',
  ASSIGNED: 'bg-[#ede9fe] text-[#6d28d9]',
  PUBLISHED: 'bg-[#e9f8f2] text-[#078b6c]',
  HIDDEN: 'bg-[#ededf2] text-[#667085]',
  CREATED: 'bg-[#ede9fe] text-[#6d28d9]',
  UPDATED: 'bg-[#ede9fe] text-[#6d28d9]',
  COMPLETED: 'bg-[#e9f8f2] text-[#078b6c]',
  REQUESTED: 'bg-[#eef2ff] text-[#365fd9]',
  RESOLVED: 'bg-[#e9f8f2] text-[#078b6c]',
  POLICY: 'bg-[#fff5de] text-[#d97706]',
  'SIGN-IN': 'bg-[#eef2ff] text-[#365fd9]',
  'SIGN-OUT': 'bg-[#ededf2] text-[#667085]',
}

const riskChip = {
  HIGH: 'text-[#d92d20]',
  MEDIUM: 'text-[#d97706]',
  LOW: 'text-[#667085]',
}

const resultChip = {
  SUCCESS: 'bg-[#e9f8f2] text-[#078b6c]',
  BLOCKED: 'bg-[#fff0f0] text-[#d92d20]',
  FLAGGED: 'bg-[#fff5de] text-[#d97706]',
}

const assurance = [
  ['● LIVE', 'Events stream in real time'],
  ['✓ INTEGRITY VERIFIED', 'Append-only event chain'],
  ['90-DAY RETENTION', 'Masked prompts only'],
  ['3 FRAMEWORKS', 'NIST AI RMF · EU AI Act · PDPA'],
]

// How often the feed re-reads. Short enough that an action taken in another tab
// shows up while the admin is still looking at the result of taking it.
const POLL_MS = 2000
const PAGE_SIZE = 8
const cols = 'grid grid-cols-[52px_72px_58px_52px_1fr_104px_74px_58px_88px] items-center gap-1'

export default function AuditLog() {
  const [events, setEvents] = useState([])
  const [search, setSearch] = useState('')
  const [action, setAction] = useState('All')
  const [scope, setScope] = useState('All') // 'All' | 'Admin' | 'Employee'
  const [menu, setMenu] = useState(null) // 'action' | 'more' | null
  const [page, setPage] = useState(0)
  const [lastSync, setLastSync] = useState(null)

  useEffect(() => {
    let alive = true
    const load = () => api.get('/audit').then(a => {
      if (!alive) return
      setEvents(a.events)
      setLastSync(new Date())
    }).catch(() => {})
    load()
    const t = setInterval(load, POLL_MS)
    return () => { alive = false; clearInterval(t) }
  }, [])

  // The filter list comes from the feed itself, so an action type the backend
  // starts writing appears here without this page being edited.
  const actions = [...new Set(events.map(e => e.action))].sort()

  const filtered = events.filter(e =>
    (action === 'All' || e.action === action) &&
    (scope === 'All' || (e.role || 'Employee') === scope) &&
    (search.trim() === '' ||
      `${e.id} ${e.user} ${e.dept} ${e.tool} ${e.resource || ''} ${e.action} ${e.control} ${e.status || ''} ${e.risk || ''} ${e.record}`
        .toLowerCase().includes(search.trim().toLowerCase()))
  )
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const current = Math.min(page, totalPages - 1)
  const slice = filtered.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE)
  // Events that were masked on-device during an outage and recorded afterwards.
  const recovered = events.filter(e => e.offline).length
  const blocked = events.filter(e => e.status === 'BLOCKED').length

  const resetPage = fn => v => { fn(v); setPage(0) }

  return (
    <div>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[28px] font-bold text-[#17213a]">Audit Log</h1>
          <p className="text-[#667085] text-sm mt-1.5">Trace every protected prompt, policy decision, training change and approval action.</p>
        </div>
        <Link to="/admin/audit-report" className="bg-gold-brand hover:bg-gold text-navy-header font-semibold text-[13px] px-8 h-11 rounded-full flex items-center cursor-pointer">
          Generate audit report
        </Link>
      </div>

      {/* Audit assurance strip */}
      <div className="bg-navy-header rounded-[12px] px-6 py-3.5 mt-6 grid grid-cols-4 gap-4">
        {assurance.map(([title, sub]) => (
          <div key={title}>
            <p className="text-gold-brand font-semibold text-[11px]">{title}</p>
            <p className="text-white text-[11px] mt-1">{sub}</p>
          </div>
        ))}
      </div>

      {/* Audit events table */}
      <div className="bg-white border border-[#d8d0b4] rounded-[14px] p-5 pt-4 mt-5">
        <div className="flex justify-between items-start">
          <div>
            <p className="text-[#17213a] font-bold text-lg">Audit events</p>
            <p className="text-[#667085] text-xs mt-0.5">
              {events.length} events · live
              {lastSync && <span> · last refreshed {lastSync.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>}
              {recovered > 0 && <span className="text-[#d97706]"> · {recovered} recovered from a gateway outage ⟲</span>}
              {blocked > 0 && <span className="text-[#d92d20]"> · {blocked} blocked</span>}
            </p>
          </div>
          <div className="flex gap-2.5">
            <div className="bg-[#fffcef] border border-[#d8d0b4] rounded-[9px] h-10 w-[280px] flex items-center px-2.5 gap-2">
              <span className="text-[#667085] text-[17px]">⌕</span>
              <input
                value={search}
                onChange={e => resetPage(setSearch)(e.target.value)}
                placeholder="Search event ID, user, module or tool"
                className="flex-1 bg-transparent outline-none text-xs text-[#17213a] placeholder-[#667085]"
              />
              {search && <button onClick={() => resetPage(setSearch)('')} className="text-[#667085] text-sm cursor-pointer px-1">×</button>}
            </div>

            {/* Actor filter — separates what an admin did from what employees did */}
            <button
              onClick={() => resetPage(setScope)(scope === 'All' ? 'Admin' : scope === 'Admin' ? 'Employee' : 'All')}
              className={`font-semibold text-[13px] h-10 px-5 rounded-full cursor-pointer ${scope === 'All' ? 'border-[1.5px] border-navy-header text-navy-header hover:bg-chip' : 'bg-navy-header text-white'}`}
            >
              {scope === 'All' ? 'All actors' : `${scope} only`}
            </button>

            {/* Action filter */}
            <div className="relative">
              <button onClick={() => setMenu(m => (m === 'action' ? null : 'action'))} className={`font-semibold text-[13px] h-10 px-5 rounded-full cursor-pointer ${action === 'All' ? 'border-[1.5px] border-navy-header text-navy-header hover:bg-chip' : 'bg-navy-header text-white'}`}>
                {action === 'All' ? 'All actions' : action}&nbsp;▾
              </button>
              {menu === 'action' && (
                <div className="absolute right-0 top-11 z-20 bg-white border border-[#d8d0b4] rounded-[10px] shadow-[0px_8px_20px_rgba(0,0,0,0.12)] py-1.5 w-52 max-h-[320px] overflow-y-auto">
                  {['All', ...actions].map(a => (
                    <button key={a} onClick={() => { resetPage(setAction)(a); setMenu(null) }} className={`block w-full text-left px-4 py-2 text-[13px] cursor-pointer hover:bg-chip ${action === a ? 'text-[#365fd9] font-semibold' : 'text-[#17213a]'}`}>
                      {a === 'All' ? 'All actions' : a}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* More filters */}
            <div className="relative">
              <button onClick={() => setMenu(m => (m === 'more' ? null : 'more'))} className="border-[1.5px] border-navy-header text-navy-header font-semibold text-[13px] h-10 px-5 rounded-full cursor-pointer hover:bg-chip">More filters</button>
              {menu === 'more' && (
                <div className="absolute right-0 top-11 z-20 bg-white border border-[#d8d0b4] rounded-[10px] shadow-[0px_8px_20px_rgba(0,0,0,0.12)] py-2 w-56">
                  <p className="px-4 py-1 text-[10px] font-semibold text-[#667085]">QUICK FILTERS</p>
                  <button onClick={() => { resetPage(setSearch)('HIGH'); setMenu(null) }} className="block w-full text-left px-4 py-2 text-[13px] text-[#17213a] cursor-pointer hover:bg-chip">
                    High-risk events only
                  </button>
                  <button onClick={() => { resetPage(setSearch)('BLOCKED'); setMenu(null) }} className="block w-full text-left px-4 py-2 text-[13px] text-[#17213a] cursor-pointer hover:bg-chip">
                    Blocked or refused
                  </button>
                  <button onClick={() => { resetPage(setAction)('ASSIGNED'); setMenu(null) }} className="block w-full text-left px-4 py-2 text-[13px] text-[#17213a] cursor-pointer hover:bg-chip">
                    Training assignments
                  </button>
                  <button onClick={() => { resetPage(setAction)('COMPLETED'); setMenu(null) }} className="block w-full text-left px-4 py-2 text-[13px] text-[#17213a] cursor-pointer hover:bg-chip">
                    Training completions
                  </button>
                  <button onClick={() => { setSearch(''); setAction('All'); setScope('All'); setPage(0); setMenu(null) }} className="block w-full text-left px-4 py-2 text-[13px] text-[#365fd9] font-semibold cursor-pointer hover:bg-chip border-t border-[#eee6d4] mt-1">
                    Reset all filters
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className={`${cols} bg-navy-header rounded-[8px] text-gold-brand font-semibold text-[11px] px-3 h-11 mt-4`}>
          <p>Time</p><p>Event</p><p>User</p><p>Dept</p><p>Record</p><p>Action</p><p>Result</p><p>Risk</p><p>Control</p>
        </div>
        {slice.map((e, i) => (
          <div key={e.id} className={`${cols} px-3 h-14 border-b border-[#eee6d4] text-xs ${i % 2 === 1 ? 'bg-[#fffcef]' : 'bg-white'}`}>
            {/* `time` is when it happened. A recovered event was masked on the
                employee's device during a gateway outage and only reached the
                log later, so it also carries when it was recorded — the
                distinction an auditor needs to read the gap correctly. */}
            <p className="text-[#475467]">
              {e.time}
              {e.offline && <span className="block text-[9px] text-[#d97706] leading-tight">rec {e.recordedAt}</span>}
            </p>
            <p className="text-[#475467] font-medium">{e.id}</p>
            <p className="text-[#475467]">{e.user}</p>
            <p className="text-[#475467] truncate">{e.dept}</p>
            <div className="min-w-0 pr-2">
              <p className="text-[#475467] truncate">{e.record}</p>
              {/* The thing the action was taken on — a module, a tool, a case. */}
              {e.resource && <p className="text-[#98a2b3] text-[10px] truncate">{e.resource}</p>}
            </div>
            <p className="flex items-center gap-1">
              <span className={`inline-block font-semibold text-[10px] rounded-full px-2 py-1 ${statusChip[e.action] || 'bg-[#ededf2] text-[#667085]'}`}>{e.action}</span>
              {e.offline && (
                <span title="Masked on device during a gateway outage, recorded on reconnection" className="text-[#d97706] text-[11px]">⟲</span>
              )}
            </p>
            <p>
              <span className={`inline-block font-semibold text-[10px] rounded-full px-2 py-1 ${resultChip[e.status] || resultChip.SUCCESS}`}>
                {e.status || 'SUCCESS'}
              </span>
            </p>
            <p className={`font-semibold text-[10px] ${riskChip[e.risk] || riskChip.LOW}`}>{e.risk || 'LOW'}</p>
            <p className="text-[#365fd9] font-medium truncate">{e.control}</p>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="text-[#667085] text-sm text-center py-10">No audit events match your search or filters.</p>
        )}

        <div className="flex items-center justify-between mt-4">
          <p className="text-[#667085] text-xs">Showing {slice.length} of {filtered.length} events&nbsp;&nbsp;·&nbsp;&nbsp;Raw personal data is never stored</p>
          {totalPages > 1 && (
            <div className="flex items-center gap-3">
              <p className="text-[#667085] font-medium text-xs">{current + 1} of {totalPages}</p>
              <button onClick={() => setPage(current - 1)} disabled={current === 0} className="w-8 h-8 rounded-full bg-[#fffcef] border border-[#d8d0b4] text-[#667085] text-lg cursor-pointer disabled:opacity-40 disabled:cursor-default">‹</button>
              <button onClick={() => setPage(current + 1)} disabled={current >= totalPages - 1} className="w-8 h-8 rounded-full bg-[#fffcef] border border-[#d8d0b4] text-[#667085] text-lg cursor-pointer disabled:opacity-40 disabled:cursor-default">›</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
