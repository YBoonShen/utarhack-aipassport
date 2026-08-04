# AI Passport — Safe AI for Every Employee

**Team Soda** · UTAR Hackathon · Case Study 3: AI Governance & Responsible AI in Enterprise

AI Passport lets companies say "yes" to AI instead of "no". Employees keep using AI tools
and stay productive, while the company keeps full visibility and control over its data.
Four features: a gamified **AI License**, a **Smart Gateway** that masks
sensitive data ("mask, don't block"), an **Admin Dashboard** with live risk alerts and
audit log, and an **AI Tool Approval workflow** ("guide, don't punish").

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

The demo has no real password check — **the email decides which side you see**:

| To open | Type this email | Password |
|---|---|---|
| Employee passport | anything, e.g. `jiayin.tan@abcd.com` | anything |
| Admin console | `admin@abcd.com` | anything |

The sign-in form is pre-filled with the employee account, so you can just click **Sign in**.

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

Sign out, sign in as `admin@abcd.com`, and look at:
- **Overview** — live counters of prompts protected and items masked
- **Audit Log** — one `MASKED` entry for the prompt you just protected (the masked text
  is stored, never the original)
- **Settings** — switch the policy between **Mask**, **Warn only** and **Block**, then
  retype the prompt in ChatGPT to see the extension behave differently

### D. Earn XP as an employee

Sign back in as an employee and open **Training** → complete a module quiz. Your XP,
level and stamps update on the **License** page — and they survive a restart.

## If something goes wrong

| Problem | Fix |
|---|---|
| `npm` or `node` is "not recognized" | Node.js isn't installed, or Command Prompt was open before you installed it. Reinstall from Step 1 and open a **new** Command Prompt. |
| The page at localhost:5173 won't load | The frontend window isn't running. Re-run `start.bat`, or `npm run dev` inside `frontend`. |
| Extension popup says "Gateway unreachable" | The backend isn't running. Check <http://localhost:5001/api/health>. |
| Popup says "Sign in to protect your prompts" | Sign in at http://localhost:5173. It can take up to a minute to reach an already-open ChatGPT tab. |
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
├── backend/     Node.js + Express (2-layer detection + in-memory demo state; Firebase optional)
├── extension/   Chrome extension, Manifest V3 (see extension/README.md)
├── start.bat    One-click launcher (Windows) · stop.bat · autostart.bat
└── README.md
```

## Optional — better name detection

Layer 2 (person names) works offline out of the box using a context heuristic. For
sharper results, add a free Gemini key:

```bash
cd backend
cp .env.example .env      # Windows: copy .env.example .env
```
Then open `backend/.env` and set `GEMINI_API_KEY=` to a key from
<https://aistudio.google.com>. Restart the backend. The Checkpoint modal always labels
which source ran. Never commit `.env` — it is gitignored.

## Tests

Layer-1 regex, Layer-2 names, XP progression, extension rule sync and compliance-report wiring:
```bash
cd backend
npm test
```

## Detection — two layers
- **Layer 1 (regex, always on):** Malaysian IC, passport numbers, phone numbers, emails,
  financial amounts (RM/MYR/USD/SGD), card numbers, credentials.
- **Layer 2 (person names):** Gemini API when `GEMINI_API_KEY` is set in `backend/.env`;
  otherwise an offline context heuristic ("customer Lim", "Encik Ahmad"). The Checkpoint
  modal labels which source ran.
- **When the gateway is unreachable:** the extension masks with its own copy of the
  Layer-1 rules (`extension/rules.js`, kept in sync by `rules.sync.test.js`) and holds
  the *masked* record — never the raw prompt — until the backend answers, then posts it
  to `/api/detect/backfill`. Recovered events are re-scanned so Layer 2 still gets its
  pass, are deduped by id, earn no XP, and appear in the Audit Log marked `⟲` with both
  the time they happened and the time they were recorded. An outage costs the audit log
  a delay, not a gap.

## API
| Method | Endpoint                   | Description |
|--------|----------------------------|-------------|
| GET    | /api/health                | Service check |
| POST   | /api/auth/login            | `{ role }` → demo session (email decides role in the UI) |
| POST   | /api/detect                | `{ prompt }` → `{ masked, detections, layer2, mode }` — two-layer scan; logs audit + applies XP rules (clean +2, masked +0) |
| POST   | /api/detect/backfill       | `{ events }` — audit records the extension held during a gateway outage; re-scanned, deduped by id, recorded with `offline: true`, no XP |
| POST   | /api/gateway/override      | Warn-only mode "send original": −20 XP, streak reset, High alert |
| GET    | /api/profile               | Employee E-217 license: total XP, level + band, per-module `trainingProgress`, streak, stamps, counters |
| GET    | /api/progression           | Level table + the employee's XP breakdown per training module (admin view) |
| GET    | /api/leaderboard           | Department XP ranking |
| POST   | /api/quiz/answer           | `{ question, correct }` — records the answer (first attempt only); earns no XP by itself |
| GET    | /api/quiz/results          | Attempt score + this module's stored progress record |
| POST   | /api/training/complete     | Settles the module's XP (best result wins), stamp + notification, `{ award, levelUp }` |
| GET    | /api/notifications         | Employee notifications (`/:id/read`, `/:id/delete`, `/:id/restore`) |
| GET    | /api/visas                 | Tool requests (`POST /api/visas/apply`, `POST /api/visas/:id/decision`) |
| GET    | /api/alerts                | Risk alerts (`POST /api/alerts/:id/resolve` to resolve) |
| POST   | /api/review-request        | Public transparency portal → creates an admin risk alert |
| GET    | /api/audit                 | Live audit log (masked records only) |
| GET    | /api/stats                 | Admin KPIs — single source of truth for all screens |
| GET    | /api/report                | One-click compliance report totals, derived from the audit log (period baseline + everything recorded since) |
| GET/PUT| /api/settings              | Gateway policy — Mask / Warn only / Block really applies |
| POST   | /api/reset                 | Reset demo data |

Demo state (audit feed, alerts, counters) is **in-memory** and reseeds on restart.
The **progression slice** — total XP, the per-module training records and stamps —
is written to `backend/data/progress.json`, so an employee's XP survives a refresh,
a re-login, a different device and a server restart. `POST /api/reset` clears it.

## AI License progression
XP is earned, accumulated and turned into a level in exactly one place:
`backend/src/levels.js` (mirrored for the UI in `frontend/src/lib/levels.js`).

| Level | Name | Total accumulated XP |
|-------|------------|---------------------:|
| 1 | Trainee | 0 – 500 |
| 2 | Navigator | 501 – 2,000 |
| 3 | Ambassador | 2,001 – 4,000 |
| 4 | Guardian | 4,001 – 8,000 (maximum — there is no Level 5) |

`totalXP = activityXP + Σ trainingProgress[moduleId].pointsEarned`

Each employee keeps **one progress record per module**, holding the best result
ever achieved. Completing a module settles that record with
`pointsEarned = MAX(previous, this attempt)`, so total XP only ever moves by the
improvement — repeating a module cannot farm XP, and a worse retry cannot cost
any. Progress bars measure progress **within the current level band**, so a
Navigator on 1,250 XP is 50% of the way to Ambassador, not 15% of the system.

## Firebase Setup (optional — persistence)
1. Create a project at https://console.firebase.google.com
2. Enable **Authentication** (email/password) and **Firestore**
3. Put the config values into `backend/.env` (see `.env.example`)
4. Never commit `.env` — it is gitignored

## Design
Figma (passport-themed design system: navy #12275a, gold #d4af37, cream #f7f1e3):
all screens are in the shared Figma file ("Soda"). UI is built to match the design.

## Docs
Full proposal: see `Team Soda - Case Study 3 Ai Passport.pdf` in the repo root.
