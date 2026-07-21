// 08 Employee · My Visas — matches Figma frame "08 Employee • My Visas"
// (table layout) plus "Modal / Request new tool" and "Modal / Request
// submitted". Live data: SummarizerX status and the license level come from
// the backend; "Request a new AI tool" posts a real request to admin.
import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'

// Data-scope chips shown in the request modal (Figma: Internal + Meeting notes
// selected by default).
const scopeOptions = ['Internal', 'Meeting notes', 'No customer data', 'No audio']

// Status → chip + left status-bar colours, matching Figma.
const statusStyle = {
  active: { chip: 'bg-[#e7f4ee] text-[#078b6c]', label: '● Active', bar: 'bg-[#078b6c]' },
  locked: { chip: 'bg-[#ededf2] text-[#667085]', label: '● Locked', bar: 'bg-[#80858f]' },
  review: { chip: 'bg-[#fcf0d4] text-[#b27a0d]', label: '● Under review', bar: 'bg-[#d9991a]' },
  suspended: { chip: 'bg-[#fae5e5] text-[#c72929]', label: '● Suspended', bar: 'bg-[#c72929]' },
  declined: { chip: 'bg-[#fae5e5] text-[#c72929]', label: '● Declined', bar: 'bg-[#c72929]' },
}

const levels = [
  { n: 1, name: 'Trainee', desc: 'Everyone starts here. Basic approved AI for everyday, non-sensitive tasks.', badge: 'LEVEL 1' },
  { n: 2, name: 'Navigator', desc: 'Unlocked by finishing the 3 core AI-safety modules. Can request standard tools like ChatGPT and Gemini.', badge: 'LEVEL 2' },
  { n: 3, name: 'Ambassador', desc: 'Needs the Advanced AI-safety path — modules coming soon.', badge: 'COMING SOON' },
  { n: 4, name: 'Guardian', desc: 'By nomination. Mentors others and helps review AI requests.', badge: 'BY NOMINATION' },
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
  const [profile, setProfile] = useState({ level: 2 })
  const [submitting, setSubmitting] = useState(false)

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
      api.get('/profile').then(p => alive && setProfile(p)).catch(() => {})
    }
    load()
    const t = setInterval(load, 4000)
    return () => { alive = false; clearInterval(t) }
  }, [])

  const level = profile.level || 2
  const copilotUnlocked = level >= 3 // Level 3 · Ambassador unlocks source-code tools
  const summarizerApproved = requests.some(r => r.tool === 'SummarizerX' && r.status === 'APPROVED')
  const summarizerDeclined = requests.some(r => r.tool === 'SummarizerX' && ['DECLINED', 'REDIRECTED'].includes(r.status))
  const summarizerStatus = summarizerApproved ? 'active' : summarizerDeclined ? 'declined' : 'review'

  const tools = [
    { name: 'ChatGPT', number: 'V-0031', model: 'GPT-5.1', data: 'Internal · non-personal', status: 'active', sub: 'Renews in 45 days' },
    { name: 'Gemini', number: 'V-0032', model: 'Gemini 3 Flash', data: 'Internal · non-personal', status: 'active', sub: 'Renews in 78 days' },
    { name: 'GitHub Copilot', number: copilotUnlocked ? 'V-0034' : '—', model: 'GPT-5.1-Codex', data: 'Source code · repos', status: copilotUnlocked ? 'active' : 'locked', sub: copilotUnlocked ? 'Renews in 90 days' : 'Needs Level 3' },
    { name: 'SummarizerX', number: summarizerApproved ? 'V-0033' : 'A-0492', model: summarizerApproved ? 'Vendor model' : 'Vendor model (in review)', data: 'Meeting notes', status: summarizerStatus, sub: summarizerApproved ? 'Renews in 90 days' : summarizerDeclined ? 'Alternative suggested' : 'Decision in ~3 days' },
    { name: 'Fable 5', number: 'V-0028', model: 'Claude Fable 5', data: 'General', status: 'suspended', sub: 'Paused — can’t run' },
  ]

  const count = s => tools.filter(t => t.status === s).length

  async function submitRequest() {
    if (!toolName.trim() || submitting) return
    setSubmitting(true)
    try {
      await api.post('/visas/apply', { tool: toolName, purpose, scopes })
      setRequests(await api.get('/visas'))
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
    <div className="max-w-[1440px] mx-auto px-10 py-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[30px] font-bold text-navy-header">My Visas — Approved AI Tools</h1>
          <p className="text-[#667085] text-sm mt-1.5 max-w-[720px]">Your visas show which AI tools you can use and with what data. Higher license levels unlock more.</p>
        </div>
        <button
          onClick={() => setModal('request')}
          className="border-[1.5px] border-navy-header text-navy-header font-semibold text-sm h-12 px-6 rounded-full cursor-pointer hover:bg-chip shrink-0"
        >
          +&nbsp;&nbsp;Request a new AI tool
        </button>
      </div>

      {/* Visa dashboard */}
      <div className="mt-6">
        {/* Summary strip */}
        <div className="bg-[#fafafc] border border-[#e0e0e5] rounded-[10px] h-11 flex items-center px-5 gap-5 flex-wrap">
          <p className="text-[#0a204f] font-bold text-sm">{tools.length} AI tools</p>
          <span className="flex items-center gap-2"><span className="text-[#078b6c] text-xs">●</span><span className="text-[#0a204f] font-semibold text-[13px]">{count('active')} active</span></span>
          <span className="flex items-center gap-2"><span className="text-[#b27a0d] text-xs">●</span><span className="text-[#0a204f] font-semibold text-[13px]">{count('review')} under review</span></span>
          <span className="flex items-center gap-2"><span className="text-[#c72929] text-xs">■</span><span className="text-[#0a204f] font-semibold text-[13px]">{count('suspended')} suspended</span></span>
          <span className="flex items-center gap-2"><span className="text-[#667085] text-xs">🔒</span><span className="text-[#0a204f] font-semibold text-[13px]">{count('locked')} needs Level 3</span></span>
        </div>

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
              <div key={t.name} className={`relative rounded-[8px] overflow-hidden ${i % 2 ? 'bg-[#fbfbfc]' : 'bg-white'}`}>
                <div className={`absolute left-0 top-0 h-full w-[5px] rounded-[3px] ${st.bar}`} />
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
              </div>
            )
          })}
        </div>
      </div>

      {/* AI literacy levels */}
      <div className="bg-white border border-[#d8d0b4] rounded-[16px] p-7 mt-6">
        <p className="text-[#0a204f] font-bold text-base">AI literacy levels — what each level means</p>
        <p className="text-[#667085] text-[13px] mt-2 max-w-[1000px]">
          Finish the 3 core AI-safety modules to reach Level 2. Higher levels need advanced training (coming soon). Access to sensitive data always still depends on your job role and admin approval.
        </p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-5">
          {levels.map(l => {
            const done = l.n < level
            const cur = l.n === level
            return (
              <div key={l.n} className={`rounded-[12px] border p-4 h-[120px] ${cur ? 'bg-[#0a204f] border-2 border-[#d9b32c]' : done ? 'bg-white border-[#e0e0e5]' : 'bg-[#f2f2f5] border-[#e0e0e5]'}`}>
                <div className="flex justify-between items-start">
                  <p className={`font-semibold text-[10px] ${cur ? 'text-[#d9b32c]' : done ? 'text-[#667085]' : 'text-[#999ea8]'}`}>LEVEL {l.n}</p>
                  <span className={`font-bold text-[9px] rounded-full px-2 py-1 ${cur ? 'bg-[#d9b32c] text-[#0a204f]' : done ? 'bg-[#e5f4ed] text-[#328768]' : 'bg-[#e5e5eb] text-[#999ea8]'}`}>
                    {cur ? 'YOU ARE HERE' : done ? '✓ DONE' : l.badge}
                  </span>
                </div>
                <p className={`font-bold text-lg mt-1 ${cur ? 'text-white' : done ? 'text-[#0a204f]' : 'text-[#737882]'}`}>{l.name}</p>
                <p className={`text-[12.5px] mt-2 leading-snug ${cur ? 'text-[#cbd5e1]' : done ? 'text-[#667085]' : 'text-[#999ea8]'}`}>{l.desc}</p>
              </div>
            )
          })}
        </div>
      </div>

      {/* Request a new AI tool — matches Figma "Modal / Request new tool" */}
      {modal === 'request' && (
        <div className="fixed inset-0 bg-navy-dark/50 flex items-center justify-center p-6 z-50" onClick={() => setModal(null)}>
          <div className="bg-[#fffefa] border-[1.5px] border-[#0a204f] rounded-[20px] shadow-[0px_10px_30px_0px_rgba(0,0,0,0.22)] w-full max-w-[600px] p-[30px] max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <p className="text-[#d9b32c] font-semibold text-[11px]">NEW TOOL REQUEST · SENT TO ADMIN</p>
            <p className="text-[#0a204f] font-bold text-[26px] mt-1.5">Request a new AI tool</p>
            <p className="text-[#667085] text-sm mt-2.5">Tell IT what tool and model you want and why. They review the vendor and data scope before approving.</p>

            <div className="grid grid-cols-2 gap-3 mt-5">
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

            <div className="flex gap-3 mt-6">
              <button onClick={() => setModal(null)} className="border-[1.5px] border-[#0a204f] text-[#0a204f] font-semibold text-sm w-[176px] h-12 rounded-full cursor-pointer hover:bg-chip">
                Cancel
              </button>
              <button onClick={submitRequest} disabled={submitting || !toolName.trim()} className="bg-[#d9b32c] hover:bg-gold-dark text-[#0a204f] font-semibold text-sm flex-1 h-12 rounded-full cursor-pointer disabled:opacity-60">
                {submitting ? 'Sending…' : 'Send request to admin  →'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Request submitted — matches Figma "Modal / Request submitted" */}
      {modal === 'sent' && (
        <div className="fixed inset-0 bg-navy-dark/50 flex items-center justify-center p-6 z-50" onClick={() => setModal(null)}>
          <div className="bg-[#fffefa] border-[1.5px] border-[#328768] rounded-[20px] shadow-[0px_10px_30px_0px_rgba(0,0,0,0.22)] w-full max-w-[520px] p-[30px]" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-[32px] bg-[#e7f1ec] border-2 border-[#328768] flex items-center justify-center text-[#19533e] text-[28px] font-bold shrink-0">✓</div>
              <div>
                <p className="text-[#19533e] font-semibold text-[11px]">REQUEST SUBMITTED</p>
                <p className="text-[#0a204f] font-bold text-[22px] mt-0.5">Sent to admin for review</p>
              </div>
            </div>
            <p className="text-[#667085] text-sm mt-5">{toolName} ({model}) is now with IT and Compliance. Typical decision: 3 working days.</p>
            <p className="text-[#667085] text-sm mt-3">You will get a notification when it is approved, and the tool will appear in your visa list.</p>
            <button onClick={() => setModal(null)} className="bg-[#d9b32c] hover:bg-gold-dark text-[#0a204f] font-semibold text-sm w-full h-12 rounded-full mt-7 cursor-pointer">
              Back to my visas&nbsp;&nbsp;→
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
