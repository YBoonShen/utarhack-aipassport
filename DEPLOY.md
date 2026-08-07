# Deploying AI Passport (public URL — anyone can use it)

Matches the proposal's stack: **frontend on Vercel, backend on Render, Firebase
Auth + Firestore**. Two hosts because the backend is a long-running Node server
(it keeps sessions), which does not fit a static/serverless-only host.

Do these **in order**: backend first (so you have its URL), then frontend, then
one Firebase setting. Both hosts have a **free tier** and both let you **log in
with GitHub**. The repo is already on GitHub, so they deploy straight from it.

> Everything below is a one-time setup. The only login-only-you-can-do parts are
> creating the Vercel/Render accounts and clicking Deploy — the code and config
> are already in the repo.

---

## Fixed demo logins (already seeded)

| Who | How | Credentials |
|-----|-----|-------------|
| **Admin** | email + password | `admin@abcd.com` / `Admin@123456` |
| **Employee** | Google button, or sign-up | any `@gmail.com` (auto-provisioned Level 1), or register on the form |

(`Admin@123456` — the product requires ≥12 chars incl. a number and a symbol,
so plain `admin123` is rejected by design. Change it via the `SEED_ADMIN_PASSWORD`
env var on Render.)

---

## 1. Backend → Render (~5 min)

1. Go to <https://render.com> → **Sign in with GitHub**.
2. **New +** → **Web Service** → connect the `utarhack-aipassport` repo.
3. Settings:
   - **Root Directory:** `backend`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance type:** Free
4. **Environment** → add these variables:

   | Key | Value |
   |-----|-------|
   | `FIREBASE_PROJECT_ID` | `ai-passport-7697c` |
   | `SSO_ALLOWED_DOMAINS` | `abcd.com,gmail.com` |
   | `SEED_ADMIN_EMAIL` | `admin@abcd.com` |
   | `SEED_ADMIN_PASSWORD` | `Admin@123456` |
   | `GEMINI_API_KEY` | *(your Gemini key from backend/.env)* |
   | `FIREBASE_SERVICE_ACCOUNT_JSON` | *(paste the **entire** contents of `backend/serviceAccount.json` on one line — see note)* |

   **Pasting the service account:** open `backend/serviceAccount.json`, copy the
   whole `{ ... }`, and paste it as the value. Render stores it encrypted. This
   is how the server verifies logins and writes Firestore without a file on disk.

5. **Create Web Service.** When the log shows
   `Firebase connected (service account env): ai-passport-7697c`, copy the
   service URL — it looks like `https://ai-passport-backend.onrender.com`.

> ⏳ Free Render sleeps after ~15 min idle; the first request then takes ~50s to
> wake. Fine for a demo — just open the site a minute before showing it.

## 2. Point the frontend at that backend (1 min)

Edit **`frontend/vercel.json`** — replace the host with your real Render URL:

```json
{ "source": "/api/:path*", "destination": "https://ai-passport-backend.onrender.com/api/:path*" }
```

Commit and push (or just paste the URL to Claude and it will do this step).

## 3. Frontend → Vercel (~3 min)

1. Go to <https://vercel.com> → **Sign in with GitHub**.
2. **Add New… → Project** → import `utarhack-aipassport`.
3. Settings:
   - **Root Directory:** `frontend`
   - **Framework Preset:** Vite (auto-detected)
   - Build/output are auto (`npm run build` → `dist`).
4. **Environment Variables** — add the 4 public Firebase values (from
   `frontend/.env`):

   | Key | Value |
   |-----|-------|
   | `VITE_FIREBASE_API_KEY` | `AIzaSyAzdepNNJxeN61kNtorh22tcye4VUAmGMA` |
   | `VITE_FIREBASE_AUTH_DOMAIN` | `ai-passport-7697c.firebaseapp.com` |
   | `VITE_FIREBASE_PROJECT_ID` | `ai-passport-7697c` |
   | `VITE_FIREBASE_APP_ID` | `1:372855266907:web:297e5f646df0c7e859297e` |

5. **Deploy.** You get a URL like `https://ai-passport.vercel.app`.

## 4. Let Firebase trust the Vercel domain (30 sec — REQUIRED for Google login)

Google sign-in refuses unknown origins, so add the Vercel domain:

1. [Authentication → Settings → Authorized domains](https://console.firebase.google.com/project/ai-passport-7697c/authentication/settings)
2. **Add domain** → paste your Vercel host, e.g. `ai-passport.vercel.app` (no
   `https://`).

Also make sure **Google** is enabled under
[Sign-in method](https://console.firebase.google.com/project/ai-passport-7697c/authentication/providers).

---

## Done — test it

Open the Vercel URL from **any device, any network**:
- **Employee:** click **Continue with Google** → sign in → you are Level 1.
- **Admin:** `admin@abcd.com` / `Admin@123456`.

Detection events land in Firestore (`audit_log`) and the admin dashboard.

### Notes / limits
- **Render free filesystem is ephemeral:** registered accounts and the local
  audit log reset when the service restarts/redeploys. The seeded admin +
  employee and Google sign-in always come back (they re-seed / re-provision).
  Making accounts fully durable = move them to Firestore (a later task).
- **Secrets:** `serviceAccount.json` and `.env` stay gitignored. In the cloud
  they live only as Render/Vercel environment variables, never in the repo.
