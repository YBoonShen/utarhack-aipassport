// 15 Admin · Tool Approvals — matches Figma frames "15 / 15A / 15B Admin • Tool Approvals" + Tool Approval Workspace
import { useState } from 'react'

const statusChip = {
  'SECURITY REVIEW': 'bg-[#fff5de] text-[#d97706]',
  COMPLIANCE: 'bg-[#eef2ff] text-[#365fd9]',
  APPROVED: 'bg-[#e9f8f2] text-[#078b6c]',
  REDIRECTED: 'bg-[#f1eddf] text-[#667085]',
}

const requests = [
  {
    id: 'A-0492', tool: 'SummarizerX', status: 'SECURITY REVIEW', meta: 'Sales · submitted 14 Jul 2026',
    cardBorder: 'border-2 border-[rgba(10,32,79,0.7)] bg-[#fefbf0]',
    detailMeta: 'Sales · requested by S-044 · owner: M. Wong',
    purpose: 'Summarise customer meeting notes and produce follow-up actions.',
    scope: ['Internal', 'No personal data', 'Text only'],
    checks: [['✓', 'Data processing terms available'], ['✓', 'Training opt-out documented'], ['!', 'Regional hosting needs confirmation']],
    alternative: ['ChatGPT · summarise mode', 'Available now with the same declared data scope.'],
    note: 'Pilot approval can be limited to Sales for 30 days.',
    primary: 'Approve 30-day pilot', secondary: 'Request info',
  },
  {
    id: 'A-0491', tool: 'MeetingMind', status: 'COMPLIANCE', meta: 'Operations · submitted 15 Jul 2026',
    cardBorder: 'border border-[#365fd9] bg-white',
    detailMeta: 'Operations · requested by O-031 · owner: R. Tan',
    purpose: 'Transcribe internal meetings and generate action items for the team.',
    scope: ['Internal', 'Voice + text', 'No customer data'],
    checks: [['✓', 'Security review passed'], ['✓', 'Data processing terms available'], ['!', 'Retention period awaiting vendor reply']],
    alternative: ['Gemini · meeting notes', 'Available now for text-based summaries.'],
    note: 'Compliance check completes after the vendor confirms retention.',
    primary: 'Approve with conditions', secondary: 'Request info',
  },
  {
    id: 'A-0488', tool: 'CodePilot Pro', status: 'APPROVED', meta: 'Engineering · approved 12 Jul 2026',
    cardBorder: 'border border-[#078b6c] bg-white',
    detailMeta: 'Engineering · requested by E-217 · owner: A. Rahman',
    purpose: 'Assist with code review and refactoring on internal repositories.',
    scope: ['Source code', 'Internal repos', 'Level 3 only'],
    checks: [['✓', 'Security review passed'], ['✓', 'Compliance review passed'], ['✓', 'Decision recorded · renewal 12 Oct 2026']],
    alternative: null,
    note: 'Approved for Engineering at Level 3. Next review in 90 days.',
    primary: 'View approval record', secondary: 'Adjust scope',
  },
  {
    id: 'A-0486', tool: 'TranslateAI', status: 'REDIRECTED', meta: 'Marketing · alternative suggested',
    cardBorder: 'border border-[rgba(10,32,79,0.5)] bg-white',
    detailMeta: 'Marketing · requested by M-083 · owner: N. Lee',
    purpose: 'Translate campaign copy for regional markets.',
    scope: ['Marketing copy', 'No personal data', 'Text only'],
    checks: [['✓', 'Approved alternative covers the need'], ['✓', 'One-click switch offered'], ['✓', 'Requester accepted the redirect']],
    alternative: ['ChatGPT · translate mode', 'Same capability inside an approved tool.'],
    note: 'No new vendor risk added. Request closed as redirected.',
    primary: 'Reopen request', secondary: 'View record',
  },
]

const kpis = [
  { label: 'PENDING REVIEW', value: '2', note: 'Oldest: 1 day', dark: true, noteColor: 'text-[#fff5de]' },
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
  const [selectedId, setSelectedId] = useState('A-0492')
  const sel = requests.find(r => r.id === selectedId)

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
        {kpis.map(k => (
          <div key={k.label} className={`rounded-[14px] px-4 py-3 ${k.dark ? 'bg-navy-header' : 'bg-white border border-[#d8d0b4]'}`}>
            <p className={`font-semibold text-[11px] ${k.dark ? 'text-gold-brand' : 'text-[#667085]'}`}>{k.label}</p>
            <p className={`font-bold text-[26px] mt-1 ${k.dark ? 'text-white' : 'text-[#17213a]'}`}>{k.value}</p>
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
              <p className="text-[#667085] text-xs mt-0.5">2 pending · sorted by submission time</p>
            </div>
            <button className="border-[1.5px] border-navy-header text-navy-header font-semibold text-xs w-[130px] h-11 rounded-full cursor-pointer hover:bg-chip">All requests</button>
          </div>
          <div className="flex flex-col gap-3.5 mt-3.5">
            {requests.map(r => (
              <button
                key={r.id}
                onClick={() => setSelectedId(r.id)}
                className={`text-left rounded-[12px] p-3.5 cursor-pointer ${r.cardBorder} ${selectedId === r.id ? 'ring-2 ring-navy-header/30' : ''}`}
              >
                <span className={`inline-block font-semibold text-[11px] rounded-full px-4 py-1.5 ${statusChip[r.status]}`}>{r.status}</span>
                <div className="flex justify-between items-center mt-2">
                  <p className="text-navy font-semibold text-[15px]">{r.tool}</p>
                  <p className="text-[#667085] font-medium text-[11px]">{r.id}</p>
                </div>
                <div className="flex justify-between items-center mt-1">
                  <p className="text-[#667085] text-[11px]">{r.meta}</p>
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
        <div className="bg-white border border-[#d8d0b4] rounded-[14px] p-5">
          <div className="flex justify-between items-center">
            <p className="text-[#667085] font-semibold text-[10px]">REQUEST {sel.id}</p>
            <span className={`font-semibold text-[11px] rounded-full px-5 py-1.5 ${statusChip[sel.status]}`}>{sel.status}</span>
          </div>
          <p className="text-[#17213a] font-bold text-xl mt-2.5">{sel.tool}</p>
          <p className="text-[#667085] text-[11px] mt-1.5">{sel.detailMeta}</p>
          <div className="h-px bg-[#d8d0b4] my-3.5" />
          <p className="text-[#667085] font-semibold text-[10px]">BUSINESS PURPOSE</p>
          <p className="text-[#17213a] text-xs mt-1.5 leading-relaxed">{sel.purpose}</p>
          <p className="text-[#667085] font-semibold text-[10px] mt-4">DECLARED DATA SCOPE</p>
          <div className="flex gap-2.5 mt-2">
            {sel.scope.map(s => (
              <span key={s} className="bg-[#edf2ff] text-navy font-semibold text-[11px] rounded-full px-4 py-1.5">{s}</span>
            ))}
          </div>

          <div className="border border-[#078b6c] rounded-[10px] px-3.5 py-2.5 mt-4">
            <p className="text-[#17213a] font-semibold text-xs">Vendor checks</p>
            <div className="mt-1.5 space-y-1.5">
              {sel.checks.map(([mark, text], i) => (
                <p key={i} className="text-[#17213a] font-medium text-[11px]">
                  <span className={`font-bold mr-2 ${mark === '!' ? 'text-[#d97706]' : 'text-[#078b6c]'}`}>{mark}</span>
                  {text}
                </p>
              ))}
            </div>
          </div>

          {sel.alternative && (
            <div className="bg-[#eef2ff] rounded-[10px] px-3.5 py-2.5 mt-4">
              <p className="text-[#365fd9] font-semibold text-[10px]">APPROVED ALTERNATIVE</p>
              <p className="text-[#17213a] font-semibold text-[13px] mt-1">{sel.alternative[0]}</p>
              <p className="text-[#365fd9] text-[10px] mt-0.5">{sel.alternative[1]}</p>
            </div>
          )}

          <div className="bg-[#fff5de] rounded-[10px] px-3.5 py-3.5 mt-4">
            <p className="text-[#d97706] font-medium text-[11px]">{sel.note}</p>
          </div>

          <div className="flex items-center gap-3 mt-5">
            <button className="bg-gold-brand hover:bg-gold text-navy-header font-semibold text-xs px-6 h-11 rounded-full cursor-pointer">{sel.primary}</button>
            <button className="border-[1.5px] border-navy-header text-navy-header font-semibold text-xs px-5 h-11 rounded-full cursor-pointer hover:bg-chip">{sel.secondary}</button>
            <button className="text-[#d92d20] font-semibold text-xs px-4 h-11 cursor-pointer ml-auto">Decline</button>
          </div>
        </div>
      </div>
    </div>
  )
}
