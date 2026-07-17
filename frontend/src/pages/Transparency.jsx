// 03 Public · Check / Transparency Use — matches Figma frame "03 Public • Check / Transparency Use"
import { useState } from 'react'

const commitments = ['✓ No covert monitoring', '✓ Masked-data audit trail', '✓ Human review available']

export default function Transparency() {
  const [reference, setReference] = useState('REF-DEMO-2026-041')
  const [checked, setChecked] = useState(false)
  const [reviewRequested, setReviewRequested] = useState(false)

  return (
    <div className="min-h-screen bg-cream">
      {/* Public portal header */}
      <header className="bg-navy-header px-10 h-20 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-full border-2 border-gold-brand flex items-center justify-center text-gold-brand font-bold text-[17px]">A</div>
          <div>
            <p className="text-white font-bold text-base leading-tight">AI PASSPORT</p>
            <p className="text-gold-brand text-[9px] font-semibold tracking-[0.9px]">TRANSPARENCY PORTAL · PUBLIC</p>
          </div>
        </div>
        <p className="text-[#cbd5e1] text-xs font-medium">Bahasa Melayu&nbsp;&nbsp;·&nbsp;&nbsp;English&nbsp;&nbsp;·&nbsp;&nbsp;中文</p>
      </header>

      <div className="max-w-[760px] mx-auto px-6 pt-10 pb-16">
        <h1 className="text-[32px] font-bold text-navy-header text-center">Was AI involved in a decision about you?</h1>
        <p className="text-[#667085] text-[15px] text-center mt-2.5">
          Use the reference from your letter or email to see a plain-language explanation and request human review.
        </p>

        {/* Reference lookup */}
        <div className="bg-white border border-[#d8d0b4] rounded-[16px] p-5 mt-8">
          <p className="text-[#8a7d56] font-semibold text-[10px] tracking-[1px]">ENTER YOUR DECISION REFERENCE</p>
          <div className="flex gap-3 mt-2.5">
            <input
              value={reference}
              onChange={e => setReference(e.target.value)}
              className="flex-1 border border-[#98a2b3] rounded-[10px] h-12 px-4 text-navy-header text-[15px] font-medium outline-none focus:border-navy-header"
            />
            <button
              onClick={() => setChecked(true)}
              className="bg-gold-brand hover:bg-gold text-navy-header font-semibold text-[13px] w-40 h-12 rounded-full cursor-pointer"
            >
              Check reference
            </button>
          </div>
          <p className="text-[#667085] text-[10px] mt-3">No account or sign-in required. We use this reference only to retrieve the matching explanation.</p>
        </div>

        {/* Decision transparency result */}
        {checked && (
          <div className="bg-white border-2 border-navy-header rounded-[18px] p-7 pt-6 mt-5">
            <span className="inline-flex items-center gap-2 bg-[#eef2ff] rounded-full px-3 py-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#365fd9]" />
              <span className="text-[#365fd9] font-semibold text-[11px]">AI was involved</span>
            </span>
            <p className="text-navy-header font-bold text-xl mt-3.5">Your job application · first-stage screening</p>
            <p className="text-[#667085] text-[11px] mt-2.5">Decision date: 12 Jul 2026&nbsp;&nbsp;·&nbsp;&nbsp;Organisation: Example Sdn Bhd</p>

            <div className="h-px bg-[#e4e7ec] my-4" />
            <p className="text-[#8a7d56] font-semibold text-[10px] tracking-[1px]">WHAT THE AI DID · IN PLAIN WORDS</p>
            <p className="text-[#475467] text-xs mt-1.5 leading-relaxed">
              An AI tool compared application details with the job requirements and suggested a shortlist. A human recruiter reviewed that
              suggestion and made the final decision.
            </p>

            <div className="grid grid-cols-2 gap-3 mt-4">
              <div className="bg-[#e9f8f2] rounded-[10px] px-3.5 py-2.5">
                <p className="text-[#047857] font-semibold text-[10px]">AI could use</p>
                <p className="text-[#475467] text-[10px] mt-1">Skills, experience and role-related answers</p>
              </div>
              <div className="bg-[#fff5de] rounded-[10px] px-3.5 py-2.5">
                <p className="text-[#b54708] font-semibold text-[10px]">AI could not use</p>
                <p className="text-[#475467] text-[10px] mt-1">Identity number, phone, email or home address</p>
              </div>
            </div>

            <div className="h-px bg-[#e4e7ec] my-4" />
            <p className="text-navy-header font-semibold text-[13px]">Want a person to look at it again?</p>
            <p className="text-[#667085] text-[11px] mt-1.5">
              You can request a fresh human review free of charge. The reviewer will not rely on the original AI recommendation.
            </p>
            <div className="flex items-center gap-4 mt-4">
              <button
                onClick={() => setReviewRequested(true)}
                disabled={reviewRequested}
                className="bg-navy-header hover:bg-navy text-white font-semibold text-[13px] w-[246px] h-12 rounded-full cursor-pointer disabled:opacity-80"
              >
                {reviewRequested ? '✓ Review requested' : 'Request human review'}
              </button>
              <p className="text-[#667085] font-medium text-[11px]">Response within 5 working days</p>
            </div>
          </div>
        )}

        {/* Public commitments */}
        <div className="flex justify-center gap-2 mt-10 flex-wrap">
          {commitments.map(c => (
            <span key={c} className="bg-[#eef2ff] text-[#365fd9] font-medium text-[10px] rounded-full px-3 py-1.5">{c}</span>
          ))}
        </div>
        <p className="text-[#667085] text-[10px] text-center mt-3.5">
          Privacy-first prototype · policy and legal validation required before deployment
        </p>
      </div>
    </div>
  )
}
