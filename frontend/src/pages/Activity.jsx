// Employee · My AI Activity — the history behind the Home "My AI Activity" card.
//
// One source, /api/activity/mine, which is the same append-only audit log the
// admin console reads, filtered on the server to the signed-in employee. There
// is no second feed and nothing generated for display: if a row is here, the
// gateway, the training flow or the visa workflow wrote it.
//
// Deliberately not the admin Audit Log: no other employees, no department
// filters, no risk queue — just this employee's own record, in plain words.
import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import { actionText, actionChip } from '../lib/activity.js'
import InfoPopover, { InfoList, InfoNote } from '../components/InfoPopover.jsx'
import BackLink from '../components/BackLink.jsx'

const POLL_MS = 4000

export default function Activity() {
  const [events, setEvents] = useState([])
  const [counters, setCounters] = useState({ promptsProtected: 0, itemsMasked: 0, streakDays: 0 })
  // An empty list before the first answer is "still loading", not "you have no
  // history" — the two are different facts and never share a sentence.
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let alive = true
    const load = () => api.get('/activity/mine').then(a => {
      if (!alive) return
      setEvents(a.events || [])
      setCounters(a.counters || {})
      setLoaded(true)
    }).catch(() => {})
    load()
    // Same cadence as the Home page, so protecting a prompt in the extension
    // shows up here while the employee is still looking at the page.
    const t = setInterval(load, POLL_MS)
    return () => { alive = false; clearInterval(t) }
  }, [])

  const tiles = [
    ['Prompts protected', counters.promptsProtected ?? 0],
    ['Items masked', counters.itemsMasked ?? 0],
    ['Safe streak', `${counters.streakDays ?? 0} days`],
  ]

  return (
    <div className="max-w-[1440px] mx-auto px-4 lg:px-10 py-6 lg:py-8">
      <BackLink to="/home">Back to Home</BackLink>
      <div className="flex items-center gap-2 mt-3">
        <h1 className="text-[26px] lg:text-[30px] font-bold text-navy-header">My AI Activity</h1>
        <InfoPopover label="About the Smart Gateway" title="About the Smart Gateway" tone="light">
          <p className="text-[#667085] text-[13px] mt-2 leading-relaxed">
            The Smart Gateway is the check that runs on your prompt before it reaches an AI tool. It looks for sensitive
            content and replaces it with masked tokens, so the tool receives the task without the personal details.
          </p>
          <InfoList
            heading="What you will see here"
            items={[
              ['Masked', 'it found something sensitive and replaced it. Only the masked version was stored.'],
              ['Clean', 'it checked your prompt and found nothing sensitive.'],
              ['Flagged', 'you chose to send the original at a checkpoint. This is recorded for your administrator.'],
            ]}
          />
          <InfoNote title="Where it runs">
            In the browser extension, inside the AI tool you are already using. You do not have to open anything
            separate or paste your prompt somewhere first.
          </InfoNote>
        </InfoPopover>
      </div>
      <p className="text-[#667085] text-sm mt-2 max-w-[900px]">
        Your own record of what the AI Passport has seen: prompts the Smart Gateway checked or masked, training you
        finished, tools you asked for, and sign-ins. Only your activity appears here, and only the masked version of
        any prompt is ever stored.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
        {tiles.map(([label, value]) => (
          <div key={label} className="bg-white border border-[#e0e0e5] rounded-[16px] px-5 py-4">
            <p className="text-[#667085] font-semibold text-[11px] uppercase tracking-wide">{label}</p>
            <p className="text-navy-header font-bold text-[26px] mt-1.5">{value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white border border-[#e0e0e5] rounded-[16px] p-5 sm:p-6 mt-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-navy-header font-bold text-lg">Activity history</p>
          {events.length > 0 && (
            <p className="text-[#667085] text-xs">{events.length} event{events.length === 1 ? '' : 's'} · newest first</p>
          )}
        </div>

        {events.length === 0 ? (
          <p className="text-[#667085] text-[13.5px] mt-4">
            {loaded
              ? 'Nothing recorded yet. Protected prompts, completed training and tool requests appear here as they happen.'
              : 'Loading your activity…'}
          </p>
        ) : (
          <div className="flex flex-col gap-2 mt-4">
            {events.map(e => (
              <div key={e.id} className="border border-[#eceaf0] rounded-[12px] px-4 py-3.5 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`font-semibold text-[10px] rounded-full px-2.5 py-1 ${actionChip(e)}`}>{e.action}</span>
                    <p className="text-navy-header font-semibold text-[15px]">{actionText(e)}</p>
                  </div>
                  {/* The masked record itself — the same text the audit log
                      holds, which is the only version that was ever stored. */}
                  {e.record && <p className="text-[#667085] text-[13.5px] mt-1.5 break-words">{e.record}</p>}
                  <p className="text-[#98a2b3] text-[11.5px] mt-1.5">
                    {e.tool}
                    {e.control && <> · {e.control}</>}
                    {/* A recovered event was masked on this employee's device
                        during a gateway outage and only reached the log later. */}
                    {e.offline && <span className="text-[#d97706]"> · recovered from an offline queue at {e.recordedAt}</span>}
                  </p>
                </div>
                <p className="text-[#667085] text-xs shrink-0 sm:text-right">{e.time}</p>
              </div>
            ))}
          </div>
        )}

        <p className="text-[#667085] text-[12px] mt-5">
          Raw personal data is never stored — prompts are recorded in their masked form only.
        </p>
      </div>
    </div>
  )
}
