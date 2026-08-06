// Manifest match-pattern coverage — run with `npm test` (backend).
//
// Chrome's match-pattern host rule is stricter than it looks: `*.host` matches
// host's subdomains but never the bare host itself (see the Chrome extensions
// docs on match patterns — the `*.google.com` example explicitly does not
// match `google.com`). Kimi and Moonshot are reachable at their bare domains —
// it's the URL the backend's own register offers as Kimi's canonical link
// (store.js's Kimi entry: url: 'https://kimi.com') — so a wildcard-only
// pattern silently left those pages with no content script injected: no
// detection, no arrival report, nothing in the audit log. This pins that both
// the bare-host and the wildcard pattern are present in every list the
// manifest declares hosts in, so a future edit that drops one as "redundant"
// fails loudly instead of quietly breaking Kimi detection again.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const manifest = JSON.parse(readFileSync(join(here, 'manifest.json'), 'utf8'))

let passed = 0
function test(name, fn) {
  fn()
  passed++
  console.log(`  ✓ ${name}`)
}

// A narrow re-implementation of Chrome's match-pattern host rule — just enough
// to check the `https://<host>/*` and `https://*.<host>/*` shapes this file
// declares. Not a general-purpose match-pattern parser.
function hostMatches(pattern, host) {
  const m = pattern.match(/^https:\/\/([^/]+)\/\*$/)
  if (!m) return false
  const patternHost = m[1]
  if (patternHost.startsWith('*.')) return host.endsWith(patternHost.slice(1))
  return host === patternHost
}

test('the wildcard pattern alone would not have matched the bare host (why this file exists)', () => {
  assert.equal(hostMatches('https://*.kimi.com/*', 'kimi.com'), false)
  assert.equal(hostMatches('https://*.kimi.com/*', 'www.kimi.com'), true)
})

const lists = {
  host_permissions: manifest.host_permissions,
  'content_scripts[0].matches': manifest.content_scripts[0].matches,
  'web_accessible_resources[0].matches': manifest.web_accessible_resources[0].matches,
}

for (const [listName, patterns] of Object.entries(lists)) {
  for (const host of ['kimi.com', 'moonshot.cn']) {
    test(`${listName} covers ${host} bare and as a subdomain`, () => {
      assert.ok(patterns.some(p => hostMatches(p, host)), `no pattern matches bare ${host}`)
      assert.ok(patterns.some(p => hostMatches(p, `www.${host}`)), `no pattern matches www.${host}`)
    })
  }
}

console.log(`\n${passed} manifest match-pattern tests passed`)
