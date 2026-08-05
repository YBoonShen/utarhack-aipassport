// 08 Employee · AI Tools — matches Figma frame "08 Employee • My Visas"
// (table layout) plus "Modal / Request new tool" and "Modal / Request
// submitted". Live data: SummarizerX status and the license level come from
// the backend; "Request tool access" posts a real request to admin.
//
// The page was called "My Visas". The layout is unchanged; only the wording is,
// so that one idea — which AI tools you may use — has one name (lib/terms.js).
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, currentUser } from '../lib/api.js'
import { ACCESS_STATUS, PENDING_STATUSES } from '../lib/terms.js'
import { LEVELS, levelBenefit } from '../lib/levels.js'
import InfoPopover, { InfoList, InfoNote } from '../components/InfoPopover.jsx'

// Data-scope chips shown in the request modal (Figma: Internal + Meeting notes
// selected by default).
const scopeOptions = ['Internal', 'Meeting notes', 'No customer data', 'No audio']

// Status → chip + left status-bar colours, matching Figma. Same colours as
// before; the words now come from the shared set (lib/terms.js) so a tool that
// is approved here is not "active" here and "approved" everywhere else.
const statusStyle = {
  active: { chip: 'bg-[#e7f4ee] text-[#078b6c]', label: `● ${ACCESS_STATUS.approved}`, bar: 'bg-[#078b6c]' },
  locked: { chip: 'bg-[#ededf2] text-[#667085]', label: `● ${ACCESS_STATUS.locked}`, bar: 'bg-[#80858f]' },
  review: { chip: 'bg-[#fcf0d4] text-[#b27a0d]', label: `● ${ACCESS_STATUS.pending}`, bar: 'bg-[#d9991a]' },
  suspended: { chip: 'bg-[#fae5e5] text-[#c72929]', label: `● ${ACCESS_STATUS.blocked}`, bar: 'bg-[#c72929]' },
  declined: { chip: 'bg-[#fae5e5] text-[#c72929]', label: `● ${ACCESS_STATUS.declined}`, bar: 'bg-[#c72929]' },
  // A tool in the register that has never been reviewed. Reachable when an
  // employee's request was withdrawn but the tool is still on their list.
  unreviewed: { chip: 'bg-[#ededf2] text-[#667085]', label: '● Not reviewed', bar: 'bg-[#80858f]' },
}

// What the detail sheet explains about each state, in the employee's words.
const statusExplainer = {
  active: 'This tool has been reviewed and cleared. You can use it for the data scope listed above — the Smart Gateway still checks every prompt before it is sent.',
  locked: 'This tool is approved for the organisation but sits above your current AI License level. Completing the training assigned to you is what raises that level.',
  review: 'Your request is with IT and Compliance. They review the vendor and the data you asked to send it before deciding. You will get a notification either way.',
  suspended: 'An administrator withdrew this tool organisation-wide after a security concern. Nobody can use it until the suspension is lifted, and new requests are not accepted.',
  declined: 'This request was not approved. An approved alternative is usually suggested — you can raise a new request if the need has changed.',
  unreviewed: 'This tool has not been through security and compliance review, so there are no agreed terms covering what it does with company data.',
}

// How each level is reached. What each level *unlocks* is not repeated here —
// that is levelBenefit() in lib/levels.js, the one fixed sentence per level that
// the licence card and the level-up notification also use, so the same level
// never carries two different descriptions.
const levels = [
  { n: 1, name: LEVELS[0].name, desc: 'Everyone starts here. Basic approved AI for everyday, non-sensitive tasks.', badge: 'LEVEL 1' },
  { n: 2, name: LEVELS[1].name, desc: 'Unlocked by finishing the 3 core AI-safety modules.', badge: 'LEVEL 2' },
  { n: 3, name: LEVELS[2].name, desc: 'Needs the Advanced AI-safety path — modules coming soon.', badge: 'COMING SOON' },
  { n: 4, name: LEVELS[3].name, desc: 'By nomination. Mentors others and helps review AI requests.', badge: 'BY NOMINATION' },
]

const cols = 'grid grid-cols-[minmax(180px,1.6fr)_minmax(150px,1.4fr)_minmax(150px,1.4fr)_minmax(150px,1fr)]'

// A light-blue prefilled field in the request modal.
function ReqField({ label, value, onChange }) {
  return (
    <div className="bg-[#edf2ff] rounded-[12px] px-4 py-2.5">
      <p className="text-[#8a7d56] font-semibold text-[11px]">{label}</p>
      <input value={value} onChange={e => onChange(e.target.value)} className="w-full bg-transparent outline-none text-[15px] text-[#0a204f] mt-1" />
    </div>
  )
}

export default function Visas() {
  const [modal, setModal] = useState(null) // 'request' | 'sent'
  const [requests, setRequests] = useState([])
  const [register, setRegister] = useState([])
  // Zeroed rather than "level 2": a Trainee opening this page was briefly shown
  // Level 2's unlocked tools before /api/profile answered.
  const [profile, setProfile] = useState({ level: 0 })
  const [loaded, setLoaded] = useState(false)
  const [detail, setDetail] = useState(null) // the tool row opened for detail
  const [submitting, setSubmitting] = useState(false)
  const user = currentUser()

  // Request-form fields (prefilled with the Figma example)
  const [toolName, setToolName] = useState('MeetingMind')
  const [model, setModel] = useState('MeetingMind Pro v2')
  const [vendor, setVendor] = useState('meetingmind.ai')
  const [category, setCategory] = useState('Meeting summariser')
  const [purpose, setPurpose] = useState('Summarise internal team meeting notes into action items.')
  const [scopes, setScopes] = useState(['Internal', 'Meeting notes'])

  useEffect(() => {
    let alive = true
    const load = () => {
      api.get('/visas').then(r => alive && setRequests(r)).catch(() => {})
      api.get('/tools').then(t => { if (alive) { setRegister(t); setLoaded(true) } }).catch(() => {})
      api.get('/profile').then(p => alive && setProfile(p)).catch(() => {})
    }
    load()
    // Polled, so an admin approving a request or suspending a tool reaches this
    // page while the employee is looking at it.
    const t = setInterval(load, 4000)
    return () => { alive = false; clearInterval(t) }
  }, [])

  const level = profile.level || 0

  // This employee's own requests, newest first (the server unshifts each new
  // one). /api/visas serves the whole organisation's queue for the admin
  // console, so this filter is what makes the page personal.
  const myRequests = useMemo(
    () => requests.filter(r => r.requester === user?.id),
    [requests, user?.id]
  )

  /**
   * The employee's tool list, built from the approved-tool register and their
   * own requests instead of a literal.
   *
   * The five rows here used to be hard-coded — fixed models, fixed licence
   * numbers and copy like "Renews in 45 days" — with only SummarizerX reading
   * anything live. So a tool the employee requested never appeared, an admin's
   * approval never changed a row, and a tool suspended organisation-wide still
   * showed as approved. Every field below now comes from a record.
   *
   * What is listed: the tools the organisation has approved (what they may
   * use), anything suspended (what they must stop using), and every tool this
   * employee has personally asked about, whatever its state. A tool nobody has
   * reviewed and nobody has asked for is not one of "my AI tools".
   */
  const tools = useMemo(() => {
    const rows = []
    const seen = new Set()

    const add = (entry, request) => {
      const key = (entry?.name || request?.tool || '').toLowerCase()
      if (!key || seen.has(key)) return
      seen.add(key)

      const registered = entry?.status || 'UNAPPROVED'
      const pending = request && PENDING_STATUSES.includes(request.status)
      const refused = request && ['DECLINED', 'REDIRECTED'].includes(request.status)
      const needsLevel = entry?.minLevel && level < entry.minLevel

      // The register decides first: a suspension applies to everyone, and an
      // approval is an approval however the employee got there.
      const status = registered === 'SUSPENDED' ? 'suspended'
        : registered === 'APPROVED' ? (needsLevel ? 'locked' : 'active')
        : pending ? 'review'
        : refused ? 'declined'
        : 'unreviewed'

      const sub = {
        suspended: entry?.suspendedOn ? `Suspended ${entry.suspendedOn}` : 'Paused — cannot be used',
        locked: `Needs Level ${entry?.minLevel}`,
        active: entry?.minLevel ? `Approved · Level ${entry.minLevel} scope` : 'Approved for use',
        review: request ? `Requested ${request.submitted} · decision in ~3 days` : 'In review',
        declined: request?.decided ? `Decided ${request.decided}` : 'An alternative was suggested',
        unreviewed: 'Not reviewed — request access before using it',
      }[status]

      rows.push({
        name: entry?.name || request.tool,
        // The employee's own reference for this tool is the request they
        // raised; an approved tool they never had to ask for has none.
        number: request?.id || '—',
        model: entry?.model || request?.model || 'Vendor model',
        data: entry?.dataScope || (request?.scopes || []).join(' · ') || 'As declared in the request',
        vendor: entry?.vendor || request?.vendor || 'Unreviewed vendor',
        status,
        sub,
        request: request || null,
        flag: entry?.flag || null,
        minLevel: entry?.minLevel || null,
      })
    }

    const requestFor = name =>
      myRequests.find(r => String(r.tool).toLowerCase() === String(name).toLowerCase()) || null

    // Approved and suspended tools, in register order.
    for (const entry of register) {
      if (entry.status === 'APPROVED' || entry.status === 'SUSPENDED') add(entry, requestFor(entry.name))
    }
    // Then anything this employee has asked about that is not already listed.
    for (const request of myRequests) {
      add(register.find(e => e.name.toLowerCase() === String(request.tool).toLowerCase()), request)
    }
    return rows
  }, [register, myRequests, level])

  const count = s => tools.filter(t => t.status === s).length

  async function submitRequest() {
    if (!toolName.trim() || submitting) return
    setSubmitting(true)
    try {
      // The whole form is sent — the model, vendor and category were being
      // collected and dropped, so an approved tool joined the register with no
      // description of itself.
      await api.post('/visas/apply', { tool: toolName, model, vendor, category, purpose, scopes })
      const [nextRequests, nextRegister] = await Promise.all([api.get('/visas'), api.get('/tools')])
      setRequests(nextRequests)
      setRegister(nextRegister)
      setModal('sent')
    } catch {
      setModal(null)
    } finally {
      setSubmitting(false)
    }
  }

  function toggleScope(s) {
    setScopes(list => (list.includes(s) ? list.filter(x => x !== s) : [...list, s]))
  }

  return (
    <div className="max-w-[1440px] mx-auto px-4 lg:px-10 py-6 lg:py-8">
      <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[26px] lg:text-[30px] font-bold text-navy-header">AI Tools</h1>
            <InfoPopover label="About tool access" title="About tool access" tone="light">
              <p className="text-[#667085] text-[13px] mt-2 leading-relaxed">
                Every AI tool has to be reviewed before company data goes into it. Tool access is that permission —
                which tools you may use, and what kind of data each one is allowed to receive.
              </p>
              <InfoList
                heading="What the statuses mean"
                items={[
                  [ACCESS_STATUS.approved, 'reviewed and cleared. You can use it within the permitted data scope.'],
                  [ACCESS_STATUS.pending, 'you have asked for it and IT and Compliance are reviewing it.'],
                  [ACCESS_STATUS.locked, 'available at a higher AI License level. Finish training to reach it.'],
                  [ACCESS_STATUS.blocked, 'withdrawn after a security concern. Nobody can use it for now.'],
                  [ACCESS_STATUS.declined, 'not approved. An alternative is usually suggested.'],
                ]}
              />
              <InfoNote title="Need something that is not listed?">
                Use Request tool access. IT and Compliance review the vendor and the data you want to send it, and you
                are notified when they decide.
              </InfoNote>
            </InfoPopover>
          </div>
          <p className="text-[#667085] text-sm mt-1.5 max-w-[720px]">
            The AI tools you are approved to use and the data each one may receive. Higher AI License levels unlock more.
          </p>
        </div>
        <button
          onClick={() => setModal('request')}
          className="border-[1.5px] border-navy-header text-navy-header font-semibold text-sm h-12 px-6 rounded-full cursor-pointer hover:bg-chip shrink-0"
        >
          +&nbsp;&nbsp;Request tool access
        </button>
      </div>

      {/* Tool access dashboard */}
      <div className="mt-6">
        {/* Summary strip */}
        <div className="bg-[#fafafc] border border-[#e0e0e5] rounded-[10px] min-h-11 sm:h-11 py-2 sm:py-0 flex items-center px-4 sm:px-5 gap-x-5 gap-y-1 flex-wrap">
          <p className="text-[#0a204f] font-bold text-sm">{tools.length} AI tools</p>
          <span className="flex items-center gap-2"><span className="text-[#078b6c] text-xs">●</span><span className="text-[#0a204f] font-semibold text-[13px]">{count('active')} approved</span></span>
          <span className="flex items-center gap-2"><span className="text-[#b27a0d] text-xs">●</span><span className="text-[#0a204f] font-semibold text-[13px]">{count('review')} pending</span></span>
          <span className="flex items-center gap-2"><span className="text-[#c72929] text-xs">■</span><span className="text-[#0a204f] font-semibold text-[13px]">{count('suspended')} blocked</span></span>
          {count('locked') > 0 && (
            <span className="flex items-center gap-2"><span className="text-[#667085] text-xs">🔒</span><span className="text-[#0a204f] font-semibold text-[13px]">{count('locked')} locked · needs a higher level</span></span>
          )}
        </div>

        {tools.length === 0 && (
          <div className="bg-white border border-[#e0e0e5] rounded-[16px] px-6 py-8 text-center mt-6">
            <p className="text-navy-header font-bold text-lg">
              {loaded ? 'No AI tools yet' : 'Loading your AI tools…'}
            </p>
            <p className="text-[#667085] text-[13.5px] mt-2 max-w-[520px] mx-auto">
              {loaded
                ? 'Nothing has been approved for you and you have no requests open. Use Request tool access to ask for a tool.'
                : 'Fetching the tools approved for you.'}
            </p>
          </div>
        )}

        {/* Below lg the table becomes cards. It previously kept its 4-column
            shape inside a 680px horizontal scroller, so on a phone the STATUS
            column — the one thing the page exists to tell you — was off-screen
            until you scrolled sideways to find it. From lg the original table
            is unchanged. */}
        {tools.length > 0 && (
          <div className="flex flex-col gap-3 mt-6 lg:hidden">
            {tools.map(t => {
              const st = statusStyle[t.status]
              return (
                <button
                  key={t.name}
                  onClick={() => setDetail(t)}
                  className="relative w-full text-left bg-white border border-[#e0e0e5] rounded-[12px] overflow-hidden pl-5 pr-4 py-4 cursor-pointer hover:border-navy-header focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-header"
                >
                  <span className={`absolute left-0 top-0 h-full w-[5px] ${st.bar}`} aria-hidden="true" />
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[#0a204f] font-bold text-base truncate">{t.name}</p>
                      <p className="text-[#667085] text-[11px] mt-0.5">No. {t.number}</p>
                    </div>
                    <span className={`inline-flex items-center font-semibold text-[12px] rounded-full px-3 h-[28px] shrink-0 ${st.chip}`}>{st.label}</span>
                  </div>
                  <dl className="mt-3 flex flex-col gap-1.5">
                    <div className="flex gap-2">
                      <dt className="text-[#8a7d56] font-semibold text-[11px] w-[104px] shrink-0">MODEL</dt>
                      <dd className="text-[#0a204f] font-semibold text-[13px] min-w-0 break-words">{t.model}</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="text-[#8a7d56] font-semibold text-[11px] w-[104px] shrink-0">PERMITTED DATA</dt>
                      <dd className="text-[#667085] text-[13px] min-w-0 break-words">{t.data}</dd>
                    </div>
                  </dl>
                  <p className="text-[#667085] text-xs mt-3">{t.sub}&nbsp;&nbsp;·&nbsp;&nbsp;<span className="text-[#2e5ccc] font-semibold">Details →</span></p>
                </button>
              )
            })}
          </div>
        )}

        {/* The 4-column table, lg and up — unchanged from the desktop design. */}
        {tools.length > 0 && (
          <div className="hidden lg:block">
            {/* Table header */}
            <div className={`${cols} px-6 mt-6 pb-2 border-b border-[#d9d9e0]`}>
              <p className="text-[#8a7d56] font-semibold text-[11px]">AI TOOL</p>
              <p className="text-[#8a7d56] font-semibold text-[11px]">MODEL</p>
              <p className="text-[#8a7d56] font-semibold text-[11px]">PERMITTED DATA</p>
              <p className="text-[#8a7d56] font-semibold text-[11px]">STATUS</p>
            </div>

            {/* Rows */}
            <div className="mt-3 flex flex-col gap-2">
              {tools.map((t, i) => {
                const st = statusStyle[t.status]
                return (
                  <button
                    key={t.name}
                    onClick={() => setDetail(t)}
                    className={`relative rounded-[8px] overflow-hidden w-full text-left cursor-pointer hover:ring-1 hover:ring-navy-header/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-header ${i % 2 ? 'bg-[#fbfbfc]' : 'bg-white'}`}
                  >
                    <span className={`absolute left-0 top-0 h-full w-[5px] rounded-[3px] ${st.bar}`} aria-hidden="true" />
                    <div className={`${cols} items-center pl-7 pr-5 min-h-[88px] py-4`}>
                      <div>
                        <p className="text-[#0a204f] font-bold text-base">{t.name}</p>
                        <p className="text-[#667085] text-[11px] mt-1">No. {t.number}</p>
                      </div>
                      <p className="text-[#0a204f] font-semibold text-sm">{t.model}</p>
                      <p className="text-[#667085] text-sm">{t.data}</p>
                      <div>
                        <span className={`inline-flex items-center font-semibold text-[13px] rounded-full px-3 h-[30px] ${st.chip}`}>{st.label}</span>
                        <p className="text-[#667085] text-xs mt-2">{t.sub}</p>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* AI literacy levels */}
      <div className="bg-white border border-[#d8d0b4] rounded-[16px] p-5 sm:p-7 mt-6">
        <p className="text-[#0a204f] font-bold text-base">AI literacy levels — what each level means</p>
        <p className="text-[#667085] text-[13px] mt-2 max-w-[1000px]">
          Finish the 3 core AI-safety modules to reach Level 2. Higher levels need advanced training (coming soon). Access to sensitive data always still depends on your job role and admin approval.
        </p>
        {/* Every card carries the same 2px border and the same flex column, so
            the current level (Navigator) lines up with its neighbours instead
            of being nudged 1px in by the thicker "you are here" border. The
            row stretches to the tallest card rather than clipping at a fixed
            height, which is what pushed Navigator's longer description out. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-5 items-stretch">
          {levels.map(l => {
            const done = l.n < level
            const cur = l.n === level
            return (
              <div
                key={l.n}
                className={`flex flex-col h-full min-h-[120px] rounded-[12px] border-2 p-4 ${cur ? 'bg-[#0a204f] border-[#d9b32c]' : done ? 'bg-white border-[#e0e0e5]' : 'bg-[#f2f2f5] border-[#e0e0e5]'}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className={`font-semibold text-[10px] shrink-0 ${cur ? 'text-[#d9b32c]' : done ? 'text-[#667085]' : 'text-[#999ea8]'}`}>LEVEL {l.n}</p>
                  <span className={`font-bold text-[9px] leading-none whitespace-nowrap rounded-full px-2 py-1 shrink-0 ${cur ? 'bg-[#d9b32c] text-[#0a204f]' : done ? 'bg-[#e5f4ed] text-[#328768]' : 'bg-[#e5e5eb] text-[#999ea8]'}`}>
                    {cur ? 'YOU ARE HERE' : done ? '✓ DONE' : l.badge}
                  </span>
                </div>
                <p className={`font-bold text-lg mt-1.5 leading-tight ${cur ? 'text-white' : done ? 'text-[#0a204f]' : 'text-[#737882]'}`}>{l.name}</p>
                <p className={`text-[12.5px] mt-2 leading-snug ${cur ? 'text-[#cbd5e1]' : done ? 'text-[#667085]' : 'text-[#999ea8]'}`}>{l.desc}</p>
                {/* The shared unlock line — identical to the one on the licence
                    card and in the level-up notification. */}
                <p className={`text-[11.5px] mt-2 leading-snug ${cur ? 'text-[#d9b32c]' : done ? 'text-[#8a7d56]' : 'text-[#b0b5bf]'}`}>
                  Unlocks: {levelBenefit(l.n)}
                </p>
              </div>
            )
          })}
        </div>
      </div>

      {/* Tool detail — what "select a tool" opens.
          The rows were inert, so there was no way to see why a tool was locked,
          what a pending request had actually asked for, or when it was decided:
          the status chip was the whole story. Same modal shell as the request
          form below, so nothing new is introduced visually. */}
      {detail && (
        <div className="fixed inset-0 bg-navy-dark/50 flex items-center justify-center p-4 sm:p-6 z-50" onClick={() => setDetail(null)}>
          <div
            role="dialog"
            aria-label={`${detail.name} details`}
            className="bg-[#fffefa] border-[1.5px] border-[#0a204f] rounded-[20px] shadow-[0px_10px_30px_0px_rgba(0,0,0,0.22)] w-full max-w-[560px] p-5 sm:p-7 max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[#d9b32c] font-semibold text-[11px]">AI TOOL</p>
                <p className="text-[#0a204f] font-bold text-[22px] sm:text-[26px] mt-1 break-words">{detail.name}</p>
                <p className="text-[#667085] text-[13px] mt-1">{detail.vendor}</p>
              </div>
              <button
                onClick={() => setDetail(null)}
                aria-label="Close"
                className="w-11 h-11 -mt-2 -mr-2 rounded-full text-[#667085] text-xl leading-none cursor-pointer hover:bg-chip shrink-0 flex items-center justify-center"
              >
                ×
              </button>
            </div>

            <span className={`inline-flex items-center font-semibold text-[13px] rounded-full px-3 h-[30px] mt-4 ${statusStyle[detail.status].chip}`}>
              {statusStyle[detail.status].label}
            </span>
            <p className="text-[#667085] text-[13.5px] mt-3 leading-relaxed">{statusExplainer[detail.status]}</p>

            <dl className="mt-5 flex flex-col gap-3">
              {[
                ['MODEL', detail.model],
                ['PERMITTED DATA', detail.data],
                ['YOUR REFERENCE', detail.number],
                detail.request ? ['REQUESTED', detail.request.submitted] : null,
                detail.request?.decided ? ['DECIDED', detail.request.decided] : null,
                detail.request?.purpose ? ['BUSINESS PURPOSE', detail.request.purpose] : null,
                detail.minLevel ? ['REQUIRED LEVEL', `Level ${detail.minLevel}`] : null,
              ].filter(Boolean).map(([label, value]) => (
                <div key={label} className="flex flex-col sm:flex-row sm:gap-4">
                  <dt className="text-[#8a7d56] font-semibold text-[11px] sm:w-[150px] sm:shrink-0 sm:pt-0.5">{label}</dt>
                  <dd className="text-[#0a204f] text-[13.5px] min-w-0 break-words">{value}</dd>
                </div>
              ))}
            </dl>

            {detail.flag && (
              <div className="bg-[#fae5e5] border border-[#c72929] rounded-[10px] px-3.5 py-3 mt-4">
                <p className="text-[#c72929] font-semibold text-[12.5px]">{detail.flag}</p>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 mt-6">
              <button
                onClick={() => setDetail(null)}
                className="border-[1.5px] border-[#0a204f] text-[#0a204f] font-semibold text-sm w-full sm:w-[160px] h-12 rounded-full cursor-pointer hover:bg-chip"
              >
                Back to AI Tools
              </button>
              {/* A locked tool needs training, not a request; a suspended one
                  cannot be requested at all; a request already in review must
                  not be raised a second time. */}
              {detail.status === 'locked' ? (
                <Link
                  to="/training"
                  className="bg-[#d9b32c] hover:bg-gold-dark text-[#0a204f] font-semibold text-sm w-full sm:flex-1 h-12 rounded-full flex items-center justify-center"
                >
                  Open my training&nbsp;&nbsp;→
                </Link>
              ) : detail.status === 'suspended' || detail.status === 'review' ? null : detail.status === 'active' ? null : (
                <button
                  onClick={() => { setToolName(detail.name); setModel(detail.model); setVendor(detail.vendor); setDetail(null); setModal('request') }}
                  className="bg-[#d9b32c] hover:bg-gold-dark text-[#0a204f] font-semibold text-sm w-full sm:flex-1 h-12 rounded-full cursor-pointer"
                >
                  Request access&nbsp;&nbsp;→
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Request tool access — matches Figma "Modal / Request new tool" */}
      {modal === 'request' && (
        <div className="fixed inset-0 bg-navy-dark/50 flex items-center justify-center p-4 sm:p-6 z-50" onClick={() => setModal(null)}>
          <div className="bg-[#fffefa] border-[1.5px] border-[#0a204f] rounded-[20px] shadow-[0px_10px_30px_0px_rgba(0,0,0,0.22)] w-full max-w-[600px] p-5 sm:p-[30px] max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <p className="text-[#d9b32c] font-semibold text-[11px]">TOOL ACCESS REQUEST · SENT TO ADMIN</p>
            <p className="text-[#0a204f] font-bold text-[22px] sm:text-[26px] mt-1.5">Request tool access</p>
            <p className="text-[#667085] text-sm mt-2.5">Tell IT what tool and model you want and why. They review the vendor and data scope before approving.</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-5">
              <ReqField label="TOOL NAME" value={toolName} onChange={setToolName} />
              <ReqField label="MODEL / VERSION" value={model} onChange={setModel} />
              <ReqField label="VENDOR / WEBSITE" value={vendor} onChange={setVendor} />
              <ReqField label="CATEGORY" value={category} onChange={setCategory} />
            </div>
            <div className="bg-[#edf2ff] rounded-[12px] px-4 py-2.5 mt-3">
              <p className="text-[#8a7d56] font-semibold text-[11px]">BUSINESS PURPOSE</p>
              <textarea value={purpose} onChange={e => setPurpose(e.target.value)} rows={2} className="w-full bg-transparent outline-none text-[15px] text-[#0a204f] resize-none mt-1" />
            </div>

            <p className="text-[#8a7d56] font-semibold text-[11px] mt-4">DECLARED DATA SCOPE · select what the tool may receive</p>
            <div className="flex flex-wrap gap-2 mt-2.5">
              {scopeOptions.map(s => {
                const on = scopes.includes(s)
                return (
                  <button
                    key={s}
                    onClick={() => toggleScope(s)}
                    className={`font-semibold text-[12.5px] rounded-[16px] px-3 py-2 cursor-pointer border ${on ? 'bg-[#e7f1ec] border-[#328768] text-[#19533e]' : 'bg-[#f2f2f5] border-[#ccccd1] text-[#667085]'}`}
                  >
                    {on ? '✓ ' : '✗ '}{s}
                  </button>
                )
              })}
            </div>

            <p className="text-[#667085] font-medium text-[12.5px] mt-4">Typical review time: 3 working days. You will get a notification when a decision is made.</p>

            <div className="flex flex-col sm:flex-row gap-3 mt-6">
              <button onClick={() => setModal(null)} className="border-[1.5px] border-[#0a204f] text-[#0a204f] font-semibold text-sm w-full sm:w-[176px] h-12 rounded-full cursor-pointer hover:bg-chip">
                Cancel
              </button>
              {/* w-full before sm: in a column flex container `flex-1` resolves
                  against the vertical axis, which zeroed the basis and collapsed
                  this button to a ~20px sliver on a phone — the one control that
                  actually submits the request. It only shares the row from sm. */}
              <button onClick={submitRequest} disabled={submitting || !toolName.trim()} className="bg-[#d9b32c] hover:bg-gold-dark text-[#0a204f] font-semibold text-sm w-full sm:flex-1 h-12 rounded-full cursor-pointer disabled:opacity-60">
                {submitting ? 'Sending…' : 'Send request to admin  →'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Request submitted — matches Figma "Modal / Request submitted" */}
      {modal === 'sent' && (
        <div className="fixed inset-0 bg-navy-dark/50 flex items-center justify-center p-4 sm:p-6 z-50" onClick={() => setModal(null)}>
          <div className="bg-[#fffefa] border-[1.5px] border-[#328768] rounded-[20px] shadow-[0px_10px_30px_0px_rgba(0,0,0,0.22)] w-full max-w-[520px] p-5 sm:p-[30px] max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-[32px] bg-[#e7f1ec] border-2 border-[#328768] flex items-center justify-center text-[#19533e] text-[28px] font-bold shrink-0">✓</div>
              <div>
                <p className="text-[#19533e] font-semibold text-[11px]">REQUEST SUBMITTED</p>
                <p className="text-[#0a204f] font-bold text-[22px] mt-0.5">Sent to admin for review</p>
              </div>
            </div>
            <p className="text-[#667085] text-sm mt-5">{toolName} ({model}) is now with IT and Compliance. Typical decision: 3 working days.</p>
            <p className="text-[#667085] text-sm mt-3">You will get a notification when it is approved, and the tool will appear in your AI Tools list.</p>
            <button onClick={() => setModal(null)} className="bg-[#d9b32c] hover:bg-gold-dark text-[#0a204f] font-semibold text-sm w-full h-12 rounded-full mt-7 cursor-pointer">
              Back to AI Tools&nbsp;&nbsp;→
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
