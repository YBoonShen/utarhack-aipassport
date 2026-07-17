// 12 Admin · Departments — matches Figma frame "12 Admin • Departments"
const depts = [
  { name: 'Engineering', employees: 84, avgLevel: 2.4, prompts: 1420, masked: 210, alerts: 0 },
  { name: 'Sales', employees: 61, avgLevel: 1.9, prompts: 1180, masked: 340, alerts: 1 },
  { name: 'Finance', employees: 22, avgLevel: 1.6, prompts: 640, masked: 480, alerts: 2 },
  { name: 'Marketing', employees: 33, avgLevel: 2.1, prompts: 520, masked: 90, alerts: 0 },
  { name: 'HR', employees: 18, avgLevel: 1.8, prompts: 310, masked: 70, alerts: 1 },
]

export default function Departments() {
  return (
    <>
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-navy">Departments</h1>
          <p className="text-gray-500 text-sm">AI usage and safety posture broken down by department.</p>
        </div>
        <input
          placeholder="Search departments…"
          className="bg-card border-2 border-[#d8cfae] rounded-lg px-4 py-2 text-sm outline-none"
        />
      </div>

      <div className="bg-card border-2 border-[#d8cfae] rounded-2xl overflow-hidden mt-6">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-navy text-gold text-[11px] tracking-wider">
              {['DEPARTMENT', 'EMPLOYEES', 'AVG LICENSE LEVEL', 'PROMPTS THIS WEEK', 'ITEMS MASKED', 'ACTIVE ALERTS', ''].map(h => (
                <th key={h} className="text-left px-4 py-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {depts.map(d => (
              <tr key={d.name} className="border-b border-[#eee5cf] last:border-0">
                <td className="px-4 py-3 font-bold text-navy">{d.name}</td>
                <td className="px-4">{d.employees}</td>
                <td className="px-4">{d.avgLevel}</td>
                <td className="px-4">{d.prompts.toLocaleString()}</td>
                <td className="px-4">{d.masked}</td>
                <td className="px-4">
                  {d.alerts > 0 ? (
                    <span className="bg-red-100 text-red-800 text-xs font-bold px-2.5 py-1 rounded-full">{d.alerts} alert{d.alerts > 1 ? 's' : ''}</span>
                  ) : (
                    <span className="text-emerald-700 text-xs">— none</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right"><a href="#" className="text-navy text-xs font-medium">View →</a></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
