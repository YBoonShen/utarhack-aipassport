// 15 Admin · Tool Approvals — matches Figma frames "15 / 15A / 15B Admin • Tool Approvals"
// Live data: the request queue comes from the backend; approving or declining
// updates the employee's My Visas page and sends them a notification.
import { useEffect, useState } from 'react'
import { api } from '../../lib/api.js'

const statusChip = {
  'SECURITY REVIEW': 'bg-[#fff5de] text-[#d97706]',
  COMPLIANCE: 'bg-[#eef2ff] text-[#365fd9]',
  APPROVED: 'bg-[#e9f8f2] text-[#078b6c]',
  REDIRECTED: 'bg-[#f1eddf] text-[#667085]',
  DECLINED: 'bg-[#fff0f0] text-[#d92d20]',
}

const cardStyles = {
  'SECURITY REVIEW': 'border-2 border-[rgba(10,32,79,0.7)] bg-[#fefbf0]',
  COMPLIANCE: 'border border-[#365fd9] bg-white',
  APPROVED: 'border border-[#078b6c] bg-white',
  REDIRECTED: 'border border-[rgba(10,32,79,0.5)] bg-white',
  DECLINED: 'border border-[#d92d20] bg-white',
}

// Presentation extras per request status (vendor checks etc. are review-team data
// that would live in Firestore later)
const checksByStatus = {
  'SECURITY REVIEW': [['✓', 'Data processing terms available'], ['✓', 'Training opt-out documented'], ['!', 'Regional hosting needs confirmation']],
  COMPLIANCE: [['✓', 'Security review passed'], ['✓', 'Data processing terms available'], ['!', 'Retention period awaiting vendor reply']],
  APPROVED: [['✓', 'Security review passed'], ['✓', 'Compliance review passed'], ['✓', 'Decision recorded']],
  REDIRECTED: [['✓', 'Approved alternative covers the need'], ['✓', 'One-click switch offered'], ['✓', 'Request closed as redirected']],
  DECLINED: [['✓', 'Security review completed'], ['!', 'Vendor risk exceeded policy'], ['✓', 'Approved alternative suggested']],
}

const noteByStatus = {
  'SECURITY REVIEW': 'Pilot approval can be limited to one department for 30 days.',
  COMPLIANCE: 'Compliance check completes after the vendor confirms retention.',
  APPROVED: 'Approved. Next review in 90 days.',
  REDIRECTED: 'No new vendor risk added. Request closed as redirected.',
  DECLINED: 'Declined. The requester was pointed to an approved alternative.',
}

const kpiBase = [
  { label: 'MEDIAN TURNAROUND', value: '2.4 days', note: 'Target: ≤ 3 days', noteColor: 'text-[#078b6c]' },
  { label: 'APPROVED TOOLS', value: '8', note: 'Across 6 categories', noteColor: 'text-[#365fd9]' },
  { label: 'SAFE REDIRECTS', value: '12', note: 'This week', noteColor: 'text-[#078b6c]' },
]

const stages = [
  { n: '✓', label: 'Submitted', active: true, done: true },
  { n: '2', label: 'Security', active: true, done: false },
  { n: '3', label: 'Compliance', active: false, done: false },
  { n: '4', label: 'Decision', active: false, done: false },
]

export default function ToolApprovals() {
  const [requests, setRequests] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    const load = () => api.get('/visas').then(r => {
      if (!alive) return
      setRequests(r)
      setSelectedId(id => id || r[0]?.id)
    }).catch(() => {})
    load()
    const t = setInterval(load, 4000)
    return () => { alive = false; clearInterval(t) }
  }, [])

  const sel = requests.find(r => r.id === selectedId)
  const pending = requests.filter(r => ['SECURITY REVIEW', 'COMPLIANCE'].includes(r.status)).length
  const isPending = sel && ['SECURITY REVIEW', 'COMPLIANCE'].includes(sel.status)

  async function decide(decision) {
    if (!sel || busy) return
    setBusy(true)
    try {
      await api.post(`/visas/${sel.id}/decision`, { decision })
      setRequests(await api.get('/visas'))
    } catch { /* offline */ } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[28px] font-bold text-[#17213a]">Tool Approvals</h1>
          <p className="text-[#667085] text-sm mt-1.5">Review new AI tools quickly while keeping data use and vendor risk explicit.</p>
        </div>
        <button className="border-[1.5px] border-navy-header text-navy-header font-semibold text-xs w-40 h-11 rounded-full cursor-pointer hover:bg-chip">Approval policy</button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-4 gap-4 mt-6">
        <div className="rounded-[14px] px-4 py-3 bg-navy-header">
          <p className="font-semibold text-[11px] text-gold-brand">PENDING REVIEW</p>
          <p className="font-bold text-[26px] mt-1 text-white">{pending}</p>
          <p className="font-medium text-[11px] mt-0.5 text-[#fff5de]">{pending > 0 ? 'Oldest: 1 day' : 'Queue clear'}</p>
        </div>
        {kpiBase.map(k => (
          <div key={k.label} className="rounded-[14px] px-4 py-3 bg-white border border-[#d8d0b4]">
            <p className="font-semibold text-[11px] text-[#667085]">{k.label}</p>
            <p className="font-bold text-[26px] mt-1 text-[#17213a]">{k.value}</p>
            <p className={`font-medium text-[11px] mt-0.5 ${k.noteColor}`}>{k.note}</p>
          </div>
        ))}
      </div>

      {/* Standard review stages */}
      <div className="bg-white border border-[#d8d0b4] rounded-[12px] px-4 py-3 mt-5">
        <p className="text-[#667085] font-semibold text-[10px]">STANDARD REVIEW</p>
        <div className="flex items-center gap-0 mt-2">
          {stages.map((s, i) => (
            <div key={s.label} className="flex items-center">
              <div className="flex items-center gap-2.5">
                <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                  s.done ? 'bg-[#078b6c] text-white' : s.active ? 'bg-gold-brand text-navy-header' : 'bg-navy-header text-white'
                }`}>{s.n}</span>
                <p className={`font-semibold text-[13px] w-[142px] ${s.active || s.done ? 'text-[#17213a]' : 'text-[#667085]'}`}>{s.label}</p>
              </div>
              {i < stages.length - 1 && <span className={`h-0.5 w-[72px] mr-3.5 ${s.done ? 'bg-[#078b6c]' : 'bg-[#d8d0b4]'}`} />}
            </div>
          ))}
        </div>
      </div>

      {/* Workspace: queue + detail */}
      <div className="grid grid-cols-[604px_1fr] gap-5 mt-5 items-start">
        <div className="bg-white border border-[#d8d0b4] rounded-[14px] p-4">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[#17213a] font-bold text-lg">Requests</p>
              <p className="text-[#667085] text-xs mt-0.5">{pending} pending · sorted by submission time</p>
            </div>
            <button className="border-[1.5px] border-navy-header text-navy-header font-semibold text-xs w-[130px] h-11 rounded-full cursor-pointer hover:bg-chip">All requests</button>
          </div>
          <div className="flex flex-col gap-3.5 mt-3.5">
            {requests.map(r => (
              <button
                key={r.id}
                onClick={() => setSelectedId(r.id)}
                className={`text-left rounded-[12px] p-3.5 cursor-pointer ${cardStyles[r.status] || cardStyles.REDIRECTED} ${selectedId === r.id ? 'ring-2 ring-navy-header/30' : ''}`}
              >
                <span className={`inline-block font-semibold text-[11px] rounded-full px-4 py-1.5 ${statusChip[r.status]}`}>{r.status}</span>
                <div className="flex justify-between items-center mt-2">
                  <p className="text-navy font-semibold text-[15px]">{r.tool}</p>
                  <p className="text-[#667085] font-medium text-[11px]">{r.id}</p>
                </div>
                <div className="flex justify-between items-center mt-1">
                  <p className="text-[#667085] text-[11px]">{r.dept} · submitted {r.submitted}</p>
                  <span className="text-[#365fd9] text-[22px] leading-none">›</span>
                </div>
              </button>
            ))}
          </div>
          <div className="bg-[#eef2ff] rounded-[10px] px-3.5 py-3 mt-4">
            <p className="text-[#365fd9] font-semibold text-[11px]">Fast, explainable decisions</p>
            <p className="text-[#365fd9] text-[11px] mt-1">Declare purpose, data scope, owner and renewal date for every approval.</p>
          </div>
        </div>

        {/* Request detail */}
        {sel && (
          <div className="bg-white border border-[#d8d0b4] rounded-[14px] p-5">
            <div className="flex justify-between items-center">
              <p className="text-[#667085] font-semibold text-[10px]">REQUEST {sel.id}</p>
              <span className={`font-semibold text-[11px] rounded-full px-5 py-1.5 ${statusChip[sel.status]}`}>{sel.status}</span>
            </div>
            <p className="text-[#17213a] font-bold text-xl mt-2.5">{sel.tool}</p>
            <p className="text-[#667085] text-[11px] mt-1.5">{sel.dept} · requested by {sel.requester} · owner: {sel.owner}</p>
            <div className="h-px bg-[#d8d0b4] my-3.5" />
            <p className="text-[#667085] font-semibold text-[10px]">BUSINESS PURPOSE</p>
            <p className="text-[#17213a] text-xs mt-1.5 leading-relaxed">{sel.purpose || 'No purpose declared yet.'}</p>
            <p className="text-[#667085] font-semibold text-[10px] mt-4">DECLARED DATA SCOPE</p>
            <div className="flex gap-2.5 mt-2 flex-wrap">
              {(sel.scopes || []).map(s => (
                <span key={s} className="bg-[#edf2ff] text-navy font-semibold text-[11px] rounded-full px-4 py-1.5">{s}</span>
              ))}
            </div>

            <div className="border border-[#078b6c] rounded-[10px] px-3.5 py-2.5 mt-4">
              <p className="text-[#17213a] font-semibold text-xs">Vendor checks</p>
              <div className="mt-1.5 space-y-1.5">
                {(checksByStatus[sel.status] || []).map(([mark, text], i) => (
                  <p key={i} className="text-[#17213a] font-medium text-[11px]">
                    <span className={`font-bold mr-2 ${mark === '!' ? 'text-[#d97706]' : 'text-[#078b6c]'}`}>{mark}</span>
                    {text}
                  </p>
                ))}
              </div>
            </div>

            {sel.status !== 'APPROVED' && (
              <div className="bg-[#eef2ff] rounded-[10px] px-3.5 py-2.5 mt-4">
                <p className="text-[#365fd9] font-semibold text-[10px]">APPROVED ALTERNATIVE</p>
                <p className="text-[#17213a] font-semibold text-[13px] mt-1">ChatGPT · closest approved capability</p>
                <p className="text-[#365fd9] text-[10px] mt-0.5">Available now with the same declared data scope.</p>
              </div>
            )}

            <div className="bg-[#fff5de] rounded-[10px] px-3.5 py-3.5 mt-4">
              <p className="text-[#d97706] font-medium text-[11px]">{noteByStatus[sel.status]}</p>
            </div>

            <div className="flex items-center gap-3 mt-5">
              {isPending ? (
                <>
                  <button onClick={() => decide('approve')} disabled={busy} className="bg-gold-brand hover:bg-gold text-navy-header font-semibold text-xs px-6 h-11 rounded-full cursor-pointer disabled:opacity-60">
                    {busy ? 'Saving…' : 'Approve 30-day pilot'}
                  </button>
                  <button onClick={() => decide('redirect')} disabled={busy} className="border-[1.5px] border-navy-header text-navy-header font-semibold text-xs px-5 h-11 rounded-full cursor-pointer hover:bg-chip disabled:opacity-60">
                    Redirect to alternative
                  </button>
                  <button onClick={() => decide('decline')} disabled={busy} className="text-[#d92d20] font-semibold text-xs px-4 h-11 cursor-pointer ml-auto disabled:opacity-60">
                    Decline
                  </button>
                </>
              ) : (
                <p className="text-[#667085] text-xs py-3">
                  Decision recorded{sel.decided ? ` on ${sel.decided}` : ''} · the requester was notified automatically.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
