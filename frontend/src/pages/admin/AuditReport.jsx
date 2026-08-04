// 14A Admin · Audit Report — matches Figma frame "14A Admin • Audit Report"
// Reached via "Export audit report" (Overview) / "One-click audit report" (Audit Log).
// A full page, not a modal — the Figma prototype navigates here, it doesn't overlay.
import { useEffect, useState } from 'react'
import { api } from '../../lib/api.js'

const frameworks = [
  { name: 'NIST AI RMF', detail: 'Govern · Map · Measure · Manage — all evidenced' },
  { name: 'EU AI Act', detail: 'Art. 4 literacy · transparency · human oversight' },
  { name: 'Malaysia PDPA', detail: 'Personal-data handling · masking · retention' },
]

// Every figure below comes from /api/report, which derives it from the audit log
// the same way the Overview KPIs derive theirs. This page holds no numbers of
// its own: a compliance report that says "generated from the append-only audit
// log" at the bottom has to actually be one, or the first auditor who sends a
// test prompt and re-exports will find the totals never moved.
//
// The values here are only the pre-fetch placeholders, replaced on first load.
const PLACEHOLDER = {
  period: { from: '01 Jul 2026', to: '19 Jul 2026' },
  promptsProtected: 4120, itemsMasked: 612, toolsApproved: 8,
  risksResolved: 3, humanReviews: 11, confirmedLeaks: 0, recoveredEvents: 0,
}

export default function AuditReport() {
  const [summary, setSummary] = useState(PLACEHOLDER)

  useEffect(() => {
    let alive = true
    const load = () => api.get('/report').then(r => alive && setSummary(r)).catch(() => {})
    load()
    // Polled like every other admin screen, so a prompt sent during the demo
    // shows up here without a manual refresh.
    const t = setInterval(load, 5000)
    return () => { alive = false; clearInterval(t) }
  }, [])

  const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  const period = `${summary.period?.from || PLACEHOLDER.period.from} – ${summary.period?.to || PLACEHOLDER.period.to}`

  const kpis = [
    [summary.promptsProtected.toLocaleString(), 'Prompts protected'],
    [summary.itemsMasked.toLocaleString(), 'Sensitive items masked'],
    [summary.toolsApproved, 'Tools reviewed & approved'],
    [summary.risksResolved, 'Risks resolved'],
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
<h1>Example Sdn Bhd</h1><p>Reporting period ${period} · Generated ${today}</p>
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
          <p className="text-[#667085] text-sm mt-1.5">Generated {today} · covers {period} · masked data only, ready for regulators.</p>
        </div>
        <button onClick={download} className="bg-gold-brand hover:bg-gold text-navy-header font-semibold text-sm w-[200px] h-12 rounded-full cursor-pointer">
          Download PDF&nbsp;&nbsp;↓
        </button>
      </div>

      <div className="bg-white border border-[#e0e0e5] rounded-[16px] p-8 mt-6">
        <p className="text-gold-brand font-bold text-xs">AI GOVERNANCE — COMPLIANCE AUDIT REPORT</p>
        <p className="text-[#0a204f] font-bold text-base mt-1.5">Example Sdn Bhd · Reporting period {period}</p>
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
          {summary.recoveredEvents > 0 && (
            <>
              {' '}
              <span className="text-[#d97706] font-medium">
                {summary.recoveredEvents} event{summary.recoveredEvents === 1 ? ' was' : 's were'} masked on-device during a gateway
                outage and recorded on reconnection — included above and marked in the audit log.
              </span>
            </>
          )}
        </p>
      </div>
    </div>
  )
}
