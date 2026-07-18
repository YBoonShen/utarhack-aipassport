// 16 Admin · Employees — matches Figma frame "16 Admin • Employees"
import { useToast, DEMO_NOTE } from '../../components/Toast.jsx'

const statusChip = {
  'On track': 'bg-[#e9f8f2] text-[#078b6c]',
  Refresher: 'bg-[#fff5de] text-[#d97706]',
  'Support due': 'bg-[#fff0f0] text-[#d92d20]',
  Review: 'bg-[#fff5de] text-[#d97706]',
  Ambassador: 'bg-[#eef2ff] text-[#365fd9]',
}

const employees = [
  { avatar: 'JY', id: 'E-217', dept: 'Eng', level: 'L2', training: 92, protectedCount: 47, alerts: 0, status: 'On track' },
  { avatar: 'MW', id: 'S-044', dept: 'Sales', level: 'L2', training: 80, protectedCount: 38, alerts: 1, status: 'Refresher' },
  { avatar: 'SK', id: 'F-102', dept: 'Finance', level: 'L1', training: 60, protectedCount: 26, alerts: 2, status: 'Support due' },
  { avatar: 'NL', id: 'M-083', dept: 'Mkt', level: 'L2', training: 87, protectedCount: 32, alerts: 0, status: 'On track' },
  { avatar: 'PL', id: 'H-011', dept: 'HR', level: 'L1', training: 72, protectedCount: 18, alerts: 1, status: 'Review' },
  { avatar: 'RT', id: 'O-031', dept: 'Ops', level: 'L2', training: 84, protectedCount: 29, alerts: 0, status: 'On track' },
  { avatar: 'AR', id: 'E-198', dept: 'Eng', level: 'L3', training: 100, protectedCount: 52, alerts: 0, status: 'Ambassador' },
]

const kpis = [
  { label: 'ACTIVE EMPLOYEES', value: '303', note: 'Across 6 departments', dark: true, noteColor: 'text-[#e9f8f2]' },
  { label: 'AVERAGE LICENSE', value: '2.1', note: '↑ from 1.6', noteColor: 'text-[#078b6c]' },
  { label: 'TRAINING COMPLETE', value: '78%', note: '236 employees', noteColor: 'text-[#365fd9]' },
  { label: 'NEEDS ATTENTION', value: '3', note: 'Learning support due', noteColor: 'text-[#d92d20]' },
]

const distribution = [
  { label: 'Level 1 · Learner', count: 72, pct: 24, color: '#98a2b3' },
  { label: 'Level 2 · Navigator', count: 188, pct: 62, color: '#365fd9' },
  { label: 'Level 3 · Ambassador', count: 43, pct: 14, color: '#d9b32c' },
]

const cols = 'grid grid-cols-[150px_82px_70px_150px_86px_64px_1fr] items-center gap-1'

export default function Employees() {
  const toast = useToast()
  return (
    <div>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[28px] font-bold text-[#17213a]">Employees</h1>
          <p className="text-[#667085] text-sm mt-1.5">Support AI literacy and safe use with role-appropriate training and controls.</p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => toast(DEMO_NOTE)} className="border-[1.5px] border-navy-header text-navy-header font-semibold text-[13px] px-6 h-11 rounded-full cursor-pointer hover:bg-chip">Sync directory</button>
          <button onClick={() => toast('Training assignment sent to the selected cohort')} className="bg-gold-brand hover:bg-gold text-navy-header font-semibold text-[13px] px-6 h-11 rounded-full cursor-pointer">Assign training</button>
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
          <input placeholder="Search employee ID or department" className="flex-1 bg-transparent outline-none text-xs text-[#17213a] placeholder-[#667085]" />
        </div>
        <button className="bg-navy-header text-white font-semibold text-[13px] h-11 px-5 rounded-full cursor-pointer">All departments</button>
        <button onClick={() => toast(DEMO_NOTE)} className="border-[1.5px] border-navy-header text-navy-header font-semibold text-[13px] h-11 px-5 rounded-full cursor-pointer hover:bg-chip">License level</button>
        <div className="flex-1" />
        <button onClick={() => toast(DEMO_NOTE)} className="border-[1.5px] border-navy-header text-navy-header font-semibold text-[13px] h-11 px-6 rounded-full cursor-pointer hover:bg-chip">More filters</button>
      </div>

      <div className="grid grid-cols-[1fr_360px] gap-5 mt-5 items-start">
        {/* Employee directory */}
        <div className="bg-white border border-[#d8d0b4] rounded-[14px] p-4">
          <p className="text-[#17213a] font-bold text-lg">Employee directory</p>
          <p className="text-[#667085] text-xs mt-0.5">303 active records · privacy-minimised view</p>

          <div className={`${cols} bg-navy-header rounded-[8px] text-gold-brand font-semibold text-[11px] px-3 h-11 mt-3.5`}>
            <p>Employee</p><p>Dept</p><p>License</p><p>Training</p><p>Protected</p><p>Alerts</p><p>Status</p>
          </div>
          {employees.map((e, i) => (
            <div key={e.id} className={`${cols} px-3 h-16 border-b border-[#eee6d4] ${i % 2 === 1 ? 'bg-[#fffcef]' : 'bg-white'}`}>
              <div className="flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-full bg-[#edf2ff] text-navy font-bold text-[10px] flex items-center justify-center shrink-0">{e.avatar}</span>
                <p className="text-[#17213a] font-semibold text-[13px]">{e.id}</p>
              </div>
              <p className="text-[#475467] text-xs">{e.dept}</p>
              <p><span className="inline-block bg-[#edf2ff] text-navy font-semibold text-[11px] rounded-full px-3 py-1">{e.level}</span></p>
              <div className="flex items-center gap-2 pr-3">
                <div className="h-2 rounded-full bg-[#f1eddf] flex-1">
                  <div className="h-2 rounded-full bg-[#365fd9]" style={{ width: `${e.training}%` }} />
                </div>
                <p className="text-[#475467] text-[11px] w-8">{e.training}%</p>
              </div>
              <p className="text-[#17213a] font-medium text-xs">{e.protectedCount}</p>
              <p className={`font-medium text-xs ${e.alerts > 0 ? 'text-[#d92d20]' : 'text-[#475467]'}`}>{e.alerts}</p>
              <p><span className={`inline-block font-semibold text-[11px] rounded-full px-3.5 py-1.5 ${statusChip[e.status]}`}>{e.status}</span></p>
            </div>
          ))}

          <div className="flex items-center justify-between mt-4">
            <p className="text-[#667085] text-xs">Showing 7 of 303 employees</p>
            <div className="flex items-center gap-3">
              <p className="text-[#667085] font-medium text-xs">1 of 44</p>
              <button onClick={() => toast(DEMO_NOTE)} className="w-8 h-8 rounded-full bg-[#fffcef] border border-[#d8d0b4] text-[#667085] text-lg cursor-pointer">‹</button>
              <button onClick={() => toast(DEMO_NOTE)} className="w-8 h-8 rounded-full bg-[#fffcef] border border-[#d8d0b4] text-[#667085] text-lg cursor-pointer">›</button>
            </div>
          </div>
        </div>

        {/* Employee insights */}
        <div className="flex flex-col gap-4">
          <div className="bg-white border border-[#d8d0b4] rounded-[14px] p-5">
            <p className="text-[#17213a] font-bold text-base">License distribution</p>
            <p className="text-[#667085] text-xs mt-0.5">Organisation-wide readiness</p>
            <div className="flex flex-col gap-4 mt-4">
              {distribution.map(d => (
                <div key={d.label}>
                  <div className="flex justify-between">
                    <p className="text-[#17213a] font-medium text-xs">{d.label}</p>
                    <p className="text-[#17213a] font-semibold text-xs">{d.count}</p>
                  </div>
                  <div className="h-2.5 rounded-full bg-[#f1eddf] mt-1.5">
                    <div className="h-2.5 rounded-full" style={{ width: `${d.pct}%`, backgroundColor: d.color }} />
                  </div>
                </div>
              ))}
            </div>
            <div className="h-px bg-[#d8d0b4] my-4" />
            <p className="text-gold font-semibold text-[10px]">NEXT TRAINING COHORT</p>
            <p className="text-[#17213a] font-semibold text-sm mt-1.5">Spotting Personal Data in Prompts</p>
            <p className="text-[#667085] text-xs mt-1">24 employees · due 23 Jul</p>
            <button onClick={() => toast('Cohort assigned — 24 employees will be notified')} className="bg-gold-brand hover:bg-gold text-navy-header font-semibold text-xs w-full h-10 rounded-full mt-3.5 cursor-pointer">Assign cohort</button>
          </div>

          <div className="bg-[#eef2ff] rounded-[14px] p-5">
            <p className="text-[#365fd9] font-semibold text-[10px]">PEOPLE-FIRST GOVERNANCE</p>
            <p className="text-[#17213a] text-xs mt-2 leading-relaxed">
              Use alerts to guide learning and safer workflows—not to rank employee performance.
            </p>
            <p className="text-[#667085] text-[11px] mt-2">Directory shows employee IDs and role data only.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
