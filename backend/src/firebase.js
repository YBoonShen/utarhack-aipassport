// Firebase Admin setup — Authentication + Firestore.
//
// This is ZONE 3 of the proposal's architecture (Figure 1): Firestore for the
// audit log / points / tool registry (E), and Firebase Authentication for
// role-based sign-in (F). The whole module is written so the server *always*
// starts: with no credentials it runs in "offline mode" and every export is a
// safe no-op, so teammates can run the app, and CI can pass, without a Firebase
// project. Add credentials and the same functions start talking to Firebase —
// nothing that calls them has to change.
//
// Two credentials, two jobs:
//   • serviceAccount.json  — the Admin SDK's key. Lets this server *verify* the
//     ID tokens the browser presents and read/write Firestore. Secret; gitignored.
//   • the web firebaseConfig — public, lives in the frontend; not used here.
// firebase-admin v14 is ESM-native: the modular subpath imports are the
// supported way in. (The legacy `import admin from 'firebase-admin'` default
// leaves `admin.credential` undefined under ESM — the "reading 'cert'" crash.)
import { initializeApp, cert, applicationDefault, getApps } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const BACKEND_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
// Overridable so a deployment can point at a mounted secret instead of a file in
// the repo checkout. Default is backend/serviceAccount.json, which .gitignore
// keeps out of version control.
const SERVICE_ACCOUNT_FILE =
  process.env.FIREBASE_SERVICE_ACCOUNT || path.join(BACKEND_DIR, 'serviceAccount.json')

let app = null
let db = null
let auth = null
let projectId = null

/**
 * Bring the Admin SDK up if — and only if — we have something to bring it up
 * with. Preference order:
 *   1. a service account JSON (full Admin: verify tokens + Firestore)
 *   2. FIREBASE_PROJECT_ID alone (enough to *initialise*, useful in a Google
 *      environment with application-default credentials; still degrades safely)
 * Anything less and we stay offline, on purpose.
 */
function init() {
  try {
    // --watch reloads this module; never initialise the same app twice.
    if (getApps().length) {
      app = getApps()[0]
      auth = getAuth(app)
      try { db = getFirestore(app) } catch { db = null }
      return
    }

    // Deployment path (Render/Vercel): the whole service-account JSON pasted
    // into an env var, because a hosted process has no repo file to read. Tried
    // first so production never depends on a file being present on disk.
    const inlineJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
    if (inlineJson && inlineJson.trim().startsWith('{')) {
      const serviceAccount = JSON.parse(inlineJson)
      projectId = serviceAccount.project_id || process.env.FIREBASE_PROJECT_ID || null
      app = initializeApp({ credential: cert(serviceAccount), projectId })
      db = getFirestore(app)
      auth = getAuth(app)
      console.log(`Firebase connected (service account env): ${projectId}`)
      return
    }

    // Local path: backend/serviceAccount.json on disk (gitignored).
    if (fs.existsSync(SERVICE_ACCOUNT_FILE)) {
      const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_FILE, 'utf8'))
      projectId = serviceAccount.project_id || process.env.FIREBASE_PROJECT_ID || null
      app = initializeApp({ credential: cert(serviceAccount), projectId })
      db = getFirestore(app)
      auth = getAuth(app)
      console.log(`Firebase connected (service account): ${projectId}`)
      return
    }

    const envProject = process.env.FIREBASE_PROJECT_ID
    if (envProject && envProject !== 'your-project-id') {
      // No service account key on disk: initialise with the project id so token
      // *verification* still works via Google's public keys. Firestore writes
      // will only succeed if application-default credentials happen to be present
      // (e.g. on Cloud Run); otherwise logDetection degrades to offline.
      projectId = envProject
      try {
        app = initializeApp({ credential: applicationDefault(), projectId })
      } catch {
        app = initializeApp({ projectId })
      }
      auth = getAuth(app)
      try {
        db = getFirestore(app)
      } catch {
        db = null
      }
      console.log(`Firebase Auth ready (project id only): ${projectId} — add serviceAccount.json for Firestore`)
      return
    }

    console.log('Firebase not configured yet — running in offline mode (see .env.example / FIREBASE_SETUP.md)')
  } catch (err) {
    // A bad key must not take the server down. Offline is a valid state.
    app = null
    db = null
    auth = null
    console.warn('Firebase init failed — running in offline mode:', err.message)
  }
}

init()

/** True once the Admin SDK is up (either credential path). */
export function firebaseReady() {
  return Boolean(app)
}

/** True when Firestore is actually writable (service account present). */
export function firestoreReady() {
  return Boolean(db)
}

/** Diagnostics for /api/health — never leaks a credential, only its presence. */
export function firebaseStatus() {
  return {
    configured: firebaseReady(),
    firestore: firestoreReady(),
    projectId: projectId || null,
    mode: firebaseReady() ? (firestoreReady() ? 'full' : 'auth-only') : 'offline',
  }
}

/**
 * Verify a Firebase ID token and return its verified claims, or null.
 *
 * This is the whole of "who is this caller" for Firebase sign-in: the browser
 * signs in with the Firebase client SDK, hands the server the ID token it got
 * back, and this function checks Google's signature, the audience, the issuer
 * and expiry before anybody is trusted. A token that fails any check is null —
 * not a weaker identity, nothing. Offline (no Admin SDK) is also null, so the
 * caller falls back to the local password/SSO paths rather than crashing.
 */
export async function verifyFirebaseToken(idToken) {
  if (!auth || !idToken) return null
  try {
    const decoded = await auth.verifyIdToken(String(idToken))
    return {
      uid: decoded.uid,
      email: decoded.email || null,
      emailVerified: decoded.email_verified === true,
      name: decoded.name || decoded.email?.split('@')[0] || null,
      // 'google.com', 'password', etc. — how they proved it to Firebase.
      provider: decoded.firebase?.sign_in_provider || null,
    }
  } catch (err) {
    console.warn('Firebase ID token rejected:', err.message)
    return null
  }
}

/**
 * Write a detection event to the audit log in Firestore (E in the architecture).
 * A no-op that reports why until Firestore is configured — the local audit log
 * in store.js remains the source of truth either way, so nothing is lost when
 * Firebase is offline.
 */
export async function logDetection(event) {
  if (!db) return { stored: false, reason: 'firebase-offline' }
  try {
    const doc = await db.collection('audit_log').add({ ...event, ts: new Date() })
    return { stored: true, id: doc.id }
  } catch (err) {
    console.warn('Firestore audit write failed:', err.message)
    return { stored: false, reason: 'firestore-error' }
  }
}

export { db, auth }
