// 02 Employee · Prompt Protection — LIVE demo of the Smart Gateway (O2).
// POST /api/detect previews the mask; the Checkpoint modal offers Safe / Edit /
// Send-original-anyway; POST /api/send applies the real points rules:
//   clean prompt +2 · masked send +0 (protection isn't farmable) · override −20 + streak reset
import { useEffect, useState } from 'react'
import { apiGet, apiPost } from '../api.js'
import { useToast } from '../components/Toast.jsx'

const STORAGE_KEY = 'aipassport-chat'
const statusChip = {
  CLEAN: 'bg-indigo-100 text-indigo-800',
  MASKED: 'bg-emerald-100 text-emerald-800',
  ALERT: 'bg-red-100 text-red-800',
}

function loadMessages() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [] } catch { return [] }
}

export default function Gateway() {
  const [prompt, setPrompt] = useState(
    'Draft a payment reminder email to our customer Lim, IC 880505-10-5566, about his overdue invoice of RM 4,500.'
  )
  const [messages, setMessages] = useState(loadMessages)
  const [checkpoint, setCheckpoint] = useState(null) // { masked, detections }
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const toast = useToast()

  useEffect(() => {
    apiGet('/profile').then(setProfile).catch(() => {})
  }, [])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages))
  }, [messages])

  async function checkPrompt() {
    setLoading(true); setError(null)
    try {
      const data = await apiPost('/detect', { prompt })
      if (data.detections.length > 0) {
        setCheckpoint(data)
      } else {
        await send(false)
      }
    } catch {
      setError('Backend not running — start it with: cd backend && npm run dev')
    } finally {
      setLoading(false)
    }
  }

  async function send(override) {
    const result = await apiPost('/send', { prompt, override })
    setMessages(m => [...m, { text: result.sentText, status: result.status, delta: result.delta }])
    setProfile(result.profile)
    setCheckpoint(null)
    setPrompt('')
    if (result.levelUp) toast('🎉 Level 3 · Ambassador unlocked — check My License and My Visas!')
    else if (result.status === 'ALERT') toast('Original sent — −20 points and your clean streak was reset.')
  }

  function newChat() {
    setMessages([])
    localStorage.removeItem(STORAGE_KEY)
  }

  return (
    <div className="max-w-3xl mx-auto px-8 py-10">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-bold text-navy">Smart Gateway — live demo</h1>
          <p className="text-gray-500 text-sm mt-1">
            Type a prompt as if this were an AI chat tool. The gateway checks it before it is sent.
          </p>
        </div>
        <button onClick={newChat} className="border-2 border-navy text-navy text-sm px-4 py-2 rounded-full shrink-0">
          New chat
        </button>
      </div>

      {profile && (
        <div className="mt-4 bg-navy rounded-xl px-5 py-3 flex items-center gap-6 text-white text-sm">
          <span><b className="text-gold">{profile.points.toLocaleString()}</b> safety points</span>
          <span>Level {profile.level} · {profile.level >= 3 ? 'Ambassador' : 'Navigator'}</span>
          <span className={profile.streakDays > 0 ? 'text-emerald-300' : 'text-red-300'}>
            {profile.streakDays > 0 ? `✓ ${profile.streakDays}-day clean streak` : 'Streak reset — rebuild with clean prompts'}
          </span>
        </div>
      )}

      {/* Conversation */}
      {messages.length > 0 && (
        <div className="mt-5 flex flex-col gap-3">
          {messages.map((m, i) => (
            <div key={i} className="bg-white border border-gray-300 rounded-xl p-4">
              <div className="flex items-center justify-between mb-1.5">
                <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${statusChip[m.status]}`}>
                  {m.status === 'ALERT' ? 'SENT UNPROTECTED' : m.status === 'MASKED' ? 'SENT MASKED' : 'SENT CLEAN'}
                </span>
                <span className={`text-xs font-bold ${m.delta > 0 ? 'text-emerald-700' : m.delta < 0 ? 'text-red-700' : 'text-gray-400'}`}>
                  {m.delta > 0 ? `+${m.delta}` : m.delta < 0 ? m.delta : '+0'} pts
                </span>
              </div>
              <p className="text-sm font-mono text-gray-800">{m.text}</p>
            </div>
          ))}
        </div>
      )}

      {/* Composer */}
      <div className="bg-white border border-gray-300 rounded-2xl p-5 mt-5">
        <textarea
          className="w-full h-28 resize-none outline-none text-[15px] text-gray-800"
          placeholder="Type your prompt…"
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
        />
        <div className="flex justify-end">
          <button
            onClick={checkPrompt}
            disabled={loading || prompt.trim().length === 0}
            className="bg-gold hover:bg-gold-dark text-navy font-bold px-6 py-2.5 rounded-full text-sm disabled:opacity-50"
          >
            {loading ? 'Checking…' : 'Send prompt'}
          </button>
        </div>
      </div>

      {error && <p className="mt-4 text-red-700 text-sm">{error}</p>}

      {/* Checkpoint modal */}
      {checkpoint && (
        <div className="fixed inset-0 bg-navy-dark/60 flex items-center justify-center p-6 z-50">
          <div className="bg-cream border-[3px] border-navy rounded-2xl max-w-2xl w-full overflow-hidden">
            <div className="bg-navy px-7 py-5 flex items-center gap-4">
              <div className="w-11 h-11 rounded-full border-2 border-gold flex items-center justify-center text-gold text-xl">✓</div>
              <div>
                <p className="text-white font-bold text-lg">Checkpoint — Smart Gateway</p>
                <p className="text-gold text-xs mt-0.5">
                  {checkpoint.detections.reduce((n, d) => n + d.count, 0)} sensitive item(s) found. Masking keeps your data home.
                </p>
              </div>
            </div>
            <div className="p-7">
              <p className="text-[11px] font-bold tracking-[0.15em] text-[#8a7f60]">YOUR ORIGINAL PROMPT</p>
              <div className="mt-2 bg-white border border-[#d8cfae] rounded-xl p-4 text-sm text-gray-800">{prompt}</div>

              <p className="text-center text-navy text-xl my-2">↓</p>

              <p className="text-[11px] font-bold tracking-[0.15em] text-[#8a7f60]">SAFE VERSION — WHAT THE AI TOOL WILL RECEIVE</p>
              <div className="mt-2 bg-emerald-50 border-2 border-emerald-600 rounded-xl p-4 text-sm font-mono text-emerald-900">
                {checkpoint.masked}
              </div>

              <div className="mt-4 bg-card border border-[#d8cfae] rounded-lg px-4 py-2.5 text-xs text-gray-600">
                Detected: {checkpoint.detections.map(d => `${d.type} ×${d.count}`).join(' · ')} · logged to audit trail.
                Masking earns no points — clean prompts earn +2; sending the original costs −20 and resets your streak.
              </div>

              <div className="mt-5 flex items-center gap-3 flex-wrap">
                <button
                  onClick={() => send(false)}
                  className="bg-gold hover:bg-gold-dark text-navy font-bold px-7 py-3 rounded-full text-sm"
                >
                  Send safe version →
                </button>
                <button
                  onClick={() => setCheckpoint(null)}
                  className="border-2 border-navy text-navy px-6 py-3 rounded-full text-sm"
                >
                  Edit prompt
                </button>
                <button
                  onClick={() => send(true)}
                  className="text-red-700 text-xs underline underline-offset-2 ml-auto"
                >
                  Send original anyway (−20 pts)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
