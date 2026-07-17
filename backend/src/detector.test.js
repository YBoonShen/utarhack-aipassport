// Tiny test runner — run with: npm test
import { maskPrompt } from './detector.js'

const cases = [
  ['Customer Lim, IC 880505-10-5566, overdue invoice', '[MASKED-IC]'],
  ['Call me at 012-345 6789 tomorrow', '[MASKED-PHONE]'],
  ['Send report to jiayin@company.com.my please', '[MASKED-EMAIL]'],
  ['password: hunter2 should never leak', '[MASKED-CREDENTIAL]'],
  ['Explain SQL joins to me', null], // clean prompt: nothing masked
]

let pass = 0
for (const [input, expectedToken] of cases) {
  const { masked, detections } = maskPrompt(input)
  const ok = expectedToken ? masked.includes(expectedToken) : detections.length === 0
  console.log(ok ? 'PASS' : 'FAIL', '-', input, '=>', masked)
  if (ok) pass++
}
console.log(`\n${pass}/${cases.length} tests passed`)
process.exit(pass === cases.length ? 0 : 1)
