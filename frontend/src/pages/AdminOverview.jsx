// 11 Admin · Governance Overview — matches Figma frame "11 Admin • Governance Overview"
const depts = [
  { name: 'Engineering', v: 420 }, { name: 'Sales', v: 350 },
  { name: 'Finance', v: 210, alert: true }, { name: 'Marketing', v: 180 }, { name: 'HR', v: 90 },
]
const alerts = [
  { level: 'High', color: 'red', title: 'Repeated IC numbers in prompts', sub: 'Finance · user F-102 · 4 events · today', action: 'Assign refresher training →' },
  { level: 'Medium', color: 'amber', title: 'Unapproved tool detected', sub: 'Sales · "SummarizerX" · redirected to approved', action: 'Review tool request →' },
  { level: 'Medium', color: 'amber', title: 'AI-assisted decision flagged', sub: 'HR screening · human review requested', action: 'Open review case →' },
]
const log = [
  { t: '14:02', u: 'E-217', d: 'Eng', tool: 'ChatGPT', s: 'MASKED', text: 'Fix bug for client [MASKED-NAME] in module…' },
  { t: '13:58', u: 'F-102', d: 'Fin', tool: 'Gemini', s: 'ALERT', text: 'Summarise payment of [MASKED-IC] invoice…' },
  { t: '13:51', u: 'S-044', d: 'Sales', tool: 'SummarizerX', s: 'REDIRECTED', text: '→ switched to approved tool (ChatGPT)' },
  { t: '13:47', u: 'E-198', d: 'Eng', tool: 'ChatGPT', s: 'CLEAN', text: 'Explain difference between SQL joins…' },
  { t: '13:40', u: 'H-011', d: 'HR', tool: 'Gemini', s: 'MASKED', text: 'Draft letter to [MASKED-NAME], [MASKED-PHONE]…' },
]
const chip = {
  MASKED: 'bg-emerald-100 text-emerald-800', ALERT: 'bg-red-100 text-red-800',
  REDIRECTED: 'bg-amber-100 text-amber-800', CLEAN: 'bg-indigo-100 text-indigo-800',
}

export default function AdminOverview() {
  return (
    <>
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold text-navy">Overview</h1>
            <p className="text-gray-500 text-sm">Company-wide AI usage · updated live</p>
          </div>
          <button className="border-2 border-dashed border-gold-dark rounded-xl p-1.5">
            <span className="block bg-gold text-navy font-bold text-sm px-5 py-2 rounded-lg">One-Click Audit Report (PDF)</span>
          </button>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-4 gap-5 mt-6">
          <div className="bg-navy rounded-2xl p-5 text-white">
            <p className="text-gold text-[10px] font-bold tracking-wider">PROMPTS PROTECTED TODAY</p>
            <p className="text-4xl font-bold mt-2">312 <span className="text-emerald-300 text-sm font-medium">▲ 8%</span></p>
          </div>
          <Stat label="ITEMS MASKED TODAY" value="58" />
          <div className="bg-card border-2 border-red-600 rounded-2xl p-5">
            <p className="text-red-700 text-[10px] font-bold tracking-wider">ACTIVE RISK ALERTS</p>
            <p className="text-4xl font-bold text-red-700 mt-2">3 <span className="text-sm font-medium">needs review</span></p>
          </div>
          <Stat label="AVG LICENSE LEVEL" value="2.1" extra="▲ from 1.6" />
        </div>

        <div className="grid grid-cols-[1fr_400px] gap-5 mt-5">
          {/* Bar chart */}
          <div className="bg-card border-2 border-[#d8cfae] rounded-2xl p-6">
            <p className="font-bold text-navy text-sm mb-6">AI usage by department (prompts this week)</p>
            <div className="flex items-end gap-8 h-56 border-b-2 border-[#d8cfae] px-4">
              {depts.map(d => (
                <div key={d.name} className="flex flex-col items-center gap-1 flex-1">
                  <p className="text-xs font-bold" style={{ color: d.alert ? '#b8912a' : '#12275a' }}>{d.v}</p>
                  <div className="w-full rounded-t-md" style={{ height: `${d.v / 2}px`, background: d.alert ? '#b8912a' : '#12275a' }} />
                </div>
              ))}
            </div>
            <div className="flex gap-8 px-4 mt-2">
              {depts.map(d => (
                <div key={d.name} className="flex-1 text-center">
                  <p className="text-xs text-gray-500">{d.name}</p>
                  {d.alert && <p className="text-[10px] text-red-700">2 alerts</p>}
                </div>
              ))}
            </div>
          </div>

          {/* Risk alerts */}
          <div className="bg-card border-2 border-[#d8cfae] rounded-2xl p-6">
            <p className="font-bold text-navy text-sm mb-4">Risk alerts</p>
            {alerts.map(a => (
              <div key={a.title} className={`rounded-xl border px-4 py-3 mb-3 ${a.color === 'red' ? 'bg-red-50 border-red-500' : 'bg-amber-50 border-amber-500'}`}>
                <p className={`text-sm font-bold ${a.color === 'red' ? 'text-red-800' : 'text-amber-800'}`}>{a.level}: {a.title}</p>
                <p className="text-xs text-gray-600 mt-0.5">{a.sub}</p>
                <p className="text-xs text-blue-700 mt-1">{a.action}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Audit log */}
        <div className="bg-card border-2 border-[#d8cfae] rounded-2xl p-6 mt-5">
          <div className="flex justify-between mb-3">
            <p className="font-bold text-navy text-sm">Live audit log</p>
            <p className="text-xs text-emerald-700">● live</p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-navy text-gold text-[11px] tracking-wider">
                {['TIME', 'USER', 'DEPT', 'TOOL', 'ACTION', 'MASKED PROMPT (STORED VERSION)'].map(h => (
                  <th key={h} className="text-left px-3 py-2 first:rounded-l-lg last:rounded-r-lg">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {log.map(r => (
                <tr key={r.t} className="border-b border-[#eee5cf] last:border-0">
                  <td className="px-3 py-2.5">{r.t}</td>
                  <td className="px-3">{r.u}</td>
                  <td className="px-3">{r.d}</td>
                  <td className="px-3">{r.tool}</td>
                  <td className="px-3"><span className={`text-[11px] font-bold px-3 py-1 rounded-full ${chip[r.s]}`}>{r.s}</span></td>
                  <td className="px-3 font-mono text-xs text-gray-600">{r.text}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
    </>
  )
}

function Stat({ label, value, extra }) {
  return (
    <div className="bg-card border-2 border-[#d8cfae] rounded-2xl p-5">
      <p className="text-[#8a7f60] text-[10px] font-bold tracking-wider">{label}</p>
      <p className="text-4xl font-bold text-navy mt-2">{value} {extra && <span className="text-emerald-700 text-sm font-medium">{extra}</span>}</p>
    </div>
  )
}
