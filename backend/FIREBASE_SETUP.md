# Firebase setup — AI Passport

This wires the proposal's **ZONE 3**: **Firebase Authentication** (role-based
sign-in) and **Firestore** (the cloud audit log the admin dashboard reads).

The code is already written. It runs in **offline mode** until you drop in two
credentials, so nothing breaks before you finish these steps. You only need to
do this **once**, and only **one teammate** does it — then share the two files.

You will produce **two things**:

| # | What | Secret? | Goes where |
|---|------|---------|------------|
| A | `serviceAccount.json` (Admin SDK key) | 🔒 **secret** — never commit | `backend/serviceAccount.json` |
| B | Web `firebaseConfig` (apiKey, etc.) | public | `frontend/.env` as `VITE_FIREBASE_*` |

`.gitignore` already excludes `serviceAccount.json` and `.env` — keep it that way.

---

## 1. Create the project (2 min)

1. Go to <https://console.firebase.google.com> → **Add project**.
2. Name it e.g. `ai-passport` → Continue. Google Analytics is optional (skip it).
3. Wait for "Your project is ready" → Continue.

## 2. Enable Authentication (2 min)

1. Left menu → **Build → Authentication** → **Get started**.
2. **Sign-in method** tab → enable:
   - **Email/Password** → Enable → Save.
   - **Google** → Enable → pick a support email → Save.

## 3. Enable Firestore (1 min)

1. Left menu → **Build → Firestore Database** → **Create database**.
2. Start in **production mode** (or test mode for the hackathon) → pick a region
   near you (e.g. `asia-southeast1`) → Enable.

## 4. Get the web config → gives you (B) (2 min)

1. **Project settings** (gear icon, top-left) → **General** tab.
2. Scroll to **Your apps** → click the **`</>` (Web)** icon → register app
   (nickname `ai-passport-web`, **do not** tick Firebase Hosting) → Register.
3. Copy the `firebaseConfig` values. Put them in **`frontend/.env`**
   (copy `frontend/.env.example` first):

   ```env
   VITE_FIREBASE_API_KEY=AIza...
   VITE_FIREBASE_AUTH_DOMAIN=ai-passport.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=ai-passport
   VITE_FIREBASE_APP_ID=1:...:web:...
   ```

   These are **public** by design (Firebase secures data with rules, not by
   hiding the config).

## 5. Get the Admin key → gives you (A) (1 min)

1. **Project settings** → **Service accounts** tab.
2. **Generate new private key** → confirm → a JSON file downloads.
3. Save it as **`backend/serviceAccount.json`** (exact name).
   🔒 This one is a real secret — it is already gitignored; never paste it into
   chat, commit it, or share it publicly.

## 6. Point the backend at the project (30 sec)

In `backend/.env`, set (the project id is the same one from step 4):

```env
FIREBASE_PROJECT_ID=ai-passport
```

## 7. Restart and verify

```bash
# backend
cd backend && npm run dev
# should print:  Firebase connected (service account): ai-passport
curl http://localhost:5001/api/health
# "firebase":{"configured":true,"firestore":true,"mode":"full", ...}
```

```bash
# frontend
cd frontend && npm run dev
```

Then sign in with the **Sign in with Google** button on the login screen — the
browser gets a Firebase ID token, the backend verifies it, and a session is
minted. Detection events now also land in Firestore under the `audit_log`
collection.

---

## Notes

- **Who may sign in with Google:** controlled by `SSO_ALLOWED_DOMAINS` in
  `backend/.env` (default `abcd.com`). A first-time Google signer on an allowed
  domain is provisioned as a Level 1 employee; anyone else is refused. For the
  demo, either add your own email's domain there, or sign in with one of the
  seeded accounts.
- **Offline is always safe:** remove the two files and the app falls straight
  back to local password + demo-SSO sign-in and the local audit log. Firebase is
  additive, never a hard dependency.
- **Firestore rules:** since all reads/writes go through the Admin SDK on the
  server (which bypasses rules), you can leave Firestore locked to clients. Do
  **not** open it to public client access.
