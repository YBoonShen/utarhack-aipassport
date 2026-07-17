// One-click compliance report — generated from live audit data, mapped to
// NIST AI RMF, EU AI Act and Malaysia's PDPA (proposal objective O3).
import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'

const frameworkRows = [
  ['NIST AI RMF', 'GOVERN 1.1 · Policies in place', 'Gateway policy active with role-based access'],
  ['NIST AI RMF', 'MEASURE 2.7 · AI monitoring', 'Live audit log of every prompt decision'],
  ['EU AI Act', 'Article 4 · AI literacy', 'Gamified license training with pass evidence'],
  ['EU AI Act', 'Article 50 · Transparency', 'Public disclosure and human-review portal'],
  ['PDPA 2010', 'P7 · Security principle', 'Sensitive data masked before leaving the browser'],
  ['AIGE (MY)', '4.2 · Accountable use', 'Approval workflow records purpose, owner and scope'],
]

export default function ComplianceReport({ onClose }) {
  const [stats, setStats] = useState(null)
  const [audit, setAudit] = useState({ events: [] })
  const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })

  useEffect(() => {
    api.get('/stats').then(setStats).catch(() => {})
    api.get('/audit').then(setAudit).catch(() => {})
  }, [])

  function download() {
    const rows = audit.events.slice(0, 10).map(e =>
      `<tr><td>${e.time}</td><td>${e.id}</td><td>${e.user}</td><td>${e.tool}</td><td>${e.action}</td><td>${e.control}</td><td>${e.record}</td></tr>`).join('')
    const mapping = frameworkRows.map(([f, c, ev]) => `<tr><td>${f}</td><td>${c}</td><td>${ev}</td></tr>`).join('')
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>AI Passport Compliance Report</title>
<style>body{font-family:Arial,sans-serif;margin:40px;color:#141a29}h1{color:#0b2457}h2{color:#0b2457;margin-top:28px}
table{border-collapse:collapse;width:100%;font-size:12px}td,th{border:1px solid #d8d0b4;padding:6px 8px;text-align:left}
th{background:#0b2457;color:#d9b32c}.kpi{display:inline-block;margin-right:32px}.kpi b{font-size:22px;color:#0b2457}</style></head><body>
<h1>AI Passport — Compliance Report</h1><p>Generated ${today} · Gateway policy active · masked prompts only</p>
<h2>Today's protection summary</h2>
<div><span class="kpi"><b>${stats?.promptsToday ?? '—'}</b><br>prompts protected</span>
<span class="kpi"><b>${stats?.maskedToday ?? '—'}</b><br>items masked</span>
<span class="kpi"><b>${stats?.openAlerts ?? '—'}</b><br>open risk alerts</span>
<span class="kpi"><b>${stats?.avgLicense ?? '—'}</b><br>avg license level</span></div>
<h2>Framework mapping</h2><table><tr><th>Framework</th><th>Control</th><th>Evidence in AI Passport</th></tr>${mapping}</table>
<h2>Recent audit events (masked records only)</h2>
<table><tr><th>Time</th><th>Event</th><th>User</th><th>Tool</th><th>Action</th><th>Control</th><th>Masked record</th></tr>${rows}</table>
<p style="margin-top:24px;font-size:11px;color:#667085">Raw personal data is never stored. Audit chain is append-only and retained for 90 days.</p>
</body></html>`
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `aipassport-compliance-report-${new Date().toISOString().slice(0, 10)}.html`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="fixed inset-0 bg-navy-dark/50 flex items-center justify-center p-6 z-50" onClick={onClose}>
      <div className="bg-card border border-navy rounded-[20px] w-full max-w-[720px] max-h-[85vh] overflow-y-auto p-7 pt-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-gold font-semibold text-[13px]">ONE-CLICK COMPLIANCE REPORT</p>
            <p className="text-navy font-bold text-[26px] mt-1">Audit-ready evidence</p>
            <p className="text-slate2 text-sm mt-1">Generated {today} · from the live audit log · masked records only</p>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-full border border-sand text-navy text-2xl leading-none cursor-pointer hover:bg-chip shrink-0" aria-label="Close">×</button>
        </div>

        <div className="grid grid-cols-4 gap-3 mt-5">
          {[
            [stats?.promptsToday ?? '—', 'prompts protected'],
            [stats?.maskedToday ?? '—', 'items masked'],
            [stats?.openAlerts ?? '—', 'open risk alerts'],
            [stats?.avgLicense ?? '—', 'avg license level'],
          ].map(([v, label]) => (
            <div key={label} className="bg-white border border-sand rounded-[12px] px-3 py-2.5">
              <p className="text-navy font-bold text-2xl">{v}</p>
              <p className="text-slate2 text-[11px] mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        <p className="text-slate2 font-semibold text-[11px] mt-5">FRAMEWORK MAPPING</p>
        <div className="border border-sand rounded-[12px] overflow-hidden mt-2">
          {frameworkRows.map(([framework, control, evidence], i) => (
            <div key={control} className={`grid grid-cols-[110px_220px_1fr] gap-3 px-3.5 py-2.5 text-xs ${i % 2 ? 'bg-[#fffcef]' : 'bg-white'}`}>
              <p className="text-navy font-semibold">{framework}</p>
              <p className="text-ink">{control}</p>
              <p className="text-slate2">{evidence}</p>
            </div>
          ))}
        </div>

        <p className="text-slate2 font-semibold text-[11px] mt-5">LATEST AUDIT EVENTS</p>
        <div className="border border-sand rounded-[12px] overflow-hidden mt-2">
          {audit.events.slice(0, 5).map((e, i) => (
            <div key={e.id} className={`grid grid-cols-[52px_70px_80px_90px_1fr] gap-2 px-3.5 py-2 text-[11px] ${i % 2 ? 'bg-[#fffcef]' : 'bg-white'}`}>
              <p className="text-slate2">{e.time}</p>
              <p className="text-slate2">{e.id}</p>
              <p className="text-navy font-medium">{e.action}</p>
              <p className="text-[#365fd9]">{e.control}</p>
              <p className="text-slate2 truncate">{e.record}</p>
            </div>
          ))}
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={download} className="bg-gold hover:bg-gold-dark text-navy font-semibold text-sm px-8 h-12 rounded-full cursor-pointer">
            Download report ↓
          </button>
          <button onClick={onClose} className="border border-navy text-navy font-semibold text-sm px-8 h-12 rounded-full cursor-pointer hover:bg-chip">
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
