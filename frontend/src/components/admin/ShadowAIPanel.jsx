// Shadow AI (proposal O3): "a Shadow AI panel that surfaces unapproved tools
// currently in use".
//
// It renders /api/shadow-ai, which is the *intersection* of the tool register
// and the audit log — a tool nobody has cleared that somebody has actually
// opened. That is what makes this a detection rather than a list: on a clean
// day it is empty, and a tool leaves it by being approved, not by being
// dismissed.
//
// Privacy-minimised the same way the audit log is: departments and a count of
// people, never a name. An admin needs to know where the pull is coming from;
// naming individuals in an org-wide panel is how a governance tool becomes the
// surveillance the case study is arguing against.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api.js'

const statusStyle = {
  UNAPPROVED: { bg: '#fef3f2', fg: '#b42318', label: 'NOT REVIEWED' },
  SUSPENDED: { bg: '#fff6ed', fg: '#b93815', label: 'SUSPENDED' },
}

export default function ShadowAIPanel() {
  const [tools, setTools] = useState(null)

  useEffect(() => {
    let alive = true
    const load = () => api.get('/shadow-ai').then(r => alive && setTools(r.tools || [])).catch(() => {})
    load()
    const t = setInterval(load, 4000)
    return () => { alive = false; clearInterval(t) }
  }, [])

  if (!tools) return null

  return (
    <div className="bg-white border border-[#d8d0b4] rounded-[16px] p-5 mt-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-navy-header font-semibold text-[15px]">Shadow AI · unapproved tools in use</p>
          <p className="text-[#667085] text-[11px] mt-0.5">
            Detected from the audit log, not from a policy list — a tool leaves this panel by being approved
          </p>
        </div>
        <span
          className="text-[10px] font-semibold px-2.5 py-1 rounded-full shrink-0"
          style={tools.length
            ? { color: '#b42318', background: '#fef3f2' }
            : { color: '#058f6b', background: '#e7f4ee' }}
        >
          {tools.length ? `${tools.length} IN USE` : 'NONE DETECTED'}
        </span>
      </div>

      {/* An empty panel is a real result and says so, rather than disappearing —
          "we looked and found nothing" is the answer an auditor wants. */}
      {tools.length === 0 ? (
        <p className="text-[#667085] text-[13px] mt-4">
          No unapproved tool has appeared in the audit log this session. Every destination reached so far is on the approved register.
        </p>
      ) : (
        <div className="flex flex-col gap-2 mt-3.5">
          {tools.map(t => {
            const s = statusStyle[t.status] || statusStyle.UNAPPROVED
            return (
              <div key={t.name} className="border border-[#eee6cf] rounded-[11px] px-4 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-navy-header font-bold text-[14px]">{t.name}</p>
                    <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full" style={{ color: s.fg, background: s.bg }}>
                      {s.label}
                    </span>
                    {t.awaitingReview && (
                      <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full text-[#365fd9] bg-[#eef2fe]">
                        REQUEST IN QUEUE
                      </span>
                    )}
                  </div>
                  <p className="text-[#667085] text-[11.5px] mt-1">
                    {t.vendor} · {t.dataScope}
                  </p>
                  <p className="text-[#8a7d56] text-[11px] mt-1">
                    {t.events} event{t.events === 1 ? '' : 's'} · {t.employees} employee{t.employees === 1 ? '' : 's'}
                    {t.departments.length ? ` · ${t.departments.join(', ')}` : ''}
                    {t.lastSeen ? ` · last seen ${t.lastSeen}` : ''}
                  </p>
                </div>
                {/* The action is "guide, don't punish": both routes land on Tool
                    Approvals, where the request can be reviewed or the tool
                    cleared — never on anything that punishes the employee. */}
                <Link
                  to="/admin/tool-approvals"
                  className="text-[#365fd9] font-semibold text-[11.5px] shrink-0 hover:underline"
                >
                  {t.awaitingReview ? 'Review request →' : 'Review tool →'}
                </Link>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
