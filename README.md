# AI Passport — Safe AI for Every Employee

**Team Soda** · UTAR Hackathon · Case Study 3: AI Governance & Responsible AI in Enterprise

AI Passport lets companies say "yes" to AI instead of "no". Employees keep using AI tools
and stay productive, while the company keeps full visibility and control over its data.
Four features: a gamified **AI License**, a **Smart Gateway** browser extension that masks
sensitive data ("mask, don't block"), an **Admin Dashboard** with one-click audit reports,
and an **AI Tool Approval workflow** ("guide, don't punish").

## Team Members
- Yeap Boon Shen (@YBoonShen) — Team Leader
- Lee Jia Yin
- Muhammad Ikhlas Bin Mohd Faizal
- Samantha Chan Pei Yin

## Project Structure
```
utarhack-aipassport/
├── frontend/   React + Vite + Tailwind CSS (web app: license, training, dashboard)
├── backend/    Node.js + Express (API + detection service; Firebase to be connected)
└── README.md
```

## How to Run

Requirements: Node.js 18+ and npm.

**1. Backend** (runs on http://localhost:5001)
```bash
cd backend
npm install
cp .env.example .env   # fill in Firebase/Gemini keys later
npm run dev
```

**2. Frontend** (runs on http://localhost:5173)
```bash
cd frontend
npm install
npm run dev
```
Open http://localhost:5173 — click "Test backend connection" to confirm both parts talk
to each other (the dev server proxies /api to the backend).

**3. Detection service tests**
```bash
cd backend
npm test    # 5 regex masking tests (IC, phone, email, credentials, clean prompt)
```

## API (so far)
| Method | Endpoint      | Description                                    |
|--------|---------------|------------------------------------------------|
| GET    | /api/health   | Service check                                  |
| POST   | /api/detect   | `{ "prompt": "..." }` → `{ masked, detections }` — Layer 1 regex masking |

## Firebase Setup (to do — whoever takes backend)
1. Create a project at https://console.firebase.google.com
2. Enable **Authentication** (email/password) and **Firestore**
3. Put the config values into `backend/.env` (see `.env.example`)
4. Never commit `.env` — it is gitignored

## Design
Figma (passport-themed design system: navy #12275a, gold #d4af37, cream #f7f1e3):
all 6 screens are in the shared Figma file. Build UI to match the design exactly.

## Docs
Full proposal: see `Team Soda - Case Study 3 Ai Passport.pdf` in the repo root.
