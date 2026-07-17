// 08 Employee · My Visas — matches Figma frames "08 / 08A / 08B Employee • My Visas"
import { useState } from 'react'
import { Link } from 'react-router-dom'

const principles = [
  ['License grants baseline access', 'Your license level automatically unlocks approved tools and permitted data categories.'],
  ['Apply once for another tool', 'IT and compliance review the vendor, data use, and business need together.'],
  ['Guidance, not punishment', 'When an unapproved tool is detected, an approved alternative is offered immediately.'],
  ['Gateway enforces each visa', 'The Smart Gateway masks prohibited data before a prompt reaches the AI provider.'],
]

function ApprovedVisa({ name, number, machineLine }) {
  return (
    <div className="bg-white border border-[#078b6c] rounded-[16px] overflow-hidden flex flex-col">
      <div className="bg-[#078b6c] h-12 flex items-center justify-between px-4.5">
        <p className="text-white font-bold text-[11px] tracking-[1.1px]">VISA · APPROVED AI TOOL</p>
        <p className="text-[#d1fae5] font-semibold text-[10px]">NO. {number}</p>
      </div>
      <div className="px-5 flex-1">
        <div className="flex items-center justify-between mt-6">
          <p className="text-navy-header font-bold text-xl">{name}</p>
          <span className="border-2 border-[#078b6c] text-[#078b6c] font-bold text-[9px] rounded-full px-2.5 py-3">✓ GRANTED</span>
        </div>
        <div className="flex gap-14 mt-5 mb-4">
          <div>
            <p className="text-[#8a7d56] font-semibold text-[9px] tracking-[0.72px]">PERMITTED DATA</p>
            <p className="text-[#475467] text-[11px] mt-1">General · Internal (non-personal)</p>
          </div>
          <div>
            <p className="text-[#8a7d56] font-semibold text-[9px] tracking-[0.72px]">VALID FOR</p>
            <p className="text-[#475467] text-[11px] mt-1">Level 2 and above</p>
          </div>
        </div>
      </div>
      <div className="bg-[#e9f8f2] h-10 flex items-center px-4.5">
        <p className="text-[#475467] font-medium text-[10px] tracking-wide">{machineLine}</p>
      </div>
    </div>
  )
}

export default function Visas() {
  const [modal, setModal] = useState(null) // 'confirm' | 'sent'

  return (
    <div className="max-w-[1440px] mx-auto px-10 py-8">
      <h1 className="text-[30px] font-bold text-navy-header">My Visas — Approved AI Tools</h1>
      <p className="text-[#667085] text-sm mt-1.5 mb-6">Your Level 2 license grants these tool visas. Higher levels unlock more data categories.</p>

      <div className="grid grid-cols-[1fr_436px] gap-6">
        <div className="grid grid-cols-2 gap-4 content-start">
          <ApprovedVisa name="ChatGPT" number="V-0031" machineLine="V<AIP<CHATGPT<<GENERAL<TEXT<CODE<<<<<<<" />
          <ApprovedVisa name="Gemini" number="V-0032" machineLine="V<AIP<GEMINI<<GENERAL<TEXT<IMAGE<<<<<<<<" />

          {/* Locked visa */}
          <div className="bg-white border border-dashed border-[#98a2b3] rounded-[16px] overflow-hidden">
            <div className="bg-[#667085] h-12 flex items-center px-4.5">
              <p className="text-white font-bold text-[11px] tracking-[1.1px]">VISA LOCKED · LEVEL 3 REQUIRED</p>
            </div>
            <div className="px-5 pb-5">
              <p className="text-[#667085] font-bold text-xl mt-4.5">GitHub Copilot</p>
              <p className="text-[#667085] text-xs mt-2.5">Source code · Internal repositories</p>
              <p className="text-[#98a2b3] font-medium text-[11px] mt-1.5">Unlocks at Level 3 · Ambassador</p>
              <Link to="/training" className="inline-block border border-gold-brand text-[#b48a00] font-semibold text-xs rounded-full px-10 py-3.5 mt-9 hover:bg-chip">
                760 points to unlock · train now
              </Link>
            </div>
          </div>

          {/* Requested visa */}
          <div className="bg-white border border-dashed border-[#d97706] rounded-[16px] overflow-hidden">
            <div className="bg-[#d97706] h-12 flex items-center px-4.5">
              <p className="text-white font-bold text-[11px] tracking-[1.1px]">VISA REQUIRED · NOT YET APPROVED</p>
            </div>
            <div className="px-5 pb-5">
              <p className="text-navy-header font-bold text-xl mt-4.5">SummarizerX</p>
              <p className="text-[#667085] text-[11px] mt-2">Detected in your browsing · 12 colleagues also use it</p>
              <p className="text-[#078b6c] font-medium text-[11px] mt-1.5">Approved alternative: ChatGPT (summarise)</p>
              <div className="flex gap-2.5 mt-11">
                <button onClick={() => setModal('confirm')} className="bg-gold-brand hover:bg-gold text-navy-header font-semibold text-xs rounded-full w-[178px] h-11 cursor-pointer">
                  Apply for visa&nbsp;&nbsp;→
                </button>
                <Link to="/gateway" className="border border-navy-header text-navy-header font-semibold text-xs rounded-full w-[172px] h-11 flex items-center justify-center hover:bg-chip">
                  Use alternative
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* My application status */}
        <div className="bg-navy-header rounded-[16px] p-7 h-fit">
          <p className="text-gold-brand font-bold text-[11px] tracking-[1.32px]">MY APPLICATION</p>
          <p className="text-white font-bold text-[22px] mt-2">SummarizerX</p>
          <p className="text-[#a9b8d0] text-[11px] mt-2.5">Submitted 14 Jul 2026&nbsp;&nbsp;·&nbsp;&nbsp;Ref A-0492</p>

          <div className="flex flex-col gap-6 mt-7">
            <div className="flex gap-3">
              <span className="w-8 h-8 rounded-full bg-gold-brand border-2 border-gold-brand text-navy-header font-bold text-sm flex items-center justify-center shrink-0">✓</span>
              <div>
                <p className="text-white font-semibold text-sm">Submitted</p>
                <p className="text-[#a9b8d0] text-[11px] mt-0.5">Form complete · data categories declared</p>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="w-8 h-8 rounded-full border-2 border-gold-brand text-gold-brand font-bold text-sm flex items-center justify-center shrink-0">•</span>
              <div>
                <p className="text-gold-brand font-semibold text-sm">Under review</p>
                <p className="text-[#a9b8d0] text-[11px] mt-0.5">IT and compliance checking vendor terms</p>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="w-8 h-8 rounded-full border-2 border-[#365d9d] text-[#365d9d] font-bold text-sm flex items-center justify-center shrink-0">○</span>
              <div>
                <p className="text-[#5e7daf] font-semibold text-sm">Visa issued</p>
                <p className="text-[#5e7daf] text-[11px] mt-0.5">Added to your passport when approved</p>
              </div>
            </div>
          </div>

          <div className="bg-[#173976] rounded-[10px] px-4 py-4 mt-8">
            <p className="text-[#a7f3d0] font-medium text-xs">Average approval time: 3 working days</p>
          </div>
          <p className="text-gold-brand font-medium text-[11px] mt-5">Tip: complete “PDPA &amp; Compliance” training while you wait&nbsp;&nbsp;→</p>
        </div>
      </div>

      {/* How visas work */}
      <div className="bg-white border border-[#d8d0b4] rounded-[16px] p-7 pt-5 mt-6">
        <p className="text-navy-header font-semibold text-[17px]">How visas work</p>
        <div className="grid grid-cols-2 gap-x-13 gap-y-4 mt-4">
          {principles.map(([title, desc], i) => (
            <div key={title} className="flex gap-3">
              <span className="w-7 h-7 rounded-full bg-[#eef2ff] text-[#365fd9] font-semibold text-[11px] flex items-center justify-center shrink-0">{i + 1}</span>
              <div>
                <p className="text-navy-header font-semibold text-xs">{title}</p>
                <p className="text-[#667085] text-[11px] mt-0.5">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 08A — Confirm visa application */}
      {modal === 'confirm' && (
        <div className="fixed inset-0 bg-navy-dark/50 flex items-center justify-center p-6 z-50" onClick={() => setModal(null)}>
          <div className="bg-card border border-navy rounded-[20px] w-full max-w-[600px] p-8 pt-6" onClick={e => e.stopPropagation()}>
            <p className="text-gold font-semibold text-[13px]">VISA APPLICATION</p>
            <p className="text-navy font-bold text-[28px] mt-1.5">Apply for a SummarizerX Visa?</p>
            <p className="text-ink text-base mt-3">
              IT and Compliance will review the vendor, business purpose and declared data scope. Your approved tools remain available while the request is reviewed.
            </p>
            <div className="bg-[#edf2ff] rounded-[12px] px-4.5 py-3.5 mt-5">
              <p className="text-navy font-semibold text-[15px]">What happens next</p>
              <div className="text-slate2 text-sm mt-1.5 space-y-0.5">
                <p>• Complete one business-purpose form</p>
                <p>• Confirm which data categories the tool may receive</p>
                <p>• Typical review time: 3 working days</p>
              </div>
            </div>
            <div className="flex gap-4 mt-7">
              <button onClick={() => setModal(null)} className="border border-navy text-navy font-semibold text-[15px] w-[176px] h-12 rounded-full cursor-pointer hover:bg-chip">
                Not now
              </button>
              <button onClick={() => setModal('sent')} className="bg-gold hover:bg-gold-dark text-navy font-semibold text-[15px] flex-1 h-12 rounded-full cursor-pointer">
                Yes, apply
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 08B — Application started */}
      {modal === 'sent' && (
        <div className="fixed inset-0 bg-navy-dark/50 flex items-center justify-center p-6 z-50" onClick={() => setModal(null)}>
          <div className="bg-card border border-navy rounded-[20px] w-full max-w-[600px] p-8 pt-6" onClick={e => e.stopPropagation()}>
            <span className="inline-block bg-green-soft text-green font-semibold text-xs rounded-full px-3 py-2">✓ PROGRESS SAVED</span>
            <p className="text-navy font-bold text-[28px] mt-4">Application Request Sent</p>
            <p className="text-ink text-base mt-2.5">
              Your request is saved. Complete the short form so reviewers have enough context to make a clear, scoped decision.
            </p>
            <div className="bg-[#edf2ff] rounded-[12px] px-4.5 py-3.5 mt-5">
              <p className="text-gold font-semibold text-[13px]">YOUR NEXT ACTION</p>
              <p className="text-navy font-semibold text-lg mt-1.5">Complete the business-purpose form</p>
              <div className="text-slate2 text-sm mt-2 space-y-0.5">
                <p>1. Describe how SummarizerX supports your role.</p>
                <p>2. Select only the data categories it needs.</p>
                <p>3. Submit for IT and Compliance review.</p>
              </div>
            </div>
            <button onClick={() => setModal(null)} className="bg-gold hover:bg-gold-dark text-navy font-semibold text-[15px] w-full h-12 rounded-full mt-7 cursor-pointer">
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
