// AI Passport — the app's one answer to "is this person signed in?".
//
// Four states, never two. The bug this exists to end came from collapsing them:
// the router asked `currentUser()`, localStorage said "admin", and the console
// mounted — with no server involved, and most visibly when there was no server
// to involve. "We have not asked yet" and "we asked and could not reach anyone"
// are not the same thing as "yes", and neither of them may render an
// authenticated screen.
//
//   loading         — resolving. Nothing authenticated is shown yet, and this is
//                     the state the app *starts* in, always.
//   authenticated   — the server verified the token and named the session's
//                     owner. `user` is the server's record.
//   unauthenticated — no token, or the server refused it (401). Local session
//                     state has already been cleared.
//   unavailable     — the check did not complete. Not signed in, not signed out:
//                     unable to verify. The token is kept, because a backend
//                     that is down has not ended anybody's session, and the
//                     check keeps retrying so recovery needs no refresh.
//
// Firebase Auth changes only what fetchSession() calls. The state machine, the
// guards and every consumer stay as they are.

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import {
  fetchSession, login as apiLogin, loginWithGoogle as apiLoginWithGoogle,
  loginWithFirebase as apiLoginWithFirebase, logout as apiLogout,
  currentUser, getToken, onAuthInvalid,
} from './api.js'

export const AUTH = {
  LOADING: 'loading',
  AUTHENTICATED: 'authenticated',
  UNAUTHENTICATED: 'unauthenticated',
  UNAVAILABLE: 'unavailable',
}

// How often a live session is re-checked while the app is open. The server can
// end a session without telling anybody — an expiry, a sign-out in another
// window — so a screen that never asks again is a screen that can be wrong for
// as long as it stays open.
const REVALIDATE_MS = 60_000
// While the backend is unreachable, ask more often: this is the interval between
// the service coming back and the app noticing, and nobody should have to reload
// to find out.
const RETRY_MS = 5_000

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [state, setState] = useState({
    status: AUTH.LOADING,
    // Shown while the first check runs so the header is not empty, and dropped
    // the moment the server answers. It is never why anything is rendered.
    user: currentUser(),
    reason: null,
  })

  // Two guards against the races that make auth state flicker or lie:
  //   `seq`      — only the newest check may write state, so a slow reply that
  //                started before a sign-in cannot overwrite the sign-in.
  //   `inFlight` — the mount check, the poll and a focus event fire together on
  //                a returning tab; they share one request rather than three.
  const seq = useRef(0)
  const inFlight = useRef(null)
  const mounted = useRef(true)

  const revalidate = useCallback(async () => {
    if (inFlight.current) return inFlight.current
    const ticket = ++seq.current

    inFlight.current = (async () => {
      const result = await fetchSession()
      // A sign-in or sign-out that happened while this was in the air is the
      // newer truth; this answer is stale and is dropped.
      if (!mounted.current || ticket !== seq.current) return result
      setState({
        status: {
          authenticated: AUTH.AUTHENTICATED,
          unauthenticated: AUTH.UNAUTHENTICATED,
          unavailable: AUTH.UNAVAILABLE,
        }[result.status],
        // On `unavailable` the cached identity is kept for the header only — the
        // status is what every gate reads, and it does not say authenticated.
        user: result.status === 'authenticated' ? result.user
          : result.status === 'unavailable' ? currentUser()
            : null,
        reason: result.reason || null,
      })
      return result
    })()

    try {
      return await inFlight.current
    } finally {
      inFlight.current = null
    }
  }, [])

  // Resolve once at startup, before anything authenticated can be shown.
  useEffect(() => {
    mounted.current = true
    revalidate()
    return () => { mounted.current = false }
  }, [revalidate])

  // Any 401, from any call anywhere in the app, ends the session here. The
  // request layer has already cleared the stored token by the time this runs.
  useEffect(() => onAuthInvalid(reason => {
    seq.current++ // nothing already in flight may resurrect the session
    setState({ status: AUTH.UNAUTHENTICATED, user: null, reason })
  }), [])

  // Keep asking. Faster while unavailable, so the app recovers by itself when
  // the backend comes back rather than waiting to be reloaded.
  useEffect(() => {
    const period = state.status === AUTH.UNAVAILABLE ? RETRY_MS : REVALIDATE_MS
    const timer = setInterval(revalidate, period)
    return () => clearInterval(timer)
  }, [state.status, revalidate])

  // A tab that was in the background is the most likely one to be holding a
  // session that ended while nobody was looking at it.
  useEffect(() => {
    const check = () => { if (document.visibilityState === 'visible') revalidate() }
    document.addEventListener('visibilitychange', check)
    window.addEventListener('online', revalidate)
    return () => {
      document.removeEventListener('visibilitychange', check)
      window.removeEventListener('online', revalidate)
    }
  }, [revalidate])

  // Signing out in one tab signs out the others. `storage` fires only in the
  // *other* tabs, which is exactly the audience for it.
  useEffect(() => {
    const onStorage = e => {
      if (e.key === 'aip-token' || e.key === null) {
        if (!getToken()) setState({ status: AUTH.UNAUTHENTICATED, user: null, reason: 'signed-out-elsewhere' })
        else revalidate()
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [revalidate])

  // Both sign-ins end the same way, because both have already been proven by
  // the server before they get here: `user` is the server's record of who the
  // credential belongs to, and the role on it is the role. Nothing about the
  // form the person filled in reaches this state.
  const adopt = useCallback(user => {
    seq.current++ // any check still in the air belongs to the session before this
    setState({ status: AUTH.AUTHENTICATED, user, reason: null })
    return user
  }, [])

  const signIn = useCallback(async (email, password) => adopt(await apiLogin(email, password)), [adopt])

  const signInWithGoogle = useCallback(async payload => adopt(await apiLoginWithGoogle(payload)), [adopt])

  // Firebase sign-in: the browser has already obtained a Firebase ID token; the
  // server verifies it and proves the account, same as every other path here.
  const signInWithFirebase = useCallback(async idToken => adopt(await apiLoginWithFirebase(idToken)), [adopt])

  const signOut = useCallback(async () => {
    // The local state goes first and unconditionally: a sign-out the server
    // never hears about must still be a sign-out here.
    seq.current++
    setState({ status: AUTH.UNAUTHENTICATED, user: null, reason: 'signed-out' })
    await apiLogout()
  }, [])

  return (
    <AuthContext.Provider value={{ ...state, signIn, signInWithGoogle, signInWithFirebase, signOut, revalidate }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
