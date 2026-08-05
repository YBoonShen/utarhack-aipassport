// Tiny test runner — run with: npm test
import { maskPrompt } from './detector.js'

const cases = [
  ['Customer Lim, IC 880505-10-5566, overdue invoice', '[MASKED-IC]'],
  ['Call me at 012-345 6789 tomorrow', '[MASKED-PHONE]'],
  ['Send report to jiayin@company.com.my please', '[MASKED-EMAIL]'],
  ['password: hunter2 should never leak', '[MASKED-CREDENTIAL]'],
  ['Passport A12345678 expires next year', '[MASKED-PASSPORT]'],
  ['Invoice of RM 4,500 due last month', '[MASKED-AMOUNT]'],
  ['Explain SQL joins to me', null], // clean prompt: nothing masked
  // Presidio-style validation: a real (Luhn-valid) card is masked, a random
  // 16-digit number is not — precision comes from the checksum, not the regex.
  ['Charge card 4111 1111 1111 1111 today', '[MASKED-CARD]'],
  // A card whose middle digits look like a mobile number must still mask as a
  // card (CARD runs before PHONE) — regression for the "4012 8888…" overlap.
  ['Refund to Visa 4012 8888 8888 1881 now', '[MASKED-CARD]'],
  ['Track parcel 1234567890123456 tomorrow', null], // fails Luhn → not a card
  // IC is confirmed by date + state code, so a random 12-digit run is left alone.
  ['New hire IC 990101-05-1234 on file', '[MASKED-IC]'],
  ['The counter reached 123456789012 today', null], // month "34" is impossible → not an IC
  // Bank accounts (name / acc word context) and SWIFT codes.
  ['Transfer to Maybank 512345678901 today', '[MASKED-BANK]'],
  ['My bank acc 90887766554 is overdue', '[MASKED-BANK]'],
  ['Wire it, SWIFT MBBEMYKL, by Friday', '[MASKED-BANK]'],
  ['He has an account here somewhere', null], // no number → not flagged
  // Case-insensitive money, landline phone, and a glued IC prefix.
  ['Please pay rm500 to the vendor', '[MASKED-AMOUNT]'],
  ['Call the office at 03-12345678', '[MASKED-PHONE]'],
  ['Verify IC900101051234 against records', '[MASKED-IC]'],
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
