// 00 Auth series — matches Figma frames "00 / 00A–00F Auth" (sign in, forgot
// password, reset email sent, authenticated, sign up step 1, sign up step 2,
// sign up successful). Sign-up is a two-step wizard per Figma 00D/00E: step 1
// collects org identity, step 2 re-shows name/email read-only and collects
// the employee ID + password.
//
// What this screen is *not* any more. It used to decide the role itself —
// "does the email start with admin?" — and send that decision to the server,
// which believed it; the password box was decoration, and Create account was
// three screens that wrote nothing anywhere. Both are gone. This page now only
// ever collects a credential and shows what the server said about it:
//
//   • Sign in    — POST /auth/login. The password is checked against a stored
//                  scrypt hash. Which console opens is the server's answer.
//   • Google SSO — POST /auth/google with the ID token Google signed, verified
//                  server-side. Falls back to a demo chooser when no Google
//                  project is configured (see /api/auth/sso/config).
//   • Sign up    — POST /auth/register. Creates a real employee account at
//                  Level 1, which can then sign in with the password it set.
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { logFailure, register as apiRegister, ssoConfig, SIGN_IN_UNAVAILABLE } from '../lib/api.js'
import { useAuth } from '../lib/auth.jsx'
import { useToast } from '../components/Toast.jsx'
import { firebaseConfigured, firebaseGoogleIdToken } from '../lib/firebase.js'

const panelCopy = {
  signin: {
    kicker: 'WELCOME BACK',
    title: 'One trusted sign-in for safer AI work.',
    body: 'Access your AI License, training, AI tools and safe-use record from one secure account.',
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
  signup2: {
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

// The six the backend directory keys on. Sent as the display name; the server
// resolves it to the department code, so this list and directory.js agree.
const DEPARTMENTS = ['Engineering', 'Sales', 'Finance', 'Marketing', 'Human Resources', 'Operations']

function Field({ label, value, onChange, type = 'text', placeholder, hint, autoFocus, readOnly, onEnter }) {
  const [show, setShow] = useState(false)
  return (
    <div className="mt-4">
      <p className="text-[#0a1733] font-semibold text-[13px]">{label}</p>
      <div
        className={`border-[1.5px] rounded-[12px] h-14 mt-1.5 flex items-center px-3.5 ${
          readOnly ? 'bg-[#eaf0ff] border-[#a9bceb]' : 'border-[#788cad] focus-within:border-[#091e47]'
        }`}
      >
        <input
          type={type === 'password' && show ? 'text' : type}
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && onEnter?.()}
          placeholder={placeholder}
          autoFocus={autoFocus}
          readOnly={readOnly}
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

function SelectField({ label, value, onChange, options }) {
  return (
    <div className="mt-4">
      <p className="text-[#0a1733] font-semibold text-[13px]">{label}</p>
      <div className="border-[1.5px] border-[#788cad] rounded-[12px] h-14 mt-1.5 flex items-center px-3.5 focus-within:border-[#091e47]">
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          className="flex-1 outline-none text-[15px] text-[#0a1733] bg-transparent cursor-pointer"
        >
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
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

function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="w-5 h-5" aria-hidden="true">
      <path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-3.2-.4-4.7H24v8.9h11.8c-.5 2.8-2 5.1-4.3 6.7v5.5h7c4.1-3.8 6.6-9.4 6.6-16.4z" />
      <path fill="#34A853" d="M24 46c5.8 0 10.7-1.9 14.3-5.2l-7-5.5c-1.9 1.3-4.4 2.1-7.3 2.1-5.6 0-10.4-3.8-12.1-8.9H4.7v5.6C8.3 41.4 15.6 46 24 46z" />
      <path fill="#FBBC05" d="M11.9 28.5c-.4-1.3-.7-2.7-.7-4.5s.3-3.2.7-4.5v-5.6H4.7C3 17.3 2 20.5 2 24s1 6.7 2.7 10.1l7.2-5.6z" />
      <path fill="#EA4335" d="M24 9.5c3.2 0 6 1.1 8.2 3.2l6.2-6.2C34.7 3 29.8 1 24 1 15.6 1 8.3 5.6 4.7 13.9l7.2 5.6C13.6 13.3 18.4 9.5 24 9.5z" />
    </svg>
  )
}

/**
 * Reads what the server said about a failed sign-in.
 *
 * The distinction that matters: a refused credential is a message the person can
 * act on ("check the password"), while an unreachable backend must not be
 * dressed up as one — telling somebody their password is wrong when nobody
 * checked it is the worst possible answer. Anything that is not an explicit
 * refusal is reported as "temporarily unavailable", and the real error goes to
 * the console.
 */
function signInMessage(err) {
  if (err?.offline) return SIGN_IN_UNAVAILABLE
  if (err?.status === 401 || err?.status === 403 || err?.status === 429) {
    return err.body?.error || 'Email or password is incorrect.'
  }
  return SIGN_IN_UNAVAILABLE
}

// The Firebase client SDK reports config problems through `err.code` (auth/*).
// During setup these are the errors that actually matter — an unauthorised
// domain or a disabled provider — so name them instead of hiding them behind a
// generic "unavailable". Backend failures (no auth/* code) fall back to
// signInMessage, which keeps not leaking infrastructure to a stranger.
function firebaseSignInMessage(err) {
  switch (err?.code) {
    case 'auth/unauthorized-domain':
      return 'This website is not an authorised Firebase domain yet. Add it under Firebase → Authentication → Settings → Authorized domains.'
    case 'auth/operation-not-allowed':
      return 'Google sign-in is not enabled for this project (Firebase → Authentication → Sign-in method → Google).'
    case 'auth/popup-blocked':
      return 'Your browser blocked the sign-in popup. Allow popups for this site and try again.'
    case 'auth/network-request-failed':
      return SIGN_IN_UNAVAILABLE
    default:
      return typeof err?.code === 'string' && err.code.startsWith('auth/')
        ? `Google sign-in failed (${err.code}).`
        : signInMessage(err)
  }
}

export default function Auth() {
  const navigate = useNavigate()
  const [view, setView] = useState('signin') // signin | forgot | reset-sent | success | signup | signup2 | signup-success
  const [email, setEmail] = useState('jiayin.tan@abcd.com')
  const [password, setPassword] = useState('Passport#2026')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [user, setUser] = useState(null)

  // Sign-up keeps its own fields. Sharing them with the sign-in box is how a
  // wizard ends up pre-filled with an account that already exists.
  const [form, setForm] = useState({
    name: '', email: '', org: 'ABCD Sdn Bhd', dept: 'Engineering', empId: '', password: '',
  })
  const set = (key, value) => setForm(f => ({ ...f, [key]: value }))
  const [consent, setConsent] = useState(false)

  const [sso, setSso] = useState(null) // { enabled, clientId, demo, accounts }
  const [chooser, setChooser] = useState(false)
  const googleButton = useRef(null)

  const { signIn, signInWithGoogle, signInWithFirebase } = useAuth()
  const toast = useToast()

  const copy = panelCopy[view]

  // What kind of SSO this deployment has. A failed lookup simply means no SSO
  // button — the password form is unaffected, so a config endpoint being down
  // can never lock everybody out.
  useEffect(() => {
    let alive = true
    ssoConfig()
      .then(c => alive && setSso(c.google))
      .catch(err => logFailure('SSO config', err))
    return () => { alive = false }
  }, [])

  // Real Google Identity Services, rendered by Google itself into the div below.
  // Only ever mounted when a client id is configured; the ID token it produces
  // is verified on the server before it means anything.
  useEffect(() => {
    if (!sso?.clientId || view !== 'signin' || !googleButton.current) return
    let cancelled = false

    const render = () => {
      if (cancelled || !window.google?.accounts?.id || !googleButton.current) return
      window.google.accounts.id.initialize({
        client_id: sso.clientId,
        callback: response => finishGoogle({ credential: response.credential }),
      })
      window.google.accounts.id.renderButton(googleButton.current, {
        theme: 'outline', size: 'large', shape: 'pill', width: 380,
        text: 'continue_with', logo_alignment: 'center',
      })
    }

    if (window.google?.accounts?.id) {
      render()
    } else {
      const existing = document.getElementById('gsi-client')
      const script = existing || Object.assign(document.createElement('script'), {
        id: 'gsi-client', src: 'https://accounts.google.com/gsi/client', async: true, defer: true,
      })
      script.addEventListener('load', render)
      if (!existing) document.head.appendChild(script)
    }
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sso?.clientId, view])

  async function submitSignIn() {
    if (!email.trim() || !password) return setError('Enter your email and password.')
    setBusy(true)
    setError(null)
    try {
      // No role is sent. The server proves the account and tells us what it is.
      const signedIn = await signIn(email.trim(), password)
      setUser(signedIn)
      setView('success')
    } catch (err) {
      // The real error goes to the console — the reader with devtools open is
      // the one debugging. The screen gets a sentence with no infrastructure,
      // no status code and no path in it.
      logFailure('sign-in', err)
      setError(signInMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function finishGoogle(payload) {
    setBusy(true)
    setError(null)
    setChooser(false)
    try {
      const signedIn = await signInWithGoogle(payload)
      setUser(signedIn)
      setView('success')
    } catch (err) {
      logFailure('Google sign-in', err)
      setError(signInMessage(err))
    } finally {
      setBusy(false)
    }
  }

  // Firebase Google sign-in: the popup returns an ID token, the server verifies
  // it and mints the session. A closed/cancelled popup is not an error to show.
  async function finishFirebaseGoogle() {
    setBusy(true)
    setError(null)
    try {
      const idToken = await firebaseGoogleIdToken()
      const signedIn = await signInWithFirebase(idToken)
      setUser(signedIn)
      setView('success')
    } catch (err) {
      if (err?.code === 'auth/popup-closed-by-user' || err?.code === 'auth/cancelled-popup-request') {
        return
      }
      logFailure('Firebase sign-in', err)
      // Firebase client errors (auth/*) carry a code that names the real cause —
      // surface it instead of the generic "unavailable", which hides config
      // problems like an unauthorised domain during setup.
      setError(firebaseSignInMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function submitSignUp() {
    if (!consent) return
    setBusy(true)
    setError(null)
    try {
      await apiRegister({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        org: form.org.trim(),
        dept: form.dept,
        employeeId: form.empId.trim() || undefined,
        consent: true,
      })
      // Carry the new credentials over to the sign-in box, so "Continue to sign
      // in" is one click and the account proves itself immediately.
      setEmail(form.email.trim())
      setPassword(form.password)
      setView('signup-success')
    } catch (err) {
      logFailure('sign-up', err)
      // A sign-up form is the one place where the specific problem *is* the
      // help: the person is creating the account, so "that email is taken" and
      // "the password is too short" are theirs to know.
      setError(err.offline ? SIGN_IN_UNAVAILABLE : (err.body?.error || 'Could not create the account. Please check the details and try again.'))
    } finally {
      setBusy(false)
    }
  }

  function continueToApp() {
    navigate(user?.role === 'admin' ? '/admin' : '/home', { replace: true })
  }

  const step1Ready = form.name.trim() && form.email.trim().includes('@')

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
              <Field label="Work email" value={email} onChange={setEmail} placeholder="jiayin.tan@abcd.com" autoFocus onEnter={submitSignIn} />
              <div className="mt-2" />
              <Field label="Password" value={password} onChange={setPassword} type="password" placeholder="••••••••••••" onEnter={submitSignIn} />
              <div className="flex justify-end mt-2">
                <button onClick={() => setView('forgot')} className="text-[#144dc2] font-semibold text-sm cursor-pointer">Forgot password?</button>
              </div>
              {error && <p className="text-[#d92d20] text-xs mt-2">{error}</p>}
              <GoldButton onClick={submitSignIn} disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</GoldButton>

              {(sso?.enabled || firebaseConfigured) && (
                <>
                  <div className="flex items-center gap-3 mt-6">
                    <div className="h-px bg-[#dee0e5] flex-1" />
                    <p className="text-[#5c6b87] font-semibold text-[11px]">OR</p>
                    <div className="h-px bg-[#dee0e5] flex-1" />
                  </div>

                  {firebaseConfigured ? (
                    // Firebase Authentication (proposal ZONE 3 · F). The popup
                    // returns an ID token the server verifies before the session
                    // is minted — takes precedence over the demo chooser.
                    <button
                      onClick={finishFirebaseGoogle}
                      disabled={busy}
                      className="border-[1.5px] border-[#dadce0] bg-white text-[#3c4043] font-semibold text-[15px] w-full h-[52px] rounded-full mt-6 cursor-pointer hover:bg-[#f7f8f8] disabled:opacity-60 flex items-center justify-center gap-3"
                    >
                      <GoogleMark />
                      {busy ? 'Signing in…' : 'Continue with Google'}
                    </button>
                  ) : sso.clientId ? (
                    // Google draws its own button — the mark, the wording and the
                    // consent flow are theirs, which is what the branding terms
                    // require and what people recognise.
                    <div ref={googleButton} className="mt-6 flex justify-center min-h-[44px]" />
                  ) : (
                    <button
                      onClick={() => setChooser(true)}
                      disabled={busy}
                      className="border-[1.5px] border-[#dadce0] bg-white text-[#3c4043] font-semibold text-[15px] w-full h-[52px] rounded-full mt-6 cursor-pointer hover:bg-[#f7f8f8] disabled:opacity-60 flex items-center justify-center gap-3"
                    >
                      <GoogleMark />
                      {busy ? 'Signing in…' : 'Continue with Google'}
                    </button>
                  )}
                </>
              )}

              <p className="text-[#5c6b87] text-xs text-center mt-5">Your organisation manages access and activity logging.</p>
              <button onClick={() => { setError(null); setView('signup') }} className="text-[#144dc2] font-semibold text-sm w-full text-center mt-4 cursor-pointer">
                New to AI Passport? Create account
              </button>
              <p className="text-[#5c6b87] text-[11px] text-center mt-5">By continuing, you agree to the acceptable-use and privacy policies.</p>
              {sso?.demo && (
                <div className="bg-[#f0f5ff] rounded-[10px] px-3 py-2.5 mt-4">
                  <p className="text-[#5c6b87] text-[11px] text-center leading-relaxed">
                    Demo accounts — employee <span className="font-semibold">jiayin.tan@abcd.com</span> · admin{' '}
                    <span className="font-semibold">admin@abcd.com</span><br />
                    Passwords are printed in the backend console at startup.
                  </p>
                </div>
              )}
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
              <button onClick={() => toast('Reset email re-sent — check your inbox')} className="text-[#144dc2] font-semibold text-sm w-full text-center mt-4 cursor-pointer">Resend email</button>
            </>
          )}

          {view === 'success' && (
            <>
              <SuccessMark />
              <h2 className="text-[#0a1733] font-bold text-[29px] text-center mt-6">Successfully authenticated</h2>
              <p className="text-[#5c6b87] text-[15px] text-center mt-3">
                Welcome back, {user?.name}. Your {user?.role === 'admin' ? 'admin console and governance tools' : 'AI license and safety progress'} are ready.
              </p>
              <div className="bg-[#e5faf2] border border-[#80d4b5] rounded-[14px] px-4 py-4 mt-5">
                <p className="text-[#088c66] font-semibold text-[13px] text-center">
                  ✓ Secure session{user?.defaultTool ? ` · Default AI tool: ${user.defaultTool}` : ''}
                </p>
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
              <Field label="Full name" value={form.name} onChange={v => set('name', v)} placeholder="Tan Jia Yin" autoFocus />
              <Field label="Work email" value={form.email} onChange={v => set('email', v)} placeholder="new.starter@abcd.com" />
              <Field label="Organisation" value={form.org} onChange={v => set('org', v)} />
              <SelectField label="Department" value={form.dept} onChange={v => set('dept', v)} options={DEPARTMENTS} />
              <GoldButton onClick={() => { setError(null); setView('signup2') }} disabled={!step1Ready}>Next</GoldButton>
              <button onClick={() => setView('signin')} className="text-[#144dc2] font-semibold text-sm w-full text-center mt-4 cursor-pointer">
                Already have an account? Sign in
              </button>
              <p className="text-[#5c6b87] text-[11px] text-center mt-4">Your administrator may need to verify your organisation membership.</p>
            </>
          )}

          {view === 'signup2' && (
            <>
              <p className="text-[#e3b214] font-bold text-xs">CREATE ACCOUNT</p>
              <h2 className="text-[#0a1733] font-bold text-[29px] mt-2">Set up your AI Passport</h2>
              <p className="text-[#5c6b87] text-sm mt-2">Use details that match your organisation directory.</p>
              <Field label="Full name" value={form.name} onChange={() => {}} readOnly />
              <Field label="Work email" value={form.email} onChange={() => {}} readOnly />
              <Field
                label="Employee ID" value={form.empId} onChange={v => set('empId', v)}
                placeholder="Leave blank to be assigned one" autoFocus
                hint="If this ID already belongs to somebody, you will be given the next free one."
              />
              <Field
                label="Create password" value={form.password} onChange={v => set('password', v)} type="password"
                placeholder="At least 12 characters"
                hint="Must include at least a number and a symbol."
              />
              <label className="flex items-center gap-3 mt-4 cursor-pointer">
                <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} className="w-[22px] h-[22px] accent-[#091e47]" />
                <span className="text-[#0a1733] text-xs">I agree to the acceptable-use and privacy policies.</span>
              </label>
              {error && <p className="text-[#d92d20] text-xs mt-3">{error}</p>}
              <GoldButton onClick={submitSignUp} disabled={!consent || busy}>{busy ? 'Creating account…' : 'Create account'}</GoldButton>
              <button onClick={() => { setError(null); setView('signup') }} className="text-[#144dc2] font-semibold text-sm w-full text-center mt-4 cursor-pointer">
                ← Back
              </button>
              <p className="text-[#5c6b87] text-[11px] text-center mt-4">New accounts start at AI License Level 1 · Trainee.</p>
            </>
          )}

          {view === 'signup-success' && (
            <>
              <SuccessMark />
              <h2 className="text-[#0a1733] font-bold text-[29px] text-center mt-6">Account created successfully</h2>
              <p className="text-[#5c6b87] text-[15px] text-center mt-3">
                {form.email} is registered at Level 1 · Trainee. Sign in to activate your passport and begin training.
              </p>
              <div className="bg-[#e5faf2] border border-[#80d4b5] rounded-[14px] px-4 py-4 mt-5">
                <p className="text-[#088c66] font-semibold text-[13px] text-center">✓ Credentials stored · Account ready</p>
              </div>
              <GoldButton onClick={() => { setError(null); setConsent(false); setView('signin') }}>Continue to sign in</GoldButton>
              <p className="text-[#5c6b87] text-xs text-center mt-6">Need help? Contact your organisation administrator.</p>
            </>
          )}
        </div>
      </div>

      {/* Demo account chooser — the shape of Google's own picker, shown only when
          this deployment has no Google project behind it. The server will only
          accept an account that already exists and has SSO enabled. */}
      {chooser && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center px-6 z-50" onClick={() => setChooser(false)}>
          <div className="bg-white rounded-[14px] w-full max-w-[400px] p-7 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <GoogleMark />
              <p className="text-[#3c4043] font-semibold text-sm">Sign in with Google</p>
            </div>
            <h3 className="text-[#202124] text-[22px] mt-4">Choose an account</h3>
            <p className="text-[#5f6368] text-[13px] mt-1">to continue to AI Passport</p>
            <div className="mt-5 divide-y divide-[#e8eaed] border-y border-[#e8eaed]">
              {(sso?.accounts || []).map(a => (
                <button
                  key={a.email}
                  onClick={() => finishGoogle({ demoEmail: a.email })}
                  disabled={busy}
                  className="w-full flex items-center gap-3 py-3.5 text-left hover:bg-[#f7f8f8] px-1 cursor-pointer disabled:opacity-60"
                >
                  <div className="w-9 h-9 rounded-full bg-[#091e47] text-white text-[13px] font-semibold flex items-center justify-center shrink-0">
                    {a.initials}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[#202124] text-sm font-medium truncate">{a.name}</p>
                    <p className="text-[#5f6368] text-[13px] truncate">{a.email}</p>
                  </div>
                  <span className="ml-auto text-[#5f6368] text-[11px] uppercase tracking-wide">{a.role}</span>
                </button>
              ))}
            </div>
            <p className="text-[#5f6368] text-[11px] mt-4 leading-relaxed">
              Demo single sign-on. Set GOOGLE_CLIENT_ID in the backend environment to use real Google accounts.
            </p>
            <button onClick={() => setChooser(false)} className="text-[#1a73e8] font-semibold text-sm mt-4 cursor-pointer">Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}
