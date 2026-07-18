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

## How to Run

Requirements: Node.js 18+ and npm.

**1. Backend** (runs on http://localhost:5001)
```bash
cd backend
npm install
cp .env.example .env   # optional: add GEMINI_API_KEY for Layer 2 AI name detection
npm run dev
```

**2. Frontend** (runs on http://localhost:5173)
```bash
cd frontend
npm install
npm run dev
```
Open http://localhost:5173 — the dev server proxies `/api` to the backend automatically.

**3. Tests** — 7 Layer-1 regex cases + 5 Layer-2 name cases:
```bash
cd backend
npm test
```

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
| POST   | /api/detect                | `{ prompt }` → `{ masked, detections, layer2 }` (preview only) |
| POST   | /api/send                  | `{ prompt, override? }` → really "send"; applies points rules (clean +2, masked +0, override −20 + streak reset) |
| GET    | /api/profile               | Employee E-217 license: points, level, streak, counters |
| GET    | /api/stats                 | Admin KPIs — single source of truth for all screens |
| GET    | /api/alerts                | Open risk alerts (`POST /api/alerts/:id/resolve` to resolve) |
| GET    | /api/approvals             | Pending tool visas (`POST /api/approvals/:id/decide`) |
| GET    | /api/events                | Live audit log |
| GET    | /api/quiz                  | Quiz results (`POST /api/quiz/answer` — first attempt only counts) |
| GET    | /api/leaderboard           | Department safety-points ranking |
| POST   | /api/review-request        | Public transparency portal → creates an admin risk alert |
| POST   | /api/reset                 | Reset demo data (optional body overrides, e.g. `{ "points": 1950 }`) |

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
