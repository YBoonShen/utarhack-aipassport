// 14 Admin · Audit Log — matches Figma frame "14 Admin • Audit Log"
const log = [
  { t: '14:02', u: 'E-217', d: 'Eng', tool: 'ChatGPT', s: 'MASKED', text: 'Fix bug for client [MASKED-NAME] in module…' },
  { t: '13:58', u: 'F-102', d: 'Fin', tool: 'Gemini', s: 'ALERT', text: 'Summarise payment of [MASKED-IC] invoice…' },
  { t: '13:51', u: 'S-044', d: 'Sales', tool: 'SummarizerX', s: 'REDIRECTED', text: '→ switched to approved tool (ChatGPT)' },
  { t: '13:47', u: 'E-198', d: 'Eng', tool: 'ChatGPT', s: 'CLEAN', text: 'Explain difference between SQL joins…' },
  { t: '13:40', u: 'H-011', d: 'HR', tool: 'Gemini', s: 'MASKED', text: 'Draft letter to [MASKED-NAME], [MASKED-PHONE]…' },
  { t: '13:22', u: 'M-019', d: 'Mktg', tool: 'ChatGPT', s: 'CLEAN', text: 'Suggest 5 taglines for Q3 campaign…' },
  { t: '13:15', u: 'F-102', d: 'Fin', tool: 'Gemini', s: 'MASKED', text: 'Reconcile invoice for [MASKED-NAME]…' },
  { t: '12:58', u: 'E-084', d: 'Eng', tool: 'ChatGPT', s: 'CLEAN', text: 'Write unit test for masking util…' },
]
const chip = {
  MASKED: 'bg-emerald-100 text-emerald-800', ALERT: 'bg-red-100 text-red-800',
  REDIRECTED: 'bg-amber-100 text-amber-800', CLEAN: 'bg-indigo-100 text-indigo-800',
}

export default function AuditLog() {
  return (
    <>
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-navy">Audit Log</h1>
          <p className="text-gray-500 text-sm">Full history of prompts checked by the Smart Gateway.</p>
        </div>
        <button className="border-2 border-dashed border-gold-dark rounded-xl p-1.5">
          <span className="block bg-gold text-navy font-bold text-sm px-5 py-2 rounded-lg">Export CSV</span>
        </button>
      </div>

      <div className="flex gap-3 mt-5">
        <input placeholder="Search by user, tool, department…" className="bg-card border-2 border-[#d8cfae] rounded-lg px-4 py-2 text-sm outline-none flex-1" />
        <select className="bg-card border-2 border-[#d8cfae] rounded-lg px-4 py-2 text-sm outline-none">
          <option>All actions</option>
          <option>Masked</option>
          <option>Alert</option>
          <option>Redirected</option>
          <option>Clean</option>
        </select>
      </div>

      <div className="bg-card border-2 border-[#d8cfae] rounded-2xl p-6 mt-5">
        <div className="flex justify-between mb-3">
          <p className="font-bold text-navy text-sm">All events</p>
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
            {log.map((r, i) => (
              <tr key={i} className="border-b border-[#eee5cf] last:border-0">
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
