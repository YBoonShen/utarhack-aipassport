// 08 Employee · My Visas — matches Figma frames "08 / 08A / 08B Employee • My Visas"
import { useState } from 'react'

const approved = [
  { name: 'ChatGPT', status: 'APPROVED AT LVL 1', color: 'emerald', note: 'Internal non-personal data only' },
  { name: 'Gemini', status: 'APPROVED AT LVL 2', color: 'emerald', note: 'Internal + drafting with masking on' },
]
const other = [
  { name: 'GitHub Copilot', status: 'NOT APPROVED AT LVL 2', color: 'red', note: 'Requires Level 3 · Engineering only', requestable: true },
  { name: 'SummarizerX', status: 'REQUESTED · UNDER REVIEW', color: 'amber', note: 'Submitted 2 days ago', requestable: false },
]
const howItWorks = [
  'Locate the tool you want and check its required license level.',
  'Apply and describe the specific task the tool will support.',
  'IT and Compliance review the vendor and data access scope.',
  'You’re notified as soon as a decision is made — usually within 2 working days.',
]

function ToolCard({ tool, onApply }) {
  const badge = { emerald: 'bg-emerald-100 text-emerald-800', red: 'bg-red-100 text-red-800', amber: 'bg-amber-100 text-amber-800' }[tool.color]
  return (
    <div className="bg-card border-2 border-[#d8cfae] rounded-2xl p-5">
      <p className="font-bold text-navy">{tool.name}</p>
      <span className={`inline-block mt-2 text-[10px] font-bold px-2.5 py-1 rounded-full ${badge}`}>{tool.status}</span>
      <p className="text-xs text-gray-500 mt-2">{tool.note}</p>
      {tool.requestable && (
        <button onClick={onApply} className="mt-4 bg-gold hover:bg-gold-dark text-navy font-bold px-4 py-2 rounded-full text-xs">
          Apply for visa →
        </button>
      )}
    </div>
  )
}

export default function Visas() {
  const [modal, setModal] = useState(null) // 'confirm' | 'sent'
  const [target, setTarget] = useState(null)

  function apply(tool) {
    setTarget(tool)
    setModal('confirm')
  }

  return (
    <div className="max-w-[1360px] mx-auto px-10 py-8">
      <h1 className="text-3xl font-bold text-navy">My Visas — Approved AI Tools</h1>
      <p className="text-gray-500 text-sm mt-1 mb-6">Each tool your department has approved. Apply for new access below.</p>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        <div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {approved.map(t => <ToolCard key={t.name} tool={t} />)}
            {other.map(t => <ToolCard key={t.name} tool={t} onApply={() => apply(t)} />)}
          </div>

          <div className="mt-8">
            <h2 className="text-xl font-bold text-navy mb-3">How visas work</h2>
            <div className="bg-card border-2 border-[#d8cfae] rounded-2xl p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {howItWorks.map((step, i) => (
                <div key={i} className="flex gap-3">
                  <div className="w-6 h-6 rounded-full bg-navy text-gold text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</div>
                  <p className="text-sm text-gray-700">{step}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-navy rounded-2xl p-6 text-white h-fit">
          <p className="text-gold text-xs font-bold tracking-[0.18em] mb-3">REQUEST STATUS</p>
          <p className="text-4xl font-bold">2.4 <span className="text-sm font-normal text-slate-300">days avg.</span></p>
          <p className="text-xs text-slate-300 mt-1">Average application turnaround time</p>
          <div className="mt-4 bg-[#1c3572] rounded-lg px-4 py-3 text-xs text-slate-200">
            To request a tool that isn’t listed, contact your admin directly.
          </div>
        </div>
      </div>

      {modal === 'confirm' && target && (
        <div className="fixed inset-0 bg-navy-dark/60 flex items-center justify-center p-6 z-50">
          <div className="bg-cream border-[3px] border-navy rounded-2xl max-w-md w-full overflow-hidden">
            <div className="bg-navy px-7 py-5">
              <p className="text-white font-bold text-lg">Apply for a {target.name} Visa?</p>
              <p className="text-gold text-xs mt-1">Your IT and Compliance team will review the vendor, business purpose and data access scope before approving.</p>
            </div>
            <div className="p-7">
              <p className="text-[11px] font-bold tracking-[0.15em] text-[#8a7f60] mb-2">WHAT HAPPENS NEXT</p>
              <ul className="text-sm text-gray-700 flex flex-col gap-1.5 list-disc pl-5">
                <li>Complete a short business-purpose form</li>
                <li>Vendor and data access categories are reviewed</li>
                <li>Approved within 2–5 working days</li>
              </ul>
              <div className="mt-6 flex gap-3">
                <button onClick={() => setModal(null)} className="border-2 border-navy text-navy px-6 py-2.5 rounded-full text-sm flex-1">Not now</button>
                <button onClick={() => setModal('sent')} className="bg-gold hover:bg-gold-dark text-navy font-bold px-6 py-2.5 rounded-full text-sm flex-1">Yes, apply</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {modal === 'sent' && target && (
        <div className="fixed inset-0 bg-navy-dark/60 flex items-center justify-center p-6 z-50">
          <div className="bg-cream border-[3px] border-navy rounded-2xl max-w-sm w-full overflow-hidden text-center">
            <div className="p-8">
              <div className="w-14 h-14 mx-auto rounded-full bg-gold flex items-center justify-center text-navy text-2xl font-bold">✓</div>
              <p className="text-navy font-bold text-lg mt-4">Application Request Sent</p>
              <p className="text-sm text-gray-600 mt-2">
                Your request for {target.name} is queued. Complete the short form so reviewers have enough context to make a timely decision.
              </p>
              <div className="mt-4 bg-card border border-[#d8cfae] rounded-lg p-4 text-left text-xs text-gray-600">
                <p className="font-bold text-navy mb-1">SUGGESTED NEXT STEP</p>
                <p>Describe the specific task this tool will support, then submit for IT/Compliance review.</p>
              </div>
              <button onClick={() => { setModal(null); setTarget(null) }} className="mt-6 bg-gold hover:bg-gold-dark text-navy font-bold px-6 py-2.5 rounded-full text-sm w-full">
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
