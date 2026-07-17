// 14 Admin · Audit Log — matches Figma frame "14 Admin • Audit Log"
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

const events = [
  ['14:02', 'EV-8217', 'E-217', 'Eng', 'ChatGPT', 'MASKED', 'NIST PR.DS', 'Fix bug for client [MASKED-NAME] in module…'],
  ['13:58', 'EV-8216', 'F-102', 'Fin', 'Gemini', 'ALERT', 'PDPA P7', 'Summarise payment for [MASKED-ID] invoice…'],
  ['13:51', 'EV-8215', 'S-044', 'Sales', 'SummarizerX', 'REDIRECTED', 'AIGE 4.2', 'Switched to approved tool · ChatGPT'],
  ['13:47', 'EV-8214', 'E-198', 'Eng', 'ChatGPT', 'CLEAN', 'NIST GV.4', 'Explain the difference between SQL joins…'],
  ['13:40', 'EV-8213', 'H-011', 'HR', 'Gemini', 'MASKED', 'EU AI Act 4', 'Draft letter to [MASKED-NAME], [MASKED-PHONE]…'],
  ['13:32', 'EV-8212', 'M-083', 'Mkt', 'ChatGPT', 'CLEAN', 'AIGE 3.1', 'Create campaign options for product launch…'],
  ['13:18', 'EV-8211', 'O-031', 'Ops', 'Gemini', 'MASKED', 'PDPA P7', 'Compare delivery notes for [MASKED-ACCOUNT]…'],
]

const cols = 'grid grid-cols-[56px_78px_64px_56px_106px_112px_104px_1fr_28px] items-center gap-1'

export default function AuditLog() {
  return (
    <div>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[28px] font-bold text-[#17213a]">Audit Log</h1>
          <p className="text-[#667085] text-sm mt-1.5">Trace every protected prompt, policy decision and approval action.</p>
        </div>
        <button className="bg-gold-brand hover:bg-gold text-navy-header font-semibold text-[13px] px-8 h-11 rounded-full cursor-pointer">
          One-click audit report
        </button>
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
            <p className="text-[#667085] text-xs mt-0.5">1,248 events · refreshed just now</p>
          </div>
          <div className="flex gap-2.5">
            <div className="bg-[#fffcef] border border-[#d8d0b4] rounded-[9px] h-10 w-[280px] flex items-center px-2.5 gap-2">
              <span className="text-[#667085] text-[17px]">⌕</span>
              <input placeholder="Search event ID, user or tool" className="flex-1 bg-transparent outline-none text-xs text-[#17213a] placeholder-[#667085]" />
            </div>
            <button className="bg-navy-header text-white font-semibold text-[13px] h-10 px-6 rounded-full cursor-pointer">Today</button>
            <button className="border-[1.5px] border-navy-header text-navy-header font-semibold text-[13px] h-10 px-5 rounded-full cursor-pointer hover:bg-chip">All actions</button>
            <button className="border-[1.5px] border-navy-header text-navy-header font-semibold text-[13px] h-10 px-5 rounded-full cursor-pointer hover:bg-chip">More filters</button>
          </div>
        </div>

        <div className={`${cols} bg-navy-header rounded-[8px] text-gold-brand font-semibold text-[11px] px-3 h-11 mt-4`}>
          <p>Time</p><p>Event</p><p>User</p><p>Dept</p><p>Tool</p><p>Action</p><p>Control</p><p>Masked record</p><p />
        </div>
        {events.map((e, i) => (
          <div key={e[1]} className={`${cols} px-3 h-14 border-b border-[#eee6d4] text-xs ${i % 2 === 1 ? 'bg-[#fffcef]' : 'bg-white'}`}>
            <p className="text-[#475467]">{e[0]}</p>
            <p className="text-[#475467] font-medium">{e[1]}</p>
            <p className="text-[#475467]">{e[2]}</p>
            <p className="text-[#475467]">{e[3]}</p>
            <p className="text-[#475467]">{e[4]}</p>
            <p><span className={`inline-block font-semibold text-[10px] rounded-full px-2.5 py-1 ${statusChip[e[5]]}`}>{e[5]}</span></p>
            <p className="text-[#365fd9] font-medium">{e[6]}</p>
            <p className="text-[#475467] truncate pr-2">{e[7]}</p>
            <p className="text-[#667085] text-center">⋯</p>
          </div>
        ))}

        <div className="flex items-center justify-between mt-4">
          <p className="text-[#667085] text-xs">Showing 7 of 1,248 events&nbsp;&nbsp;·&nbsp;&nbsp;Raw personal data is never stored</p>
          <div className="flex items-center gap-3">
            <p className="text-[#667085] font-medium text-xs">1 of 179</p>
            <button className="w-8 h-8 rounded-full bg-[#fffcef] border border-[#d8d0b4] text-[#667085] text-lg cursor-pointer">‹</button>
            <button className="w-8 h-8 rounded-full bg-[#fffcef] border border-[#d8d0b4] text-[#667085] text-lg cursor-pointer">›</button>
          </div>
        </div>
      </div>
    </div>
  )
}
