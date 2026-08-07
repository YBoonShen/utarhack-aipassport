// Firebase client SDK — the browser half of proposal ZONE 3 · F.
//
// The employee signs in here (Google popup, or email/password), Firebase mints
// an ID token, and that token is handed to the backend's /api/auth/firebase,
// which verifies it and mints our session. This module never decides anything
// about identity — it only obtains the token the server will judge.
//
// Everything is gated on config being present. With no VITE_FIREBASE_* values
// the SDK is never initialised, `firebaseConfigured` is false, and the login
// screen simply does not offer the Firebase button — password / demo-SSO sign-in
// is untouched. (Firebase web config is public by design; see FIREBASE_SETUP.md.)

import { initializeApp, getApps } from 'firebase/app'
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword,
} from 'firebase/auth'

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

/** True only when the web config is filled in — the one switch the UI reads. */
export const firebaseConfigured = Boolean(config.apiKey && config.authDomain && config.projectId)

// Initialised lazily, and once: importing this module has no side effect, so an
// unconfigured build pays nothing and cannot throw at load.
let authInstance = null
function firebaseAuth() {
  if (!firebaseConfigured) throw new Error('Firebase is not configured')
  if (!authInstance) {
    const app = getApps()[0] || initializeApp(config)
    authInstance = getAuth(app)
  }
  return authInstance
}

/** Google popup → the Firebase ID token the backend will verify. */
export async function firebaseGoogleIdToken() {
  const provider = new GoogleAuthProvider()
  const result = await signInWithPopup(firebaseAuth(), provider)
  return result.user.getIdToken()
}

/** Email/password against Firebase → the ID token the backend will verify. */
export async function firebasePasswordIdToken(email, password) {
  const result = await signInWithEmailAndPassword(firebaseAuth(), email, password)
  return result.user.getIdToken()
}
