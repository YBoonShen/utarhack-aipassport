// 14 Admin · Audit Log — matches Figma frame "14 Admin • Audit Log"
// Live data: events poll the backend, so employee gateway activity streams in.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api.js'

const statusChip = {
  MASKED: 'bg-[#e9f8f2] text-[#078b6c]',
  ALERT: 'bg-[#fff0f0] text-[#d92d20]',
  REDIRECTED: 'bg-[#fff5de] text-[#d97706]',
  CLEAN: 'bg-[#eef2ff] text-[#365fd9]',
}

const assurance = [
  ['● LIVE', 'Events stream in real time'],
  ['✓ INTEGRITY VERIFIED', 'Append-only event chain'],
  ['90-DAY RETENTION', 'Masked prompts only'],
  ['3 FRAMEWORKS', 'NIST AI RMF · EU AI Act · PDPA'],
]

const actions = ['MASKED', 'ALERT', 'REDIRECTED', 'CLEAN']
const PAGE_SIZE = 8
const cols = 'grid grid-cols-[56px_78px_64px_56px_106px_112px_104px_1fr_28px] items-center gap-1'

export default function AuditLog() {
  const [events, setEvents] = useState([])
  const [search, setSearch] = useState('')
  const [action, setAction] = useState('All')
  const [menu, setMenu] = useState(null) // 'action' | 'more' | null
  const [page, setPage] = useState(0)

  useEffect(() => {
    let alive = true
    const load = () => api.get('/audit').then(a => alive && setEvents(a.events)).catch(() => {})
    load()
    const t = setInterval(load, 3000)
    return () => { alive = false; clearInterval(t) }
  }, [])

  const filtered = events.filter(e =>
    (action === 'All' || e.action === action) &&
    (search.trim() === '' || `${e.id} ${e.user} ${e.dept} ${e.tool} ${e.action} ${e.control} ${e.record}`.toLowerCase().includes(search.trim().toLowerCase()))
  )
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const current = Math.min(page, totalPages - 1)
  const slice = filtered.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE)

  const resetPage = fn => v => { fn(v); setPage(0) }

  return (
    <div>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[28px] font-bold text-[#17213a]">Audit Log</h1>
          <p className="text-[#667085] text-sm mt-1.5">Trace every protected prompt, policy decision and approval action.</p>
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
            <p className="text-[#667085] text-xs mt-0.5">{events.length} events · refreshed just now</p>
          </div>
          <div className="flex gap-2.5">
            <div className="bg-[#fffcef] border border-[#d8d0b4] rounded-[9px] h-10 w-[280px] flex items-center px-2.5 gap-2">
              <span className="text-[#667085] text-[17px]">⌕</span>
              <input
                value={search}
                onChange={e => resetPage(setSearch)(e.target.value)}
                placeholder="Search event ID, user or tool"
                className="flex-1 bg-transparent outline-none text-xs text-[#17213a] placeholder-[#667085]"
              />
              {search && <button onClick={() => resetPage(setSearch)('')} className="text-[#667085] text-sm cursor-pointer px-1">×</button>}
            </div>
            <button className="bg-navy-header text-white font-semibold text-[13px] h-10 px-6 rounded-full cursor-pointer">Today</button>

            {/* Action filter */}
            <div className="relative">
              <button onClick={() => setMenu(m => (m === 'action' ? null : 'action'))} className={`font-semibold text-[13px] h-10 px-5 rounded-full cursor-pointer ${action === 'All' ? 'border-[1.5px] border-navy-header text-navy-header hover:bg-chip' : 'bg-navy-header text-white'}`}>
                {action === 'All' ? 'All actions' : action}&nbsp;▾
              </button>
              {menu === 'action' && (
                <div className="absolute right-0 top-11 z-20 bg-white border border-[#d8d0b4] rounded-[10px] shadow-[0px_8px_20px_rgba(0,0,0,0.12)] py-1.5 w-44">
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
                <div className="absolute right-0 top-11 z-20 bg-white border border-[#d8d0b4] rounded-[10px] shadow-[0px_8px_20px_rgba(0,0,0,0.12)] py-2 w-52">
                  <p className="px-4 py-1 text-[10px] font-semibold text-[#667085]">QUICK ACTION FILTER</p>
                  {actions.map(a => (
                    <button key={a} onClick={() => { resetPage(setAction)(a); setMenu(null) }} className="block w-full text-left px-4 py-2 text-[13px] text-[#17213a] cursor-pointer hover:bg-chip">
                      Only {a.toLowerCase()} events
                    </button>
                  ))}
                  <button onClick={() => { setSearch(''); setAction('All'); setPage(0); setMenu(null) }} className="block w-full text-left px-4 py-2 text-[13px] text-[#365fd9] font-semibold cursor-pointer hover:bg-chip border-t border-[#eee6d4] mt-1">
                    Reset all filters
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className={`${cols} bg-navy-header rounded-[8px] text-gold-brand font-semibold text-[11px] px-3 h-11 mt-4`}>
          <p>Time</p><p>Event</p><p>User</p><p>Dept</p><p>Tool</p><p>Action</p><p>Control</p><p>Masked record</p><p />
        </div>
        {slice.map((e, i) => (
          <div key={e.id} className={`${cols} px-3 h-14 border-b border-[#eee6d4] text-xs ${i % 2 === 1 ? 'bg-[#fffcef]' : 'bg-white'}`}>
            <p className="text-[#475467]">{e.time}</p>
            <p className="text-[#475467] font-medium">{e.id}</p>
            <p className="text-[#475467]">{e.user}</p>
            <p className="text-[#475467]">{e.dept}</p>
            <p className="text-[#475467]">{e.tool}</p>
            <p><span className={`inline-block font-semibold text-[10px] rounded-full px-2.5 py-1 ${statusChip[e.action] || statusChip.CLEAN}`}>{e.action}</span></p>
            <p className="text-[#365fd9] font-medium">{e.control}</p>
            <p className="text-[#475467] truncate pr-2">{e.record}</p>
            <p className="text-[#667085] text-center">⋯</p>
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
