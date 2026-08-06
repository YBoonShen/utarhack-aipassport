// The downloadable compliance report — the document, separated from the screen.
//
// It lives here rather than inside AuditReport.jsx for one reason: this is the
// artefact that leaves the building. A regulator reads it without the app
// around it, so it has to be checkable on its own, and a template built inside
// a component closure can only be checked by clicking the button. Everything
// below is data in, string out — see reportDocument.test.js, which runs it
// against the same payload the page renders.
//
// There is exactly one template. "Print / Save as PDF" and "Download HTML file"
// are two ways of getting the same document out of the browser, so they cannot
// describe the same period differently.

export const bandColor = { Low: '#058f6b', Moderate: '#d5a71f', Elevated: '#e0771b', High: '#db2629' }

// The report is assembled from strings the audit log wrote — masked records,
// tool names, control references. None of it is trusted markup.
export function esc(value) {
  return String(value ?? '').replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]))
}

/** "01 Jul 2026 – 19 Jul 2026", or a placeholder while the fetch is in flight. */
export function periodLabel(report) {
  return report?.period ? `${report.period.from} – ${report.period.to}` : 'loading'
}

/** The metric rows, in the order the page shows them as cards. */
export function kpiRows(report) {
  const k = report?.kpis
  if (!k) return []
  const n = v => Number(v || 0).toLocaleString()
  return [
    [n(k.promptsProtected), 'Prompts protected'],
    [n(k.itemsMasked), 'Sensitive items masked'],
    ['RM ' + n(k.valueProtected), 'Exposure value protected'],
    [n(k.toolsApproved), 'Tools reviewed & approved'],
    [n(k.risksResolved), 'Risks resolved'],
    [n(k.humanReviews), 'Human reviews completed'],
    [n(k.confirmedLeaks), 'Confirmed data leaks'],
    [n(k.recoveredEvents), 'Events recovered after outage'],
    [n(k.trainingAssigned), 'Training assignments issued'],
  ]
}

export function reportFileName(extension, at = new Date()) {
  return `aipassport-compliance-report-${at.toISOString().slice(0, 10)}.${extension}`
}

/**
 * The whole report as a standalone HTML document.
 *
 * @param {object} report   the /api/report payload
 * @param {object} summary  the /api/report/summary payload, or null
 * @param {string} today    the generation date, already formatted for display
 */
export function reportHTML(report, summary, today) {
  const risk = report.risk
  const period = periodLabel(report)

  const fw = report.frameworks.map(f =>
    `<tr><td>${esc(f.name)}</td><td>${esc(f.detail)}</td><td style="color:${f.state === 'watch' ? '#c48f16' : '#058f6b'};font-weight:bold">${esc(f.status)}</td></tr>`).join('')
  const kpis = kpiRows(report).map(([v, label]) => `<tr><td>${esc(label)}</td><td>${esc(v)}</td></tr>`).join('')
  const factors = risk.factors.map(f =>
    `<tr><td>${esc(f.label)}</td><td>${esc(f.points)}</td><td>${esc(f.detail)}</td></tr>`).join('')
  const ctrl = report.controls.map(c =>
    `<tr><td>${esc(c.type)}</td><td>${esc(c.framework)}</td><td>${esc(c.evidence)}</td></tr>`).join('')
  const ev = report.topEvents.map(e =>
    `<tr><td>${esc(e.time)}</td><td>${esc(e.user)}</td><td>${esc(e.dept)}</td><td>${esc(e.tool)}</td><td>${esc(e.action)}</td><td>${esc(e.control)}</td><td>${esc(e.record)}</td></tr>`).join('')

  // The summary is the one section that can legitimately be missing. It says so
  // rather than leaving a blank panel, which reads as the export having failed.
  const summaryText = summary?.summary || 'Not available at the time this report was generated.'
  const provenance = summary?.source === 'gemini'
    ? 'Written by Gemini from live audit data.'
    : 'Written by the governance analyst from live audit data.'

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>AI Passport - Compliance Report</title>
<style>body{font-family:Arial,Helvetica,sans-serif;margin:40px;color:#0a204f;max-width:900px}
h1{margin:2px 0}h2{color:#0a204f;margin-top:30px;border-bottom:2px solid #d9b32c;padding-bottom:5px}
.kick{color:#d9b32c;font-weight:bold;font-size:12px;letter-spacing:1px}
.risk{display:inline-block;background:${bandColor[risk.band] || '#d5a71f'};color:#fff;font-weight:bold;padding:6px 16px;border-radius:20px;font-size:14px}
.sum{background:#f7f4ea;border-left:4px solid #d9b32c;padding:14px 18px;border-radius:6px;font-size:14px;line-height:1.6}
table{border-collapse:collapse;width:100%;font-size:12.5px;margin-top:10px}td,th{border:1px solid #e0e0e5;padding:7px 10px;text-align:left}
th{background:#0b2457;color:#d9b32c}.foot{margin-top:26px;font-size:11px;color:#667085}
@media print{body{margin:14mm}h2{page-break-after:avoid}tr{page-break-inside:avoid}}</style></head><body>
<p class="kick">AI GOVERNANCE - COMPLIANCE AUDIT REPORT</p>
<h1>${esc(report.org)}</h1>
<p>Reporting period ${esc(period)} &middot; ${esc(report.headcount)} employees &middot; Generated ${esc(today)}</p>
<p style="margin-top:14px">Organisational AI Risk Score: <span class="risk">${esc(risk.score)}/100 - ${esc(risk.band)}</span>
<span style="font-size:12px;color:#667085">&nbsp;(${risk.delta <= 0 ? 'down' : 'up'} ${esc(Math.abs(risk.delta))} on yesterday)</span></p>
<h2>Executive summary</h2><div class="sum">${esc(summaryText)}</div>
<p style="font-size:11px;color:#667085">${provenance}</p>
<h2>Framework coverage</h2><table><tr><th>Framework</th><th>Evidence</th><th>Status</th></tr>${fw}</table>
<h2>Period summary</h2><table><tr><th>Metric</th><th>Value</th></tr>${kpis}</table>
<h2>What is driving the risk score</h2><table><tr><th>Factor</th><th>Points</th><th>Basis</th></tr>${factors}</table>
<h2>Control mapping</h2><table><tr><th>Data category</th><th>Framework control</th><th>Evidence</th></tr>${ctrl}</table>
<h2>Evidence - recent masked records</h2><table><tr><th>Time</th><th>User</th><th>Dept</th><th>Tool</th><th>Action</th><th>Control</th><th>Stored masked record</th></tr>${ev}</table>
<p class="foot">Generated from the append-only audit log. Only masked records are included - no raw personal data leaves the platform.</p>
</body></html>`
}

/**
 * The evidence annexe on its own, for whoever wants it in a spreadsheet.
 * CRLF and a BOM because the reader is Excel: without the BOM it decodes the
 * middots and en dashes the records are full of as mojibake.
 */
export function evidenceCSV(report) {
  const cell = v => `"${String(v ?? '').replace(/"/g, '""')}"`
  const rows = [
    ['Time', 'User', 'Department', 'Tool', 'Action', 'Control', 'Risk', 'Stored masked record'],
    ...report.topEvents.map(e => [e.time, e.user, e.dept, e.tool, e.action, e.control, e.risk, e.record]),
  ]
  return '﻿' + rows.map(r => r.map(cell).join(',')).join('\r\n')
}
