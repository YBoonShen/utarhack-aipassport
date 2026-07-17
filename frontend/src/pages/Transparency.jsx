// 03 Public · Decision Transparency — matches Figma frame "03 Public • Decision Transparency"
// Public-facing page: no employee nav, reachable without login.
import { useState } from 'react'

const sampleCase = {
  ref: 'JOB-42093-JAN',
  title: 'Your job application — first-stage screening',
  desc: 'An AI tool screened resumes for keyword match against job requirements. A human recruiter makes the final shortlisting decision.',
  status: 'Reviewed',
  outcome: 'Shortlisted',
}

export default function Transparency() {
  const [ref, setRef] = useState('')
  const [result, setResult] = useState(null)

  function check() {
    if (ref.trim()) setResult(sampleCase)
  }

  return (
    <div className="min-h-screen bg-cream flex flex-col">
      <header className="bg-navy px-10 h-16 flex items-center gap-3">
        <div className="w-9 h-9 rounded-full border-2 border-gold flex items-center justify-center text-gold font-bold text-sm">✈</div>
        <div>
          <p className="text-white font-bold tracking-[0.15em] text-sm">AI PASSPORT</p>
          <p className="text-gold text-[9px] tracking-[0.12em]">TRANSPARENCY PORTAL</p>
        </div>
      </header>

      <main className="flex-1 max-w-2xl mx-auto w-full px-6 py-14">
        <h1 className="text-2xl font-bold text-navy text-center">Was AI involved in a decision about you?</h1>
        <p className="text-gray-500 text-sm text-center mt-2">
          Enter the reference number from your notice below to see how the decision was made.
        </p>

        <div className="flex gap-3 mt-6">
          <input
            value={ref}
            onChange={e => setRef(e.target.value)}
            placeholder="e.g. JOB-42093-JAN"
            className="flex-1 bg-white border-2 border-[#d8cfae] rounded-lg px-4 py-2.5 text-sm outline-none"
          />
          <button onClick={check} className="bg-gold hover:bg-gold-dark text-navy font-bold px-6 py-2.5 rounded-full text-sm shrink-0">
            Check reference
          </button>
        </div>

        {result && (
          <div className="bg-card border-2 border-[#d8cfae] rounded-2xl p-6 mt-8">
            <span className="inline-block bg-blue-50 text-navy text-xs font-bold px-3 py-1.5 rounded-full border border-blue-200">
              AI-Assisted Decision
            </span>
            <p className="text-navy font-bold text-lg mt-3">{result.title}</p>
            <p className="text-xs text-gray-500 mt-0.5">Reference: {result.ref}</p>
            <p className="text-sm text-gray-700 mt-3">{result.desc}</p>

            <div className="grid grid-cols-2 gap-4 mt-5">
              <div className="bg-white border border-[#d8cfae] rounded-lg p-3">
                <p className="text-[10px] font-bold tracking-wider text-[#8a7f60]">DECISION STATUS</p>
                <p className="text-navy font-bold mt-1">{result.status}</p>
              </div>
              <div className="bg-emerald-50 border border-emerald-300 rounded-lg p-3">
                <p className="text-[10px] font-bold tracking-wider text-emerald-700">OUTCOME</p>
                <p className="text-emerald-900 font-bold mt-1">{result.outcome}</p>
              </div>
            </div>

            <p className="text-sm text-gray-700 mt-5">
              If you believe a human should review this case, or you’d like to contest the outcome, you can request that below.
            </p>
            <div className="flex gap-3 mt-4">
              <button className="bg-navy hover:bg-navy-dark text-white font-bold px-5 py-2.5 rounded-full text-sm">Request human review</button>
              <button className="border-2 border-navy text-navy px-5 py-2.5 rounded-full text-sm">Download this decision</button>
            </div>
          </div>
        )}
      </main>

      <footer className="text-center text-xs text-gray-500 py-6 border-t border-[#d8cfae]">
        <a href="#" className="hover:text-navy">How masking works</a>
        <span className="mx-2">·</span>
        <a href="#" className="hover:text-navy">Report a concern</a>
        <span className="mx-2">·</span>
        <a href="#" className="hover:text-navy">About this portal</a>
      </footer>
    </div>
  )
}
