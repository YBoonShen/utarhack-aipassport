// Governance Copilot — a floating explainability assistant available on every
// admin screen. Answers plain-language questions ("why was this masked?",
// "what's our biggest risk?") grounded in the live governance state, and maps
// answers to PDPA / NIST AI RMF / EU AI Act. Powered by Gemini when a key is
// set, with a deterministic offline responder otherwise — the reply is
// labelled so we never pass the fallback off as the model.
import { useEffect, useRef, useState } from 'react'
import { api } from '../../lib/api.js'

const GREETING = {
  role: 'bot',
  source: 'system',
  text: "I'm your Governance Copilot. Ask me about your live risk posture, why a prompt was masked, a department, or compliance status — I answer from the real audit data.",
}

export default function GovernanceCopilot() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([GREETING])
  const [suggestions, setSuggestions] = useState([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const scrollRef = useRef(null)

  useEffect(() => {
    api.get('/copilot/suggestions').then(s => setSuggestions(s.suggestions || [])).catch(() => {})
  }, [])

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, open, busy])

  async function ask(question) {
    const q = (question ?? input).trim()
    if (!q || busy) return
    setInput('')
    setMessages(m => [...m, { role: 'user', text: q }])
    setBusy(true)
    try {
      const r = await api.post('/copilot', { question: q })
      setMessages(m => [...m, { role: 'bot', text: r.answer, source: r.source }])
    } catch {
      setMessages(m => [...m, { role: 'bot', source: 'system', text: 'I could not reach the governance backend. Make sure the server is running on port 5001.' }])
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {/* Floating launcher */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-40 h-14 pl-5 pr-6 rounded-full bg-navy-header text-white shadow-[0_10px_30px_rgba(10,32,79,0.35)] flex items-center gap-3 cursor-pointer hover:bg-navy-mid transition-colors"
        >
          <span className="w-8 h-8 rounded-full border-2 border-gold-brand flex items-center justify-center text-gold-brand text-lg leading-none">✦</span>
          <span className="text-left leading-tight">
            <span className="block text-[13px] font-bold">Governance Copilot</span>
            <span className="block text-[9px] text-gold-brand tracking-[0.5px]">ASK ABOUT YOUR RISK</span>
          </span>
        </button>
      )}

      {/* Panel */}
      {open && (
        <div className="fixed bottom-6 right-6 z-40 w-[400px] max-w-[calc(100vw-3rem)] h-[600px] max-h-[calc(100vh-3rem)] bg-white rounded-[20px] shadow-[0_20px_60px_rgba(10,32,79,0.35)] border border-[#d8d0b4] flex flex-col overflow-hidden">
          {/* Header */}
          <div className="bg-navy-header px-5 py-4 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <span className="w-9 h-9 rounded-full border-2 border-gold-brand flex items-center justify-center text-gold-brand text-lg">✦</span>
              <div>
                <p className="text-white font-bold text-sm leading-tight">Governance Copilot</p>
                <p className="text-gold-brand text-[9px] font-semibold tracking-[0.8px]">GROUNDED IN LIVE AUDIT DATA</p>
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="text-[#cbd5e1] hover:text-white text-xl leading-none cursor-pointer w-7 h-7">×</button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3 bg-[#faf7ec]">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[86%] rounded-[14px] px-3.5 py-2.5 text-[12.5px] leading-relaxed ${
                  m.role === 'user'
                    ? 'bg-navy-header text-white rounded-br-[4px]'
                    : 'bg-white border border-[#e6dcbf] text-[#344054] rounded-bl-[4px]'
                }`}>
                  {m.text}
                  {m.role === 'bot' && m.source && m.source !== 'system' && (
                    <span className={`block mt-2 text-[9px] font-semibold tracking-[0.4px] ${m.source === 'gemini' ? 'text-[#365fd9]' : 'text-[#8a7d56]'}`}>
                      {m.source === 'gemini' ? '✦ ANSWERED BY GEMINI · LIVE DATA' : '◆ OFFLINE ANALYST · LIVE DATA'}
                    </span>
                  )}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex justify-start">
                <div className="bg-white border border-[#e6dcbf] rounded-[14px] rounded-bl-[4px] px-4 py-3 flex gap-1">
                  {[0, 150, 300].map(d => (
                    <span key={d} className="w-1.5 h-1.5 rounded-full bg-[#c3bda6] animate-bounce" style={{ animationDelay: `${d}ms` }} />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Suggestions */}
          {messages.length <= 1 && suggestions.length > 0 && (
            <div className="px-4 pb-2 flex flex-wrap gap-2 shrink-0 bg-[#faf7ec]">
              {suggestions.slice(0, 4).map(s => (
                <button key={s} onClick={() => ask(s)} className="text-[11px] text-[#365fd9] bg-[#eef2ff] border border-[#cadafd] rounded-full px-3 py-1.5 cursor-pointer hover:bg-[#e2e9ff]">
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="p-3 border-t border-[#e6dcbf] flex items-center gap-2 shrink-0 bg-white">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && ask()}
              placeholder="Ask about your risk, alerts, compliance…"
              className="flex-1 h-11 px-4 rounded-full bg-[#f5f2e5] text-[13px] text-ink outline-none focus:ring-2 focus:ring-gold-brand"
            />
            <button
              onClick={() => ask()}
              disabled={busy || !input.trim()}
              className="w-11 h-11 rounded-full bg-gold-brand hover:bg-gold text-navy-header font-bold text-lg shrink-0 cursor-pointer disabled:opacity-50 flex items-center justify-center"
            >↑</button>
          </div>
        </div>
      )}
    </>
  )
}
