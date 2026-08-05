// 02 Employee · Prompt Protection Modal — matches Figma frame "02 Employee • Prompt Protection Modal".
// LIVE demo: POST /api/detect really masks the prompt before the Checkpoint modal opens.
//
// The tool selector is what makes the unapproved-tool rule demonstrable without
// installing the Chrome extension. Picking a tool tells the gateway where the
// prompt is heading, exactly as the extension does when it arms the checkpoint
// on a page — and a tool with no visa raises the same risk alert either way.
import { useEffect, useState } from 'react'
import { api, logFailure, SERVICE_UNAVAILABLE } from '../lib/api.js'

// Render masked text with [MASKED-*] tokens as green protected chips, like the Figma
function ProtectedText({ text }) {
  const parts = text.split(/(\[MASKED-[A-Z-]+\])/g)
  return (
    <p className="text-[#344054] text-sm leading-[2]">
      {parts.map((part, i) =>
        /^\[MASKED-[A-Z-]+\]$/.test(part) ? (
          <span key={i} className="bg-[#e9f8f2] border border-[#078b6c] text-[#047857] font-semibold text-[13px] rounded-[7px] px-2 py-0.5 mx-0.5">
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </p>
  )
}

// Shown until GET /tools answers, so the picker is never empty.
const FALLBACK_TOOLS = [{ name: 'AI Assistant', vendor: 'Internal', status: 'APPROVED' }]

export default function Gateway() {
  const [prompt, setPrompt] = useState('')
  const [result, setResult] = useState(null) // { masked, detections } -> modal open
  const [checkedPrompt, setCheckedPrompt] = useState('')
  const [messages, setMessages] = useState([])
  const [showWhy, setShowWhy] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [tools, setTools] = useState(FALLBACK_TOOLS)
  const [tool, setTool] = useState('AI Assistant')

  // The approved-tool register — the same list the admin curates on Tool
  // Approvals, so what counts as approved here is never a second opinion.
  useEffect(() => {
    let alive = true
    api.get('/tools').then(t => alive && t.length && setTools(t)).catch(() => {})
    return () => { alive = false }
  }, [])

  const selected = tools.find(t => t.name === tool) || FALLBACK_TOOLS[0]
  const unapproved = selected.status !== 'APPROVED'

  // Choosing a tool is the event: it tells the gateway where prompts are about
  // to go. An unapproved one is recorded and alerted on immediately, before any
  // prompt is typed — which is the point, since the alert is about the tool.
  function chooseTool(name) {
    setTool(name)
    api.post('/gateway/tool-use', { tool: name }).catch(err => logFailure('tool check', err))
  }

  async function send() {
    if (!prompt.trim() || loading) return
    setLoading(true); setError(null)
    try {
      const data = await api.post('/detect', { prompt, tool })
      if (data.detections && data.detections.length > 0) {
        setCheckedPrompt(prompt)
        setResult(data)
        setShowWhy(false)
      } else {
        deliver(prompt)
      }
    } catch (err) {
      // Same split as sign-in: the employee is told the prompt was not sent, the
      // console keeps the reason it was not.
      logFailure('prompt check', err)
      setError(SERVICE_UNAVAILABLE)
    } finally {
      setLoading(false)
    }
  }

  // Warn-only mode: sending the original is allowed but penalised (-20, streak reset)
  async function sendOriginal() {
    try {
      await api.post('/gateway/override', { prompt: checkedPrompt })
    } catch (err) {
      // The override still goes through for the employee; only the record of it
      // is lost, which is a developer's problem and not a message for them.
      logFailure('override record', err)
    }
    deliver(checkedPrompt, 0)
  }

  // Matches Figma "02·0 AI Assistant (replied)" — masked bubbles carry a small
  // "N sensitive items masked" pill, and the assistant answers with a draft.
  function deliver(text, maskedCount = itemCount) {
    setMessages(m => [
      ...m,
      { role: 'user', text, maskedCount },
      {
        role: 'ai',
        title: 'Draft ready',
        subject: 'Subject: Friendly reminder — outstanding invoice',
        text: 'Hello, I hope you’re well. This is a friendly reminder regarding the item discussed above — let me know if you’d like any changes.',
      },
    ])
    setPrompt('')
    setResult(null)
  }

  const itemCount = result ? result.detections.reduce((n, d) => n + (d.count || 1), 0) : 0
  const detectedSummary = result ? result.detections.map(d => d.type).join(' + ') : ''
  const mode = result?.mode || 'Mask and continue' // admin's protection mode really applies here
  const blocked = mode === 'Block'

  return (
    // Below lg the employee header also renders a nav strip (~44px), so the
    // chat column accounts for both bars; at lg+ it is the original 80px.
    <div className="bg-[#eef2f7] min-h-[calc(100vh-124px)] lg:min-h-[calc(100vh-80px)] flex">
      {/* Chat sidebar */}
      <aside className="bg-white border-r border-[#e4e7ec] w-[250px] shrink-0 px-7 py-7 hidden lg:block">
        <p className="text-navy-header font-bold text-[17px]">AI CHAT</p>
        <button
          onClick={() => { setMessages([]); setPrompt(''); setResult(null) }}
          className="bg-[#f2f4f7] hover:bg-[#e4e7ec] rounded-[12px] w-full h-12 mt-5 px-4 text-left text-[#344054] text-sm font-medium cursor-pointer"
        >
          +&nbsp;&nbsp;New chat
        </button>
        <div className="flex flex-col gap-4 mt-4">
          <div className="bg-[#f2f4f7] rounded-[10px] h-11" />
          <div className="bg-[#f2f4f7] rounded-[10px] h-11" />
          <div className="bg-[#f2f4f7] rounded-[10px] h-11" />
        </div>
      </aside>

      {/* Chat area */}
      <div className="flex-1 min-w-0 flex flex-col px-4 sm:px-10 lg:px-20">
        <div className="pt-7 pb-4 border-b border-[#d0d5dd]">
          <p className="text-navy-header font-bold text-2xl text-center">{selected.name}</p>
          {/* Which tool the prompt is heading for. Approved tools are neutral;
              anything without a visa is marked here and on the admin's queue. */}
          <div className="flex flex-wrap items-center justify-center gap-2 mt-3">
            <span className="text-[#667085] text-[11px] font-semibold">SENDING TO</span>
            {tools.map(t => {
              const active = t.name === tool
              const ok = t.status === 'APPROVED'
              return (
                <button
                  key={t.name}
                  onClick={() => chooseTool(t.name)}
                  title={`${t.vendor} · ${t.status}`}
                  className={`text-[11px] font-semibold px-3 py-1.5 rounded-full cursor-pointer border ${
                    active
                      ? ok ? 'bg-navy-header border-navy-header text-white' : 'bg-[#d97706] border-[#d97706] text-white'
                      : ok ? 'bg-white border-[#d0d5dd] text-[#344054] hover:border-navy-header' : 'bg-[#fff5de] border-[#e8c877] text-[#8a6410] hover:border-[#d97706]'
                  }`}
                >
                  {t.name}
                  {!ok && <span className="ml-1.5">⚠</span>}
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex-1 flex flex-col gap-4 py-8 overflow-y-auto">
          {/* Guide, don't punish: the tool is not blocked and the prompt is
              still protected — the employee is told what is missing and how to
              fix it, and the same finding reaches the admin's queue. */}
          {unapproved && (
            <div className="bg-[#fff5de] border border-[#e8c877] rounded-[12px] px-4 py-3 self-center max-w-[560px]">
              <p className="text-[#8a6410] font-semibold text-[13px]">{selected.name} is not an approved tool</p>
              <p className="text-[#8a6410] text-xs mt-1">
                It has no approved access, so there are no agreed terms for what it does with company data. Your prompts are
                still protected by the Smart Gateway. Request tool access from AI Tools before putting company data in it.
              </p>
            </div>
          )}
          {messages.length === 0 && (
            <p className="text-[#667085] text-base text-center mt-32">
              {unapproved ? 'Pick an approved tool, or request access for this one.' : 'Start a conversation with your approved AI tool.'}
            </p>
          )}
          {messages.map((m, i) =>
            m.role === 'user' ? (
              <div key={i} className="max-w-[85%] sm:max-w-[70%] self-end bg-[#eaf0ff] border border-[#94adff] text-[#111d35] rounded-2xl px-5 py-3.5">
                <ProtectedText text={m.text} />
                {m.maskedCount > 0 && (
                  <span className="inline-flex items-center gap-1.5 bg-[#e6faf2] rounded-full px-3 py-1 mt-2.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#05946e]" />
                    <span className="text-[#05946e] font-semibold text-[11px]">{m.maskedCount} sensitive item{m.maskedCount === 1 ? '' : 's'} masked</span>
                  </span>
                )}
              </div>
            ) : (
              <div key={i} className="max-w-[85%] sm:max-w-[70%] self-start bg-white border border-[#e4e7ec] text-[#344054] rounded-2xl px-5 py-3.5">
                <p className="font-semibold text-sm">{m.title}</p>
                {m.subject && <p className="text-sm mt-2">{m.subject}</p>}
                <p className="text-sm mt-2">{m.text}</p>
              </div>
            )
          )}
          {error && <p className="text-red-alert text-sm text-center">{error}</p>}
        </div>

        {/* Prompt composer */}
        <div className="pb-8">
          <div className="bg-white border border-[#98a2b3] rounded-[32px] h-16 flex items-center pl-6 pr-2">
            <input
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && send()}
              placeholder="Type a prompt…"
              className="flex-1 outline-none text-sm text-[#344054] placeholder-[#98a2b3] bg-transparent"
            />
            <button
              onClick={send}
              disabled={loading}
              className="bg-gold-brand hover:bg-gold text-navy-header font-semibold text-sm rounded-full px-7 h-12 cursor-pointer disabled:opacity-50"
            >
              {loading ? 'Checking…' : 'Send'}
            </button>
          </div>
          <p className="text-[#98a2b3] text-[11px] text-center mt-2.5">Protected by AI Passport Smart Gateway — sensitive data is masked before it leaves your browser.</p>
        </div>
      </div>

      {/* Smart Gateway modal */}
      {result && (
        <div className="fixed inset-0 bg-[rgba(7,24,58,0.52)] flex items-center justify-center p-4 sm:p-6 z-50">
          <div className="bg-[#f8f5ea] border-2 border-navy-header rounded-[20px] shadow-[0px_16px_36px_0px_rgba(0,0,0,0.28)] w-full max-w-[860px] overflow-hidden max-h-[92vh] overflow-y-auto">
            <div className="bg-navy-header px-4 sm:px-7 py-6 flex items-center gap-4">
              <div className="w-[52px] h-[52px] rounded-[16px] border-2 border-gold-brand flex items-center justify-center shrink-0">
                <span className="text-gold-brand font-bold text-2xl">✓</span>
              </div>
              <div>
                <p className="text-white font-bold text-[22px]">Checkpoint — Smart Gateway</p>
                <p className="text-[#fde68a] text-[13px] mt-0.5">
                  {blocked
                    ? `${itemCount} sensitive item${itemCount === 1 ? '' : 's'} found. Company policy blocks this prompt — edit it and try again.`
                    : `${itemCount} sensitive item${itemCount === 1 ? '' : 's'} found. Review the protected version before sending.`}
                </p>
              </div>
            </div>

            <div className="px-4 sm:px-7 py-6">
              <p className="text-[#8a7d56] font-semibold text-[11px] tracking-[1.1px]">YOUR ORIGINAL PROMPT</p>
              <div className="bg-white border border-[#d8d0b4] rounded-[12px] px-4 py-3.5 mt-2 min-h-[76px]">
                <p className="text-[#344054] text-sm leading-relaxed">{checkedPrompt}</p>
              </div>

              <p className="text-[#8a7d56] font-semibold text-[11px] tracking-[0.88px] mt-5">PROTECTED VERSION · WHAT THE AI TOOL WILL RECEIVE</p>
              <div className="bg-[#f3fbf7] border border-[#078b6c] rounded-[12px] px-4 py-3.5 mt-2 min-h-[76px]">
                <ProtectedText text={result.masked} />
              </div>

              <div className="bg-white border border-[#d8d0b4] rounded-[10px] px-4 h-14 mt-5 flex items-center gap-3">
                <span className="w-3 h-3 rounded-full bg-[#078b6c] shrink-0" />
                <p className="text-[#667085] text-xs">
                  Detected: {detectedSummary}
                  {result.layer2 && result.layer2 !== 'none' && (
                    <>&nbsp;&nbsp;·&nbsp;&nbsp;Layer 2: {result.layer2 === 'gemini' ? 'Gemini AI' : 'context heuristic'}</>
                  )}
                  &nbsp;&nbsp;·&nbsp;&nbsp;Audit records store only the masked version
                </p>
              </div>

              {showWhy && (
                <div className="bg-[#eef2ff] rounded-[10px] px-4 py-3 mt-3">
                  <p className="text-[#365fd9] text-xs">
                    Personal identifiers (names, IC/passport numbers, phone numbers, credentials, financial figures) can identify a specific
                    person. Masking them keeps the prompt useful while your company’s data never leaves the browser.
                  </p>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3 mt-6">
                {!blocked && (
                  <button onClick={() => deliver(result.masked)} className="bg-gold-brand hover:bg-gold text-navy-header font-semibold text-sm w-full sm:w-[316px] h-12 rounded-full cursor-pointer">
                    Send protected version&nbsp;&nbsp;→
                  </button>
                )}
                {mode === 'Warn only' && (
                  <button onClick={sendOriginal} className="border border-[#d92d20] text-[#d92d20] font-semibold text-sm px-5 h-12 rounded-full cursor-pointer hover:bg-[#fff0f0]">
                    Send original anyway (-20 pts)
                  </button>
                )}
                <button onClick={() => setResult(null)} className="border border-navy-header text-navy-header font-semibold text-sm w-full sm:w-[180px] h-12 rounded-full cursor-pointer hover:bg-white">
                  Edit prompt
                </button>
                <button onClick={() => setShowWhy(w => !w)} className="text-[#8a7d56] font-semibold text-sm px-4 h-12 cursor-pointer">
                  Why was this masked?
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
