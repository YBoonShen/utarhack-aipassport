// Layer 2 tests — run WITHOUT a Gemini key so they exercise the offline
// heuristic deterministically (CI/teammates shouldn't need API access).
//
// The span tests below are the ones that matter when the key IS set: they feed
// maskNames the shapes the API actually returns — title-cased, re-spaced, split
// across entries — without needing the network to produce them.
delete process.env.GEMINI_API_KEY
const { maskPromptFull, maskNames, nameSpans } = await import('./layer2.js')

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

  // ---- capitalisation must not decide whether a name is found ---------------
  // Every one of these used to leave the name, or half of it, in the prompt.
  ['Lim Meng', '[MASKED-NAME]', 'Meng'],
  ['lim meng', '[MASKED-NAME]', 'meng'],
  ['lim MeNg', '[MASKED-NAME]', 'MeNg'],
  ['LIM MENG', '[MASKED-NAME]', 'MENG'],
  ['Lim Meng Meng', '[MASKED-NAME]', 'Meng'],
  ['lim MeNg MeNg', '[MASKED-NAME]', 'MeNg'],
  ['Lim meng meng', '[MASKED-NAME]', 'meng'],
  // Inside a sentence, and next to punctuation.
  ['Please send this to Lim Meng Meng.', '[MASKED-NAME]', 'Meng'],
  ['Please prepare the report for lim MeNg Meng by tomorrow.', '[MASKED-NAME]', 'MeNg'],
  ['Forward it to lim meng meng, then close the ticket.', '[MASKED-NAME]', 'meng'],
  ['(lim meng) approved the change.', '[MASKED-NAME]', 'meng'],
  // Names mixed with other sensitive data — Layer 1 must still do its half.
  ['Call lim MeNg Meng at 012-3456789 about invoice INV-2291 for RM 4,500.', '[MASKED-PHONE]', 'MeNg'],
  // Irregular casing anchored by a gazetteer name — the offline safety net that
  // covers Gemini being rate-limited. "shen" anchors the whole span.
  ['here is bOon SheN', '[MASKED-NAME]', 'SheN'],
  ['the invoice is for boon shen please', '[MASKED-NAME]', 'shen'],
  // "boon" is an ordinary English word, not a name on its own.
  ['this is a real boon for us', null, '[MASKED-NAME]'],
]

let pass = 0
let fail = 0
for (const [input, mustInclude, mustNotInclude] of cases) {
  const { masked, detections, layer2 } = await maskPromptFull(input)
  const ok =
    (mustInclude ? masked.includes(mustInclude) : detections.every(d => d.type !== 'NAME')) &&
    (!mustNotInclude || !masked.includes(mustNotInclude))
  console.log(ok ? 'PASS' : 'FAIL', `- [${layer2}]`, input, '=>', masked)
  ok ? pass++ : fail++
}

// A whole prompt's worth of sensitive data, checked field by field rather than
// by one substring: the name, the phone number, the record ID and the amount all
// have to go, and the wording around them has to survive untouched.
{
  const input = 'Email lim MeNg Meng at 012-3456789 about account no. A-88213 and the RM 4,500 refund.'
  const { masked, detections } = await maskPromptFull(input)
  const types = detections.map(d => d.type)
  const ok =
    masked.includes('[MASKED-NAME]') &&
    !/meng/i.test(masked) &&
    ['NAME', 'PHONE', 'FINANCIAL', 'CUSTOMER_RECORD'].every(t => types.includes(t)) &&
    masked.startsWith('Email ') &&
    masked.endsWith(' refund.')
  console.log(ok ? 'PASS' : 'FAIL', '- [mixed]', input, '=>', masked)
  ok ? pass++ : fail++
}

// Two people in one prompt stay two separate maskings — merging adjacent spans
// must not run two names together when a word sits between them.
{
  const { masked, detections } = await maskPromptFull('Ask lim meng and Sarah Tan to review the draft.')
  const name = detections.find(d => d.type === 'NAME')
  const ok = name?.count === 2 && (masked.match(/\[MASKED-NAME\]/g) || []).length === 2 && !/meng|sarah/i.test(masked)
  console.log(ok ? 'PASS' : 'FAIL', '- [two people]', '=>', masked, JSON.stringify(detections))
  ok ? pass++ : fail++
}

// ---- span handling, against what a detector really returns -------------------
//
// These call maskNames directly with the answers the Gemini layer gives, so the
// post-processing is tested without the network. Each pair is a shape that used
// to leave part of the name in the prompt.
const spanCases = [
  // [text, names the detector returned, expected masked text]
  ['lim MeNg Meng owes RM 500.', ['Lim Meng Meng'], '[MASKED-NAME] owes RM 500.'],          // re-cased by the model
  ['lim MeNg Meng owes RM 500.', ['Lim', 'Meng Meng'], '[MASKED-NAME] owes RM 500.'],       // split into two entries
  ['lim  MeNg  Meng owes.', ['Lim Meng Meng'], '[MASKED-NAME] owes.'],                      // re-spaced by the model
  ['LIM MENG asked.', ['lim meng'], '[MASKED-NAME] asked.'],                                // lower-cased by the model
  ['Send to Lim Meng Meng.', ['Lim Meng Meng'], 'Send to [MASKED-NAME].'],                  // trailing punctuation
  ['Ask Lim, then Tan.', ['Lim', 'Tan'], 'Ask [MASKED-NAME], then [MASKED-NAME].'],         // punctuation must not merge
  ['Lim Meng Meng and Lim Meng Meng', ['Lim Meng Meng'], '[MASKED-NAME] and [MASKED-NAME]'], // every occurrence
  ['IC [MASKED-IC] belongs to Lim.', ['MASKED', 'Lim'], 'IC [MASKED-IC] belongs to [MASKED-NAME].'], // never inside a Layer 1 token
  ['Nothing to do here.', [], 'Nothing to do here.'],                                       // no names: text untouched
  ['Ada is away.', ['Zainal'], 'Ada is away.'],                                             // a name that is not there masks nothing
]

for (const [text, names, expected] of spanCases) {
  const { masked } = maskNames(text, names)
  const ok = masked === expected
  console.log(ok ? 'PASS' : 'FAIL', '- [span]', JSON.stringify(names), '=>', masked)
  if (!ok) console.log('        expected:', expected)
  ok ? pass++ : fail++
}

// Masking the same span twice must produce the same string — the checkpoint
// shows the employee one safe version and sends exactly that.
{
  const text = 'Please prepare the report for lim MeNg Meng by tomorrow.'
  const names = ['Lim Meng Meng', 'Lim', 'Meng']
  const a = maskNames(text, names)
  const b = maskNames(text, [...names].reverse())
  const ok = a.masked === b.masked && a.count === 1 && a.masked === 'Please prepare the report for [MASKED-NAME] by tomorrow.'
  console.log(ok ? 'PASS' : 'FAIL', '- [deterministic]', '=>', a.masked, `x${a.count}`)
  ok ? pass++ : fail++
}

// The span itself, not just the string it produces: one name, one range.
{
  const spans = nameSpans('Please send this to lim MeNg Meng.', ['Lim', 'Meng', 'Meng Meng'])
  const ok = spans.length === 1 && spans[0][0] === 20 && spans[0][1] === 33
  console.log(ok ? 'PASS' : 'FAIL', '- [one span]', JSON.stringify(spans))
  ok ? pass++ : fail++
}

const total = pass + fail
console.log(`\n${pass}/${total} layer-2 tests passed`)
process.exit(fail === 0 ? 0 : 1)
