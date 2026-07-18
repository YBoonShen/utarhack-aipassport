// 12 Admin · Departments — matches Figma frame "12 Admin • Departments"
import { useToast, DEMO_NOTE } from '../../components/Toast.jsx'

const statusStyles = {
  Clear: 'bg-[#e9f8f2] text-[#078b6c]',
  '1 open': 'bg-[#fff5de] text-[#d97706]',
  '2 open': 'bg-[#fff0f0] text-[#d92d20]',
}

const rows = [
  { name: 'Engineering', employees: 84, prompts: 420, fill: 100, fillColor: '#365fd9', masked: 12, status: 'Clear', avg: '2.6', owner: 'A. Rahman' },
  { name: 'Sales', employees: 71, prompts: 350, fill: 83, fillColor: '#365fd9', masked: 15, status: '1 open', avg: '2.2', owner: 'M. Wong' },
  { name: 'Finance', employees: 46, prompts: 210, fill: 50, fillColor: '#d9b32c', masked: 20, status: '2 open', avg: '1.9', owner: 'S. Kumar' },
  { name: 'Marketing', employees: 39, prompts: 180, fill: 43, fillColor: '#365fd9', masked: 7, status: 'Clear', avg: '2.1', owner: 'N. Lee' },
  { name: 'Human Resources', employees: 28, prompts: 90, fill: 21, fillColor: '#365fd9', masked: 4, status: '1 open', avg: '1.8', owner: 'P. Lim' },
  { name: 'Operations', employees: 35, prompts: 126, fill: 30, fillColor: '#365fd9', masked: 6, status: 'Clear', avg: '2.0', owner: 'R. Tan' },
]

const cols = 'grid grid-cols-[210px_100px_180px_130px_130px_140px_1fr_28px] items-center'

export default function Departments() {
  const toast = useToast()
  return (
    <div>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[28px] font-bold text-[#17213a]">Departments</h1>
          <p className="text-[#667085] text-sm mt-1.5">Compare AI adoption, license readiness and risk across the organisation.</p>
        </div>
        <button onClick={() => toast(DEMO_NOTE)} className="bg-gold-brand hover:bg-gold text-navy-header font-semibold text-[13px] w-[200px] h-11 rounded-full cursor-pointer">
          Export department view
        </button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-4 gap-4 mt-6">
        <div className="bg-navy-header rounded-[14px] px-4.5 py-3.5">
          <p className="text-gold-brand font-semibold text-[11px]">ACTIVE DEPARTMENTS</p>
          <div className="flex items-baseline gap-4 mt-1.5">
            <p className="text-white font-bold text-[30px]">6</p>
            <p className="text-[#e9f8f2] font-medium text-xs">All reporting</p>
          </div>
        </div>
        <div className="bg-white border border-[#d8d0b4] rounded-[14px] px-4.5 py-3.5">
          <p className="text-[#667085] font-semibold text-[11px]">PROMPTS PROTECTED</p>
          <div className="flex items-baseline gap-4 mt-1.5">
            <p className="text-[#17213a] font-bold text-[30px]">1,376</p>
            <p className="text-[#078b6c] font-medium text-xs">+12% this week</p>
          </div>
        </div>
        <div className="bg-white border border-[#d8d0b4] rounded-[14px] px-4.5 py-3.5">
          <p className="text-[#667085] font-semibold text-[11px]">ITEMS MASKED</p>
          <div className="flex items-baseline gap-4 mt-1.5">
            <p className="text-[#17213a] font-bold text-[30px]">64</p>
            <p className="text-[#d97706] font-medium text-xs">4.7% of prompts</p>
          </div>
        </div>
        <div className="bg-white border border-[#d8d0b4] rounded-[14px] px-4.5 py-3.5">
          <p className="text-[#667085] font-semibold text-[11px]">OPEN ALERTS</p>
          <div className="flex items-baseline gap-4 mt-1.5">
            <p className="text-[#17213a] font-bold text-[30px]">4</p>
            <p className="text-[#d92d20] font-medium text-xs">2 need review</p>
          </div>
        </div>
      </div>

      {/* Department performance table */}
      <div className="bg-white border border-[#d8d0b4] rounded-[14px] p-6 pt-5 mt-6">
        <p className="text-[#17213a] font-bold text-lg">Department performance</p>
        <p className="text-[#667085] text-xs mt-1">Updated live · select a department to review employees and controls</p>

        <div className="flex justify-between mt-4">
          <div className="bg-[#fffcef] border border-[#d8d0b4] rounded-[10px] h-11 w-[330px] flex items-center px-3 gap-2">
            <span className="text-[#667085] text-lg">⌕</span>
            <input placeholder="Search departments" className="flex-1 bg-transparent outline-none text-[13px] text-[#17213a] placeholder-[#667085]" />
          </div>
          <div className="flex gap-3">
            <button onClick={() => toast(DEMO_NOTE)} className="border-[1.5px] border-navy-header text-navy-header font-semibold text-[13px] w-[120px] h-11 rounded-full cursor-pointer hover:bg-chip">Filters · 2</button>
            <button onClick={() => toast(DEMO_NOTE)} className="bg-navy-header text-white font-semibold text-[13px] w-[130px] h-11 rounded-full cursor-pointer hover:bg-navy">Compare</button>
          </div>
        </div>

        <div className={`${cols} bg-navy-header rounded-[8px] text-gold-brand font-semibold text-[11px] px-2 h-[50px] mt-4`}>
          <p className="pl-2">Department</p><p>Employees</p><p>Protected prompts</p><p>Items masked</p><p>Risk alerts</p><p>Avg. license</p><p>Owner</p><p />
        </div>
        {rows.map((r, i) => (
          <div key={r.name} className={`${cols} px-2 h-[72px] border-b border-[#d8d0b4] ${i % 2 === 1 ? 'bg-[#fffcef]' : 'bg-white'}`}>
            <p className="text-[#17213a] font-semibold text-sm pl-2">{r.name}</p>
            <p className="text-[#17213a] font-medium text-sm">{r.employees}</p>
            <div className="flex items-center gap-3 pr-4">
              <p className="text-[#17213a] font-semibold text-sm w-8">{r.prompts}</p>
              <div className="h-2.5 rounded-full bg-[#f1eddf] flex-1 max-w-[82px]">
                <div className="h-2.5 rounded-full" style={{ width: `${r.fill}%`, backgroundColor: r.fillColor }} />
              </div>
            </div>
            <p className="text-[#17213a] font-medium text-sm">{r.masked}</p>
            <p><span className={`inline-block text-xs font-semibold rounded-full px-4 py-1.5 ${statusStyles[r.status]}`}>{r.status}</span></p>
            <p className="text-[#17213a] font-semibold text-sm">{r.avg}</p>
            <p className="text-[#17213a] font-medium text-[13px]">{r.owner}</p>
            <p className="text-[#365fd9] text-[22px] text-center">›</p>
          </div>
        ))}

        <div className="flex items-center justify-between mt-4">
          <p className="text-[#667085] text-xs">Showing 6 departments</p>
          <div className="flex items-center gap-3">
            <p className="text-[#667085] font-medium text-xs">1 of 1</p>
            <button onClick={() => toast(DEMO_NOTE)} className="w-8 h-8 rounded-full bg-[#fffcef] border border-[#d8d0b4] text-[#667085] text-lg cursor-pointer">‹</button>
            <button onClick={() => toast(DEMO_NOTE)} className="w-8 h-8 rounded-full bg-[#fffcef] border border-[#d8d0b4] text-[#667085] text-lg cursor-pointer">›</button>
          </div>
        </div>
      </div>
    </div>
  )
}
