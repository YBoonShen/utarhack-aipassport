// 13 Admin · Risk Alerts — matches Figma frame "13 Admin • Risk Alerts"
const alerts = [
  { level: 'High', color: 'red', title: 'Repeated IC numbers in prompts', sub: 'Finance · user F-102 · 4 events · today', action: 'Assign refresher training →' },
  { level: 'Medium', color: 'amber', title: 'Unapproved tool detected', sub: 'Sales · "SummarizerX" · redirected to approved', action: 'Review tool request →' },
  { level: 'Medium', color: 'amber', title: 'AI-assisted decision flagged', sub: 'HR screening · human review requested', action: 'Open review case →' },
  { level: 'Low', color: 'slate', title: 'License level below department average', sub: 'Marketing · user M-019 · Level 1', action: 'Nudge training →' },
]
const filters = ['All (4)', 'High (1)', 'Medium (2)', 'Low (1)']
const chip = { red: 'bg-red-50 border-red-500 text-red-800', amber: 'bg-amber-50 border-amber-500 text-amber-800', slate: 'bg-slate-100 border-slate-400 text-slate-700' }

export default function RiskAlerts() {
  return (
    <>
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-navy">Risk Alerts</h1>
          <p className="text-gray-500 text-sm">Items that need a human decision, ranked by severity.</p>
        </div>
      </div>

      <div className="flex gap-2 mt-5">
        {filters.map((f, i) => (
          <button key={f} className={`text-xs font-bold px-4 py-2 rounded-full border-2 ${i === 0 ? 'bg-navy text-white border-navy' : 'border-[#d8cfae] text-navy'}`}>
            {f}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3 mt-5">
        {alerts.map(a => (
          <div key={a.title} className={`rounded-xl border px-5 py-4 flex items-center justify-between ${chip[a.color]}`}>
            <div>
              <p className="text-sm font-bold">{a.level}: {a.title}</p>
              <p className="text-xs text-gray-600 mt-0.5">{a.sub}</p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <a href="#" className="text-xs text-blue-700 font-medium">{a.action}</a>
              <button className="bg-gold hover:bg-gold-dark text-navy text-xs font-bold px-4 py-2 rounded-full">Resolve</button>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
