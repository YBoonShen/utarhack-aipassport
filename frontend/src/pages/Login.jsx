// Login — passport-themed role selection (demo auth; Firebase Auth later)
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { login } from '../lib/api.js'

const roles = [
  {
    role: 'employee',
    title: 'Employee',
    name: 'Tan Jia Yin · E-217',
    desc: 'My AI License, training, visas and the Smart Gateway.',
    initials: 'JY',
  },
  {
    role: 'admin',
    title: 'Admin',
    name: 'Compliance role',
    desc: 'Governance overview, risk alerts, approvals and audit log.',
    initials: 'AD',
  },
]

export default function Login() {
  const navigate = useNavigate()
  const [selected, setSelected] = useState('employee')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function enter() {
    setBusy(true)
    setError(null)
    try {
      const user = await login(selected)
      navigate(user.role === 'admin' ? '/admin' : '/license', { replace: true })
    } catch {
      setError('Backend not running — start it with: cd backend && npm run dev')
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-navy-header flex flex-col items-center justify-center px-6 relative overflow-hidden">
      {/* Decorative passport rings */}
      <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full border-[30px] border-navy opacity-60" />
      <div className="absolute -bottom-32 -right-20 w-[28rem] h-[28rem] rounded-full border-[30px] border-navy opacity-60" />

      <div className="relative flex flex-col items-center">
        <div className="w-16 h-16 rounded-full border-[3px] border-gold-brand flex items-center justify-center text-gold-brand font-bold text-3xl">A</div>
        <h1 className="text-white font-bold text-[28px] tracking-[2px] mt-4">AI PASSPORT</h1>
        <p className="text-gold-brand text-xs font-semibold tracking-[1.6px] mt-1">SAFE AI FOR EVERY EMPLOYEE</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-10 w-full max-w-[620px]">
          {roles.map(r => {
            const active = selected === r.role
            return (
              <button
                key={r.role}
                onClick={() => setSelected(r.role)}
                className={`text-left rounded-[18px] p-5 cursor-pointer transition-colors ${
                  active ? 'bg-card border-2 border-gold-brand' : 'bg-navy border-2 border-navy-mid hover:border-[#365fd9]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className={`w-11 h-11 rounded-full flex items-center justify-center font-bold text-sm ${active ? 'bg-gold-brand text-navy-header' : 'bg-navy-mid text-white'}`}>
                    {r.initials}
                  </span>
                  <div>
                    <p className={`font-bold text-base ${active ? 'text-navy-header' : 'text-white'}`}>{r.title}</p>
                    <p className={`text-[11px] ${active ? 'text-slate2' : 'text-[#a9b8d0]'}`}>{r.name}</p>
                  </div>
                  <span className={`ml-auto w-5 h-5 rounded-full border-2 flex items-center justify-center ${active ? 'border-gold-dark' : 'border-[#365d9d]'}`}>
                    {active && <span className="w-2.5 h-2.5 rounded-full bg-gold-brand" />}
                  </span>
                </div>
                <p className={`text-xs mt-3 leading-relaxed ${active ? 'text-ink' : 'text-[#a9b8d0]'}`}>{r.desc}</p>
              </button>
            )
          })}
        </div>

        <button
          onClick={enter}
          disabled={busy}
          className="bg-gold-brand hover:bg-gold text-navy-header font-semibold text-[15px] w-full max-w-[620px] h-12 rounded-full mt-6 cursor-pointer disabled:opacity-60"
        >
          {busy ? 'Signing in…' : `Continue as ${selected === 'admin' ? 'Admin' : 'Employee'} →`}
        </button>
        {error && <p className="text-[#fda29b] text-xs mt-3">{error}</p>}

        <p className="text-[#a9b8d0] text-[11px] mt-8">Demo sign-in · Firebase Authentication with role-based access in production</p>
        <a href="/transparency" className="text-gold-brand text-[11px] font-medium mt-2 hover:underline">
          Affected by an AI-assisted decision? Visit the public transparency portal →
        </a>
      </div>
    </div>
  )
}
