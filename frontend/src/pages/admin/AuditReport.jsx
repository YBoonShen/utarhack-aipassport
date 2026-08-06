// 14A Admin - AI Compliance Report.
//
// Everything on this page comes from /api/report, and everything in the file
// the admin downloads comes from the same object. That is deliberate: a report
// whose export is assembled from a second set of numbers is a report nobody can
// hand to a regulator, because the two can disagree without anybody noticing.
import { useEffect, useRef, useState } from 'react'
import { api, logFailure } from '../../lib/api.js'
import {
  bandColor, reportHTML, evidenceCSV, reportFileName, periodLabel, kpiRows,
} from '../../lib/reportDocument.js'

const toneColor = { low: '#058f6b', med: '#d5a71f', high: '#db2629' }
// Framework rows are green only when their evidence is actually present — see
// the `state` the backend derives. A page that can only ever say "covered" is
// decoration.
const stateStyle = {
  ok: { bg: '#e7f4ee', pill: '#078b6c', mark: 'OK' },
  watch: { bg: '#fdf6e3', pill: '#c48f16', mark: '!' },
}

export default function AuditReport() {
  const [report, setReport] = useState(null)
  const [summary, setSummary] = useState(null)
  const [regen, setRegen] = useState(false)
  const [menu, setMenu] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    let alive = true
    const load = () => {
      api.get('/report').then(r => alive && setReport(r)).catch(() => {})
      // The summary is the one part that can legitimately be unavailable (no
      // model key, a failed call). It falls back to a marked empty state rather
      // than blocking the figures, which are already on screen.
      api.get('/report/summary').then(s => alive && setSummary(s)).catch(() => alive && setSummary({ summary: '', source: 'offline' }))
    }
    load()
    const t = setInterval(load, 5000)
    return () => { alive = false; clearInterval(t) }
  }, [])

  // Close the download menu on an outside click or Escape — it sits over the
  // report, so leaving it open swallows the next thing the admin tries to read.
  useEffect(() => {
    if (!menu) return
    const away = e => { if (!menuRef.current?.contains(e.target)) setMenu(false) }
    const esc = e => e.key === 'Escape' && setMenu(false)
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc) }
  }, [menu])

  async function regenerate() {
    setRegen(true)
    try {
      // `refresh=1` is what makes this button mean something: without it the
      // server answers from the cache that serves the five-second poll.
      setSummary(await api.get('/report/summary?refresh=1'))
    } catch (err) {
      logFailure('regenerate executive summary', err) // keep the current summary
    } finally {
      setRegen(false)
    }
  }

  const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  const risk = report?.risk
  // `period` is { from, to } on the wire. Rendering the object straight into JSX
  // threw "Objects are not valid as a React child" and took this page's header
  // down with it; the exported HTML printed "[object Object]" for the same
  // reason. Formatted once, in the document module, so both readers agree.
  const period = periodLabel(report)
  const kpiCards = kpiRows(report)

  // ---- the export ----------------------------------------------------------
  //
  // Three ways out of the browser, one document — the template lives in
  // lib/reportDocument.js so it can be checked without clicking a button.

  function saveFile(content, type, extension) {
    const blob = new Blob([content], { type })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = reportFileName(extension)
    document.body.appendChild(a)
    a.click()
    a.remove()
    // Revoking in the same tick cancels the download in Firefox — the click is
    // queued, not completed, when this line runs.
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }

  function downloadHTML() {
    saveFile(reportHTML(report, summary, today), 'text/html', 'html')
  }

  function downloadCSV() {
    saveFile(evidenceCSV(report), 'text/csv;charset=utf-8', 'csv')
  }

  // Printing goes through a hidden iframe rather than window.open: a popup
  // blocker silently eats the second one, and "nothing happened" is the worst
  // possible answer for a download button.
  function printReport() {
    const frame = document.createElement('iframe')
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
    frame.srcdoc = reportHTML(report, summary, today)
    frame.onload = () => {
      frame.contentWindow.focus()
      frame.contentWindow.print()
      // Removed once the print dialog has had the document; too early and the
      // dialog prints a blank page.
      setTimeout(() => frame.remove(), 60_000)
    }
    document.body.appendChild(frame)
  }

  function choose(fn) {
    setMenu(false)
    if (!report) return
    try {
      fn()
    } catch (err) {
      logFailure('compliance report export', err)
    }
  }

  const exports = [
    ['Print / Save as PDF', 'Opens the print dialog', printReport],
    ['Download HTML file', 'The full report, one file', downloadHTML],
    ['Download evidence CSV', 'Recent masked records only', downloadCSV],
  ]

  return (
    <div>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[30px] font-bold text-[#0a204f]">AI Compliance Report</h1>
          <p className="text-[#667085] text-sm mt-1.5">Live from the audit log. Masked data only. Generated {today}.</p>
        </div>

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenu(m => !m)}
            disabled={!report}
            aria-haspopup="menu"
            aria-expanded={menu}
            className="bg-gold-brand hover:bg-gold text-navy-header font-semibold text-sm w-[200px] h-12 rounded-full cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2"
          >
            Download report
            {/* A drawn chevron rather than the letters "v" and "^", which is what
                stood here — at this weight they read as text in the label rather
                than as the control's state. It rotates instead of swapping, so
                opening the menu is one movement. */}
            <svg
              viewBox="0 0 12 12" aria-hidden="true"
              className={`w-3 h-3 shrink-0 transition-transform duration-200 ${menu ? 'rotate-180' : ''}`}
            >
              <path d="M2 4.5 L6 8.5 L10 4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {menu && (
            <div role="menu" className="absolute right-0 mt-2 w-[268px] bg-white border border-[#e0e0e5] rounded-[12px] shadow-lg overflow-hidden z-20">
              {exports.map(([label, note, fn]) => (
                <button
                  key={label}
                  role="menuitem"
                  onClick={() => choose(fn)}
                  className="w-full text-left px-4 py-3 hover:bg-[#faf7ec] cursor-pointer border-b border-[#f0eee6] last:border-b-0"
                >
                  <p className="text-[#0a204f] font-semibold text-[13px]">{label}</p>
                  <p className="text-[#667085] text-[11px] mt-0.5">{note}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white border border-[#e0e0e5] rounded-[16px] p-8 mt-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-gold-brand font-bold text-xs">AI GOVERNANCE - COMPLIANCE AUDIT REPORT</p>
            <p className="text-[#0a204f] font-bold text-base mt-1.5">{report?.org || 'Example Sdn Bhd'} - Reporting period {period}</p>
          </div>
          {risk && (
            <div className="text-right shrink-0">
              <p className="text-[#8a7d56] font-semibold text-[10px]">AI RISK SCORE</p>
              <span className="inline-block text-white font-bold text-sm rounded-full px-4 py-1.5 mt-1" style={{ background: bandColor[risk.band] }}>
                {risk.score}/100 - {risk.band}
              </span>
              <p className="text-[11px] mt-1" style={{ color: risk.delta <= 0 ? '#058f6b' : '#db2629' }}>
                {risk.delta <= 0 ? '▼' : '▲'} {Math.abs(risk.delta)} vs yesterday
              </p>
            </div>
          )}
        </div>
        <div className="h-px bg-[#e5e5eb] mt-6" />

        <div className="flex items-center justify-between mt-6">
          <p className="text-[#8a7d56] font-semibold text-[11px]">EXECUTIVE SUMMARY</p>
          <button onClick={regenerate} disabled={regen} className="text-[#365fd9] font-semibold text-[11px] cursor-pointer disabled:opacity-50">
            {regen ? 'Generating...' : 'Regenerate with AI'}
          </button>
        </div>
        <div className="bg-[#f7f4ea] border-l-4 border-gold-brand rounded-r-[10px] px-5 py-4 mt-2">
          {summary?.summary
            ? <p className="text-[#344054] text-[13.5px] leading-relaxed">{summary.summary}</p>
            : <p className="text-[#98a2b3] text-[13px]">Writing executive summary from live audit data...</p>}
          {summary?.summary && (
            <p className={`mt-2.5 text-[9px] font-semibold tracking-[0.5px] ${summary.source === 'gemini' ? 'text-[#365fd9]' : 'text-[#8a7d56]'}`}>
              {summary.source === 'gemini' ? 'WRITTEN BY GEMINI - FROM LIVE AUDIT DATA' : 'GOVERNANCE ANALYST - FROM LIVE AUDIT DATA'}
            </p>
          )}
        </div>

        <p className="text-[#8a7d56] font-semibold text-[11px] mt-7">FRAMEWORK COVERAGE</p>
        <div className="flex flex-col gap-2.5 mt-3">
          {(report?.frameworks || []).map(f => {
            const s = stateStyle[f.state] || stateStyle.ok
            return (
              <div key={f.name} className="rounded-[10px] min-h-14 px-4.5 py-2.5 flex items-center gap-3" style={{ background: s.bg }}>
                <span className="font-bold text-base w-5 text-center shrink-0" style={{ color: s.pill }}>{s.mark}</span>
                <div className="flex-1">
                  <p className="text-[#0a204f] font-bold text-[15px]">{f.name}</p>
                  <p className="text-[#667085] text-[13px]">{f.detail}</p>
                </div>
                <span className="text-white font-bold text-[11px] rounded-full px-3.5 h-[26px] flex items-center shrink-0" style={{ background: s.pill }}>
                  {f.status.toUpperCase()}
                </span>
              </div>
            )
          })}
        </div>

        <p className="text-[#8a7d56] font-semibold text-[11px] mt-7">PERIOD SUMMARY</p>
        <div className="grid grid-cols-3 gap-3.5 mt-3">
          {kpiCards.map(([v, label]) => (
            <div key={label} className="bg-[#fafafc] border border-[#e5e5eb] rounded-[10px] px-4.5 py-3.5">
              <p className="text-[#0a204f] font-bold text-[24px]">{v}</p>
              <p className="text-[#667085] text-[13px] mt-1">{label}</p>
            </div>
          ))}
        </div>

        {risk && (
          <>
            <p className="text-[#8a7d56] font-semibold text-[11px] mt-7">WHAT IS DRIVING THE RISK SCORE</p>
            <div className="flex flex-col gap-1.5 mt-3">
              {risk.factors.map(f => (
                <div key={f.key} className="flex items-center gap-3">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: toneColor[f.tone] }} />
                  <p className="text-[#344054] text-[12px] font-medium w-[170px] shrink-0">{f.label}</p>
                  <div className="flex-1 h-1.5 bg-[#f0ece0] rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(100, f.points * 4)}%`, background: toneColor[f.tone] }} />
                  </div>
                  <p className="text-[#667085] text-[11px] w-[250px] shrink-0 text-right">{f.points} pts · {f.detail}</p>
                </div>
              ))}
            </div>
          </>
        )}

        <p className="text-[#8a7d56] font-semibold text-[11px] mt-7">CONTROL MAPPING - WHAT WE PROTECT AND WHY</p>
        <div className="border border-[#e5e5eb] rounded-[10px] overflow-hidden mt-3">
          <div className="grid grid-cols-[1.4fr_1.2fr_1.4fr] bg-navy-header text-gold-brand font-semibold text-[10px] tracking-[0.5px] px-4 py-2.5">
            <p>DATA CATEGORY</p><p>FRAMEWORK CONTROL</p><p>EVIDENCE</p>
          </div>
          {(report?.controls || []).map((c, i) => (
            <div key={c.type} className={`grid grid-cols-[1.4fr_1.2fr_1.4fr] px-4 py-3 text-[11.5px] ${i % 2 ? 'bg-white' : 'bg-[#fcfaf3]'}`}>
              <p className="text-[#0a204f] font-medium pr-2">{c.type}</p>
              <p className="text-[#475467] pr-2">{c.framework}</p>
              <p className="text-[#667085]">{c.evidence}</p>
            </div>
          ))}
        </div>

        {/* The annexe the download promises. On screen too, so the admin can see
            what they are about to hand over before they hand it over. */}
        <p className="text-[#8a7d56] font-semibold text-[11px] mt-7">EVIDENCE - RECENT MASKED RECORDS</p>
        <div className="border border-[#e5e5eb] rounded-[10px] overflow-hidden mt-3">
          <div className="grid grid-cols-[64px_74px_64px_100px_92px_1fr] bg-navy-header text-gold-brand font-semibold text-[10px] tracking-[0.5px] px-4 py-2.5">
            <p>TIME</p><p>USER</p><p>DEPT</p><p>TOOL</p><p>ACTION</p><p>STORED MASKED RECORD</p>
          </div>
          {(report?.topEvents || []).map((e, i) => (
            <div key={e.id} className={`grid grid-cols-[64px_74px_64px_100px_92px_1fr] px-4 py-2.5 text-[11.5px] items-center ${i % 2 ? 'bg-white' : 'bg-[#fcfaf3]'}`}>
              <p className="text-[#667085]">{e.time}</p>
              <p className="text-[#0a204f] font-medium">{e.user}</p>
              <p className="text-[#475467]">{e.dept}</p>
              <p className="text-[#475467] pr-2">{e.tool}</p>
              <p className="font-semibold" style={{ color: e.risk === 'HIGH' ? '#db2629' : e.risk === 'MEDIUM' ? '#c48f16' : '#058f6b' }}>{e.action}</p>
              <p className="text-[#667085] truncate">{e.record}</p>
            </div>
          ))}
        </div>

        <p className="text-[#667085] text-[12.5px] mt-7">
          This report is generated from the append-only audit log. Only masked records are included - no raw personal data leaves the platform.
        </p>
      </div>
    </div>
  )
}
