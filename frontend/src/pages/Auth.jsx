// 00 Auth series — matches Figma frames "00 / 00A–00E Auth" (sign in, forgot
// password, reset sent, authenticated, sign up, sign up successful).
// Demo auth: email decides the role — admin@abcd.com enters the Admin Console,
// anything else signs in as the employee. Firebase Auth later.
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { login } from '../lib/api.js'

const panelCopy = {
  signin: {
    kicker: 'WELCOME BACK',
    title: 'One trusted sign-in for safer AI work.',
    body: 'Access your AI license, training, visas and protected tools from one secure account.',
  },
  forgot: {
    kicker: 'ACCOUNT RECOVERY',
    title: 'Recover access without losing your progress.',
    body: 'We will send a time-limited link to your verified organisation email.',
  },
  'reset-sent': {
    kicker: 'CHECK YOUR INBOX',
    title: 'A private recovery link is on its way.',
    body: 'Only the verified account owner can use the link, and it expires automatically.',
  },
  success: {
    kicker: 'IDENTITY VERIFIED',
    title: 'Your secure session is ready.',
    body: 'AI Passport confirmed your identity and restored access to your protected workspace.',
  },
  signup: {
    kicker: 'CREATE YOUR PASSPORT',
    title: 'Start with a secure organisation identity.',
    body: 'Your AI Passport brings training, access permissions and safe-use progress together.',
  },
  'signup-success': {
    kicker: 'ACCOUNT CREATED',
    title: 'Your AI Passport account is ready to verify.',
    body: 'One final sign-in keeps your organisation identity and access record secure.',
  },
}

function Field({ label, value, onChange, type = 'text', placeholder, hint, autoFocus }) {
  const [show, setShow] = useState(false)
  return (
    <div className="mt-4">
      <p className="text-[#0a1733] font-semibold text-[13px]">{label}</p>
      <div className="border-[1.5px] border-[#788cad] rounded-[12px] h-14 mt-1.5 flex items-center px-3.5 focus-within:border-[#091e47]">
        <input
          type={type === 'password' && show ? 'text' : type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          className="flex-1 outline-none text-[15px] text-[#0a1733] placeholder-[#5c6b87] bg-transparent"
        />
        {type === 'password' && (
          <button type="button" onClick={() => setShow(s => !s)} className="text-[#1447b2] font-semibold text-[13px] cursor-pointer pl-2">
            {show ? 'Hide' : 'Show'}
          </button>
        )}
      </div>
      {hint && <p className="text-[#5c6b87] text-xs mt-1.5">{hint}</p>}
    </div>
  )
}

function GoldButton({ children, onClick, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled} className="bg-[#e3b214] hover:bg-gold-dark text-[#091e47] font-semibold text-[15px] w-full h-[52px] rounded-full mt-6 cursor-pointer disabled:opacity-60">
      {children}
    </button>
  )
}

function SuccessMark() {
  return (
    <div className="w-[120px] h-[120px] rounded-full bg-[#e5faf2] border-[3px] border-[#088c66] flex items-center justify-center mx-auto">
      <span className="text-[#088c66] text-[52px] font-bold">✓</span>
    </div>
  )
}

export default function Auth() {
  const navigate = useNavigate()
  const [view, setView] = useState('signin') // signin | forgot | reset-sent | success | signup | signup-success
  const [email, setEmail] = useState('jiayin.tan@abcd.com')
  const [password, setPassword] = useState('demo-password')
  const [name, setName] = useState('Tan Jia Yin')
  const [org, setOrg] = useState('ABCD Sdn Bhd')
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [user, setUser] = useState(null)

  const copy = panelCopy[view]

  async function signIn() {
    if (!email.trim() || !password.trim()) return setError('Enter your email and password.')
    setBusy(true)
    setError(null)
    try {
      const role = email.trim().toLowerCase().startsWith('admin') ? 'admin' : 'employee'
      const u = await login(role)
      setUser(u)
      setView('success')
    } catch {
      setError('Backend not running — start it with: cd backend && npm run dev')
    } finally {
      setBusy(false)
    }
  }

  function continueToApp() {
    navigate(user?.role === 'admin' ? '/admin' : '/license', { replace: true })
  }

  return (
    <div className="min-h-screen bg-[#f7f2e3] flex">
      {/* Auth brand panel */}
      <div className="bg-[#091e47] w-[520px] shrink-0 hidden lg:flex flex-col px-16 py-10">
        <div className="flex items-center gap-3 -ml-4">
          <div className="w-[54px] h-[54px] rounded-full border-[3px] border-[#e3b214] flex items-center justify-center text-[#e3b214] font-bold text-[22px]">A</div>
          <div>
            <p className="text-white font-bold text-lg leading-tight">AI PASSPORT</p>
            <p className="text-[#e3b214] text-[11px] font-semibold">SAFE AI FOR EVERY EMPLOYEE</p>
          </div>
        </div>

        <div className="mt-36">
          <p className="text-[#e3b214] font-bold text-xs tracking-wide">{copy.kicker}</p>
          <h1 className="text-white font-bold text-[38px] leading-tight mt-6 max-w-[388px]">{copy.title}</h1>
          <p className="text-[#ccd6eb] text-[17px] mt-6 max-w-[376px]">{copy.body}</p>
          <div className="w-[72px] h-1 rounded-[2px] bg-[#e3b214] mt-8" />
          <p className="text-white font-semibold text-base mt-6">Protected by default</p>
          <p className="text-[#b8c7e0] text-sm mt-2 max-w-[365px]">Sensitive prompt data stays protected before it reaches an AI tool.</p>
          <div className="inline-block bg-[#142e61] rounded-full px-4.5 py-3 mt-8">
            <p className="text-[#baf5de] font-semibold text-[13px]">✓&nbsp;&nbsp;Privacy-first access</p>
          </div>
        </div>

        <div className="flex-1" />
        <p className="text-[#9eb0cc] text-xs">Employee and administrator access · Auditable · PDPA aligned</p>
      </div>

      {/* Authentication card */}
      <div className="flex-1 flex items-center justify-center px-6 py-10">
        <div className="bg-white border border-[#dbd4ba] rounded-[20px] shadow-[0px_12px_15px_rgba(5,15,38,0.1)] w-full max-w-[500px] p-7">
          {view === 'signin' && (
            <>
              <p className="text-[#e3b214] font-bold text-xs">SECURE ACCESS</p>
              <h2 className="text-[#0a1733] font-bold text-[30px] mt-2">Sign in to AI Passport</h2>
              <p className="text-[#5c6b87] text-sm mt-2">Use your organisation email to continue.</p>
              <Field label="Work email" value={email} onChange={setEmail} placeholder="jiayin.tan@abcd.com" autoFocus />
              <div className="mt-2" />
              <Field label="Password" value={password} onChange={setPassword} type="password" placeholder="••••••••••••" />
              <div className="flex justify-end mt-2">
                <button onClick={() => setView('forgot')} className="text-[#144dc2] font-semibold text-sm cursor-pointer">Forgot password?</button>
              </div>
              {error && <p className="text-[#d92d20] text-xs mt-2">{error}</p>}
              <GoldButton onClick={signIn} disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</GoldButton>
              <div className="flex items-center gap-3 mt-6">
                <div className="h-px bg-[#dee0e5] flex-1" />
                <p className="text-[#5c6b87] font-semibold text-[11px]">OR</p>
                <div className="h-px bg-[#dee0e5] flex-1" />
              </div>
              <button className="border-[1.5px] border-[#091e47] text-[#091e47] font-semibold text-[15px] w-full h-[52px] rounded-full mt-6 cursor-pointer hover:bg-chip">
                Continue with enterprise SSO
              </button>
              <p className="text-[#5c6b87] text-xs text-center mt-5">Your organisation manages access and activity logging.</p>
              <button onClick={() => setView('signup')} className="text-[#144dc2] font-semibold text-sm w-full text-center mt-4 cursor-pointer">
                New to AI Passport? Create account
              </button>
              <p className="text-[#5c6b87] text-[11px] text-center mt-5">By continuing, you agree to the acceptable-use and privacy policies.</p>
              <div className="bg-[#f0f5ff] rounded-[10px] px-3 py-2 mt-4">
                <p className="text-[#5c6b87] text-[11px] text-center">
                  Demo accounts — employee: any email · admin console: <span className="font-semibold">admin@abcd.com</span>
                </p>
              </div>
            </>
          )}

          {view === 'forgot' && (
            <>
              <p className="text-[#e3b214] font-bold text-xs">PASSWORD RECOVERY</p>
              <h2 className="text-[#0a1733] font-bold text-[30px] mt-2">Reset your password</h2>
              <p className="text-[#5c6b87] text-sm mt-2">Enter the email connected to your AI Passport.</p>
              <Field label="Work email" value={email} onChange={setEmail} hint="We will only send a link if the account exists." autoFocus />
              <GoldButton onClick={() => setView('reset-sent')}>Send reset email</GoldButton>
              <p className="text-[#5c6b87] text-xs text-center mt-6">For your security, the reset link expires after 20 minutes.</p>
              <button onClick={() => setView('signin')} className="text-[#144dc2] font-semibold text-sm w-full text-center mt-4 cursor-pointer">← Back to sign in</button>
            </>
          )}

          {view === 'reset-sent' && (
            <>
              <SuccessMark />
              <h2 className="text-[#0a1733] font-bold text-[30px] text-center mt-6">Check your email</h2>
              <p className="text-[#5c6b87] text-[15px] text-center mt-3">We sent a password-reset link to<br />{email}</p>
              <div className="bg-[#edf2ff] rounded-[14px] px-5 py-4 mt-5">
                <p className="text-[#0a1733] text-[13px] text-center">Didn’t receive it? Check spam or wait five (5) minutes before requesting another link.</p>
              </div>
              <GoldButton onClick={() => setView('signin')}>Return to sign in</GoldButton>
              <button className="text-[#144dc2] font-semibold text-sm w-full text-center mt-4 cursor-pointer">Resend email</button>
            </>
          )}

          {view === 'success' && (
            <>
              <SuccessMark />
              <h2 className="text-[#0a1733] font-bold text-[29px] text-center mt-6">Successfully authenticated</h2>
              <p className="text-[#5c6b87] text-[15px] text-center mt-3">
                Welcome back, {user?.name || 'Tan Jia Yin'}. Your {user?.role === 'admin' ? 'admin console and governance tools' : 'AI license and safety progress'} are ready.
              </p>
              <div className="bg-[#e5faf2] border border-[#80d4b5] rounded-[14px] px-4 py-4 mt-5">
                <p className="text-[#088c66] font-semibold text-[13px] text-center">✓ Secure session · Last sign-in 17 Jul 2026, 10:42</p>
              </div>
              <GoldButton onClick={continueToApp}>{user?.role === 'admin' ? 'Continue to admin console' : 'Continue to my passport'}</GoldButton>
              <p className="text-[#5c6b87] text-xs text-center mt-6">For shared devices, remember to sign out when you finish.</p>
            </>
          )}

          {view === 'signup' && (
            <>
              <p className="text-[#e3b214] font-bold text-xs">CREATE ACCOUNT</p>
              <h2 className="text-[#0a1733] font-bold text-[29px] mt-2">Set up your AI Passport</h2>
              <p className="text-[#5c6b87] text-sm mt-2">Use details that match your organisation directory.</p>
              <Field label="Full name" value={name} onChange={setName} autoFocus />
              <Field label="Work email" value={email} onChange={setEmail} />
              <Field label="Organisation" value={org} onChange={setOrg} />
              <Field label="Create password" value={password} onChange={setPassword} type="password" placeholder="At least 12 characters" hint="Use 12+ characters with a number and symbol." />
              <label className="flex items-center gap-3 mt-4 cursor-pointer">
                <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} className="w-[22px] h-[22px] accent-[#091e47]" />
                <span className="text-[#0a1733] text-xs">I agree to the acceptable-use and privacy policies.</span>
              </label>
              <GoldButton onClick={() => consent && setView('signup-success')} disabled={!consent}>Create account</GoldButton>
              <button onClick={() => setView('signin')} className="text-[#144dc2] font-semibold text-sm w-full text-center mt-4 cursor-pointer">
                Already have an account? Sign in
              </button>
              <p className="text-[#5c6b87] text-[11px] text-center mt-4">Your administrator may need to verify your organisation membership.</p>
            </>
          )}

          {view === 'signup-success' && (
            <>
              <SuccessMark />
              <h2 className="text-[#0a1733] font-bold text-[29px] text-center mt-6">Account created successfully</h2>
              <p className="text-[#5c6b87] text-[15px] text-center mt-3">
                We verified your organisation email. Sign in to activate your passport and begin training.
              </p>
              <div className="bg-[#e5faf2] border border-[#80d4b5] rounded-[14px] px-4 py-4 mt-5">
                <p className="text-[#088c66] font-semibold text-[13px] text-center">✓ Email verified · Account ready</p>
              </div>
              <GoldButton onClick={() => setView('signin')}>Continue to sign in</GoldButton>
              <p className="text-[#5c6b87] text-xs text-center mt-6">Need help? Contact your organisation administrator.</p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
