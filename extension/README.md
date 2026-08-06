# AI Passport — Chrome Extension (Manifest V3)

This is the real browser extension. While you type into ChatGPT (or Claude, Gemini,
DeepSeek, Kimi) it quietly checks your prompt for personal data — IC numbers, phone
numbers, customer names, money amounts — and offers to mask them **before** the prompt
is sent. Safe prompts are never interrupted.

New here? Follow Part 1. Everything after it is for developers.

---

# Part 1 — Install and use it

## Before you start

The extension is only the front door — the **backend does the actual detection**, so it
must be running. From the project root:

- **Windows:** double-click `start.bat` and leave the two windows open.
- **Any OS:** `cd backend && npm install && npm run dev` (port 5001), and optionally
  `cd frontend && npm install && npm run dev` (port 5173) for the dashboard.

Check it's alive: <http://localhost:5001/api/health> should return a short JSON response.

Full setup instructions, including installing Node.js, are in the [main README](../README.md).

## Install the extension (2 minutes)

1. Open Chrome and type `chrome://extensions` in the address bar, then press Enter.
2. Turn on **Developer mode** using the switch at the **top right**.
3. Click **Load unpacked** at the top left.
4. Select this **`extension`** folder — the folder itself, not any file inside it.
5. "AI Passport — Smart Gateway" appears in your extension list. ✅
6. Click the puzzle-piece 🧩 icon in the toolbar and **pin** AI Passport so its icon
   stays visible.

## Sign in

The extension has no login of its own — it follows your dashboard session.

Open <http://localhost:5173>, sign in (any email works; `admin@abcd.com` opens the admin
console), then click the AI Passport toolbar icon. It should say **Protected**.

If it says *Sign in to protect your prompts*, you aren't signed in yet — or the extension
hasn't noticed. It rechecks about once a minute; you never need to reload the page.

## Use it

1. Open <https://chatgpt.com>.
2. Type normally. For a safe prompt like `Explain SQL joins to me in simple terms`,
   **nothing happens** — the extension is invisible.
3. Type something with personal data:
   ```
   Draft a reminder for customer Lim, IC 880505-10-5566, about RM 4,500
   ```
4. Stop typing. Half a second later the checkpoint panel appears, listing what it found.
5. Choose:
   - **Protect & continue** — the masked version replaces your text, and that is what
     ChatGPT receives.
   - **Edit prompt** — the panel closes and your text is still there to fix by hand.

Click the toolbar icon any time to see your protection status, literacy level, prompts
protected, items masked and the current gateway policy.

## Try the interesting cases

| # | Type this into ChatGPT | What should happen |
|---|---|---|
| 1 | `Explain SQL joins to me in simple terms` | Nothing appears. The extension is invisible for safe prompts. |
| 2 | `Draft a reminder for customer Lim, IC 880505-10-5566, about RM 4,500` | Panel appears ~0.5s after you stop typing, listing `IC NUMBER ×1`, `FINANCIAL FIGURE ×1`, `NAME ×1`. |
| 3 | Click **Protect & continue** | The composer text is replaced with the masked version. Click into it — ChatGPT's own state has the masked text, and sending delivers the masked prompt. |
| 4 | Admin → Settings → set mode to **Warn only**, retype prompt 2 | Panel warns and offers *Protect prompt* / *Keep original*; nothing is rewritten automatically. |
| 5 | Open <https://deepseek.com> (or <https://kimi.com>) and type prompt 2 | A banner on arrival says the tool has not been reviewed. The checkpoint still appears, still masks, and **still sends** — with a *Use an approved tool* button beside the safe version. Nothing is blocked. |
| 5b | Same prompt with `lim MeNg Meng` in place of `Lim` | Still `NAME ×1`, and the whole name masked as one `[MASKED-NAME]` — capitalisation is not what makes something a name. |
| 6 | Stop the backend, retype prompt 2 | Checkpoint still appears, marked *Masked on your device*. Send it — the masked prompt goes through. A **clean** prompt sends with no panel at all. |
| 7 | Click the toolbar icon | Popup shows Protected / literacy level / prompts protected / items masked / gateway policy. |
| 8 | Admin → Audit Log | One `MASKED` event per **Protect & continue**, not one per keystroke. |
| 9 | Sign out on the dashboard, then return to the ChatGPT tab | Within a minute the popup says *Sign in to protect your prompts* and the page stops intercepting — ChatGPT works exactly as if the extension were not installed. Sign back in and protection returns in place, no reload. |
| 10 | Reload the extension from `chrome://extensions` with ChatGPT open | The old checkpoint tears itself down. Sending still works; open the popup once to re-arm the tab. |

## If something goes wrong

| Problem | Fix |
|---|---|
| No panel ever appears | Reload the extension at `chrome://extensions` (↻ icon), then **refresh the ChatGPT tab**. |
| Popup says "Gateway unreachable" | The backend isn't running — start it and check <http://localhost:5001/api/health>. |
| Popup says "Sign in to protect your prompts" | Sign in at <http://localhost:5173>. Give it up to a minute to reach an open AI tab. |
| Short prompts aren't checked | By design — anything under 12 characters can't realistically carry an identifier (`minPromptLength` in `config.js`). |
| Backend runs on a different port | Change `apiBase` in `config.js` **and** the matching entry in `manifest.json` → `host_permissions`. |
| You edited a file in this folder | Reload the extension from `chrome://extensions`. Extension files are not hot-reloaded. |

To watch it work, open DevTools on the AI tab (`F12` → Console): `[AI Passport]` logs
state transitions, interception, detection start/finish and graceful fallbacks. Prompt
text is never logged — only lengths and detection types.

---

# Part 2 — How it works (developers)

Detection is `POST /api/detect` — the same `detector.js` + `layer2.js` pipeline
the web Smart Gateway at `/gateway` uses — so both behave identically. The one
exception is `rules.js`, a mirror of the Layer 1 regexes used *only* when the
backend cannot be reached; `backend/src/rules.sync.test.js` fails if the two
drift apart.

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

### One protection state

"Is this employee protected?" is answered in exactly one place — `state.js`
`derive()` — and only `background.js` may call it:

```
/api/auth/session + /api/profile + /api/settings
        │  background.js  →  state.js derive()
        ▼
chrome.storage.local.aipProtection      ← the single record
        │
        ├─► popup.js       (shield card, via state.js summary())
        └─► content.js     (whether to intercept at all)
```

`chrome.storage.onChanged` fires in every context at once, so signing in or out
reaches an already-open ChatGPT tab without a reload and without a message that
could go missing. Two clocks keep the record current, because a dashboard login
happens on another origin that cannot notify the extension:

- a **one-minute alarm** in the service worker — the floor, running whether or
  not any AI tab is open;
- a **15-second heartbeat** from the checkpoint on whichever AI tab is visible
  (`config.js` → `heartbeatMs`) — so a sign-out reaches a page the employee is
  still typing into, and a sign-in clears the notice without a refresh. Those
  calls are answered from the worker's own cache (`stateTtlMs`, 10s) and
  single-flighted, so ten open tabs are not ten times the traffic.

`derive()` separates the two failures that look identical from inside a browser:

| | backend answered | backend did not answer |
|---|---|---|
| **session live** | `active` — full two-layer checks | `degraded` for `AUTH_GRACE_MS` (2 min), then `unverified` |
| **no session** | `signedOut` | `signedOut` (an outage cannot sign anyone *in*) |
| **never reached** | — | `offline` |

`degraded` keeps protection on: an outage is when it matters most, and the local
Layer 1 rules still mask. `unverified` turns it off and says so — after the grace
window the cached session is no longer evidence of anything, and claiming
protection would be a claim with nothing behind it. Only an *answer* moves the
`verifiedAt` clock, so a failed retry can never renew the window.

The three surfaces never derive this independently. The popup adds exactly one
fact of its own — whether a checkpoint is running *in this tab*, which it proves
with a ping rather than assuming.

### Failing without breaking the AI tool

The checkpoint sits in front of somebody else's send button, so every
interception must end in one of three ways: the prompt is sent, a panel is shown
with the prompt still in the composer, or the send is handed back. Four things
enforce that:

| Guard | Stops |
|---|---|
| `ask()` — timeout + one retry, and it recognises an orphaned context | A sleeping MV3 worker reading as "protection failed" |
| `rules.js` — local Layer 1 fallback | A backend blip becoming either a block or a leak |
| `beginWork()` watchdog | One hung await turning Enter into a dead key forever |
| Instance replacement (`globalThis.__aipCheckpoint`) | A reloaded extension leaving orphaned capture listeners in front of Send |

When the Gateway cannot be reached, `rules.js` decides: nothing sensitive found
locally → the prompt goes through; something found → the usual checkpoint, masked
on the device and labelled as the reduced check it is. Known sensitive content is
never sent silently, and the tool is never left unusable.

## Notes and limits

- **Debounce.** Detection runs 500ms after the last keystroke (`debounceMs` in
  `config.js`), and identical text is never re-sent. Typing is never blocked on
  the network.
- **Audit.** While-typing checks use `preview: true`, which runs detection but
  records nothing. The audit event is written only when the employee actually
  protects the prompt — one event per sent prompt, same as `/gateway`.
- **Supported tools.** ChatGPT, Claude, Gemini, DeepSeek and Kimi.
- **Adding a tool.** Add an entry to `TOOLS` in `config.js` and the host to
  **three** lists in `manifest.json` — `content_scripts.matches`,
  `host_permissions` and `web_accessible_resources.matches` (miss the last one
  and the panel renders unstyled). No other file hardcodes a host.
- **Checking a tool's selectors.** Upstream markup changes, so `selectors` and
  `sendSelectors` are ordered specific → generic and the checkpoint degrades
  rather than failing: `findComposer()` falls back to whatever the employee
  actually typed into, and `fireSend()` falls back to dispatching Enter when no
  send button matches. To confirm a tool: open its page with DevTools, run
  `document.querySelector('<selector>')` for the composer, then right-click the
  send control → Inspect and check it matches one of `sendSelectors` or
  `sendFallback`. If the send control is missed, Enter is still intercepted —
  only mouse clicks on Send would bypass the checkpoint.
- **ChatGPT's composer** is a ProseMirror `contenteditable`. Masked text is
  inserted through a real edit (`execCommand('insertText')`) so the editor's
  internal document updates — setting `textContent` alone would leave ChatGPT
  holding the original prompt. If OpenAI changes the editor, the fallback path
  in `content.js` → `writeText()` is where to look.
- **Approval is the backend's answer, never this table's.** `config.js` → `TOOLS`
  says only which sites the checkpoint can *operate* on. `background.js` →
  `resolveTool()` asks `GET /api/gateway/tool-status`, which folds the org
  register, the employee's AI License level and their own request history into
  one verdict, and returns the mode that really applies plus approved
  alternatives. Resolving and recording are deliberately separate calls: asking
  the question used to POST a tool-use, so opening the popup wrote an audit event
  about a use that never happened.
- **An unapproved tool blocks nothing at all.** The site opens, clean prompts are
  untouched, and a sensitive one is masked and sent exactly as it would be to an
  approved tool. What changes is that the employee is *told*: a standing banner on
  arrival, a line on the checkpoint beside the safe version, and a **Use an
  approved tool** button that names the alternatives they actually hold. The visit
  and the prompt both reach the admin's audit log.

  Refusing those prompts protected nothing the masking does not already protect —
  the masked prompt carries no company data either way — while costing the
  employee their work and teaching them to finish the job in a browser the
  extension is not installed in. That is the one outcome the whole product exists
  to avoid, and it is the same reason the site itself is never blocked.

  A **banned** or **suspended** destination, and one **above the employee's
  licence level**, still refuse. Those are decisions an admin has already made;
  "nobody has reviewed this yet" is the absence of one.
- **Model selection** is read at send time — `config.js` → `readModel()`, using
  `modelParam` (a URL query parameter) first and then `modelSelectors`. Read
  lazily rather than watched with a MutationObserver: the value only matters at
  the instant a prompt is sent, and a standing observer on somebody else's picker
  would run all session for it. Reading nothing is a normal answer, and the
  backend treats an unidentified model as UNKNOWN rather than unapproved.
- **Checking a model picker.** Same recipe as the composer: open the tool with
  DevTools and run `document.querySelector('<selector>')?.innerText`. It should
  print the model name the UI is showing. If every selector misses, the checkpoint
  simply has no model to report — it never guesses.
- **Protection follows the dashboard session.** The extension has no login of its
  own: it runs on another origin, cannot share the dashboard's storage, and has
  no token. It asks `/api/auth/session` *without* one, which the backend answers
  with whoever is signed in on this machine's dashboard — subject to the same
  expiry as any other session, and `{ "user": null }` the moment that session
  ends. Reading it grants nothing; it is a lookup, not a credential. Sessions are
  held in `backend/src/auth.js` and persisted, so restarting the backend no
  longer signs everybody out (and the dashboard no longer has to re-assert its
  stored identity to work around it — that workaround was localStorage
  authenticating itself).
- **Local dev only.** `apiBase` is plain HTTP on localhost. Production needs
  HTTPS, and the employee's own session token attached in `background.js` →
  `callApi()` instead of the shared-session lookup. No secret is shipped in the
  extension.
