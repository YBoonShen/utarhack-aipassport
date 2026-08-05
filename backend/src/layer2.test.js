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
  // Gazetteer pass: a known name is caught with no context word in front of it.
  ['Rahman flagged a discrepancy in the ledger.', '[MASKED-NAME]', 'Rahman'],
  ['The escalation from Kumar still needs sign-off.', '[MASKED-NAME]', 'Kumar'],
  // Stop-list + verb removal: role-noun phrases and "Contact X" are not people.
  ['Outline a Customer Success onboarding plan.', null, '[MASKED-NAME]'],
  ['Contact Support if the build fails again.', null, '[MASKED-NAME]'],
  // Arbitrary names (not in the gazetteer) — the multi-word / person-frame passes.
  ['John Smith will attend the review.', '[MASKED-NAME]', 'John Smith'],
  ['Please email Xavier before noon.', '[MASKED-NAME]', 'Xavier'],
  ['The proposal from Emily Watson is ready.', '[MASKED-NAME]', 'Emily Watson'],
  // Capitalised non-people that a naive two-word matcher would wrongly mask.
  ['Explain Machine Learning to the team.', null, '[MASKED-NAME]'],
  ['Summarise Google Sheets shortcuts.', null, '[MASKED-NAME]'],
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
