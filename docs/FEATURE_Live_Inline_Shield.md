# Feature Spec — Live Inline Shield (实时行内遮罩)

**One-line pitch:** Instead of only checking a prompt after you click Send, the AI
Passport extension protects you **while you are still typing** — sensitive text is
highlighted live inside the AI tool's input box, before the prompt ever leaves the
browser.

This is the "real browser extension" upgrade of the existing Smart Gateway. Everything
below is scoped so one developer can build it in ~1 day without touching the rest of the app.

---

## 0. Context — what already exists (read this first)

- **Repo:** `utarhack-aipassport/` · Frontend: React 19 + Vite + Tailwind (port 5173) ·
  Backend: Node/Express (port 5001). Vite proxies `/api` → backend automatically.
- **Detection is already built** (two layers):
  - Layer 1 = regex, in `backend/src/detector.js` (`RULES` array + `maskPrompt(text)`).
  - Layer 2 = person names, in `backend/src/layer2.js`
    (`maskPromptFull(text)` runs BOTH layers and is **side-effect free** — key point below).
- **The page we extend:** `frontend/src/pages/Extension.jsx` — the simulated browser +
  AI Passport side panel. It currently has a **fake, non-functional input box** at the
  bottom of the chat (around line 124). We make that input real.
- **Reusable UI:** `frontend/src/pages/Gateway.jsx` has a `<ProtectedText>` component that
  renders `[MASKED-*]` tokens as green chips. We reuse its styling.
- **API helper:** `frontend/src/lib/api.js` exports `api.post(path, body)`.

### ⚠️ Critical gotcha — do NOT call `/api/detect` on every keystroke

The existing `POST /api/detect` endpoint has **side effects**: every call writes an audit
event, updates points, and pushes a notification. If we call it on each keystroke it will
spam the audit log and notifications and corrupt the demo state.

**Solution:** add a new **preview** endpoint that detects **without recording anything**.
It wraps the already-existing, pure `maskPromptFull()` function. Live typing uses the
preview endpoint; the final Send still uses the real `/api/detect` (which commits the event).

---

## 1. User story

> As an employee typing into an AI tool, I want sensitive parts of my message to be
> highlighted the moment I type them, so I fix or trust the masking **before** I hit Send —
> without the tool blocking me or breaking my flow.

**Before (today):** type freely → click Send → modal appears → review masked version.
**After (this feature):** as you type `refund RM 4,500 to customer Lim`, the words
`RM 4,500` and `Lim` get an amber underline in real time, and a live counter under the box
reads *"2 items will be masked · your data won't leave the browser"*. Click Send → the amber
turns green (committed) → existing Checkpoint flow.

---

## 2. UX spec

### States of the input box
| State | Trigger | Visual |
|---|---|---|
| Idle | empty / no matches | plain input, helper text grey |
| Scanning | user typing, request in flight | tiny "checking…" dot (optional) |
| Pending (found) | preview returned ≥1 match | matched spans get **amber underline** in the box; counter bar shows below |
| Committed | user clicks Send | spans flip to **green**, run existing Checkpoint modal / deliver flow |

### Colors (use the existing design tokens — do not invent new ones)
- Amber "will be masked" (pending): background `#fff5de`, underline/border `#d4af37`, text `#b54708`
  (these already appear in `Extension.jsx`).
- Green "masked / protected" (committed): background `#e9f8f2`, border `#078b6c`, text `#047857`
  (from `Gateway.jsx` `ProtectedText`).
- Navy `#12275a`, gold `#d4af37`, cream `#f7f1e3` are the app theme.

### Copy (keep every line readable in 1 second, verb-first — house style)
- Counter bar (matches found): `{n} item{s} will be masked · Your data stays in this browser`
- Counter bar (clean): `No sensitive data · Safe to send`
- Tooltip on an amber span (optional): `This {type} will be masked before sending`

### The highlight-overlay technique (how to underline text *inside* an input)
A plain `<input>` / `<textarea>` cannot style parts of its own text. Use the standard
**backdrop layer** pattern:

```
<div class="relative">
  <div class="highlight-layer">   ← same font, same padding, absolutely positioned behind
     renders the text with <mark> around sensitive spans
  </div>
  <textarea class="transparent-caret" />  ← real textarea, transparent background, on top
</div>
```
Both layers share identical font/size/padding/line-height and scroll together, so the
`<mark>` backgrounds line up exactly under the real characters. The textarea stays fully
editable; the layer behind it just paints the highlights.

---

## 3. Data flow

```
user types ──debounce 300ms──► POST /api/detect/preview { prompt }
                                          │  (pure, NO audit/points/notification)
                                          ▼
                             { count, spans:[{start,end,type}], masked, layer2 }
                                          │
                        frontend paints amber <mark> over spans + counter bar
                                          │
user clicks Send ─────────────► POST /api/detect { prompt }   (existing, commits event)
                                          ▼
                        existing Checkpoint modal / deliver() flow (unchanged)
```

---

## 4. Backend work (≈40 lines, 2 files)

### 4a. Add span detection to `backend/src/detector.js`
Add a function that returns character ranges (so the frontend can highlight in place).
It reuses the same `RULES`.

```js
// detector.js — add below maskPrompt()
/**
 * Return the character ranges of every sensitive match (Layer 1 only).
 * @returns {{start:number,end:number,type:string}[]}
 */
export function detectSpans(text) {
  const spans = []
  for (const rule of RULES) {
    // rule.regex has the /g flag, so matchAll gives every hit with .index
    for (const m of text.matchAll(rule.regex)) {
      spans.push({ start: m.index, end: m.index + m[0].length, type: rule.type })
    }
  }
  return spans.sort((a, b) => a.start - b.start)
}
```

> Layer 2 (names) spans are optional for v1. If you want name highlighting too, run the
> heuristic/Gemini name list and `indexOf` each name in the original text to get its range.
> Ship v1 with Layer 1 spans first — that already covers IC, phone, email, financial, card,
> credentials, secrets, customer records.

### 4b. Add the preview endpoint to `backend/src/server.js`
Put it right next to the existing `/api/detect` route.

```js
import { maskPromptFull } from './layer2.js'   // already imports detectNames/maskNames — add this
import { detectSpans } from './detector.js'     // add detectSpans to the existing import

// Preview scan — same detection, but writes NOTHING (safe to call on every keystroke)
app.post('/api/detect/preview', async (req, res) => {
  const { prompt } = req.body || {}
  if (typeof prompt !== 'string' || prompt.length === 0) return res.json({ count: 0, spans: [], masked: '' })
  const { masked, detections, layer2 } = await maskPromptFull(prompt) // pure, no side effects
  const spans = detectSpans(prompt)
  const count = detections.reduce((n, d) => n + d.count, 0)
  res.json({ count, spans, masked, detections, layer2 })
})
```

**That's the entire backend change.** No store, no audit, no points touched.

### API contract
```
POST /api/detect/preview
  body:  { "prompt": "refund RM 4,500 to customer Lim" }
  200:   {
           "count": 2,
           "spans": [ { "start": 7, "end": 15, "type": "FINANCIAL" } ],
           "masked": "refund [MASKED-AMOUNT] to customer [MASKED-NAME]",
           "detections": [ { "type": "FINANCIAL", "count": 1 }, { "type": "NAME", "count": 1 } ],
           "layer2": "heuristic"
         }
```

---

## 5. Frontend work (`frontend/src/pages/Extension.jsx`)

Replace the fake input block (currently ~lines 123-129) with a real composer that has the
highlight overlay. Below is the component to add — drop it in the same file.

```jsx
import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api.js'

function LiveShieldComposer({ onSend }) {
  const [text, setText] = useState('')
  const [scan, setScan] = useState({ count: 0, spans: [] })
  const layerRef = useRef(null)
  const areaRef = useRef(null)

  // Debounced preview scan — 300ms after the user stops typing
  useEffect(() => {
    if (!text.trim()) { setScan({ count: 0, spans: [] }); return }
    const t = setTimeout(async () => {
      try { setScan(await api.post('/detect/preview', { prompt: text })) } catch { /* offline */ }
    }, 300)
    return () => clearTimeout(t)
  }, [text])

  // Keep the highlight layer scrolled in sync with the textarea
  const syncScroll = () => {
    if (layerRef.current && areaRef.current) {
      layerRef.current.scrollTop = areaRef.current.scrollTop
      layerRef.current.scrollLeft = areaRef.current.scrollLeft
    }
  }

  // Build the highlighted markup from character spans
  const highlighted = () => {
    if (!scan.spans?.length) return text
    const out = []
    let cursor = 0
    scan.spans.forEach((s, i) => {
      out.push(text.slice(cursor, s.start))
      out.push(
        <mark key={i} className="bg-[#fff5de] border-b-2 border-[#d4af37] rounded-[3px] text-[#b54708]">
          {text.slice(s.start, s.end)}
        </mark>
      )
      cursor = s.end
    })
    out.push(text.slice(cursor))
    return out
  }

  return (
    <div>
      {/* counter bar */}
      {text.trim() && (
        <div className={`mb-2 text-[11px] font-semibold ${scan.count ? 'text-[#b54708]' : 'text-[#05946e]'}`}>
          {scan.count
            ? `${scan.count} item${scan.count === 1 ? '' : 's'} will be masked · Your data stays in this browser`
            : 'No sensitive data · Safe to send'}
        </div>
      )}

      {/* overlay composer: highlight layer behind a transparent textarea */}
      <div className="relative bg-white border border-[#d5dae3] rounded-[18px] min-h-16">
        <div
          ref={layerRef}
          aria-hidden
          className="absolute inset-0 px-6 py-4 text-sm text-[#111d35] whitespace-pre-wrap break-words overflow-hidden pointer-events-none"
        >
          {highlighted()}
        </div>
        <textarea
          ref={areaRef}
          value={text}
          onChange={e => setText(e.target.value)}
          onScroll={syncScroll}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
          placeholder="Ask the approved AI workspace…"
          rows={2}
          className="relative w-full bg-transparent px-6 py-4 text-sm text-transparent caret-[#0c2556] outline-none resize-none"
        />
      </div>
    </div>
  )

  function handleSend() {
    if (!text.trim()) return
    onSend(text)          // parent runs the existing /api/detect commit + Checkpoint flow
    setText(''); setScan({ count: 0, spans: [] })
  }
}
```

**Important CSS detail:** the highlight layer and the textarea must have **identical**
`font-family`, `font-size`, `line-height`, and `padding` (here both use `text-sm px-6 py-4`),
or the highlights will drift out of alignment. The textarea text is `text-transparent` so
only the layer behind it is visible; `caret-[#0c2556]` keeps the blinking cursor visible.

Wire `onSend` to the same commit logic Gateway already uses (POST `/api/detect`, then open
the Checkpoint modal). You can literally lift `send()` / the modal JSX from
`Gateway.jsx` into `Extension.jsx`, or extract it into a shared hook.

---

## 6. Edge cases to handle
- **Empty / whitespace prompt** → counter hidden, no request.
- **Backend offline** → `catch` keeps the box usable, just no highlights (never crash).
- **Overlapping spans** → `detectSpans` sorts by start; if two rules overlap, keep the first
  (or merge). For the demo the seed prompts don't overlap, so sort-only is fine.
- **Very long prompt** → both layers scroll together via `syncScroll`; cap preview calls with
  the 300ms debounce so you never fire a request per character.
- **Fast typing** → debounce + `clearTimeout` cleanup already cancels stale requests.

---

## 7. Definition of Done (acceptance criteria)
1. Typing `refund RM 4,500 to customer Lim` in the Extension composer shows **amber
   underlines** under `RM 4,500` and `Lim` within ~300ms, with no click.
2. Counter bar reads `2 items will be masked · Your data stays in this browser`.
3. Typing `explain SQL joins` shows the green `No sensitive data · Safe to send` bar.
4. The audit log and notifications are **unchanged** while typing (verify: preview endpoint
   writes nothing — check `GET /api/audit` count before/after typing).
5. Clicking Send still runs the existing Checkpoint modal and commits **one** audit event.
6. Highlights stay aligned when the textarea is scrolled.
7. With the backend stopped, the box still types normally (no crash).

---

## 8. Demo script (30 seconds, for the video / judges)
1. Open `/extension` — the simulated ChatGPT page with the AI Passport extension active.
2. Slowly type: `Draft a payment reminder for customer Lim, IC 880505-10-5566, RM 4,500.`
3. As each sensitive item is typed, it lights up **amber live** — pause here, this is the wow.
4. Point to the counter: *"3 items will be masked — and notice it says the data stays in the
   browser. Nothing left yet. I haven't even sent it."*
5. Click Send → amber flips to **green** protected chips → Checkpoint confirms the masked
   version → the AI replies. *"Protected without ever blocking me."*

---

## 9. Optional stretch (if there's extra time) — tie it to gamification
When a Send commits with masked items, briefly float a `+0 protected · streak safe` badge from
the extension icon (reuse `profile.streakDays`). Reinforces the passport/"guide don't punish"
story: you were protected, your streak is intact, you were never punished. ~1 hour, pure
frontend, uses the profile data the panel already fetches.

---

## 10. File checklist for your friend
- [ ] `backend/src/detector.js` — add `detectSpans(text)` (≈10 lines)
- [ ] `backend/src/server.js` — add `POST /api/detect/preview` (≈8 lines) + import `detectSpans`
- [ ] `frontend/src/pages/Extension.jsx` — add `LiveShieldComposer`, replace the fake input,
      wire `onSend` to the existing `/api/detect` + Checkpoint flow
- [ ] Manual test against the 7 acceptance criteria above

No database, no new dependency, no change to any other screen. All detection logic is reused.
