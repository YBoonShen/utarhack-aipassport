// 02 Employee · Prompt Protection — LIVE demo of the Smart Gateway (O2).
// This page really calls the backend: POST /api/detect masks the prompt,
// then the Checkpoint modal shows original vs safe version, like the Figma design.
import { useState } from 'react'

export default function Gateway() {
  const [prompt, setPrompt] = useState(
    'Draft a payment reminder email to our customer Lim, IC 880505-10-5566, about his overdue invoice of RM 4,500.'
  )
  const [result, setResult] = useState(null)   // { masked, detections }
  const [sent, setSent] = useState(null)       // final sent text
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function checkPrompt() {
    setLoading(true); setError(null); setSent(null)
    try {
      const res = await fetch('/api/detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      })
      const data = await res.json()
      if (data.detections && data.detections.length > 0) {
        setResult(data)            // sensitive -> open Checkpoint modal
      } else {
        setSent(prompt)            // clean -> send directly
      }
    } catch {
      setError('Backend not running — start it with: cd backend && npm run dev')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-8 py-10">
      <h1 className="text-3xl font-bold text-navy">Smart Gateway — live demo</h1>
      <p className="text-gray-500 text-sm mt-1 mb-6">
        Type a prompt as if this were an AI chat tool. The gateway checks it before it is sent.
      </p>

      <div className="bg-white border border-gray-300 rounded-2xl p-5">
        <textarea
          className="w-full h-32 resize-none outline-none text-[15px] text-gray-800"
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
        />
        <div className="flex justify-end">
          <button
            onClick={checkPrompt}
            disabled={loading}
            className="bg-gold hover:bg-gold-dark text-navy font-bold px-6 py-2.5 rounded-full text-sm disabled:opacity-50"
          >
            {loading ? 'Checking…' : 'Send prompt'}
          </button>
        </div>
      </div>

      {error && <p className="mt-4 text-red-700 text-sm">{error}</p>}
      {sent && (
        <div className="mt-6 bg-emerald-50 border-2 border-emerald-600 rounded-xl p-4 text-sm text-emerald-900">
          <p className="font-bold mb-1">✓ Prompt sent to AI tool</p>
          <p className="font-mono text-[13px]">{sent}</p>
        </div>
      )}

      {/* Checkpoint modal */}
      {result && (
        <div className="fixed inset-0 bg-navy-dark/60 flex items-center justify-center p-6 z-50">
          <div className="bg-cream border-[3px] border-navy rounded-2xl max-w-2xl w-full overflow-hidden">
            <div className="bg-navy px-7 py-5 flex items-center gap-4">
              <div className="w-11 h-11 rounded-full border-2 border-gold flex items-center justify-center text-gold text-xl">✓</div>
              <div>
                <p className="text-white font-bold text-lg">Checkpoint — Smart Gateway</p>
                <p className="text-gold text-xs mt-0.5">
                  {result.detections.reduce((n, d) => n + d.count, 0)} sensitive item(s) masked before crossing. Your data stays home.
                </p>
              </div>
            </div>
            <div className="p-7">
              <p className="text-[11px] font-bold tracking-[0.15em] text-[#8a7f60]">YOUR ORIGINAL PROMPT</p>
              <div className="mt-2 bg-white border border-[#d8cfae] rounded-xl p-4 text-sm text-gray-800">{prompt}</div>

              <p className="text-center text-navy text-xl my-2">↓</p>

              <p className="text-[11px] font-bold tracking-[0.15em] text-[#8a7f60]">SAFE VERSION — WHAT THE AI TOOL WILL RECEIVE</p>
              <div className="mt-2 bg-emerald-50 border-2 border-emerald-600 rounded-xl p-4 text-sm font-mono text-emerald-900">
                {result.masked}
              </div>

              <div className="mt-4 bg-card border border-[#d8cfae] rounded-lg px-4 py-2.5 text-xs text-gray-600">
                Detected: {result.detections.map(d => `${d.type} ×${d.count}`).join(' · ')} · logged to audit trail · +10 points earned
              </div>

              <div className="mt-5 flex items-center gap-4">
                <button
                  onClick={() => { setSent(result.masked); setResult(null) }}
                  className="bg-gold hover:bg-gold-dark text-navy font-bold px-7 py-3 rounded-full text-sm"
                >
                  Send safe version →
                </button>
                <button
                  onClick={() => setResult(null)}
                  className="border-2 border-navy text-navy px-6 py-3 rounded-full text-sm"
                >
                  Edit prompt
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
