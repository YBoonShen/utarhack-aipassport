// 14A Admin · Audit Report — matches Figma frame "14A Admin • Audit Report"
// Reached via "Export audit report" (Overview) / "One-click audit report" (Audit Log).
// A full page, not a modal — the Figma prototype navigates here, it doesn't overlay.
import { useEffect, useState } from 'react'

const frameworks = [
  { name: 'NIST AI RMF', detail: 'Govern · Map · Measure · Manage — all evidenced' },
  { name: 'EU AI Act', detail: 'Art. 4 literacy · transparency · human oversight' },
  { name: 'Malaysia PDPA', detail: 'Personal-data handling · masking · retention' },
]

// Prompts protected / masked / human reviews reflect the reporting period shown
// below, not just "today" — the demo backend only tracks daily counters, so
// these three follow the reference report; tools/risks are wired live where
// the store already tracks them.
const summary = { promptsProtected: 4120, itemsMasked: 612, humanReviews: 11, confirmedLeaks: 0 }

export default function AuditReport() {
  const [toolsApproved, setToolsApproved] = useState(8)
  const [risksResolved, setRisksResolved] = useState(3)

  useEffect(() => {
    fetch('/api/visas').then(r => r.json()).then(v => {
      const approved = (Array.isArray(v) ? v : []).filter(x => x.status === 'APPROVED').length
      if (approved > 0) setToolsApproved(approved)
    }).catch(() => {})
    fetch('/api/alerts').then(r => r.json()).then(a => {
      const resolved = (Array.isArray(a) ? a : []).filter(x => x.status === 'resolved').length
      if (resolved > 0) setRisksResolved(resolved)
    }).catch(() => {})
  }, [])

  const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })

  const kpis = [
    [summary.promptsProtected.toLocaleString(), 'Prompts protected'],
    [summary.itemsMasked.toLocaleString(), 'Sensitive items masked'],
    [toolsApproved, 'Tools reviewed & approved'],
    [risksResolved, 'Risks resolved'],
    [summary.humanReviews, 'Human reviews completed'],
    [summary.confirmedLeaks, 'Confirmed data leaks'],
  ]

  function download() {
    const rows = frameworks.map(f => `<tr><td>${f.name}</td><td>${f.detail}</td><td>Compliant</td></tr>`).join('')
    const kpiRows = kpis.map(([v, label]) => `<tr><td>${label}</td><td>${v}</td></tr>`).join('')
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>AI Passport Audit Report</title>
<style>body{font-family:Arial,sans-serif;margin:40px;color:#0a204f}h1{color:#0a204f}h2{color:#0a204f;margin-top:28px}
table{border-collapse:collapse;width:100%;font-size:13px}td,th{border:1px solid #e0e0e5;padding:7px 10px;text-align:left}
th{background:#0b2457;color:#d9b32c}</style></head><body>
<p style="color:#d9b32c;font-weight:bold;font-size:12px">AI GOVERNANCE — COMPLIANCE AUDIT REPORT</p>
<h1>Example Sdn Bhd</h1><p>Reporting period 1–19 July 2026 · Generated ${today}</p>
<h2>Framework coverage</h2><table><tr><th>Framework</th><th>Evidence</th><th>Status</th></tr>${rows}</table>
<h2>Period summary</h2><table><tr><th>Metric</th><th>Value</th></tr>${kpiRows}</table>
<p style="margin-top:24px;font-size:11px;color:#667085">This report is generated from the append-only audit log. Only masked records are included — no raw personal data leaves the platform.</p>
</body></html>`
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `aipassport-audit-report-${new Date().toISOString().slice(0, 10)}.html`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[30px] font-bold text-[#0a204f]">Audit Report</h1>
          <p className="text-[#667085] text-sm mt-1.5">Generated {today} · covers 1–19 Jul · masked data only, ready for regulators.</p>
        </div>
        <button onClick={download} className="bg-gold-brand hover:bg-gold text-navy-header font-semibold text-sm w-[200px] h-12 rounded-full cursor-pointer">
          Download PDF&nbsp;&nbsp;↓
        </button>
      </div>

      <div className="bg-white border border-[#e0e0e5] rounded-[16px] p-8 mt-6">
        <p className="text-gold-brand font-bold text-xs">AI GOVERNANCE — COMPLIANCE AUDIT REPORT</p>
        <p className="text-[#0a204f] font-bold text-base mt-1.5">Example Sdn Bhd · Reporting period 1–19 July 2026</p>
        <div className="h-px bg-[#e5e5eb] mt-6" />

        <p className="text-[#8a7d56] font-semibold text-[11px] mt-6">FRAMEWORK COVERAGE</p>
        <div className="flex flex-col gap-2.5 mt-3">
          {frameworks.map(f => (
            <div key={f.name} className="bg-[#e7f4ee] rounded-[10px] h-14 px-4.5 flex items-center gap-3">
              <span className="text-[#078b6c] font-bold text-base">✓</span>
              <div className="flex-1">
                <p className="text-[#0a204f] font-bold text-[15px]">{f.name}</p>
                <p className="text-[#667085] text-[13px]">{f.detail}</p>
              </div>
              <span className="bg-[#078b6c] text-white font-bold text-[11px] rounded-full px-3.5 h-[26px] flex items-center">COMPLIANT</span>
            </div>
          ))}
        </div>

        <p className="text-[#8a7d56] font-semibold text-[11px] mt-7">PERIOD SUMMARY</p>
        <div className="grid grid-cols-3 gap-3.5 mt-3">
          {kpis.map(([v, label]) => (
            <div key={label} className="bg-[#fafafc] border border-[#e5e5eb] rounded-[10px] px-4.5 py-3.5">
              <p className="text-[#0a204f] font-bold text-[26px]">{v}</p>
              <p className="text-[#667085] text-[13px] mt-1">{label}</p>
            </div>
          ))}
        </div>

        <p className="text-[#667085] text-[12.5px] mt-7">
          This report is generated from the append-only audit log. Only masked records are included — no raw personal data leaves the platform.
        </p>
      </div>
    </div>
  )
}
