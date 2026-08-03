# AI Passport — Chrome Extension (Manifest V3)

The real browser extension. It watches the composer on an approved AI tool,
checks the prompt against the **existing** AI Passport backend, and protects it
before it is sent.

This does **not** contain any detection rules of its own. Detection is
`POST /api/detect` — the same `detector.js` + `layer2.js` pipeline the web
Smart Gateway at `/gateway` uses — so both behave identically.

The `/extension` page in the React app remains the polished demo of this
concept; it is untouched and independent of this directory.

## Architecture

```
ChatGPT page
    │  content.js — finds the composer, debounces typing
    ▼
chrome.runtime message
    │  background.js — the only place that calls the API
    ▼
POST /api/detect  ──► detector.js ──► layer2.js
    │
    ▼
allow · mask · warn · block  (policy comes from /api/settings)
```

`background.js` makes every request from the extension's own origin, so there is
no CORS negotiation and no mixed-content problem calling `http://localhost` from
an `https://` page.

## Run it

1. **Backend** (required — it is the detection engine):
   ```
   cd backend && npm install && npm run dev      # http://localhost:5001
   ```
2. **Frontend** (optional, for the dashboard link in the popup):
   ```
   cd frontend && npm install && npm run dev     # http://localhost:5173
   ```
3. **Load the extension**
   - Open `chrome://extensions`
   - Turn on **Developer mode** (top right)
   - **Load unpacked** → select this `extension/` folder
4. Open <https://chatgpt.com> and start typing.

If the backend runs on a different port, change `apiBase` in `config.js` and the
matching entry in `manifest.json` → `host_permissions`.

## Test it

| # | Type this into ChatGPT | Expected |
|---|---|---|
| 1 | `Explain SQL joins to me in simple terms` | Nothing appears. The extension is invisible for safe prompts. |
| 2 | `Draft a reminder for customer Lim, IC 880505-10-5566, about RM 4,500` | Panel appears ~0.5s after you stop typing, listing `IC NUMBER ×1`, `FINANCIAL FIGURE ×1`, `NAME ×1`. |
| 3 | Click **Protect & continue** | The composer text is replaced with the masked version. Click into it — ChatGPT's own state has the masked text, and sending delivers the masked prompt. |
| 4 | Admin → Settings → set mode to **Warn only**, retype prompt 2 | Panel warns and offers *Protect prompt* / *Keep original*; nothing is rewritten automatically. |
| 5 | Set mode to **Block**, retype prompt 2 | Panel says policy blocks it; only *Edit prompt* is offered. |
| 6 | Stop the backend, retype prompt 2 | "Protection unavailable" — the page keeps working, the prompt is untouched. |
| 7 | Click the toolbar icon | Popup shows Protected / literacy level / prompts protected / items masked / gateway policy. |
| 8 | Admin → Audit Log | One `MASKED` event per **Protect & continue**, not one per keystroke. |

Reload the extension from `chrome://extensions` after changing any file here.

## Notes and limits

- **Debounce.** Detection runs 500ms after the last keystroke (`debounceMs` in
  `config.js`), and identical text is never re-sent. Typing is never blocked on
  the network.
- **Audit.** While-typing checks use `preview: true`, which runs detection but
  records nothing. The audit event is written only when the employee actually
  protects the prompt — one event per sent prompt, same as `/gateway`.
- **Adding a tool.** Add an entry to `TOOLS` in `config.js` and the host to
  `content_scripts.matches` / `host_permissions` in `manifest.json`. No other
  file hardcodes a host.
- **ChatGPT's composer** is a ProseMirror `contenteditable`. Masked text is
  inserted through a real edit (`execCommand('insertText')`) so the editor's
  internal document updates — setting `textContent` alone would leave ChatGPT
  holding the original prompt. If OpenAI changes the editor, the fallback path
  in `content.js` → `writeText()` is where to look.
- **Approved tools** fall back to the `TOOLS` table because `/api/visas` returns
  visa *requests*, not an approved-tool list. `background.js` → `resolveTool()`
  already honours a `DECLINED`/`REDIRECTED` decision from that API and is the
  single function to change when the backend exposes the real list.
- **Local dev only.** `apiBase` is plain HTTP on localhost and the requests carry
  no auth token. Production needs HTTPS plus the employee's session token —
  added in `background.js` → `callApi()`. No secret is shipped in the extension.
