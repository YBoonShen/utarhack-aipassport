// Firebase Admin setup (Firestore + Auth).
// Runs in "offline mode" until the team adds real credentials to .env —
// so the server always starts, even before Firebase is configured.
import admin from 'firebase-admin'

let db = null

if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_PROJECT_ID !== 'your-project-id') {
  admin.initializeApp({
    projectId: process.env.FIREBASE_PROJECT_ID,
    // For the hackathon: download a service account JSON from
    // Firebase Console > Project settings > Service accounts,
    // save it as backend/serviceAccount.json (gitignored!) and uncomment:
    // credential: admin.credential.cert(JSON.parse(fs.readFileSync('./serviceAccount.json')))
  })
  db = admin.firestore()
  console.log('Firebase connected:', process.env.FIREBASE_PROJECT_ID)
} else {
  console.log('Firebase not configured yet — running in offline mode (see .env.example)')
}

/** Write a detection event to the audit log (no-op until Firebase is configured). */
export async function logDetection(event) {
  if (!db) return { stored: false, reason: 'firebase-offline' }
  const doc = await db.collection('audit_log').add({ ...event, ts: new Date() })
  return { stored: true, id: doc.id }
}
