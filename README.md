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

## Project Structure
```
utarhack-aipassport/
├── frontend/   React + Vite + Tailwind CSS (employee, public + admin screens)
├── backend/    Node.js + Express (2-layer detection + in-memory demo state; Firebase optional)
└── README.md
```

## Run Locally

**Requirements:** [Node.js](https://nodejs.org) 18+ and npm (`node -v` to check).

You need **two terminals** — one for the backend, one for the frontend. Both must run at the same time.

> ⚠️ **Important — start in the right folder.** All commands below assume you are **inside the `utarhack-aipassport/` project folder** (the one containing `frontend/` and `backend/`). If you cloned the repo, `cd` into it first:
> ```bash
> cd utarhack-aipassport
> ```
> If you see `The system cannot find the path specified` or `ENOENT: package.json`, you are one folder too high — `cd` into `utarhack-aipassport` and try again.

### Terminal 1 — Backend (http://localhost:5001)
```bash
cd backend
npm install                 # first time only
copy .env.example .env      # Windows  (macOS/Linux: cp .env.example .env)  — optional, for Gemini
npm run dev
```
Leave it running. Optional: add a free `GEMINI_API_KEY` to `backend/.env` to enable Layer‑2 AI name detection (works fine without it — falls back to an offline heuristic).

### Terminal 2 — Frontend (http://localhost:5173)
```bash
cd frontend
npm install                 # first time only
npm run dev
```
Then open **http://localhost:5173** in your browser. The frontend proxies `/api` to the backend automatically.

### Logging in (demo accounts)
- **Employee side:** sign in with **any email** (e.g. `jiayin@abcd.com`) + any password.
- **Admin console:** sign in with **`admin@abcd.com`**, or click **"Continue with enterprise SSO"**.

### Verify it works (optional)
```bash
cd backend
npm test          # detection unit tests — 7 Layer-1 + 5 Layer-2 cases
npm run benchmark # accuracy on the 100-prompt labelled set (target ≥ 90%)
```

### Troubleshooting
| Problem | Fix |
|---|---|
| `cd backend` → *"cannot find the path"* / `ENOENT ...package.json` | You're in the wrong folder. `cd utarhack-aipassport` first, then `cd backend`. |
| `EADDRINUSE: address already in use :::5001` (or `:5173`) | An old server is still running. Close it, or on Windows PowerShell: `Get-NetTCPConnection -LocalPort 5001,5173 -State Listen \| Select -Expand OwningProcess \| ForEach { Stop-Process -Id $_ -Force }` |
| Page loads but data is blank / "Backend not running" | Make sure Terminal 1 (backend) is running on port 5001. |
| Want to reset the demo data | Restart the backend (`Ctrl+C`, then `npm run dev`) — state is in‑memory. |

## Detection — two layers
- **Layer 1 (regex, always on):** Malaysian IC, passport numbers, phone numbers, emails,
  financial amounts (RM/MYR/USD/SGD), card numbers, credentials.
- **Layer 2 (person names):** Gemini API when `GEMINI_API_KEY` is set in `backend/.env`
  (free key: https://aistudio.google.com); otherwise an offline context heuristic
  ("customer Lim", "Encik Ahmad"). The Checkpoint modal labels which source ran.

## API
| Method | Endpoint                   | Description |
|--------|----------------------------|-------------|
| GET    | /api/health                | Service check |
| POST   | /api/auth/login            | `{ role }` → demo session (email decides role in the UI) |
| POST   | /api/detect                | `{ prompt }` → `{ masked, detections, layer2, mode }` — two-layer scan; logs audit + applies points rules (clean +2, masked +0) |
| POST   | /api/gateway/override      | Warn-only mode "send original": −20 points, streak reset, High alert |
| GET    | /api/profile               | Employee E-217 license: points, level, streak, stamps, counters |
| GET    | /api/leaderboard           | Department safety-points ranking |
| POST   | /api/quiz/answer           | `{ question, correct }` — first attempt only, +50 per correct |
| GET    | /api/quiz/results          | First-attempt quiz score |
| POST   | /api/training/complete     | Adds the training stamp + notification |
| GET    | /api/notifications         | Employee notifications (`/:id/read`, `/:id/delete`, `/:id/restore`) |
| GET    | /api/visas                 | Tool requests (`POST /api/visas/apply`, `POST /api/visas/:id/decision`) |
| GET    | /api/alerts                | Risk alerts (`POST /api/alerts/:id/resolve` to resolve) |
| POST   | /api/review-request        | Public transparency portal → creates an admin risk alert |
| GET    | /api/audit                 | Live audit log (masked records only) |
| GET    | /api/stats                 | Admin KPIs — single source of truth for all screens |
| GET/PUT| /api/settings              | Gateway policy — Mask / Warn only / Block really applies |
| POST   | /api/reset                 | Reset demo data |

Demo state is **in-memory**: it resets on server restart or `POST /api/reset`.
Admin → Settings has hidden "Demo tools" links (reset / jump to 1,950 pts) for demo prep.

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
