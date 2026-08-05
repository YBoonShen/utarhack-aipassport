// 15 Admin · Tool Approvals — matches Figma frame "15 Admin • Tool Approvals"
// and its "Selection=Archive" workspace variant.
// Live data: the request queue comes from the backend; approving or declining
// updates the employee's My Visas page and sends them a notification.
// The vendor security card suspends a tool org-wide from here — confirm, then
// the backend flips its status, writes one audit event and notifies employees.
// Archive is demo-local: it hides a decided request from the queue this session.
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api.js'
import { useToast, DEMO_NOTE } from '../../components/Toast.jsx'

const statusChip = {
  'SECURITY REVIEW': 'bg-[#fff5de] text-[#d97706]',
  COMPLIANCE: 'bg-[#eef2ff] text-[#365fd9]',
  APPROVED: 'bg-[#e9f8f2] text-[#078b6c]',
  REDIRECTED: 'bg-[#f1eddf] text-[#667085]',
  DECLINED: 'bg-[#fff0f0] text-[#d92d20]',
}

const cardStyles = {
  'SECURITY REVIEW': 'border-2 border-[rgba(10,32,79,0.7)] bg-[#fefbf0]',
  COMPLIANCE: 'border border-[#365fd9] bg-white',
  APPROVED: 'border border-[#078b6c] bg-white',
  REDIRECTED: 'border border-[rgba(10,32,79,0.5)] bg-white',
  DECLINED: 'border border-[#d92d20] bg-white',
}

// Presentation extras per request status (vendor checks etc. are review-team data
// that would live in Firestore later)
const checksByStatus = {
  'SECURITY REVIEW': [['✓', 'Data processing terms available'], ['✓', 'Training opt-out documented'], ['!', 'Regional hosting needs confirmation']],
  COMPLIANCE: [['✓', 'Security review passed'], ['✓', 'Data processing terms available'], ['!', 'Retention period awaiting vendor reply']],
  APPROVED: [['✓', 'Security review passed'], ['✓', 'Compliance review passed'], ['✓', 'Decision recorded']],
  REDIRECTED: [['✓', 'Approved alternative covers the need'], ['✓', 'One-click switch offered'], ['✓', 'Request closed as redirected']],
  DECLINED: [['✓', 'Security review completed'], ['!', 'Vendor risk exceeded policy'], ['✓', 'Approved alternative suggested']],
}

const noteByStatus = {
  'SECURITY REVIEW': 'Pilot approval can be limited to Sales for 30 days.',
  COMPLIANCE: 'Compliance check completes after the vendor confirms retention.',
  APPROVED: 'Approved. Next review in 90 days.',
  REDIRECTED: 'No new vendor risk added. Request closed as redirected.',
  DECLINED: 'Declined. The requester was pointed to an approved alternative.',
}

// ---- explainable AI risk score ----
// The score is never a bare verdict: it is a weighted average of six factors,
// each scored 0–10 where higher means more risk. Weights sum to 1 and are shown
// in the breakdown popover so an admin can see exactly what drove the number.
const RISK_FACTORS = [
  { key: 'dataSensitivity', label: 'Data sensitivity', weight: 0.3 },
  { key: 'vendorTransparency', label: 'Vendor transparency', weight: 0.15 },
  { key: 'externalRetention', label: 'External data retention', weight: 0.25 },
  { key: 'modelType', label: 'Model type', weight: 0.1 },
  { key: 'userPopulation', label: 'User population', weight: 0.1 },
  { key: 'humanOversight', label: 'Human oversight', weight: 0.1 },
]

// Factor scores per tool — review-team data that would live in Firestore later,
// like the vendor checks above. A tool that has just been requested and not yet
// profiled falls back to the unknown-vendor baseline.
const riskByTool = {
  SummarizerX: { dataSensitivity: 8, vendorTransparency: 5, externalRetention: 7, modelType: 4, userPopulation: 6, humanOversight: 3 },
  MeetingMind: { dataSensitivity: 7, vendorTransparency: 6, externalRetention: 6, modelType: 5, userPopulation: 5, humanOversight: 4 },
  'GitHub Copilot': { dataSensitivity: 9, vendorTransparency: 4, externalRetention: 6, modelType: 6, userPopulation: 4, humanOversight: 2 },
  TranslateAI: { dataSensitivity: 3, vendorTransparency: 5, externalRetention: 4, modelType: 4, userPopulation: 5, humanOversight: 3 },
}
const DEFAULT_RISK = { dataSensitivity: 6, vendorTransparency: 7, externalRetention: 6, modelType: 5, userPopulation: 5, humanOversight: 5 }

const riskScoreOf = scores =>
  Math.round(RISK_FACTORS.reduce((total, f) => total + f.weight * (scores[f.key] ?? 0), 0) * 10) / 10

// Bands and per-factor bars share one scale: ≥7 high, ≥4 medium, below that low.
const riskBand = score =>
  score >= 7 ? { label: 'HIGH', text: 'text-[#d92d20]', chip: 'bg-[#fff0f0] text-[#d92d20]', bar: 'bg-[#d92d20]' }
    : score >= 4 ? { label: 'MEDIUM', text: 'text-[#d97706]', chip: 'bg-[#fff5de] text-[#d97706]', bar: 'bg-[#d97706]' }
      : { label: 'LOW', text: 'text-[#078b6c]', chip: 'bg-[#e9f8f2] text-[#078b6c]', bar: 'bg-[#078b6c]' }

const kpiBase = [
  { label: 'MEDIAN TURNAROUND', value: '2.4 days', note: 'Target: ≤ 3 days', noteColor: 'text-[#078b6c]' },
  { label: 'APPROVED TOOLS', value: '8', note: 'Across 6 categories', noteColor: 'text-[#365fd9]' },
]

// Where each request status sits on the Submitted → Security → Compliance →
// Decision track (0-indexed). Drives the "Standard review" stage tracker.
const stageOfStatus = {
  'SECURITY REVIEW': 1,
  COMPLIANCE: 2,
  APPROVED: 3,
  REDIRECTED: 3,
  DECLINED: 3,
}
const stageLabels = ['Submitted', 'Security', 'Compliance', 'Decision']

// Shown until GET /tools answers (and if the backend is offline), so the vendor
// security card keeps its Figma content instead of blinking out.
const FALLBACK_FLAGGED = { name: 'Fable 5', vendor: 'Claude', status: 'ACTIVE', flag: 'Security team flagged a breach' }

/**
 * The flagged thing the vendor security card acts on.
 *
 * Fable 5 used to be registered as a *tool* whose vendor was "Claude", which
 * made the only available response "suspend the whole vendor". It is a model on
 * an approved tool, so the card now finds it either way: a flagged tool if there
 * is one, otherwise a flagged model, carrying the tool it belongs to so the
 * action can be scoped to the model alone.
 */
function findFlagged(tools) {
  const tool = tools.find(t => t.flag)
  if (tool) return { kind: 'tool', name: tool.name, vendor: tool.vendor, status: tool.status, flag: tool.flag, tool, suspendedOn: tool.suspendedOn }

  for (const t of tools) {
    const model = (t.models || []).find(m => m.flag)
    if (model) {
      return {
        kind: 'model',
        name: model.label,
        vendor: t.name,
        status: model.status,
        flag: model.flag,
        tool: t,
        model,
        suspendedOn: model.suspendedOn,
      }
    }
  }
  return null
}

// The score line plus the info icon that opens the factor breakdown beside it.
// Closes on click-outside and Escape; remounted per request so switching
// requests never leaves another tool's breakdown open.
function RiskScore({ tool }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDown = e => { if (!ref.current?.contains(e.target)) setOpen(false) }
    const onKey = e => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const scores = riskByTool[tool] || DEFAULT_RISK
  const score = riskScoreOf(scores)
  const band = riskBand(score)

  return (
    <div ref={ref} className="relative w-fit flex items-center gap-1.5 mt-3.5">
      <p className="text-[#17213a] font-semibold text-xs">
        AI Risk = <span className={band.text}>{score.toFixed(1)}</span>
      </p>
      <button
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-label="How this AI risk score is calculated"
        className={`w-[17px] h-[17px] rounded-full border text-[10px] font-bold leading-none flex items-center justify-center cursor-pointer ${
          open ? 'bg-navy-header border-navy-header text-white' : 'border-[#98a2b3] text-[#667085] hover:border-navy-header hover:text-navy-header'
        }`}
      >
        i
      </button>

      {open && (
        <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2.5 z-30 w-[262px] bg-white border border-[#d8d0b4] rounded-[10px] shadow-[0px_8px_20px_rgba(0,0,0,0.14)] p-3.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[#17213a] font-bold text-[11px]">AI Risk = {score.toFixed(1)}</p>
            <span className={`font-semibold text-[9px] rounded-full px-2 py-0.5 ${band.chip}`}>{band.label}</span>
          </div>
          <p className="text-[#667085] text-[9px] mt-0.5">Weighted average of six factors · higher = more risk</p>
          <div className="mt-2.5 space-y-2">
            {RISK_FACTORS.map(f => (
              <div key={f.key}>
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-[#17213a] text-[10px]">{f.label}</p>
                  <p className="text-[#17213a] font-semibold text-[10px] shrink-0">
                    {scores[f.key]}/10
                    <span className="text-[#667085] font-medium"> · {Math.round(f.weight * 100)}%</span>
                  </p>
                </div>
                <div className="h-1 rounded-full bg-[#f1eddf] mt-1 overflow-hidden">
                  <div className={`h-full rounded-full ${riskBand(scores[f.key]).bar}`} style={{ width: `${scores[f.key] * 10}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function ToolApprovals() {
  const [requests, setRequests] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [archived, setArchived] = useState(() => new Set())
  const [busy, setBusy] = useState(false)
  const [tools, setTools] = useState([])
  const [confirming, setConfirming] = useState(false) // org-wide suspend confirmation
  const [suspending, setSuspending] = useState(false)
  const [suspendError, setSuspendError] = useState('')
  const [actionResult, setActionResult] = useState(null) // { tool, eventId } after a successful suspension
  const toast = useToast()

  useEffect(() => {
    let alive = true
    const load = () => {
      api.get('/visas').then(r => {
        if (!alive) return
        setRequests(r)
        setSelectedId(id => id || r.find(x => !archived.has(x.id))?.id)
      }).catch(() => {})
      api.get('/tools').then(t => alive && setTools(t)).catch(() => {})
    }
    load()
    const t = setInterval(load, 4000)
    return () => { alive = false; clearInterval(t) }
  }, [archived])

  // The vendor-flagged tool *or model* the security card acts on.
  const flagged = findFlagged(tools) || FALLBACK_FLAGGED
  // Withdrawn covers both endings this card can produce: SUSPENDED (pending a
  // review that may lift it) and BANNED (the organisation has decided nothing
  // may be sent there, so even a harmless prompt is refused). Either way the
  // action is done and the button is spent — but the card has to say which,
  // because they are not the same instruction to the employee.
  const flaggedBanned = flagged.status === 'BANNED'
  const flaggedSuspended = flagged.status === 'SUSPENDED' || flaggedBanned
  const flaggedIsModel = flagged.kind === 'model'

  const visible = requests.filter(r => !archived.has(r.id))
  const sel = visible.find(r => r.id === selectedId)
  const pending = visible.filter(r => ['SECURITY REVIEW', 'COMPLIANCE'].includes(r.status)).length
  const isPending = sel && ['SECURITY REVIEW', 'COMPLIANCE'].includes(sel.status)

  // Stage tracker follows the selected request: done stages up to its current
  // step, the current step highlighted, later steps still pending. A decided
  // request (approved/redirected/declined) completes every stage.
  const currentStage = sel ? (stageOfStatus[sel.status] ?? 1) : 1
  const decided = sel && ['APPROVED', 'REDIRECTED', 'DECLINED'].includes(sel.status)
  const stages = stageLabels.map((label, i) => {
    const done = i < currentStage || (decided && i === currentStage)
    return { label, n: done ? '✓' : String(i + 1), done, active: i === currentStage && !decided }
  })

  // Approve / decline a pending request — updates the employee's My Visas and
  // sends them a notification through the backend.
  async function decide(decision) {
    if (!sel || busy) return
    setBusy(true)
    try {
      await api.post(`/visas/${sel.id}/decision`, { decision })
      setRequests(await api.get('/visas'))
    } catch { /* offline */ } finally {
      setBusy(false)
    }
  }

  // Suspend the flagged tool for the whole organisation. Nothing is written
  // until the admin confirms here; the backend rejects a second suspension, so
  // the card can only ever record the action once.
  // Suspending a *model* is a different action from suspending its tool, and
  // the difference is the whole point: withdrawing Fable 5 must not stop the
  // organisation using Claude. The card picks the endpoint that matches what it
  // is actually looking at.
  async function confirmSuspend() {
    if (suspending || flaggedSuspended) return
    setSuspending(true)
    setSuspendError('')
    try {
      const res = flaggedIsModel
        ? await api.post('/tools/model-status', {
          tool: flagged.tool.name, model: flagged.model.id, status: 'SUSPENDED',
        })
        : await api.post('/tools/suspend', { tool: flagged.name })
      setTools(res.tools)
      setConfirming(false)
      const label = flaggedIsModel ? res.model.label : res.tool.name
      setActionResult({ tool: label, eventId: res.event.id, model: flaggedIsModel })
      toast(flaggedIsModel
        ? `${label} has been withdrawn — ${res.tool.name} itself is unaffected`
        : `${label} has been suspended organisation-wide`)
    } catch (err) {
      if (err.status === 409) {
        // Already suspended elsewhere — resync the card instead of writing again.
        setSuspendError(`${flagged.name} is already suspended.`)
        api.get('/tools').then(setTools).catch(() => {})
      } else {
        setSuspendError('The suspension could not be completed. Please try again.')
      }
    } finally {
      setSuspending(false)
    }
  }

  // Cancelling leaves the tool active — no request is sent.
  function closeConfirm() {
    if (suspending) return
    setConfirming(false)
    setSuspendError('')
  }

  // Archive removes the selected request from the queue this session,
  // matching Figma's "Selection=Archive" workspace state.
  function archive() {
    if (!sel) return
    const next = visible.find(r => r.id !== sel.id)
    setArchived(a => new Set(a).add(sel.id))
    setSelectedId(next?.id ?? null)
    toast(`${sel.tool} archived — removed from the review queue`)
  }

  return (
    <div>
      <div>
        <h1 className="text-[28px] font-bold text-[#17213a]">Tool Approvals</h1>
        <p className="text-[#667085] text-sm mt-1.5">
          Decide employee requests for tool access — approving one adds it to their AI Tools list, and either way they are notified.
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-4 gap-4 mt-6">
        <div className="rounded-[14px] px-4 py-3 bg-navy-header">
          <p className="font-semibold text-[11px] text-gold-brand">PENDING REVIEW</p>
          <p className="font-bold text-[26px] mt-1 text-white">{pending}</p>
          <p className="font-medium text-[11px] mt-0.5 text-[#fff5de]">{pending > 0 ? 'Oldest: 1 day' : 'Queue clear'}</p>
        </div>
        {kpiBase.map(k => (
          <div key={k.label} className="rounded-[14px] px-4 py-3 bg-white border border-[#d8d0b4]">
            <p className="font-semibold text-[11px] text-[#667085]">{k.label}</p>
            <p className="font-bold text-[26px] mt-1 text-[#17213a]">{k.value}</p>
            <p className={`font-medium text-[11px] mt-0.5 ${k.noteColor}`}>{k.note}</p>
          </div>
        ))}
        {/* Vendor security alert — replaces "Safe redirects", per Figma.
            Flips to the suspended state once the tool is suspended org-wide. */}
        <div className={`rounded-[14px] px-3.5 py-2.5 border-[1.5px] flex flex-col ${flaggedSuspended ? 'bg-[#f3f4f6] border-[#98a2b3]' : 'bg-[#fceded] border-[#c72929]'}`}>
          <p className={`font-bold text-[11px] ${flaggedSuspended ? 'text-[#667085]' : 'text-[#c72929]'}`}>
            {flaggedBanned
              ? (flaggedIsModel ? '■  MODEL BANNED · NO PROMPTS SENT' : '■  ORG-WIDE STATUS: BANNED')
              : flaggedSuspended
                ? (flaggedIsModel ? '■  MODEL WITHDRAWN' : '■  ORG-WIDE STATUS: SUSPENDED')
                : (flaggedIsModel ? '⚠  MODEL SECURITY ALERT · ACTIVE' : '⚠  VENDOR SECURITY ALERT · ACTIVE')}
          </p>
          <p className="font-bold text-[16px] text-[#0a204f] mt-1">{flagged.name} · {flagged.vendor}</p>
          <p className={`text-[9px] mt-0.5 ${flaggedSuspended ? 'text-[#667085]' : 'text-[#804d4d]'}`}>
            {flaggedBanned
              ? `${flaggedIsModel ? `Every prompt refused · ${flagged.vendor} still approved` : 'Every prompt refused, org-wide'}${flagged.suspendedOn ? ` · ${flagged.suspendedOn}` : ''}`
              : flaggedSuspended
                ? `${flaggedIsModel ? `Withdrawn · ${flagged.vendor} still approved` : 'Suspended for all employees'}${flagged.suspendedOn ? ` · ${flagged.suspendedOn}` : ''}`
                : flagged.flag}
          </p>
          {flaggedSuspended ? (
            <button disabled className="bg-[#e4e7ec] text-[#667085] font-semibold text-[12px] rounded-full h-[30px] px-4 mt-1.5 self-end flex items-center justify-center cursor-default">
              {flaggedBanned ? 'Banned' : flaggedIsModel ? 'Withdrawn' : 'Suspended'}
            </button>
          ) : (
            <button
              onClick={() => { setSuspendError(''); setConfirming(true) }}
              className="bg-[#c72929] hover:bg-[#a91f1f] text-white font-semibold text-[12px] rounded-full h-[30px] px-4 mt-1.5 self-end flex items-center justify-center cursor-pointer"
            >
              {flaggedIsModel ? 'Withdraw model' : 'Suspend org-wide'}&nbsp;&nbsp;→
            </button>
          )}
        </div>
      </div>

      {/* Action made — stays until dismissed so the admin sees what was recorded */}
      {actionResult && (
        <div className="bg-[#e9f8f2] border border-[#078b6c] rounded-[12px] px-4 py-3 mt-4 flex items-start gap-3">
          <span className="w-7 h-7 rounded-full bg-[#078b6c] text-white text-sm font-bold flex items-center justify-center shrink-0">✓</span>
          <div className="flex-1">
            <p className="text-[#17213a] font-bold text-[13px]">{actionResult.model ? 'Model withdrawn' : 'Tool suspended'}</p>
            <p className="text-[#0a5f4a] text-xs mt-0.5">
              Action completed: {actionResult.tool} {actionResult.model ? 'withdrawn — the tool itself stays approved' : 'suspended organisation-wide'}.
              Recorded in the audit log as {actionResult.eventId}.
            </p>
          </div>
          <Link to="/admin/audit-log" className="text-[#078b6c] font-semibold text-xs underline shrink-0 mt-0.5">View in audit log</Link>
          <button onClick={() => setActionResult(null)} className="text-[#667085] text-lg leading-none cursor-pointer px-1 shrink-0" aria-label="Dismiss">×</button>
        </div>
      )}

      {/* Standard review stages */}
      <div className="bg-white border border-[#d8d0b4] rounded-[12px] px-4 py-3 mt-5">
        <p className="text-[#667085] font-semibold text-[10px]">STANDARD REVIEW</p>
        <div className="flex items-center gap-0 mt-2">
          {stages.map((s, i) => (
            <div key={s.label} className="flex items-center">
              <div className="flex items-center gap-2.5">
                <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                  s.done ? 'bg-[#078b6c] text-white' : s.active ? 'bg-gold-brand text-navy-header' : 'bg-navy-header text-white'
                }`}>{s.n}</span>
                <p className={`font-semibold text-[13px] w-[142px] ${s.active || s.done ? 'text-[#17213a]' : 'text-[#667085]'}`}>{s.label}</p>
              </div>
              {i < stages.length - 1 && <span className={`h-0.5 w-[72px] mr-3.5 ${s.done ? 'bg-[#078b6c]' : 'bg-[#d8d0b4]'}`} />}
            </div>
          ))}
        </div>
      </div>

      {/* Workspace: queue + detail */}
      <div className="grid grid-cols-[604px_1fr] gap-5 mt-5 items-start">
        <div className="bg-white border border-[#d8d0b4] rounded-[14px] p-4">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[#17213a] font-bold text-lg">Requests</p>
              <p className="text-[#667085] text-xs mt-0.5">{pending} pending · sorted by submission time</p>
            </div>
            <button onClick={() => toast(DEMO_NOTE)} className="border-[1.5px] border-navy-header text-navy-header font-semibold text-xs w-[130px] h-11 rounded-full cursor-pointer hover:bg-chip">All requests</button>
          </div>
          <div className="flex flex-col gap-3.5 mt-3.5">
            {visible.map(r => (
              <button
                key={r.id}
                onClick={() => setSelectedId(r.id)}
                className={`text-left rounded-[12px] p-3.5 cursor-pointer ${cardStyles[r.status] || cardStyles.REDIRECTED} ${selectedId === r.id ? 'ring-2 ring-navy-header/30' : ''}`}
              >
                <span className={`inline-block font-semibold text-[11px] rounded-full px-4 py-1.5 ${statusChip[r.status]}`}>{r.status}</span>
                <div className="flex justify-between items-center mt-2">
                  <p className="text-navy font-semibold text-[15px]">{r.tool}</p>
                  <p className="text-[#667085] font-medium text-[11px]">{r.id}</p>
                </div>
                <div className="flex justify-between items-center mt-1">
                  <p className="text-[#667085] text-[11px]">{r.dept} · submitted {r.submitted}</p>
                  <span className="text-[#365fd9] text-[22px] leading-none">›</span>
                </div>
              </button>
            ))}
          </div>
          <div className="bg-[#eef2ff] rounded-[10px] px-3.5 py-3 mt-4">
            <p className="text-[#365fd9] font-semibold text-[11px]">Fast, explainable decisions</p>
            <p className="text-[#365fd9] text-[11px] mt-1">Declare purpose, data scope, owner and renewal date for every approval.</p>
          </div>
        </div>

        {/* Request detail */}
        {sel ? (
          <div className="bg-white border border-[#d8d0b4] rounded-[14px] p-5">
            <div className="flex justify-between items-center">
              <p className="text-[#667085] font-semibold text-[10px]">REQUEST {sel.id}</p>
              <span className={`font-semibold text-[11px] rounded-full px-5 py-1.5 ${statusChip[sel.status]}`}>{sel.status}</span>
            </div>
            <p className="text-[#17213a] font-bold text-xl mt-2.5">{sel.tool}</p>
            <p className="text-[#667085] text-[11px] mt-1.5">{sel.dept} · requested by {sel.requester} · owner: {sel.owner}</p>
            <div className="h-px bg-[#d8d0b4] my-3.5" />
            <p className="text-[#667085] font-semibold text-[10px]">BUSINESS PURPOSE</p>
            <p className="text-[#17213a] text-xs mt-1.5 leading-relaxed">{sel.purpose || 'No purpose declared yet.'}</p>
            <p className="text-[#667085] font-semibold text-[10px] mt-4">DECLARED DATA SCOPE</p>
            <div className="flex gap-2.5 mt-2 flex-wrap">
              {(sel.scopes || []).map(s => (
                <span key={s} className="bg-[#edf2ff] text-navy font-semibold text-[11px] rounded-full px-4 py-1.5">{s}</span>
              ))}
            </div>

            <div className="border border-[#078b6c] rounded-[10px] px-3.5 py-2.5 mt-4">
              <p className="text-[#17213a] font-semibold text-xs">Vendor checks</p>
              <div className="mt-1.5 space-y-1.5">
                {(checksByStatus[sel.status] || []).map(([mark, text], i) => (
                  <p key={i} className="text-[#17213a] font-medium text-[11px]">
                    <span className={`font-bold mr-2 ${mark === '!' ? 'text-[#d97706]' : 'text-[#078b6c]'}`}>{mark}</span>
                    {text}
                  </p>
                ))}
              </div>
            </div>

            <RiskScore key={sel.id} tool={sel.tool} />

            {sel.status !== 'APPROVED' && (
              <div className="bg-[#eef2ff] rounded-[10px] px-3.5 py-2.5 mt-3.5">
                <p className="text-[#365fd9] font-semibold text-[10px]">APPROVED ALTERNATIVE</p>
                <p className="text-[#17213a] font-semibold text-[13px] mt-1">ChatGPT · summarise mode</p>
                <p className="text-[#365fd9] text-[10px] mt-0.5">Available now with the same declared data scope.</p>
              </div>
            )}

            <div className="bg-[#fff5de] rounded-[10px] px-3.5 py-3.5 mt-3.5">
              <p className="text-[#d97706] font-medium text-[11px]">{noteByStatus[sel.status]}</p>
            </div>

            <div className="flex items-center gap-3 mt-5">
              {isPending ? (
                <>
                  <button onClick={() => decide('approve')} disabled={busy} className="bg-gold-brand hover:bg-gold text-navy-header font-semibold text-xs px-7 h-11 rounded-full cursor-pointer disabled:opacity-60">
                    {busy ? 'Saving…' : 'Approve 30-day pilot'}
                  </button>
                  <button onClick={() => decide('decline')} disabled={busy} className="text-[#d92d20] font-semibold text-xs px-4 h-11 cursor-pointer ml-auto disabled:opacity-60">
                    Decline
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => toast(`${sel.tool} · ${sel.id} · view the recorded review and decision`)}
                    className="bg-gold-brand hover:bg-gold text-navy-header font-semibold text-xs px-7 h-11 rounded-full cursor-pointer"
                  >
                    View approval
                  </button>
                  <button onClick={archive} className="text-[#d92d20] font-semibold text-xs px-4 h-11 cursor-pointer ml-auto">
                    Archive
                  </button>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-white border border-[#d8d0b4] rounded-[14px] p-10 text-center">
            <p className="text-[#667085] text-sm">No request selected. Pick one from the queue, or the queue is all clear. 🎉</p>
          </div>
        )}
      </div>

      {/* Confirm org-wide suspension — same overlay shape as "Confirm logout" */}
      {confirming && (
        <div className="fixed inset-0 bg-navy-dark/50 flex items-center justify-center p-4 sm:p-6 z-[60]" onClick={closeConfirm}>
          <div
            className="bg-white border-[1.5px] border-[#c7b887] rounded-[20px] shadow-[0px_18px_24px_rgba(3,10,31,0.22)] w-full max-w-[517px] p-5 sm:p-7"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 sm:gap-5">
              <div className="w-[52px] h-[52px] rounded-full bg-[#fceded] border-2 border-[#c72929] flex items-center justify-center shrink-0">
                <span className="text-[#c72929] font-bold text-2xl">!</span>
              </div>
              <div className="flex-1">
                <p className="text-[#c72929] font-bold text-xs">
                  ADMINISTRATIVE ACTION · {flaggedIsModel ? 'ONE MODEL' : 'ORGANISATION-WIDE'}
                </p>
                <p className="text-[#0a1733] font-bold text-2xl mt-1.5">
                  {flaggedIsModel
                    ? `Withdraw ${flagged.name} from ${flagged.vendor}?`
                    : `Suspend ${flagged.name} organisation-wide?`}
                </p>
              </div>
              <button onClick={closeConfirm} className="w-10 h-10 rounded-full border border-sand text-navy text-xl leading-none cursor-pointer hover:bg-chip shrink-0" aria-label="Close">×</button>
            </div>

            <p className="text-[#5c6b87] text-sm mt-5">
              {flaggedIsModel
                ? `This withdraws one model. ${flagged.vendor} stays approved and every other model on it keeps working. Are you sure you want to continue?`
                : 'This will suspend this AI tool for all employees in the organisation. Are you sure you want to continue?'}
            </p>

            <div className="bg-[#f0f5ff] rounded-[12px] px-4 py-4 mt-4 space-y-1.5">
              {flaggedIsModel ? (
                <>
                  <p className="text-[#0a1733] text-xs">• {flagged.vendor} is <strong>not</strong> suspended — employees keep using it on approved models.</p>
                  <p className="text-[#0a1733] text-xs">• Prompts containing company or customer data are no longer sent to {flagged.name}.</p>
                  <p className="text-[#0a1733] text-xs">• Employees selecting it are told which models to use instead.</p>
                  <p className="text-[#0a1733] text-xs">• The action is recorded in the audit log against your admin account.</p>
                </>
              ) : (
                <>
                  <p className="text-[#0a1733] text-xs">• Every employee loses access — {flagged.name} shows as blocked in their AI Tools list.</p>
                  <p className="text-[#0a1733] text-xs">• {flagged.name} can no longer be used or requested while the suspension is in place.</p>
                  <p className="text-[#0a1733] text-xs">• The action is recorded in the audit log against your admin account.</p>
                </>
              )}
            </div>

            {suspendError && (
              <div className="bg-[#fff0f0] border border-[#d92d20] rounded-[12px] px-4 py-3 mt-4">
                <p className="text-[#d92d20] font-bold text-[13px]">Unable to suspend tool</p>
                <p className="text-[#a2382f] text-xs mt-0.5">{suspendError}</p>
              </div>
            )}

            <div className="flex gap-4 mt-6">
              <button onClick={closeConfirm} disabled={suspending} className="border-[1.5px] border-[#091e47] text-[#091e47] font-semibold text-sm flex-1 h-[52px] rounded-full cursor-pointer hover:bg-chip disabled:opacity-60">
                Cancel
              </button>
              <button onClick={confirmSuspend} disabled={suspending || flaggedSuspended} className="bg-[#c71f1f] hover:bg-[#a91a1a] text-white font-semibold text-sm flex-1 h-[52px] rounded-full cursor-pointer disabled:opacity-60">
                {suspending ? 'Suspending…' : 'Suspend org-wide'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
