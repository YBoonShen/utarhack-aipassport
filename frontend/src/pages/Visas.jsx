// 08 Employee · AI Tools — matches Figma frame "08 Employee • My Visas"
// (table layout) plus "Modal / Request new tool" and "Modal / Request
// submitted". Live data: SummarizerX status and the license level come from
// the backend; "Request tool access" posts a real request to admin.
//
// The page was called "My Visas". The layout is unchanged; only the wording is,
// so that one idea — which AI tools you may use — has one name (lib/terms.js).
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api.js'
import { useAuth } from '../lib/auth.jsx'
import { ACCESS_STATUS, PENDING_STATUSES, BUILT_IN_ASSISTANT } from '../lib/terms.js'
import { LEVELS, levelBenefit, REQUEST_MIN_LEVEL } from '../lib/levels.js'
import InfoPopover, { InfoList, InfoNote } from '../components/InfoPopover.jsx'

// Data-scope chips shown in the request modal. The selected tool's own declared
// scope comes from the register; these are the extra restrictions an employee
// can promise on top of it.
const scopeOptions = ['Internal', 'Meeting notes', 'No customer data', 'No audio']

// Status → chip + left status-bar colours, matching Figma. Same colours as
// before; the words now come from the shared set (lib/terms.js) so a tool that
// is approved here is not "active" here and "approved" everywhere else.
const statusStyle = {
  active: { chip: 'bg-[#e7f4ee] text-[#078b6c]', label: `● ${ACCESS_STATUS.approved}`, bar: 'bg-[#078b6c]' },
  locked: { chip: 'bg-[#ededf2] text-[#667085]', label: `● ${ACCESS_STATUS.locked}`, bar: 'bg-[#80858f]' },
  review: { chip: 'bg-[#fcf0d4] text-[#b27a0d]', label: `● ${ACCESS_STATUS.pending}`, bar: 'bg-[#d9991a]' },
  suspended: { chip: 'bg-[#fae5e5] text-[#c72929]', label: `● ${ACCESS_STATUS.blocked}`, bar: 'bg-[#c72929]' },
  banned: { chip: 'bg-[#fae5e5] text-[#c72929]', label: '● Banned', bar: 'bg-[#c72929]' },
  declined: { chip: 'bg-[#fae5e5] text-[#c72929]', label: `● ${ACCESS_STATUS.declined}`, bar: 'bg-[#c72929]' },
  // Access that was granted and then withdrawn by an admin. A distinct state
  // from "declined" (never granted): the server returns access 'revoked', and
  // without this entry statusStyle[status] was undefined and the page crashed
  // on render for any employee who had a revoked tool.
  revoked: { chip: 'bg-[#fae5e5] text-[#c72929]', label: '● Revoked', bar: 'bg-[#c72929]' },
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
  banned: 'Your organisation has banned this tool. No prompt is sent to it at all — an ordinary question included — and it cannot be requested.',
  declined: 'This request was not approved. An approved alternative is usually suggested — you can raise a new request if the need has changed.',
  revoked: 'An administrator withdrew your access to this tool. The Smart Gateway treats it as unreviewed again — you can raise a new request if you still need it.',
  unreviewed: 'This AI tool is not approved by your organisation. It has not been through security and compliance review, so there are no agreed terms covering what it does with company data.',
}

// The status line under each model in the expandable model list.
const modelAccessLabel = {
  active: 'Approved',
  locked: 'Needs a higher level',
  suspended: 'Withdrawn',
  banned: 'Banned',
  unreviewed: 'Not approved',
}

// How each level is reached, and what it opens on this page. What each level
// *unlocks* is not repeated here — that is levelBenefit() in lib/levels.js, the
// one fixed sentence per level that the licence card and the level-up
// notification also use, so the same level never carries two different
// descriptions.
const levels = [
  { n: 1, name: LEVELS[0].name, desc: 'Everyone starts here. The free models on the approved assistants, for everyday non-sensitive work.', badge: 'LEVEL 1' },
  { n: 2, name: LEVELS[1].name, desc: 'Unlocked by finishing the 3 core AI-safety modules. Opens the paid models and tool access requests.', badge: 'LEVEL 2' },
  { n: 3, name: LEVELS[2].name, desc: 'Needs the Advanced AI-safety path — modules coming soon.', badge: 'COMING SOON' },
  // "BY NOMINATION" until now, which described a mechanism that does not exist:
  // every level here is reached by accumulated safety points and nothing else —
  // there is no nomination, endorsement or manual promotion anywhere in the
  // system. Level 4 is gated by the same thing Level 3 is, the advanced modules
  // that have not shipped yet, so it carries the same badge.
  { n: 4, name: LEVELS[3].name, desc: 'The end of the Advanced AI-safety path — modules coming soon. Guardians mentor others and help review AI requests.', badge: 'COMING SOON' },
]

const cols = 'grid grid-cols-[minmax(180px,1.6fr)_minmax(150px,1.4fr)_minmax(150px,1.4fr)_minmax(150px,1fr)]'

// One model on the tool detail sheet. `access` is the server's verdict for this
// employee, not the register's org-wide status, so a paid model reads "Needs a
// higher level" to a Trainee and "Approved" to a Navigator — the same answer the
// Smart Gateway gives when they actually send something to it.
function ModelRow({ model }) {
  const ok = model.approved
  const tone = ok ? 'text-[#078b6c]' : model.access === 'locked' ? 'text-[#667085]' : 'text-[#c72929]'
  return (
    <div className="flex items-baseline gap-2.5">
      <span className={`text-[13px] shrink-0 ${tone}`}>{ok ? '●' : model.access === 'locked' ? '🔒' : '■'}</span>
      <p className="text-[#0a204f] text-[13.5px] font-semibold min-w-0 break-words">{model.label}</p>
      <p className={`text-[11.5px] ml-auto shrink-0 ${tone}`}>
        {model.access === 'locked' && model.minLevel
          ? `Needs Level ${model.minLevel}`
          : modelAccessLabel[model.access] || 'Not approved'}
      </p>
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
  const [showPaid, setShowPaid] = useState(false) // the paid-model section on the detail sheet
  const [submitting, setSubmitting] = useState(false)
  const [requestError, setRequestError] = useState('')
  const { user } = useAuth()

  // The guided request form. `catalogue` is the server's answer to "what may
  // this employee ask for" — the register filtered by the `requestable` flag and
  // by their own licence level — so the page never invents an option the
  // approval queue would refuse. It replaced four free-text boxes in which an
  // employee typed a tool name, a vendor and a website, and the queue took
  // whatever they wrote.
  const [catalogue, setCatalogue] = useState({ canRequest: false, minLevel: REQUEST_MIN_LEVEL, tools: [] })
  const [picked, setPicked] = useState(null) // the chosen tool's name
  const [purpose, setPurpose] = useState('')
  const [scopes, setScopes] = useState([])

  useEffect(() => {
    let alive = true
    const load = () => {
      api.get('/visas').then(r => alive && setRequests(r)).catch(() => {})
      // /tools/mine, not /tools: the register plus where *this* employee stands
      // on each row, and which models their licence reaches. The comparison used
      // to happen here, which is how the page could show a tool as approved
      // while the gateway refused the prompt.
      api.get('/tools/mine').then(t => { if (alive) { setRegister(t); setLoaded(true) } }).catch(() => {})
      api.get('/profile').then(p => alive && setProfile(p)).catch(() => {})
      api.get('/tools/requestable').then(c => alive && setCatalogue(c)).catch(() => {})
    }
    load()
    // Polled, so an admin approving a request or suspending a tool reaches this
    // page while the employee is looking at it.
    const t = setInterval(load, 4000)
    return () => { alive = false; clearInterval(t) }
  }, [])

  const level = profile.level || 0
  // Level 1 has no tool request feature at all — no button, no modal, no field.
  // The server refuses the request too; this is so the page never offers one.
  const canRequest = catalogue.canRequest && catalogue.tools.length > 0
  const chosen = catalogue.tools.find(t => t.name === picked) || null

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
   *
   * The one register entry left out is the built-in assistant. It is in the
   * register for the Smart Gateway's benefit, not the employee's — it is the
   * product itself, nobody requests access to it, and it was heading the list
   * ahead of the third-party tools this page exists to answer for.
   */
  const tools = useMemo(() => {
    const rows = []
    const seen = new Set()

    const add = (entry, request) => {
      const key = (entry?.name || request?.tool || '').toLowerCase()
      if (!key || seen.has(key)) return
      if (key === BUILT_IN_ASSISTANT.toLowerCase()) return
      seen.add(key)

      const registered = entry?.status || 'UNAPPROVED'
      const pending = request && PENDING_STATUSES.includes(request.status)
      const refused = request && ['DECLINED', 'REDIRECTED'].includes(request.status)

      // The server has already folded the register, this employee's licence
      // level and their own request history into one verdict — the same one the
      // Smart Gateway enforces. The fallback below only covers a row built from
      // a request for a tool the register has never heard of.
      const status = entry?.access
        || (registered === 'BANNED' ? 'banned'
          : registered === 'SUSPENDED' ? 'suspended'
            : registered === 'APPROVED' ? 'active'
              : pending ? 'review'
                : refused ? 'declined'
                  : 'unreviewed')

      const sub = {
        suspended: entry?.suspendedOn ? `Suspended ${entry.suspendedOn}` : 'Paused — cannot be used',
        banned: 'Banned — no prompt is sent here',
        locked: `Unlocks at Level ${entry?.minLevel}`,
        active: entry?.minLevel ? `Approved · Level ${entry.minLevel} scope` : 'Approved for use',
        review: request ? `Requested ${request.submitted} · decision in ~3 days` : 'In review',
        declined: request?.decided ? `Decided ${request.decided}` : 'An alternative was suggested',
        revoked: request?.decided ? `Access withdrawn ${request.decided}` : 'Access withdrawn — request again if needed',
        unreviewed: 'Not approved — request access before using it',
      }[status]

      const vendor = entry?.vendor || request?.vendor || 'Unreviewed vendor'
      // Models already folded for this employee by /api/tools/mine: `tier` says
      // which section a model belongs in, `access` what they may do with it.
      const models = entry?.models || []
      const free = models.filter(m => m.tier === 'free')
      const paid = models.filter(m => m.tier !== 'free')
      const available = models.filter(m => m.approved).length
      const developer = (entry?.category || 'assistant') === 'developer'

      rows.push({
        name: entry?.name || request.tool,
        // The employee's own reference for this tool is the request they
        // raised; an approved tool they never had to ask for has none.
        number: request?.id || '—',
        // The line under the tool name. Vendor first, because "which company
        // is actually receiving this?" is the question a tool name alone does
        // not answer — a lookalike site has the same name as the real thing.
        // Then, for a platform that ships a model picker, how much of that
        // picker this employee may actually use — approving ChatGPT is not
        // approving every model on it, and their licence level decides which of
        // the approved ones they reach.
        subtitle: developer
          ? `${vendor} · Development tool`
          : models.length > 0
            ? `${vendor} · ${available} of ${models.length} models available to you`
            : vendor,
        // The MODEL column shows the newest FREE model, at every licence level.
        // It is the one every employee can actually use; the paid models sit
        // behind the expandable section on the detail sheet.
        model: entry?.displayModel || entry?.model || request?.model || 'Vendor model',
        data: entry?.dataScope || (request?.scopes || []).join(' · ') || 'As declared in the request',
        vendor,
        developer,
        status,
        sub,
        request: request || null,
        flag: entry?.flag || null,
        minLevel: entry?.minLevel || null,
        explain: entry?.explain || null,
        models,
        free,
        paid,
      })
    }

    const requestFor = name =>
      myRequests.find(r => String(r.tool).toLowerCase() === String(name).toLowerCase()) || null

    // What the page lists, by licence level.
    //
    // A Trainee sees the tools that are approved *for them* — the free
    // assistants — and nothing else: a list of things they cannot use is not
    // "my AI tools", it is a catalogue, and it buries the three they can. From
    // Level 2, where tool access requests exist and paid models open, the locked
    // rows become useful information: they are what the next level unlocks, so
    // they are shown with the level that opens them.
    const listLocked = level >= REQUEST_MIN_LEVEL

    for (const entry of register) {
      const listed = entry.access === 'active'
        || entry.status === 'SUSPENDED'
        || entry.status === 'BANNED'
        || (listLocked && entry.access === 'locked')
      if (listed) add(entry, requestFor(entry.name))
    }
    // Then anything this employee has asked about that is not already listed.
    for (const request of myRequests) {
      add(register.find(e => e.name.toLowerCase() === String(request.tool).toLowerCase()), request)
    }
    return rows
  }, [register, myRequests, level])

  const count = s => tools.filter(t => t.status === s).length

  // The paid-model section starts collapsed on every tool: it is the "what else
  // is there?" answer, not the "what can I use?" one, and leaving it open from
  // the last tool would make it look like this tool's default state.
  function openDetail(row) {
    setShowPaid(false)
    setDetail(row)
  }

  // Opening the form picks the first tool on offer, so the common case — one
  // tool available — is one click and Send. The defaults come from the
  // register's own record of the tool, which is what "keep it default" means.
  function openRequest() {
    const first = catalogue.tools[0]
    setPicked(first?.name || null)
    setScopes(first?.scopes || ['Internal', 'Text only'])
    setPurpose('')
    setRequestError('')
    setModal('request')
  }

  function chooseTool(name) {
    const next = catalogue.tools.find(t => t.name === name)
    setPicked(name)
    setScopes(next?.scopes || ['Internal', 'Text only'])
    setRequestError('')
  }

  async function submitRequest() {
    if (!picked || submitting) return
    setSubmitting(true)
    setRequestError('')
    try {
      // Only the two things the employee genuinely knows are theirs to state:
      // which tool, and why. Everything else about it — model, vendor, category
      // — is read from the register by the server, so a request cannot describe
      // a tool differently from the way the organisation has it recorded.
      await api.post('/visas/apply', { tool: picked, purpose, scopes })
      const [nextRequests, nextRegister, nextCatalogue] = await Promise.all([
        api.get('/visas'), api.get('/tools/mine'), api.get('/tools/requestable'),
      ])
      setRequests(nextRequests)
      setRegister(nextRegister)
      setCatalogue(nextCatalogue)
      setModal('sent')
    } catch (err) {
      // The server enforces the same two rules this form does, so a refusal
      // here means the answer changed underneath it — the tool was approved by
      // an admin a moment ago, or a request is already in flight. Saying so
      // beats closing the modal and leaving the employee guessing.
      setRequestError(err?.body?.error || 'The request could not be sent. Please try again.')
      api.get('/tools/requestable').then(setCatalogue).catch(() => {})
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
                {level >= REQUEST_MIN_LEVEL
                  ? 'Use Request tool access and pick from the AI tools your organisation has opened for requests. IT and Compliance review the vendor and the data you want to send it, and you are notified when they decide.'
                  : `Tool access requests unlock at Level ${REQUEST_MIN_LEVEL}. Until then the approved free AI tools above are available to you, and finishing your assigned training is what opens the rest.`}
              </InfoNote>
            </InfoPopover>
          </div>
          <p className="text-[#667085] text-sm mt-1.5 max-w-[720px]">
            The AI tools you are approved to use and the data each one may receive. Higher AI License levels unlock more.
          </p>
        </div>
        {/* Level 1 has no tool request feature at all — there is no button to
            press and no form behind it. The server refuses the request too, so
            this is presentation of a rule rather than the rule itself. */}
        {canRequest && (
          <button
            onClick={openRequest}
            className="border-[1.5px] border-navy-header text-navy-header font-semibold text-sm h-12 px-6 rounded-full cursor-pointer hover:bg-chip shrink-0"
          >
            +&nbsp;&nbsp;Request tool access
          </button>
        )}
      </div>

      {/* Tool access dashboard */}
      <div className="mt-6">
        {/* Summary strip */}
        <div className="bg-[#fafafc] border border-[#e0e0e5] rounded-[10px] min-h-11 sm:h-11 py-2 sm:py-0 flex items-center px-4 sm:px-5 gap-x-5 gap-y-1 flex-wrap">
          <p className="text-[#0a204f] font-bold text-sm">{tools.length} AI tools</p>
          <span className="flex items-center gap-2"><span className="text-[#078b6c] text-xs">●</span><span className="text-[#0a204f] font-semibold text-[13px]">{count('active')} approved</span></span>
          <span className="flex items-center gap-2"><span className="text-[#b27a0d] text-xs">●</span><span className="text-[#0a204f] font-semibold text-[13px]">{count('review')} pending</span></span>
          <span className="flex items-center gap-2"><span className="text-[#c72929] text-xs">■</span><span className="text-[#0a204f] font-semibold text-[13px]">{count('suspended') + count('banned')} blocked</span></span>
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
                  onClick={() => openDetail(t)}
                  className="relative w-full text-left bg-white border border-[#e0e0e5] rounded-[12px] overflow-hidden pl-5 pr-4 py-4 cursor-pointer hover:border-navy-header focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-header"
                >
                  <span className={`absolute left-0 top-0 h-full w-[5px] ${st.bar}`} aria-hidden="true" />
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[#0a204f] font-bold text-base truncate">{t.name}</p>
                      <p className="text-[#667085] text-[11px] mt-0.5 truncate">{t.subtitle}</p>
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
                    onClick={() => openDetail(t)}
                    className={`relative rounded-[8px] overflow-hidden w-full text-left cursor-pointer hover:ring-1 hover:ring-navy-header/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-header ${i % 2 ? 'bg-[#fbfbfc]' : 'bg-white'}`}
                  >
                    <span className={`absolute left-0 top-0 h-full w-[5px] rounded-[3px] ${st.bar}`} aria-hidden="true" />
                    <div className={`${cols} items-center pl-7 pr-5 min-h-[88px] py-4`}>
                      <div>
                        <p className="text-[#0a204f] font-bold text-base">{t.name}</p>
                        <p className="text-[#667085] text-[11px] mt-1">{t.subtitle}</p>
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
            {/* The server's own sentence when it has one — it is the reason the
                gateway will act on, so it must be the reason the employee is
                given. The static copy stays as the fallback. */}
            <p className="text-[#667085] text-[13.5px] mt-3 leading-relaxed">
              {detail.explain || statusExplainer[detail.status]}
            </p>

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

            {/* Which models on this tool the employee may actually pick.
                Approving a tool is not approving everything the vendor ships on
                it, and that distinction is enforced at the checkpoint — so it
                has to be readable here rather than discovered when a prompt is
                refused.

                The free models are on screen because they are the ones every
                licence level can use; the paid ones are behind the toggle
                because at Level 1 they are not yet a choice, and at Level 2 and
                above they are a longer list than the answer to "what can I use
                right now?" needs to be. */}
            {detail.free.length > 0 && (
              <div className="mt-5">
                <p className="text-[#8a7d56] font-semibold text-[11px]">FREE MODELS · AVAILABLE AT EVERY LEVEL</p>
                <div className="flex flex-col gap-1.5 mt-2">
                  {detail.free.map(m => <ModelRow key={m.id} model={m} />)}
                </div>
              </div>
            )}

            {detail.paid.length > 0 && (
              <div className="mt-4">
                <button
                  onClick={() => setShowPaid(v => !v)}
                  aria-expanded={showPaid}
                  className="w-full flex items-center justify-between gap-3 bg-[#f7f6f1] border border-[#e0ddd0] rounded-[10px] px-3.5 py-2.5 cursor-pointer hover:border-[#d8d0b4]"
                >
                  <span className="text-[#8a7d56] font-semibold text-[11px]">
                    PAID MODELS&nbsp;&nbsp;·&nbsp;&nbsp;{detail.paid.filter(m => m.approved).length} of {detail.paid.length} available to you
                  </span>
                  <span className="text-[#2e5ccc] font-semibold text-[12px] shrink-0">
                    {showPaid ? 'Hide' : 'Show'} {showPaid ? '▲' : '▼'}
                  </span>
                </button>
                {showPaid && (
                  <div className="flex flex-col gap-1.5 mt-2.5 px-1">
                    {detail.paid.map(m => <ModelRow key={m.id} model={m} />)}
                    {detail.paid.some(m => m.access === 'locked') && (
                      <p className="text-[#667085] text-[12px] mt-1.5 leading-relaxed">
                        Paid models unlock at AI License Level {detail.paid.find(m => m.access === 'locked')?.minLevel || REQUEST_MIN_LEVEL}.
                        Until then the free models above work as normal, and sensitive prompts are not sent to the locked ones.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {detail.models.some(m => m.access === 'banned') && (
              <p className="text-[#667085] text-[12px] mt-3 leading-relaxed">
                {detail.name} itself is approved. A banned model is different from an unapproved one: <em>nothing</em> is
                sent to it, an ordinary question included. Pick another model and everything works as normal.
              </p>
            )}

            {detail.flag && (
              <div className="bg-[#fae5e5] border border-[#c72929] rounded-[10px] px-3.5 py-3 mt-4">
                <p className="text-[#c72929] font-semibold text-[12.5px]">{detail.flag}</p>
              </div>
            )}
            {detail.models.filter(m => m.flag).map(m => (
              <div key={m.id} className="bg-[#fae5e5] border border-[#c72929] rounded-[10px] px-3.5 py-3 mt-4">
                <p className="text-[#c72929] font-semibold text-[12.5px]">{m.label} · {m.flag}</p>
              </div>
            ))}

            <div className="flex flex-col sm:flex-row gap-3 mt-6">
              <button
                onClick={() => setDetail(null)}
                className="border-[1.5px] border-[#0a204f] text-[#0a204f] font-semibold text-sm w-full sm:w-[160px] h-12 rounded-full cursor-pointer hover:bg-chip"
              >
                Back to AI Tools
              </button>
              {/* A locked tool needs training, not a request; a suspended or
                  banned one cannot be requested at all; a request already in
                  review must not be raised a second time; and below Level 2
                  there is no request feature to offer. */}
              {detail.status === 'locked' ? (
                <Link
                  to="/training"
                  className="bg-[#d9b32c] hover:bg-gold-dark text-[#0a204f] font-semibold text-sm w-full sm:flex-1 h-12 rounded-full flex items-center justify-center"
                >
                  Open my training&nbsp;&nbsp;→
                </Link>
              ) : ['suspended', 'banned', 'review', 'active'].includes(detail.status) ? null
                : canRequest && catalogue.tools.some(t => t.name === detail.name) ? (
                  <button
                    onClick={() => { setDetail(null); chooseTool(detail.name); setPurpose(''); setRequestError(''); setModal('request') }}
                    className="bg-[#d9b32c] hover:bg-gold-dark text-[#0a204f] font-semibold text-sm w-full sm:flex-1 h-12 rounded-full cursor-pointer"
                  >
                    Request access&nbsp;&nbsp;→
                  </button>
                ) : null}
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
            <p className="text-[#667085] text-sm mt-2.5">
              Choose the AI tool you need. Your organisation decides which tools can be requested, so what you pick here
              is already a tool IT and Compliance are willing to review.
            </p>

            {/* The guided selection. This replaced four free-text fields —
                tool name, model, vendor and category — in which an employee
                typed whatever they liked and the approval queue accepted it.
                Everything about the tool now comes from the register, so the
                admin reviews a record rather than a description of one. */}
            <p className="text-[#8a7d56] font-semibold text-[11px] mt-5">SELECT AN AI TOOL</p>
            <div className="flex flex-col gap-2.5 mt-2.5">
              {catalogue.tools.map(t => {
                const on = picked === t.name
                return (
                  <button
                    key={t.name}
                    onClick={() => chooseTool(t.name)}
                    aria-pressed={on}
                    className={`text-left rounded-[12px] border-2 px-4 py-3 cursor-pointer flex items-start gap-3 ${on ? 'bg-[#edf2ff] border-[#0a204f]' : 'bg-white border-[#e0e0e5] hover:border-[#b6bcc9]'}`}
                  >
                    <span className={`w-[18px] h-[18px] rounded-full border-2 mt-0.5 shrink-0 flex items-center justify-center ${on ? 'border-[#0a204f]' : 'border-[#98a2b3]'}`}>
                      {on && <span className="w-2 h-2 rounded-full bg-[#0a204f]" />}
                    </span>
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-baseline gap-x-2">
                        <span className="text-[#0a204f] font-bold text-[15px]">{t.name}</span>
                        <span className="text-[#667085] text-[11.5px]">{t.vendor} · {t.category}</span>
                      </span>
                      <span className="block text-[#0a204f] text-[12.5px] mt-1">{t.model}</span>
                      {t.note && <span className="block text-[#667085] text-[12px] mt-1 leading-relaxed">{t.note}</span>}
                    </span>
                  </button>
                )
              })}
            </div>

            <div className="bg-[#edf2ff] rounded-[12px] px-4 py-2.5 mt-3">
              <p className="text-[#8a7d56] font-semibold text-[11px]">BUSINESS PURPOSE</p>
              <textarea
                value={purpose}
                onChange={e => setPurpose(e.target.value)}
                rows={2}
                placeholder={chosen ? `What you need ${chosen.name} for, in one line.` : 'What you need this tool for, in one line.'}
                className="w-full bg-transparent outline-none text-[15px] text-[#0a204f] placeholder-[#98a2b3] resize-none mt-1"
              />
            </div>

            <p className="text-[#8a7d56] font-semibold text-[11px] mt-4">DECLARED DATA SCOPE · select what the tool may receive</p>
            <div className="flex flex-wrap gap-2 mt-2.5">
              {[...new Set([...(chosen?.scopes || []), ...scopeOptions])].map(s => {
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

            {requestError && (
              <div className="bg-[#fae5e5] border border-[#c72929] rounded-[10px] px-3.5 py-3 mt-4">
                <p className="text-[#c72929] text-[12.5px]">{requestError}</p>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 mt-6">
              <button onClick={() => setModal(null)} className="border-[1.5px] border-[#0a204f] text-[#0a204f] font-semibold text-sm w-full sm:w-[176px] h-12 rounded-full cursor-pointer hover:bg-chip">
                Cancel
              </button>
              {/* w-full before sm: in a column flex container `flex-1` resolves
                  against the vertical axis, which zeroed the basis and collapsed
                  this button to a ~20px sliver on a phone — the one control that
                  actually submits the request. It only shares the row from sm. */}
              <button onClick={submitRequest} disabled={submitting || !picked} className="bg-[#d9b32c] hover:bg-gold-dark text-[#0a204f] font-semibold text-sm w-full sm:flex-1 h-12 rounded-full cursor-pointer disabled:opacity-60">
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
            <p className="text-[#667085] text-sm mt-5">{picked}{chosen ? ` (${chosen.model})` : ''} is now with IT and Compliance. Typical decision: 3 working days.</p>
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
