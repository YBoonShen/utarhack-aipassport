// Detection accuracy benchmark (proposal Objective O2/O6).
// Labelled test set of 100 prompts — 50 sensitive, 50 safe — run through the
// full two-layer scan. A prompt is "flagged" when any sensitive item is
// detected. We report accuracy, precision and recall against the 90% target.
//
// Run: npm run benchmark   (uses Gemini if GEMINI_API_KEY is set, else the
// offline name heuristic — either way Layer 1 regex always applies).
import { maskPromptFull } from './layer2.js'

// 50 SENSITIVE prompts — each contains at least one of the six protected
// categories (IC/passport, names, phone, financial, customer records,
// credentials/source code). Expected: flagged.
const sensitive = [
  'Summarise the complaint from customer Lim, IC 880505-10-5566.',
  'Draft a reply to Encik Ahmad about his overdue payment.',
  'Send the audit summary to Ms Sarah Tan by Friday.',
  'Call the client back at 012-345 6789 this afternoon.',
  'Our vendor contact is +60123456789, please follow up.',
  'Email the invoice to jiayin.tan@company.com.my today.',
  'The applicant passport number is A12345678.',
  'Refund RM 4,500 to the customer this week.',
  'Forecast shows USD 1,200,000 in Q4 revenue.',
  'Charge the card 4111 1111 1111 1111 for the order.',
  'The login is password: hunter2 for the shared account.',
  'Set api_key=demo0000token1234 in the config.',
  'Connect using mongodb://db.internal:27017/prod for the export.',
  'Rotate the config value mysql://db.internal:3306/live now.',
  'The deploy config still has jdbc:mysql://db.internal:3306/app.',
  'Look up account no 88123456 for the dispute.',
  'Escalate case #4821 to the compliance team.',
  'Cancel order ORD-2291 and refund the buyer.',
  'Pull the record for customer id C-1029 please.',
  'Reference INV-4500 is still unpaid.',
  'Draft an apology to Mr Kumar for the delay.',
  'IC 900101-05-1234 belongs to the new hire.',
  'His mobile is 019-8765432 if you need to confirm.',
  'Wire MYR 25,000 to the supplier account.',
  'Customer Rahman reported a billing error of RM 320.',
  'The client Tan Wei Ming asked for a callback at 03-12345678.',
  'Send Puan Aminah the statement for account 55009988.',
  'Passport B87654321 expired last month.',
  'The db string is postgres://db.internal:5432/app in the code.',
  'The queue url amqp://mq.internal:5672 is in the repo.',
  'Please summarise Dr Lee\'s patient notes from yesterday.',
  'Charge SGD 3,499.00 to the corporate card.',
  'Order no A-0492 needs a status update.',
  'Customer Chan Pei Yin, phone 011-23456789, wants a refund.',
  'The secret is stored in postgresql://svc.internal:5432/orders.',
  'Invoice number INV-2026-041 is overdue by RM 900.',
  'New candidate Muhammad Ikhlas starts on Monday.',
  'Verify IC number 770707-14-9999 against the record.',
  'Case CASE-7781 involves a data-entry mistake.',
  'Send RM12,000.50 to jiayin@abcd.com for the deposit.',
  'Client Samantha Chan can be reached at +6012 987 6543.',
  'Reset the pwd: Winter2026! on the finance account.',
  'The applicant Ahmad Zaki listed passport C11223344.',
  'Account 4000123412341234 was charged twice.',
  'Colleague Sarah handles order 33417 for that region.',
  'Redis url redis://cache.internal:6379 must be rotated.',
  'Refund customer 100482 the sum of USD 780.',
  'Mrs Wong called from 07-2345678 about invoice 8890.',
  'The service config has jdbc:postgresql://svc.internal:5432/hr hardcoded.',
  'Patient Lim Ah Kaw, IC 550303-08-1122, needs a review.',
]

// 50 SAFE prompts — generic work tasks with no personal or confidential data
// and no record IDs. Expected: not flagged.
const safe = [
  'Explain the difference between SQL inner and outer joins.',
  'Summarise the key points of agile project management.',
  'Write a polite out-of-office email template.',
  'What are best practices for writing clear documentation?',
  'Give me three tips for running an effective standup meeting.',
  'Explain how HTTPS keeps web traffic secure.',
  'Draft a friendly welcome message for a new team channel.',
  'What is the difference between REST and GraphQL?',
  'Suggest a weekly structure for a marketing content calendar.',
  'How do I write a good unit test?',
  'Explain the concept of technical debt in simple terms.',
  'Give me an outline for a product launch checklist.',
  'What are common causes of slow database queries?',
  'Rewrite this sentence to sound more professional.',
  'Explain the pros and cons of remote work.',
  'What is a good framework for prioritising tasks?',
  'Summarise the benefits of code review for a team.',
  'Draft a short thank-you note for a workshop host.',
  'How does caching improve application performance?',
  'Explain continuous integration to a non-technical manager.',
  'Give me an agenda for a one-hour brainstorming session.',
  'What are the main principles of responsive design?',
  'Suggest ways to improve email subject lines.',
  'Explain the difference between a stack and a queue.',
  'Write a brief introduction for a company newsletter.',
  'What are effective onboarding practices for new hires?',
  'Explain how version control helps a development team.',
  'Give me tips for delivering constructive feedback.',
  'Summarise the advantages of cloud computing.',
  'What is the purpose of a retrospective meeting?',
  'Draft a reminder about the upcoming team lunch.',
  'Explain the difference between authentication and authorisation.',
  'How can I make my presentation slides clearer?',
  'What are good habits for maintaining work-life balance?',
  'Explain the idea of a minimum viable product.',
  'Suggest a naming convention for project files.',
  'What are common accessibility improvements for a website?',
  'Draft a short update on general project progress.',
  'Explain how load balancing works at a high level.',
  'Give me a checklist for reviewing a design mockup.',
  'What is the difference between a bug and a feature request?',
  'Summarise the main goals of a governance policy.',
  'Explain why documentation should be kept up to date.',
  'Suggest icebreaker questions for a team meeting.',
  'What are the benefits of pair programming?',
  'Draft a neutral reply confirming a meeting time.',
  'Explain the concept of scalability for a web service.',
  'How do I structure a clear bug report?',
  'What are good practices for naming variables in code?',
  'Summarise the value of regular team knowledge sharing.',
]

function isFlagged(result) {
  return result.detections && result.detections.length > 0
}

async function run() {
  let tp = 0, fn = 0, tn = 0, fp = 0
  const misses = []

  for (const text of sensitive) {
    const r = await maskPromptFull(text)
    if (isFlagged(r)) tp++
    else { fn++; misses.push(`FN (missed)  → ${text}`) }
  }
  for (const text of safe) {
    const r = await maskPromptFull(text)
    if (!isFlagged(r)) tn++
    else { fp++; misses.push(`FP (false +) → ${text}  [${r.detections.map(d => d.type).join(',')}]`) }
  }

  const total = sensitive.length + safe.length
  const accuracy = ((tp + tn) / total) * 100
  const precision = tp / (tp + fp || 1)
  const recall = tp / (tp + fn || 1)

  console.log('\nAI Passport — Detection Accuracy Benchmark (O2)')
  console.log('------------------------------------------------')
  console.log(`Test set:   ${total} prompts (${sensitive.length} sensitive, ${safe.length} safe)`)
  console.log(`Layer 2:    ${process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'your-gemini-key' ? 'Gemini API' : 'offline heuristic'}`)
  console.log(`TP ${tp}  FN ${fn}  TN ${tn}  FP ${fp}`)
  console.log(`Accuracy:   ${accuracy.toFixed(1)}%   (target ≥ 90%)`)
  console.log(`Precision:  ${(precision * 100).toFixed(1)}%`)
  console.log(`Recall:     ${(recall * 100).toFixed(1)}%`)
  if (misses.length) {
    console.log('\nMisclassifications:')
    misses.forEach(m => console.log('  ' + m))
  }
  console.log(`\n${accuracy >= 90 ? 'PASS' : 'BELOW TARGET'} — 90% accuracy objective\n`)
  process.exit(accuracy >= 90 ? 0 : 1)
}

run()
