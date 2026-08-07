# AI Passport — Safe AI for Every Employee

**Team Soda** · UTAR Hackathon · Case Study 3: AI Governance & Responsible AI in Enterprise

AI Passport lets companies say "yes" to AI instead of "no". Employees keep using AI tools
and stay productive, while the company keeps full visibility and control over its data.
Four features: a gamified **AI License**, a **Smart Gateway** that masks
sensitive data ("mask, don't block"), an **Admin Dashboard** with live risk alerts and
audit log, and an **AI Tool Approval workflow** ("guide, don't punish").

## 🚀 Live Demo

### 🔗 Try it now — nothing to install: **[utarhack-aipassport.vercel.app](https://utarhack-aipassport.vercel.app)**

| Sign in as | How |
|---|---|
| **Admin** — compliance console | `admin@abcd.com` / `Admin@123456` |
| **Employee** | **Continue with Google** (a Gmail account → provisioned at Level 1), or **Create account** |

Deployed on **Vercel** (web) + **Render** (API) + **Firebase** (Authentication & Firestore).
Registered accounts are saved in Firestore, so they survive redeploys. The very first visit
of the day may take ~30–50s while the free API instance wakes up, then it's instant.

> **Contributors:** see **[TEAM.md](TEAM.md)** for the workflow (push to `main` → auto-deploys
> to Vercel + Render) and **[DEPLOY.md](DEPLOY.md)** for how the deployment is set up.

## Team Members
- Yeap Boon Shen (@YBoonShen) — Team Leader
- Lee Jia Yin
- Muhammad Ikhlas Bin Mohd Faizal
- Samantha Chan Pei Yin

---

# Part 1 — Getting started (no experience needed)

Everything below runs on your own laptop. Nothing is uploaded anywhere, and you do not
need an account, a server or a credit card.

## What the system is made of

| Piece | What it does | Where it runs |
|---|---|---|
| **Backend** | The "brain" — scans prompts for sensitive data, stores the audit log and XP | http://localhost:5001 |
| **Frontend** | The website — employee passport, training, admin dashboard | http://localhost:5173 |
| **Chrome extension** | Sits inside ChatGPT/Claude/Gemini and checks prompts before they are sent | Your Chrome browser |

The extension needs the backend running — the backend is what does the detection.

## Step 1 — Install Node.js (one time)

1. Go to <https://nodejs.org> and download the **LTS** version.
2. Run the installer and click Next until it finishes.
3. Check it worked. Open **Command Prompt** (press `Win`, type `cmd`, press Enter) and run:
   ```
   node -v
   ```
   You should see something like `v20.11.0`. Any version **18 or higher** is fine.
   If you see "not recognized", close Command Prompt, open it again, and retry.

You also need **Google Chrome** (or Edge/Brave — anything Chromium-based) for the extension.

## Step 2 — Start the system

### On Windows — the easy way

Double-click **`start.bat`** in this folder.

That's it. The first run takes 1–3 minutes because it downloads the libraries; after that
it takes a few seconds. Two black windows open (backend and frontend) and your browser
opens at http://localhost:5173.

> **Keep the two black windows open.** They *are* the servers — closing them stops the app.
> To shut everything down later, double-click **`stop.bat`**.
>
> Want it to start automatically when Windows starts? Press `Win+R`, type `shell:startup`,
> press Enter, and drop a **shortcut** to `autostart.bat` into the folder that opens.

### On macOS / Linux, or if you prefer doing it by hand

Open **two** terminal windows and leave both running.

Terminal 1 — the backend:
```bash
cd backend
npm install     # first time only
npm run dev
```
Wait until it prints that it is listening on port 5001.

Terminal 2 — the frontend:
```bash
cd frontend
npm install     # first time only
npm run dev
```
Then open <http://localhost:5173> in your browser.

**How do I know it worked?** Visit <http://localhost:5001/api/health> — you should see a
short JSON response. If you do, the backend is alive.

## Step 3 — Sign in

Passwords are real. The password you type is checked against a stored scrypt hash —
there is no "any password works" path, and nothing you type decides whether you get
the admin console. **Two accounts are provisioned** when the backend first starts:

| To open | Email | Password |
|---|---|---|
| Employee passport (Tan Jia Yin, E-217, Level 2) | `jiayin.tan@abcd.com` | `Passport#2026` |
| Admin console (compliance) | `admin@abcd.com` | `AdminPass#2026` |

`tanjiayin@abcd.com` reaches the same employee account — it is an alias, not a second
passport. The sign-in form is pre-filled with the employee account, so you can just
click **Sign in**. The backend also prints both accounts in its console window at
startup, so you never have to come back to this table.

**Three ways to sign in, all of which work out of the box:**

1. **Email + password** — the table above.
2. **Continue with Google** — see [Google single sign-on](#google-single-sign-on-sso)
   below. With no Google project configured you get a demo account chooser offering
   the same two organisation identities; set `GOOGLE_CLIENT_ID` and it becomes real
   Google sign-in, verified server-side.
3. **Create account** — the sign-up wizard writes a real account. Fill in name, email,
   organisation and department, then set an employee ID (optional) and a password of
   **at least 12 characters including a number and a symbol**. The new account can
   sign in immediately and **starts at AI License Level 1 · Trainee** with an empty
   passport — 0 points, no stamps, no training history.

Accounts are stored in `backend/data/accounts.json` (gitignored, hashes only) and
survive a restart. To wipe every account you created and go back to the two seeded
ones, stop the backend and delete that file.

**What the admin sees when you create one.** The new employee's *own* passport is
empty — that is what Level 1 means. The organisation's record of them is not: an
account creation writes a `CREATED` event to the **Audit Log**, and they appear as a
row in **Employees** (marked `New starter`) as soon as they are registered, before
they have signed in even once. Sign in as `admin@abcd.com` after step 3 above and
check both.

> **Signing in as a second employee** is what makes the training assignment demo
> convincing: put the admin console in one window and a second account in another,
> assign a module to E-217, and watch it appear for E-217 and *not* for the other one.
> Create the second employee through **Create account** — they get their own directory
> ID and their own blank passport. The seeded directory IDs are `E-217`, `E-198`,
> `S-044`, `F-102`, `M-083`, `H-011`, `O-031`.

### Changing the seeded passwords

For anything that is not a local demo, put these in `backend/.env` (copy
`backend/.env.example`) and restart the backend:

```
SEED_EMPLOYEE_PASSWORD=your-own-password
SEED_ADMIN_PASSWORD=your-own-password
```

They only apply the *first* time each account is created. If `backend/data/accounts.json`
already exists, delete it first — an existing account keeps the password it was
created with.

## Google single sign-on (SSO)

**Out of the box, with nothing to configure:** the sign-in screen shows a
**Continue with Google** button that opens a Google-style account chooser listing the
two organisation identities (Tan Jia Yin and Admin). Pick one and you are signed in as
that account. This is a demo path and it is fenced in deliberately — it only runs when
no `GOOGLE_CLIENT_ID` is set, it refuses to run under `NODE_ENV=production`, and it can
only ever select an account that already exists and has SSO enabled. It can never reach
an account somebody created through the sign-up form.

**With a real Google project** (recommended if you have five minutes):

1. Go to https://console.cloud.google.com/apis/credentials
2. **Create credentials → OAuth client ID → Web application**
3. Under **Authorised JavaScript origins** add `http://localhost:5173`
4. Copy the client ID into `backend/.env`:
   ```
   GOOGLE_CLIENT_ID=1234567890-abcdefg.apps.googleusercontent.com
   SSO_ALLOWED_DOMAINS=abcd.com
   ```
5. Restart the backend.

The demo chooser disappears and Google renders its own sign-in button. The ID token
Google issues is verified **on the server** — signature, audience, issuer, expiry and
`email_verified` — before anybody is signed in; the browser's claim about who signed in
is not part of the decision. A first-time Google signer whose email is on an allowed
domain is provisioned as an employee at Level 1; anyone else is refused.

## Step 4 — Install the Chrome extension

1. Open Chrome and go to `chrome://extensions` (type it in the address bar).
2. Turn on **Developer mode** — the switch at the **top right**.
3. Click **Load unpacked** (top left).
4. Select the **`extension`** folder inside this project — the folder itself, not a file
   inside it. Click *Select Folder*.
5. "AI Passport — Smart Gateway" now appears in the list.
6. Click the puzzle-piece 🧩 icon in Chrome's toolbar and **pin** AI Passport so you can
   see its icon.

Now click the AI Passport icon. It should say **Protected**. If it says *Sign in to
protect your prompts*, go back to http://localhost:5173 and sign in (Step 3) — the
extension follows the dashboard's session.

> After changing any file inside `extension/`, return to `chrome://extensions` and click
> the **↻ reload** icon on the AI Passport card.

## Step 5 — Try it (5 minutes)

### A. See the extension protect a real prompt

1. Open <https://chatgpt.com>.
2. Type an ordinary question: `Explain SQL joins to me in simple terms`
   → **Nothing happens.** The extension stays invisible for safe prompts.
3. Now type something with personal data:
   ```
   Draft a reminder for customer Lim, IC 880505-10-5566, about RM 4,500
   ```
4. Stop typing. After about half a second a panel slides in listing what it found:
   `IC NUMBER ×1`, `FINANCIAL FIGURE ×1`, `NAME ×1`.
5. Click **Protect & continue**. The text in the composer is replaced with a masked
   version, and *that* is what gets sent to ChatGPT. The real IC number never leaves
   your browser.

### B. See the same thing on the website

Go to <http://localhost:5173/gateway>, paste the same sentence and press the check
button. This is the Smart Gateway demo — same detection engine, no extension needed.

### C. See it from the company's side

Sign out, sign in as `admin@abcd.com` / `AdminPass#2026`, and look at:
- **Overview** — live counters of prompts protected and items masked
- **Audit Log** — one `MASKED` entry for the prompt you just protected (the masked text
  is stored, never the original)
- **Settings** — switch the policy between **Mask** and **Warn only**, then retype the
  prompt in ChatGPT to see the extension behave differently. (There is no org-wide
  "Block" mode: blocking every sensitive prompt everywhere is the posture that moves the
  work to a personal laptop. Blocking is decided per destination instead — see below.)

### D. Earn XP as an employee

Sign back in as an employee and open **Training** → complete a module quiz. Your XP,
level and stamps update on the **License** page — and they survive a restart.

### E. Assign a training and watch it arrive

1. As admin, open **Training modules**. Module 5 (*AI Tools at Work*) ships as a draft —
   click **Publish**.
2. Click **Edit questions** on it. The saved questions are listed with their answers;
   click one to change its wording or its correct answer, then **Confirm training
   module**. Nothing is saved until you confirm. A module holds at most **40** questions.
3. Click **Assign →**, pick **Employee**, tick `E-217`, confirm.
4. In another window, sign in as `jiayin.tan@abcd.com` / `Passport#2026` (that is E-217). The module is
   on **Training** immediately, and the notification bell has a **Start training** quick
   action that opens it.
5. Sign in as a *different* employee instead — create one through **Create account**, or
   use any second account you have made: no notification, the module is not listed, and
   opening `/training/quiz/5` directly is refused — the refusal is recorded in the
   admin **Audit Log** as a `DENIED` event.

Everything an admin does — publish, hide, edit questions, assign, decide a tool request,
change the policy — appears in the Audit Log within a couple of seconds, without
refreshing the page.

### F. Trigger a real risk alert (2 minutes)

Open **Admin → Risk Alerts** in one window and the employee **Smart Gateway** in another.

**Repeated identifiers.** Paste this into the Gateway and send it three times:
```
Draft a reminder for customer Lim, IC 880505-10-5566, about the order
```
- Sends 1 and 2 raise **nothing** — a masked prompt is the system working.
- Send 3 raises one **MEDIUM** alert, and the employee gets a notification first.
- Sends 4 and 5 **escalate that same card to HIGH**. No second card ever appears.

**Unapproved tool.** In the Gateway's *Sending to* row, pick **DeepSeek** (marked ⚠ —
it has no visa). A **MEDIUM** alert appears immediately, the employee is told which
tool and where to request a visa, and the prompt is still protected — nothing is
blocked. Picking it again does not add a second card.

Then close the loop: **Tool Approvals → approve SummarizerX** and the register stops
flagging it. Or on the alert, **Assign training** opens the assignment wizard already
on the employee the alert is about.

With the Chrome extension loaded, opening <https://deepseek.com> does the same thing —
the extension shows its standing "not approved" banner *and* the admin gets the alert.

## If something goes wrong

| Problem | Fix |
|---|---|
| `npm` or `node` is "not recognized" | Node.js isn't installed, or Command Prompt was open before you installed it. Reinstall from Step 1 and open a **new** Command Prompt. |
| The page at localhost:5173 won't load | The frontend window isn't running. Re-run `start.bat`, or `npm run dev` inside `frontend`. |
| Extension popup says "Gateway unreachable" | The backend isn't running. Check <http://localhost:5001/api/health>. |
| Popup says "Sign in to protect your prompts" | Nobody is signed in. Sign in at http://localhost:5173 — an open ChatGPT tab picks it up within about 15 seconds, with no reload. |
| Popup says "Your sign-in could not be confirmed" | The backend has been unreachable for over two minutes, so the session can no longer be verified. Check <http://localhost:5001/api/health>; it clears by itself when the backend answers again. |
| The dashboard says "We can't verify your session right now" | Same cause, web-app side. It is deliberately *not* showing you as signed in — it retries every few seconds and recovers on its own. |
| "Email or password is incorrect" with the passwords from Step 3 | You created `backend/data/accounts.json` with different seed passwords set, or the backend is running older code. Stop the backend, delete `backend/data/accounts.json`, start it again, and read the credentials it prints. |
| "Sign-in is temporarily unavailable" | Nothing checked your password — the backend is not answering. Check <http://localhost:5001/api/health>. (It deliberately does **not** say "wrong password", because nobody looked at it.) |
| "Too many sign-in attempts" | 8 wrong passwords for one account in 15 minutes. Wait, or restart the backend to clear the counters. |
| The Google button doesn't appear | The backend is not answering `/api/auth/sso/config`. Start it and reload the page. |
| Google sign-in says "could not be verified" | `GOOGLE_CLIENT_ID` does not match the client ID the page was loaded with, or `http://localhost:5173` is not an authorised JavaScript origin on that OAuth client. |
| "That Google account is not part of your organisation" | Your Google email's domain is not in `SSO_ALLOWED_DOMAINS`. Add it in `backend/.env` and restart. |
| A new account you created signs in as Tan Jia Yin | Old code. Every new account gets its own directory ID; restart the backend so it picks up the current build. |
| Port 5001 or 5173 "already in use" | Something else is on that port. Double-click `stop.bat` and start again. |
| The panel never appears in ChatGPT | Reload the extension at `chrome://extensions`, then **refresh the ChatGPT tab**. |
| Nothing detected at all | Prompts under 12 characters are skipped on purpose. Try the full example sentence. |

Still stuck? Open Chrome DevTools on the AI tab (`F12` → Console) and look for
`[AI Passport]` lines — they trace every step. Prompt text is never logged.

---

# Part 2 — Reference (for developers)

## Project Structure
```
utarhack-aipassport/
├── frontend/    React + Vite + Tailwind CSS (employee, public + admin screens)
├── backend/     Node.js + Express (2-layer detection; Firebase Auth + Firestore, offline-safe)
├── extension/   Chrome extension, Manifest V3 (see extension/README.md)
├── start.bat    One-click launcher (Windows) · stop.bat · autostart.bat
└── README.md
```

The four files that decide whether somebody is signed in, and as whom:

| File | Question it answers |
|---|---|
| `backend/src/accounts.js` | Is this person who they say they are? Password hashing, registration, Google identities. |
| `backend/src/auth.js` | Is this token a live session? Minting, expiry, the record the extension follows. |
| `backend/src/server.js` | The routes, `requireAdmin`, and the throttle in front of the password check. |
| `frontend/src/lib/auth.jsx` | What the web app is allowed to conclude — four states, never two. |

Written state lives in `backend/data/` (gitignored): `accounts.json` (hashes only),
`sessions.json`, `progress.json`.

## Optional — better name detection, and an AI-written executive summary

Two things use the model, and both work without it. Layer 2 (person names) falls back
to a context heuristic; the compliance report's executive summary falls back to a
governance analyst that composes the same paragraph from the same figures. Neither
fallback is ever labelled as AI output — the report says "GOVERNANCE ANALYST" when
that is what wrote it. For sharper results on both, add a free Gemini key:

```bash
cd backend
cp .env.example .env      # Windows: copy .env.example .env
```
Then open `backend/.env` and set `GEMINI_API_KEY=` to a key from
<https://aistudio.google.com>. Restart the backend. The Checkpoint modal and the
compliance report both label which source ran. Never commit `.env` — it is gitignored.

The free tier allows ~20 requests a minute, and the extension checks the prompt on
every typing pause, so the layer caches each answer by exact prompt text (5 min) and
stops calling for 60s after a 429 rather than spending a request and an 8s timeout to
be told the same thing. If the modal says **context heuristic** while a key is set,
the key is fine — the quota is spent. Layer 2 never fails a prompt: a key that is
missing, rate-limited, slow or wrong all degrade to the offline heuristic, and the
modal labels which one ran rather than pretending the fallback is AI.

## Tests

Layer-1 regex, Layer-2 names, XP progression, extension rule sync, compliance-report
wiring, the training assignment/access rules (question limit, department resolution,
who can open what, no duplicate notifications), the risk-alert rules (thresholds,
escalation instead of duplication, per-employee isolation), sessions, and credentials
(hashing, refusals, registration, Level 1, Google SSO):
```bash
cd backend
npm test
```

`accounts.test.js` is the one to read if you want to check the sign-in claims above —
each test names the rule it is holding in place, and the refusals matter more than the
successes. It runs against the real Express app on an ephemeral port with scratch
registry files, so it never touches the demo's own accounts or sessions.

## Detection — two layers
- **Layer 1 (regex, always on):** Malaysian IC, passport numbers, phone numbers, emails,
  financial amounts (RM/MYR/USD/SGD), card numbers, credentials.
- **Layer 2 (person names):** Gemini API when `GEMINI_API_KEY` is set in `backend/.env`;
  otherwise an offline context heuristic ("customer Lim", "Encik Ahmad"). The Checkpoint
  modal labels which source ran.
- **Capitalisation is not what makes something a name.** `lim MeNg Meng` is masked as
  one `[MASKED-NAME]`, not partly masked and not missed — see below.
- **When the gateway is unreachable:** the extension masks with its own copy of the
  Layer-1 rules (`extension/rules.js`, kept in sync by `rules.sync.test.js`) and holds
  the *masked* record — never the raw prompt — until the backend answers, then posts it
  to `/api/detect/backfill`. Recovered events are re-scanned so Layer 2 still gets its
  pass, are deduped by id, earn no XP, and appear in the Audit Log marked `⟲` with both
  the time they happened and the time they were recorded. An outage costs the audit log
  a delay, not a gap.

### Names: detecting a span and masking a span are two jobs

Nobody capitalises reliably while typing. `Lim Meng`, `lim meng`, `lim MeNg`, `LIM MENG`
and `lim MeNg Meng` are the same customer, and all of them must come out as a single
`[MASKED-NAME]` — never half of one.

**Detecting.** The heuristic's first three sources all read a capital letter as the signal
that a word might be a name, so an irregularly-cased one was invisible to every one of
them. A fourth source drops capitalisation as evidence and anchors on the name gazetteer
instead: a run of words is a candidate only when a known name token appears in it, the run
stops at any stop-word, and a lower-case word with an English inflection (`flagged`,
`needs`, `quickly`) cannot extend it — which is what keeps `Rahman flagged` from becoming a
name. With a Gemini key the model does this job and is asked for spans *as written*.

**Masking.** This is where a correctly detected name still came out half-masked, and it is
the half worth understanding. A detector does not hand back the exact substring it found:
Gemini title-cases what it read (answering `"Lim Meng Meng"` for text that says
`lim MeNg Meng`), normalises the spacing, and sometimes splits one person across several
entries (`["Lim", "Meng Meng"]`). Matching those answers back **literally and
case-sensitively** meant the entry that happened to match was replaced and the re-cased one
silently matched nothing — `lim [MASKED-NAME]`.

So `maskNames()` locates each name case-insensitively with flexible whitespace, **merges**
the ranges that overlap or sit a space apart, and replaces each merged range whole, right
to left so every offset stays valid. Punctuation between two names keeps them separate
(`Ask Lim, then Tan.` → two tokens), and ranges landing inside a Layer 1 token are dropped —
`[MASKED-IC]` is not a person. Once a span is identified the replacement is a slice, not a
search: the same input always produces the same output. `nameSpans()` is exported so the
span logic is tested directly, against the shapes the API really returns, without the
network.

## API
| Method | Endpoint                   | Description |
|--------|----------------------------|-------------|
| GET    | /api/health                | Service check |
| POST   | /api/auth/login            | `{ role, email }` → `{ user, token, expiresAt }` — mints a server-side session (email decides role in the UI) |
| GET    | /api/auth/session          | With `Authorization: Bearer` → this session, or **401** with a `reason` (`expired` / `invalid`). Without one → whoever is signed in on this machine's dashboard, for the extension |
| POST   | /api/auth/logout           | Ends the session for the web app and the extension at once. Idempotent |
| POST   | /api/detect                | `{ prompt }` → `{ masked, detections, layer2, mode }` — two-layer scan; logs audit + applies XP rules (clean +2, masked +0) |
| POST   | /api/detect/backfill       | `{ events }` — audit records the extension held during a gateway outage; re-scanned, deduped by id, recorded with `offline: true`, no XP |
| POST   | /api/gateway/tool-use      | `{ tool, model? }` — an employee reached a tool. Approved ones answer quietly; anything else writes an audit event and raises a risk alert |
| GET    | /api/gateway/tool-status   | `?tool=&model=&host=` → the whole verdict without recording anything: this employee's access, the model's status, the mode that really applies and approved alternatives |
| POST   | /api/gateway/model-use     | `{ tool, model }` — the employee switched model inside an approved tool |
| POST   | /api/gateway/blocked       | `{ tool, model?, reason, types[] }` — the checkpoint refused a send on-device. Writes the incident (audit + one alert per hour); never accepts prompt text |
| GET    | /api/tools                 | The approved-tool register |
| GET    | /api/tools/mine            | The register folded for the signed-in employee — the same access verdict the gateway enforces, plus each model's standing and the free model to display |
| GET    | /api/tools/requestable     | The tools this employee may ask for, and whether their licence lets them ask at all |
| POST   | /api/tools/model-status    | Admin — approve, unapprove, withdraw or **ban** one model without touching its tool |
| POST   | /api/gateway/override      | Warn-only mode "send original": −20 XP, streak reset, High alert |
| GET    | /api/profile               | Employee E-217 license: total XP, level + band, per-module `trainingProgress`, streak, stamps, counters |
| GET    | /api/progression           | Level table + the employee's XP breakdown per training module (admin view) |
| GET    | /api/leaderboard           | Department XP ranking |
| POST   | /api/quiz/answer           | `{ question, correct }` — records the answer (first attempt only); earns no XP by itself |
| GET    | /api/quiz/results          | Attempt score + this module's stored progress record |
| POST   | /api/training/complete     | Settles the module's XP (best result wins), stamp + notification, `{ award, levelUp }` |
| GET    | /api/training/library      | Admin — every module with its questions, plus assignment records |
| POST   | /api/training/modules      | Admin — create a module (max 40 questions, validated server-side) |
| PUT    | /api/training/modules/:id  | Admin — save an edited question set in one write |
| POST   | /api/training/modules/:id/status | Admin — publish (`live`) or hide (`draft`) |
| GET/POST | /api/training/assignments | Admin — assignment records; POST assigns and notifies the recipients |
| GET    | /api/training/mine         | Employee — only the modules assigned to *them* |
| GET    | /api/training/mine/:id     | Employee — one module with its questions; 403 if not assigned |
| GET    | /api/notifications         | The signed-in employee's notifications (`/:id/read`, `/:id/delete`, `/:id/restore`) |
| GET    | /api/visas                 | Tool requests (`POST /api/visas/apply`, `POST /api/visas/:id/decision`) |
| GET    | /api/alerts                | Admin — risk alerts (`POST /api/alerts/:id/resolve`; `POST /api/alerts/:id/action` for acknowledge / escalate) |
| POST   | /api/review-request        | Public transparency portal → creates an admin risk alert |
| GET    | /api/audit                 | Admin — live audit log (masked records only, review status folded in) |
| GET    | /api/stats                 | Admin KPIs — single source of truth for all screens |
| GET    | /api/risk                  | Admin — the organisational AI risk score behind the Overview gauge: score, band, 6-day trend and the five named factors that sum to it. Same `riskPosture()` the compliance report embeds, so dashboard and report can never disagree |
| GET    | /api/shadow-ai             | Admin — Shadow AI (O3): unapproved tools the audit log has actually seen. The *intersection* of the register and the log, so it empties when tools are cleared rather than listing policy. Departments and counts only, never employee ids |
| POST   | /api/tools/clear           | Admin — clear a tool org-wide, or lift a suspension. The mirror of `/api/tools/suspend`; deliberately **not** the same action as approving one employee's request (see `decideVisa`) |
| GET    | /api/report                | Admin — the one-click compliance report: period totals, organisational AI risk score, framework coverage, control mapping and the evidence annexe, all derived from the audit log (period baseline + everything recorded since) |
| GET    | /api/report/summary        | Admin — the report's executive summary, written from those same figures. `?refresh=1` bypasses the cache ("Regenerate with AI"). Answers `source: 'gemini'` or `'analyst'`, never one labelled as the other |
| GET/PUT| /api/settings              | Gateway policy — **Mask** or **Warn only** really applies. Block is not an org-wide mode (see below); a request naming it is ignored |
| POST   | /api/reset                 | Reset demo data |

Demo state (audit feed, alerts, counters) is **in-memory** and reseeds on restart.
The **durable slice** — every employee's XP, per-module training records and stamps,
plus the training library, its assignment records and the notifications they produced —
is written to `backend/data/progress.json`, so an assignment and an employee's XP both
survive a refresh, a re-login, a different device and a server restart.
Sessions are durable too (`backend/data/sessions.json`), for the same reason a real
deployment keeps them in a datastore: restarting the API is an operational event, not
a decision to sign everybody out. `POST /api/reset` clears both.

## Authentication: the server is the only thing that knows

Two modules, two questions. `backend/src/accounts.js` answers *"is this person who
they say they are"*; `backend/src/auth.js` answers *"is this token a live session"*.
A session is only ever minted once an account has been proven.

### Credentials (`accounts.js`)

- **Passwords are hashed, never stored.** scrypt (N=16384) with a per-account 16-byte
  salt, so two people who chose the same password do not share a hash. Verification is
  `timingSafeEqual` — a byte-by-byte comparison leaks how much of a guess was right
  through how long the answer took. The hash never leaves the module: there is no code
  path that returns `passwordHash`.
- **The role comes off the account, not the request.** `{ "role": "admin" }` in a login
  body changes nothing. Registration always creates an *employee* — an administrator is
  provisioned (seeded, or via `SEED_ADMIN_*`) and there is no request anywhere that
  creates one.
- **An unknown email and a wrong password are the same refusal**, in the same words, so
  the form cannot be used to find out who works here. An unknown email is hashed anyway,
  so it cannot be identified by response time either.
- **Guessing is throttled** — 8 failures per email and 40 per source address in a
  15-minute window. A success clears both, so a mistyped password costs nothing.
- **A new employee is a new person.** Registration allocates them a directory ID
  (`nextEmployeeId`) and their own blank passport at **Level 1**. An ID typed into the
  sign-up form is a *request*: asking for `E-217` gets you the next free ID, never
  somebody else's history.
- **Google SSO is verified server-side** — see [Google single sign-on](#google-single-sign-on-sso).

### Sessions (`auth.js`)

Signing in mints a **server-side session record** and returns the opaque token that
names it. Everything after that is judged against the record:

- **The token is the only credential.** An unknown or expired one is a `401` with a
  `reason`, never a weaker identity. There is no header a caller can set to become an
  administrator — `requireAdmin` needs a verified session and nothing else.
- **Expiry is real**: 8 hours idle (extended by use) with a 24-hour absolute cap, so a
  token that leaks cannot be renewed forever. Both are tunable via
  `AUTH_SESSION_IDLE_MS` / `AUTH_SESSION_MAX_MS`.
- **The browser stores a token, not an identity.** `localStorage` also holds a cached
  user for the avatar and for per-employee local keys, but it is display state: no
  screen renders because of it. The web app resolves its session against the server
  before showing anything authenticated, and treats *loading*, *authenticated*,
  *unauthenticated* and *unable to verify* as four separate states
  (`frontend/src/lib/auth.jsx`).
- **An outage is not a sign-out.** A failed request proves nothing about a session, so
  it never destroys one — but it never claims one either. The dashboard shows "we
  can't verify your session"; the extension keeps protecting for a two-minute grace
  window and then reports that it can no longer confirm the session. Both recover by
  themselves when the backend answers again.
- **One sign-out, everywhere.** Ending the session ends it for the web app and for the
  Chrome extension in the same call — the extension follows the server's record, not
  the browser's.

This is the seam **Firebase Authentication** replaces: `createSession()` becomes the
ID-token mint, `verifySession()` becomes `verifyIdToken()`, and `accounts.js` becomes
`admin.auth()`. Nothing above it moves.

### Auth API

| Route | Auth | What it does |
|---|---|---|
| `POST /api/auth/login` | none | `{ email, password }` → `{ user, token, expiresAt }`. `401` on a bad credential, `429` when throttled. |
| `POST /api/auth/register` | none | `{ name, email, password, org, dept, employeeId?, consent }` → `201` with the new employee. Never signs them in. |
| `POST /api/auth/google` | none | `{ credential }` (a Google ID token) or `{ demoEmail }` in demo mode → same shape as login. |
| `GET /api/auth/sso/config` | none | Whether Google SSO is on, and with what client ID. |
| `GET /api/auth/session` | token *or* none | With a token: this browser's session. Without: who is signed in on this machine's dashboard (the Chrome extension's view). |
| `POST /api/auth/logout` | token optional | Ends the session. Idempotent. |

## The audit log: what is recorded, and what is never stored

One append-only feed carries everything that has to be explainable later — the
gateway's own decisions and the governance actions an admin takes. Every employee
event that matters reaches it **as it happens**: a prompt masked, a prompt refused,
an unapproved or banned tool opened, an unreviewed model selected, a tool used above
a licence level, a tool access request made *or refused*, a checkpoint override, a
training module opened, completed or denied, an account provisioned, a sign-in.

**The trail starts where the identity does.** Creating an account writes a `CREATED`
event before that employee has done anything, so the log never opens mid-story with a
sign-in from an employee ID it cannot account for. It records who (the employee ID),
how (`self-registration` or `Google SSO · domain` — materially different claims, never
collapsed into one), what access was granted (the AI License level, which decides which
models they can reach on day one) and which department. It does **not** record their
name or email: the log is privacy-minimised by design, and provisioning is no reason to
make the first exception.

```
CREATED  | M-300  | Mkt | NIST PR.AC | Employee M-300 account created · self-registration · Level 1
SIGN-IN  | M-300  | Mkt | NIST PR.AC | Employee M-300 signed in
```

This is the pairing **ISO 27001 A.9.2.1** (formal user registration) and
**NIST CSF PR.AC-1** (identities issued, managed and audited) ask for.

Each record carries the fields a compliance report is built from:

| Field | Holds |
|---|---|
| `user` · `dept` · `role` | who, and which department |
| `tool` · `resource` | where it was heading |
| `action` · `status` · `risk` | what happened, its result, its risk level |
| `types[]` | the detection **categories** found (`IC`, `NAME`, `CREDENTIAL`…) |
| `reason` | why the gateway decided as it did (`sensitive-data-detected`, `tool-banned`…) |
| `outcome` | what was actually done — "Masked before transmission · 3 items removed" |
| `alertId` → `review` | the risk alert it opened, and whether that case is still open |
| `control` | NIST AI RMF / EU AI Act / PDPA clause |
| `time` · `at` · `recordedAt` | when it happened, and when the log received it |

**No raw prompt is ever stored, on any path.** Records derived from something an
employee typed are marked `promptDerived` and re-masked by Layer 1 on the way into the
log, so the guarantee is a property of the log rather than a promise each call site has
to keep. `types[]` names the *category* that was found and never the value behind it,
which is what lets the log answer "how much customer identity data went to AI tools
this month" without holding any.

That applies to the override too — the one event where the employee genuinely did send
the original. What left the organisation is not a reason for the audit log to keep a
second copy of it, so the record and the alert's evidence carry the masked text plus
the categories, and the raw prompt is dropped. This is the discipline the case study
names (**privacy by design**: PDPA §7, NIST AI RMF MAP/MEASURE, EU AI Act Art. 12
record-keeping).

`/api/audit`, `/api/alerts` and `/api/report` are **admin-only** — they carry every
employee's governance history. An employee's own slice is served separately by
`/api/activity/mine`, filtered on the server rather than in the browser.

An alert is deduplicated; the log is not. Three visits to an unapproved tool produce
**one** card and **three** records, because "they opened it three more times after
being told" is the evidence a governance case is built from.

## Risk alerts: what raises one, and at what level

The rules and their thresholds live in `backend/src/risk.js`, and the Risk Alerts
screen states the rubric so the queue can be explained rather than just read.

| Level | Means | Answer within |
|---|---|---:|
| **HIGH** | Protected data left the organisation, or a pattern repeated past the point where guidance is enough | 4h |
| **MEDIUM** | The gateway held — nothing escaped — but the behaviour needs a refresher | 24h |
| **MONITORING** | A trend with no individual responsible | 72h |

| Rule | Raises | Escalates to HIGH |
|---|---|---|
| **Repeated identifiers** — the same *kind* of identifier masked repeatedly for one employee inside a 15-minute window | MEDIUM at 3 | at 5 |
| **Credential or secret in a prompt** — a password, API key or private key masked in a prompt | HIGH on the first occurrence | — |
| **Unapproved tool** — an employee opens a tool with no active visa | MEDIUM | HIGH if the tool is SUSPENDED or BANNED |
| **Tool above licence level** — the tool is approved, the employee's AI License is not high enough for it | MEDIUM | — |
| **Unapproved model** — the tool is approved, the selected model is not | MEDIUM | HIGH if the model is SUSPENDED or BANNED |
| **Model above licence level** — the model is approved, the employee's licence does not reach it | MEDIUM | — |
| **Prompt refused** — they tried to send to a destination the gateway would not allow | MEDIUM | HIGH if the destination is banned |
| **Checkpoint override** — Warn-only mode, "send original anyway" | HIGH immediately | — |
| **Human review requested** — from the public transparency portal | HIGH | — |

Two properties hold across all of them:

- **A single protected prompt is never an alert.** The gateway masking something is
  the system working; alerting on it would teach an admin to ignore the queue. Only a
  *pattern* is raised. The one exception is a **credential or secret**: masking it in
  the prompt does not un-leak the key from wherever it was copied, and the response is
  to rotate it today rather than to book a refresher — so that rule fires at one.
- **A pattern that continues escalates the alert it already has.** It never opens a
  second one — a queue holding the same finding five times is the same failure as no
  queue at all. The `×N` on a card is that finding's own evidence count.

Every alert names the employee and department it is about (`employeeId`, `dept`) and
carries `events[]` — the ids of the audit records that raised it. Each of those records
carries `alertId` back. That is what makes a card traceable to its evidence and any
record answerable for whether it was followed up: `GET /api/audit` folds the alert's
live status onto each event as `review: OPEN | RESOLVED`, derived on read so the log
itself stays append-only.

Beyond resolving, an admin can **acknowledge** or **escalate** an alert
(`POST /api/alerts/:id/action`). Escalating raises the severity by hand and moves the
response deadline with it — a human who knows more than the rule did is allowed to
overrule it. Every action lands on the alert's timeline *and* in the audit log, so who
acknowledged what is a record rather than a toast.

The approved-tool register (`db.orgTools`) is the single authority on what is
approved. Approving a visa on Tool Approvals is what moves a tool into it, and that is
what stops the gateway flagging it — the decision and its effect cannot drift apart.
The Chrome extension asks the same register (`GET /api/gateway/tool-status`) rather than
assuming, and falls back to the last verdict it saw when the gateway is unreachable.

## Unapproved tools: what actually happens

Approval does **not** decide whether a tool opens, and it does **not** decide whether a
prompt may be sent. Blocking the website outright is the one response the case study
rules out — it pushes the usage somewhere nothing can see it, and a browser extension
cannot enforce it anyway. **An unreviewed destination is told about, never refused.**

| | Clean prompt | Sensitive prompt |
|---|---|---|
| **Approved** tool + model | sent untouched | masked, then sent |
| **Unapproved** tool or model | sent untouched | **masked, then sent** — plus a notice naming approved alternatives |
| Tool or model above the employee's **licence level** | sent untouched | refused — the way out is training, not a request |
| Data the tool is **not cleared for** (`blockOn`) | sent untouched | **refused**, whatever the tool's status |
| **Suspended** tool or model | sent untouched | refused — and the panel says stop, not "be careful" |
| **Banned** tool or model | **refused** | **refused** |

The gateway's answer to "nobody has reviewed this tool" is the same protection an
approved tool gets, plus a sentence. Refusing the prompt protected nothing that the
masking does not already protect — the masked prompt carries no company data either
way — while costing the employee their work and teaching them to finish the job in a
browser the gateway cannot see. Governance here comes from the record, not from the
refusal: the visit is in the audit log, the alert is in the admin's queue, and the
employee is told what they are typing into and offered somewhere better.

So `effectiveMode()` returns two flags that are opposites, and callers read both:

- **`notify`** — nobody has reviewed this destination. The org's own mode still runs,
  so sensitive content is masked before it goes. The flag says *say so*, never *hold
  back*. A caller that ignores it sends a protected prompt and tells the employee
  nothing, which is a worse product, not a leak.
- **`banned`** — nothing may be sent here at all. Read *before* detections, because it
  is the one refusal that applies to a prompt with nothing in it: a model withdrawn
  after a breach is not made safe by the prompt happening to be harmless. The seed
  register bans **Claude Fable 5**; `POST /api/tools/model-status` with
  `status: "BANNED"` bans any other model, including a free one.

A **ban**, a **suspension** and a **licence level** are the three verdicts that still
refuse, and they have one thing in common: an admin has already looked at this
destination and answered. "Unreviewed" is the opposite — nobody has looked yet — and an
unmade decision is not a reason to stop somebody working. A **data scope** refuses too,
because it is an explicit instruction about a category of content: a tool that may not
receive customer records may not receive them masked either, reviewed or not.

Because a refused prompt is never sent, it produces no prompt event — so the
refusal itself is what reaches the admin. `/api/detect` records it server-side;
the Chrome extension, whose while-typing check records nothing, posts it to
`/api/gateway/blocked`. Every attempt lands in the audit log; the alert queue takes
one per employee + destination + reason per hour. No prompt text either way. An
unreviewed tool needs none of that path: the prompt *is* sent, so it produces an
ordinary prompt event carrying the tool's name, and `POST /api/gateway/tool-use` has
already written the visit and raised the MEDIUM alert.

`risk.js` → `effectiveMode()` is the one place this is decided, and every rule in it can
only ever *tighten* the org's policy. A tool's own settings can never loosen what an admin
set, so this can never become the reason something leaked.

Approval is also per employee, not only per organisation: `toolAccessFor()` folds the
register's status, the employee's AI License level (`minLevel`) and their own request
history into one verdict — `active · locked · review · declined · suspended · unreviewed`.
The employee's AI Tools page and the gateway both read it, so the page cannot show a tool
as approved while the checkpoint refuses the prompt.

## Model-level approval

A greenlit tool is not a greenlit catalogue. Register entries carry a `models` list with
its own status per model, so **Claude can be approved while Fable 5 on it is not**.
Withdrawing a model is a different admin action from suspending its tool
(`POST /api/tools/model-status` vs `/api/tools/suspend`) — the whole point being that
refusing one model leaves every approved model on that tool working.

Each model also carries a `tier` (`free` / `paid`) and its own `minLevel`, which is what
makes "Level 1 gets the free models" a rule the gateway enforces rather than a sentence
in a brochure. The employee's AI Tools page shows the tool's newest **free** model in the
MODEL column at every level and puts the paid ones behind an expandable section on the
detail sheet; `GET /api/tools/mine` returns both, already folded, so the page and the
checkpoint cannot disagree about which models a person may pick.

The register names the models each **product's own picker** offers, not the vendor's
whole lineup — GPT-5.6 Terra and Luna are API and Codex tiers that cannot be selected in
a standard ChatGPT conversation, so ChatGPT lists GPT-5.5 Instant (free) and GPT-5.6 Sol
(paid) and Terra appears on the Codex entry where it is genuinely reachable. Model
aliases avoid bare family words for the same reason `UNKNOWN` exists: a lone `opus` would
adopt every future Opus release and hand it the current one's approval.

The extension reads the selected model at send time, from the URL parameter when the tool
has one and otherwise from the model picker's label (`modelSelectors` in
`extension/config.js`, ordered specific → generic like every other selector there).

**A model the register cannot identify is `UNKNOWN`, never unapproved.** Platforms rename
models constantly and the extension is reading somebody else's UI label, so blocking on
"we could not tell" would punish the employee for a register that is a week out of date.
That means model-level restriction is best-effort by construction: it is enforced at the
checkpoint, not at the network, and an "auto"/router mode cannot promise which model
actually served a request.

## Training: one set of records, two views

The training library and its assignment records live on the backend, not in browser
storage, and both sides read the same rows:

| Fact | Admin sees it as | Employee sees it as |
|---|---|---|
| module id | the row on Training modules | the module on their Training page |
| `status: live` | "Live · visible to employees" | the module appears at all |
| assignment record | "assigned to N" | the module is on their list, and a notification arrives |
| `questions[]` | the question editor | the assessment they sit |

Because there is one set of records, "published and assigned" and "the employee can open
it" cannot disagree. Access is decided by `canAccessModule()` on the server, so an
unassigned employee gets a 403 from a direct URL or a hand-made API call — and the
refusal is written to the audit log as a `DENIED` event. A module is playable the moment
it has questions; there is no separate content flag that can leave an assigned module
permanently on "coming soon".

Each employee's identity is stated by the browser (`X-AIP-User`) and re-validated against
the directory on every request — the seam a Firebase ID token replaces. It is what lets
an admin console and an employee passport be open at the same time without the later
sign-in redefining who the earlier one is.

## AI License progression
XP is earned, accumulated and turned into a level in exactly one place:
`backend/src/levels.js` (mirrored for the UI in `frontend/src/lib/levels.js`).

| Level | Name | Total accumulated XP |
|-------|------------|---------------------:|
| 1 | Trainee | 0 – 500 |
| 2 | Navigator | 501 – 2,000 |
| 3 | Ambassador | 2,001 – 4,000 |
| 4 | Guardian | 4,001 – 8,000 (maximum — there is no Level 5) |

A level is **earned by accumulated XP and nothing else** — there is no nomination,
approval or manual promotion anywhere in the system. What each level opens is stated by
the register rather than by copy, so the AI Tools page cannot promise something the
gateway then refuses:

| Level | Reaches |
|---|---|
| 1 | The **free** model on each approved assistant — ChatGPT (GPT-5.5 Instant), Claude (Sonnet 5), Gemini (3.6 Flash). No tool request feature at all. |
| 2 | The **paid** models on those tools, and the tool access request form (`REQUEST_MIN_LEVEL`) |
| 3 | GitHub Copilot (`minLevel: 3`), and Kimi becomes requestable (`requestMinLevel: 3`) with its free models |
| 4 | Codex and Claude Code (`minLevel: 4`), and Kimi K3 (`minLevel: 4` on the model) |

`totalXP = activityXP + Σ trainingProgress[moduleId].pointsEarned`

Each employee keeps **one progress record per module**, holding the best result
ever achieved. Completing a module settles that record with
`pointsEarned = MAX(previous, this attempt)`, so total XP only ever moves by the
improvement — repeating a module cannot farm XP, and a worse retry cannot cost
any. Progress bars measure progress **within the current level band**, so a
Navigator on 1,250 XP is 50% of the way to Ambassador, not 15% of the system.

## Firebase + deployment

The live demo runs on **Firebase Authentication** (Google + password) and **Firestore**
(durable account registry + audit), fronted by **Vercel** and **Render**. It is all
**offline-safe**: with no Firebase credentials the app falls straight back to local
password / demo sign-in and file storage, so you can develop without any of it.

- **Wire up your own Firebase:** `backend/FIREBASE_SETUP.md` (create project, enable
  Auth + Firestore, drop in `serviceAccount.json` and the web config).
- **Deploy publicly (Vercel + Render):** `DEPLOY.md`.
- **How it's wired:** the Firebase client SDK gets an ID token, the server verifies it
  with the Admin SDK (`backend/src/firebase.js`, `POST /api/auth/firebase`) and mints the
  same session everything else already uses — so the extension, audit and role guards are
  unchanged. Accounts mirror to Firestore and are restored on boot (`hydrateFromFirestore`).

Never commit `.env` or `serviceAccount.json` — both are gitignored; in the cloud they live
only as environment variables.

## Design
Figma (passport-themed design system: navy #12275a, gold #d4af37, cream #f7f1e3):
all screens are in the shared Figma file ("Soda"). UI is built to match the design.

## Docs
Full proposal: see `Team Soda - Case Study 3 Ai Passport.pdf` in the repo root.
