// 13 Admin · Risk Alerts — matches Figma frame "13 Admin • Risk Alerts" + Risk Alert Workspace component
import { useState } from 'react'

const severityChip = {
  HIGH: 'bg-[#fef0f0] text-[#d92d20]',
  MEDIUM: 'bg-[#fff5de] text-[#d97706]',
  MONITORING: 'bg-[#eef2ff] text-[#365fd9]',
}

const alerts = [
  {
    id: 'RA-2048', severity: 'HIGH', title: 'Repeated identifiers in prompts',
    meta: 'Finance · User F-102 · 4 events today', due: 'Due in 2h 18m', dueColor: 'text-[#d92d20]',
    detailMeta: 'Finance · User F-102 · detected today at 13:58',
    what: 'Four prompts contained the same identifier pattern. The gateway masked every instance before transmission.',
    evidence: 'Payment reminder for [MASKED-ID] invoice…', evidenceNote: 'Layer 1 pattern match · confidence 99%',
    timeline: [['13:58', 'Alert created'], ['14:01', 'Employee notified'], ['14:06', 'Manager review pending']],
    recommend: 'Assign the 5-minute Data Privacy refresher.', primary: 'Assign training',
    card: 'bg-[#fef0f0] border-2 border-[#d92d20]', titleColor: 'text-[#d92d20]',
  },
  {
    id: 'RA-2049', severity: 'MEDIUM', title: 'Unapproved tool detected',
    meta: 'Sales · SummarizerX · redirected to approved tool', due: 'Due tomorrow', dueColor: 'text-[#d97706]',
    detailMeta: 'Sales · User S-044 · detected today at 13:51',
    what: 'An employee opened an unapproved AI tool. The gateway redirected them to the approved alternative with one click.',
    evidence: 'Switched to approved tool · ChatGPT', evidenceNote: 'Redirect accepted · no data sent to unapproved tool',
    timeline: [['13:51', 'Alert created'], ['13:51', 'Redirect offered'], ['13:52', 'Approved tool opened']],
    recommend: 'Review the pending SummarizerX visa request.', primary: 'Review tool request',
    card: 'bg-[#fefbf0] border border-[#d1c79e]', titleColor: 'text-[#17213a]',
  },
  {
    id: 'RA-2050', severity: 'MEDIUM', title: 'AI-assisted decision flagged',
    meta: 'HR screening · human review requested', due: 'Due tomorrow', dueColor: 'text-[#d97706]',
    detailMeta: 'HR · Case REF-2026-041 · flagged today at 11:20',
    what: 'An affected applicant used the public transparency page to request a human review of an AI-assisted screening decision.',
    evidence: 'Screening summary for [MASKED-NAME]…', evidenceNote: 'Disclosure record complete · masked only',
    timeline: [['11:20', 'Review requested'], ['11:24', 'Case assigned'], ['—', 'Human decision pending']],
    recommend: 'Route the case to an independent human reviewer.', primary: 'Open review case',
    card: 'bg-[#fefbf0] border border-[#d1c79e]', titleColor: 'text-[#17213a]',
  },
  {
    id: 'RA-2051', severity: 'MONITORING', title: 'Masking rate above baseline',
    meta: 'Operations · 2.1× weekly average', due: 'Observe 24h', dueColor: 'text-[#365fd9]',
    detailMeta: 'Operations · department-wide · trend since 15 Jul',
    what: 'The masking rate in Operations is 2.1× the weekly average. No single user is responsible; the pattern is spread across the team.',
    evidence: 'Aggregated masking events · no raw text stored', evidenceNote: 'Trend monitor · auto-resolves if rate normalises',
    timeline: [['15 Jul', 'Trend detected'], ['16 Jul', 'Threshold exceeded'], ['—', 'Observation ends in 24h']],
    recommend: 'Keep observing. Assign group refresher if the trend continues.', primary: 'Acknowledge',
    card: 'bg-[#edf2ff]/50 border-2 border-[#cadafd]/50', titleColor: 'text-[#17213a]',
  },
]

const kpis = [
  { label: 'OPEN ALERTS', value: '4', note: '3 active · 1 monitoring', dark: true, noteColor: 'text-[#fff0f0]' },
  { label: 'HIGH SEVERITY', value: '1', note: 'Review within 4 hours', noteColor: 'text-[#d92d20]' },
  { label: 'MEDIAN RESPONSE', value: '38 min', note: '↓ 12 min this month', noteColor: 'text-[#078b6c]' },
  { label: 'RESOLVED SAFELY', value: '96%', note: 'No raw data retained', noteColor: 'text-[#078b6c]' },
]

const filters = ['All · 4', 'High · 1', 'Medium · 2', 'Monitoring · 1']

export default function RiskAlerts() {
  const [selectedId, setSelectedId] = useState('RA-2048')
  const [filter, setFilter] = useState('All · 4')
  const sel = alerts.find(a => a.id === selectedId)

  return (
    <div>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[28px] font-bold text-[#17213a]">Risk Alerts</h1>
          <p className="text-[#667085] text-sm mt-1.5">Review high-risk AI activity with context, evidence and accountable next steps.</p>
        </div>
        <div className="flex gap-3.5">
          <button className="border-[1.5px] border-navy-header text-navy-header font-semibold text-[13px] w-[136px] h-11 rounded-full cursor-pointer hover:bg-chip">Risk policy</button>
          <button className="bg-gold-brand hover:bg-gold text-navy-header font-semibold text-[13px] w-40 h-11 rounded-full cursor-pointer">Create report</button>
        </div>
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
          <input placeholder="Search alert, user or department" className="flex-1 bg-transparent outline-none text-xs text-[#17213a] placeholder-[#667085]" />
        </div>
        {filters.map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`h-11 px-5 rounded-full font-semibold text-[13px] cursor-pointer ${filter === f ? 'bg-navy-header text-white' : 'border-[1.5px] border-navy-header text-navy-header hover:bg-chip'}`}
          >
            {f}
          </button>
        ))}
        <div className="flex-1" />
        <button className="border-[1.5px] border-navy-header text-navy-header font-semibold text-[13px] h-11 px-8 rounded-full cursor-pointer hover:bg-chip">More filters</button>
      </div>

      {/* Workspace: queue + detail */}
      <div className="grid grid-cols-[1fr_412px] gap-5 mt-5 items-start">
        <div className="bg-white border border-[#d8d0b4] rounded-[14px] p-4">
          <div className="flex justify-between items-start px-1">
            <div>
              <p className="text-[#17213a] font-bold text-lg">Priority queue</p>
              <p className="text-[#667085] text-xs mt-0.5">Sorted by severity and due time</p>
            </div>
            <span className="bg-[#fff0f0] text-[#d92d20] font-semibold text-[11px] rounded-full px-5 py-1.5">4 open</span>
          </div>
          <div className="flex flex-col gap-3.5 mt-4">
            {alerts.map(a => (
              <button
                key={a.id}
                onClick={() => setSelectedId(a.id)}
                className={`text-left rounded-[12px] p-3.5 cursor-pointer ${a.card} ${selectedId === a.id ? 'ring-2 ring-navy-header/30' : ''}`}
              >
                <div className="flex justify-between items-center">
                  <span className={`font-semibold text-[11px] rounded-full px-4 py-1.5 ${severityChip[a.severity]}`}>{a.severity}</span>
                  <p className={`font-medium text-[11px] ${a.dueColor}`}>{a.due}</p>
                </div>
                <div className="flex justify-between items-center mt-2">
                  <div>
                    <p className={`font-semibold text-sm ${a.titleColor}`}>{a.title}</p>
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
        <div className="bg-white border border-[#d8d0b4] rounded-[14px] p-5">
          <div className="flex justify-between items-center">
            <p className="text-[#667085] font-semibold text-[11px]">ALERT {sel.id}</p>
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
            <button className="bg-gold-brand hover:bg-gold text-navy-header font-semibold text-[13px] flex-1 h-11 rounded-full cursor-pointer">{sel.primary}</button>
            <button className="border-[1.5px] border-navy-header text-navy-header font-semibold text-[13px] flex-1 h-11 rounded-full cursor-pointer hover:bg-chip">Resolve alert</button>
          </div>
        </div>
      </div>
    </div>
  )
}
