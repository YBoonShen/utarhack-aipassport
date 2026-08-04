// Live Demo Simulator — a pitch-mode switch. When on, the backend injects
// synthetic org-wide activity every ~2.5s, so the audit log, KPI cards,
// department chart and risk score all move on their own during a live pitch.
// Purely a demo aid; it never touches the signed-in employee's own profile.
import { useEffect, useState } from 'react'
import { api } from '../../lib/api.js'

export default function LiveSimToggle() {
  const [on, setOn] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api.get('/simulate').then(s => setOn(s.on)).catch(() => {})
  }, [])

  async function toggle() {
    setBusy(true)
    try {
      const next = await api.post('/simulate', { on: !on })
      setOn(next.on)
    } catch { /* backend offline — leave state */ } finally {
      setBusy(false)
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={busy}
      title="Simulate live company-wide AI activity for the demo"
      className={`h-[46px] px-4 rounded-full flex items-center gap-2.5 text-[13px] font-semibold cursor-pointer transition-colors disabled:opacity-60 ${
        on ? 'bg-[#e7f4ee] text-[#058f6b] border border-[#a7dcc6]' : 'bg-white text-[#667085] border border-[#d8d0b4] hover:bg-chip'
      }`}
    >
      <span className={`relative flex w-2.5 h-2.5`}>
        {on && <span className="absolute inline-flex w-full h-full rounded-full bg-[#058f6b] opacity-60 animate-ping" />}
        <span className={`relative inline-flex w-2.5 h-2.5 rounded-full ${on ? 'bg-[#058f6b]' : 'bg-[#c3bda6]'}`} />
      </span>
      {on ? 'Live demo · on' : 'Live demo'}
    </button>
  )
}
