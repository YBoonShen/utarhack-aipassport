// Layer 2 tests — run WITHOUT a Gemini key so they exercise the offline
// heuristic deterministically (CI/teammates shouldn't need API access).
delete process.env.GEMINI_API_KEY
const { maskPromptFull } = await import('./layer2.js')

const cases = [
  // [input, mustInclude, mustNotInclude]
  ['Draft a payment reminder email to our customer Lim, IC 880505-10-5566, about RM 4,500.', '[MASKED-NAME]', 'Lim'],
  ['Meeting with Encik Ahmad tomorrow about the audit', '[MASKED-NAME]', 'Ahmad'],
  ['Send the report to Ms Sarah Tan by Friday', '[MASKED-NAME]', 'Sarah Tan'],
  ['Explain SQL joins to me', null, '[MASKED-NAME]'], // clean: no names invented
  ['The customer database needs indexing', null, '[MASKED-NAME]'], // "customer" + lowercase word: not a name
]

let pass = 0
for (const [input, mustInclude, mustNotInclude] of cases) {
  const { masked, detections, layer2 } = await maskPromptFull(input)
  const ok =
    (mustInclude ? masked.includes(mustInclude) : detections.every(d => d.type !== 'NAME')) &&
    (!mustNotInclude || !masked.includes(mustNotInclude))
  console.log(ok ? 'PASS' : 'FAIL', `- [${layer2}]`, input, '=>', masked)
  if (ok) pass++
}
console.log(`\n${pass}/${cases.length} layer-2 tests passed`)
process.exit(pass === cases.length ? 0 : 1)
