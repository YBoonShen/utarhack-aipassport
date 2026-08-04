// The Chrome extension ships a copy of the Layer 1 rules (extension/rules.js) so
// the checkpoint can still mask when this backend is unreachable. A copy that
// drifts is worse than no copy at all: the employee would be shown one safe
// version offline and a different one online. This test is the seam that keeps
// them identical — run with: npm test
import { RULES } from './detector.js'
import '../../extension/rules.js'

const local = globalThis.AIP_RULES
const checks = []

checks.push([
  'same number of rules',
  local.RULES.length === RULES.length,
  `${local.RULES.length} in the extension vs ${RULES.length} in detector.js`,
])

for (const [i, rule] of RULES.entries()) {
  const mirror = local.RULES[i]
  const same = mirror
    && mirror.type === rule.type
    && mirror.token === rule.token
    && mirror.regex.source === rule.regex.source
    && mirror.regex.flags === rule.regex.flags
  checks.push([`rule ${i} (${rule.type}) matches`, Boolean(same), mirror ? `got ${mirror.type} /${mirror.regex.source}/${mirror.regex.flags}` : 'missing'])
}

// A rule that no control enables can never run offline, which would silently
// drop a whole detection type from the fallback.
const covered = new Set(Object.values(local.CONTROL_TYPES).flat())
for (const rule of RULES) {
  checks.push([`${rule.type} is reachable through a control`, covered.has(rule.type), 'not in CONTROL_TYPES'])
}

// The fallback must produce the tokens the backend would have produced.
const sample = 'Customer Lim, IC 900101-01-1234, invoice RM5,000'
const masked = local.mask(sample, { personalIdentifiers: true, customerRecords: true, financialFigures: true, sourceCode: false }).masked
checks.push(['masks IC locally', masked.includes('[MASKED-IC]'), masked])
checks.push(['masks amounts locally', masked.includes('[MASKED-AMOUNT]'), masked])
checks.push(['leaves no raw IC behind', !masked.includes('900101-01-1234'), masked])

// A switched-off control must switch its rules off here too.
const noMoney = local.mask(sample, { personalIdentifiers: true, financialFigures: false }).masked
checks.push(['honours a disabled control', noMoney.includes('RM5,000'), noMoney])

let pass = 0
for (const [name, ok, detail] of checks) {
  console.log(ok ? 'PASS' : 'FAIL', '-', name, ok ? '' : `→ ${detail}`)
  if (ok) pass++
}
console.log(`\n${pass}/${checks.length} tests passed`)
process.exit(pass === checks.length ? 0 : 1)
