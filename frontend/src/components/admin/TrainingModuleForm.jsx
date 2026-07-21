// Shared pieces of the Training module-authoring flow — matches Figma
// "18C Admin • Create module", "Overlay / Add question", "Overlay / Assign
// Training" and "Modal / Module created". Used by both the standalone
// Create-module page and the embedded "New Training" card on Assign Training.
import { useState } from 'react'

export const emptyDraft = { title: '', points: '', minutes: '', questions: [] }

// Pre-filled example draft — matches Figma "Create a module" (2 questions, a
// title and points/time already in place so the form mirrors the design).
export const seedDraft = {
  title: 'AI Tools at Work: Staying Compliant & Safe',
  points: '150',
  minutes: '6',
  questions: [
    {
      type: 'mcq',
      question: 'Which part of this prompt contains personal data?',
      answers: ['The customer’s name and IC number', 'The instruction to summarise', 'The request to reply', 'Nothing — internal is always private'],
      correct: 0,
    },
    { type: 'practice', question: 'Write your own safe version of the prompt.', answers: [], correct: null },
  ],
}

export function QuestionModal({ onCancel, onSave }) {
  // Pre-filled with the Figma example so the overlay mirrors the design.
  const [type, setType] = useState('mcq') // 'mcq' | 'practice'
  const [question, setQuestion] = useState('Which part of this prompt contains personal data?')
  const [answers, setAnswers] = useState([
    'The customer’s name and IC number',
    'The instruction to summarise',
    'The request to reply',
    'Nothing — internal is always private',
  ])
  const [correct, setCorrect] = useState(0)

  function setAnswer(i, v) {
    setAnswers(a => a.map((x, idx) => (idx === i ? v : x)))
  }

  function save() {
    if (!question.trim()) return
    onSave({
      type,
      question,
      answers: type === 'mcq' ? answers.filter(a => a.trim()) : [],
      correct: type === 'mcq' ? correct : null,
    })
  }

  return (
    <div className="fixed inset-0 bg-navy-dark/50 flex items-center justify-center p-6 z-50" onClick={onCancel}>
      <div className="bg-[#fffefa] border-[1.5px] border-[#0a204f] rounded-[20px] shadow-[0px_10px_30px_0px_rgba(0,0,0,0.22)] w-full max-w-[620px] p-[30px]" onClick={e => e.stopPropagation()}>
        <p className="text-[#d9b32c] font-semibold text-[11px]">ADD A QUESTION</p>
        <p className="text-[#0a204f] font-bold text-[24px] mt-1">New question</p>

        <p className="text-[#8a7d56] font-semibold text-[11px] mt-6">QUESTION TYPE</p>
        <div className="flex gap-3 mt-2.5">
          <button
            onClick={() => setType('mcq')}
            className={`w-[180px] h-10 rounded-full text-[13px] font-semibold cursor-pointer ${type === 'mcq' ? 'bg-[#3b6be5] text-white' : 'bg-white border border-[#ccccd1] text-[#667085]'}`}
          >
            Multiple choice
          </button>
          <button
            onClick={() => setType('practice')}
            className={`w-[180px] h-10 rounded-full text-[13px] font-semibold cursor-pointer ${type === 'practice' ? 'bg-[#3b6be5] text-white' : 'bg-white border border-[#ccccd1] text-[#667085]'}`}
          >
            Type-your-own
          </button>
        </div>

        <p className="text-[#8a7d56] font-semibold text-[11px] mt-6">QUESTION</p>
        <input
          value={question}
          onChange={e => setQuestion(e.target.value)}
          placeholder="e.g. Which part of this prompt contains personal data?"
          className="w-full bg-[#edf2ff] rounded-[10px] h-12 px-3.5 mt-2.5 text-[15px] text-[#0a204f] outline-none"
        />

        {type === 'mcq' && (
          <>
            <p className="text-[#8a7d56] font-semibold text-[11px] mt-6">ANSWERS · tick the correct one</p>
            <div className="flex flex-col gap-2 mt-2.5">
              {answers.map((a, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-3 rounded-[8px] px-3.5 h-11 border ${correct === i ? 'bg-[#e7f1ec] border-[#328768]' : 'bg-white border-[#e0e0e5]'}`}
                >
                  <button
                    onClick={() => setCorrect(i)}
                    className={`w-[18px] h-[18px] rounded-full border-2 shrink-0 cursor-pointer flex items-center justify-center ${correct === i ? 'bg-[#328768] border-[#328768] text-white text-[10px]' : 'border-[#ccccd1]'}`}
                  >
                    {correct === i && '✓'}
                  </button>
                  <input
                    value={a}
                    onChange={e => setAnswer(i, e.target.value)}
                    placeholder={`Answer ${i + 1}`}
                    className="flex-1 bg-transparent outline-none text-[13.5px] text-[#0a204f]"
                  />
                </div>
              ))}
            </div>
          </>
        )}

        <div className="flex justify-end gap-3 mt-7">
          <button onClick={onCancel} className="border-[1.5px] border-[#0a204f] text-[#0a204f] font-semibold text-sm px-7 h-12 rounded-full cursor-pointer hover:bg-chip">
            Cancel
          </button>
          <button onClick={save} className="bg-[#d9b32c] hover:bg-gold-dark text-[#0a204f] font-semibold text-sm px-9 h-12 rounded-full cursor-pointer">
            Save question →
          </button>
        </div>
      </div>
    </div>
  )
}

export function AssignModal({ moduleTitle, onCancel, onAssigned }) {
  const [target, setTarget] = useState('everyone')
  const options = [
    ['everyone', 'Everyone', 'All 303 active employees'],
    ['department', 'By department', 'Pick Engineering, Sales, Finance, etc.'],
    ['selected', 'Selected employees', 'Choose specific people'],
  ]
  return (
    <div className="fixed inset-0 bg-navy-dark/50 flex items-center justify-center p-6 z-50" onClick={onCancel}>
      <div className="bg-card border border-navy rounded-[20px] w-full max-w-[520px] p-7 pt-6" onClick={e => e.stopPropagation()}>
        <p className="text-gold font-semibold text-[13px]">ASSIGN MODULE</p>
        <p className="text-navy font-bold text-[26px] mt-1">Who should get this module?</p>
        <p className="text-ink text-sm mt-2.5">Assigning &ldquo;{moduleTitle}&rdquo;. Employees see it in their training list once assigned.</p>

        <div className="flex flex-col gap-2.5 mt-5">
          {options.map(([key, label, desc]) => (
            <button
              key={key}
              onClick={() => setTarget(key)}
              className={`text-left rounded-[12px] border-[1.5px] px-4 py-3 cursor-pointer ${target === key ? 'bg-[#eef2ff] border-[#365fd9]' : 'border-[#d8d0b4]'}`}
            >
              <div className="flex items-center gap-3">
                <span className={`w-4 h-4 rounded-full border-2 shrink-0 ${target === key ? 'border-[#365fd9] bg-[#365fd9]' : 'border-[#98a2b3]'}`} />
                <div>
                  <p className="text-navy font-semibold text-sm">{label}</p>
                  <p className="text-slate2 text-xs mt-0.5">{desc}</p>
                </div>
              </div>
            </button>
          ))}
        </div>

        <p className="text-slate2 font-semibold text-xs mt-5">DUE DATE</p>
        <div className="bg-[#eef2ff] rounded-[10px] h-12 px-3.5 mt-2 flex items-center text-sm text-ink">30 Jul 2026</div>

        <div className="flex gap-3 mt-7">
          <button onClick={onCancel} className="border border-navy text-navy font-semibold text-sm px-6 h-12 rounded-full cursor-pointer hover:bg-chip">
            Cancel
          </button>
          <button onClick={() => onAssigned(target)} className="bg-gold hover:bg-gold-dark text-navy font-semibold text-sm flex-1 h-12 rounded-full cursor-pointer">
            Assign to {target === 'everyone' ? 'everyone' : target === 'department' ? 'department' : 'selected'} →
          </button>
        </div>
      </div>
    </div>
  )
}

export function InfoToast({ kicker, title, body, onClose }) {
  return (
    <div className="fixed inset-0 bg-navy-dark/50 flex items-center justify-center p-6 z-50" onClick={onClose}>
      <div className="bg-card border-2 border-[#078b6c] rounded-[20px] w-full max-w-[480px] p-7" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[#e9f8f2] border border-[#078b6c] flex items-center justify-center text-[#078b6c] text-lg shrink-0">✓</div>
          <div>
            <p className="text-[#078b6c] font-semibold text-[11px] tracking-wide">{kicker}</p>
            <p className="text-navy font-bold text-xl">{title}</p>
          </div>
        </div>
        <p className="text-ink text-sm mt-4">{body}</p>
        <button onClick={onClose} className="bg-gold hover:bg-gold-dark text-navy font-semibold text-sm w-full h-12 rounded-full mt-6 cursor-pointer">
          Back to library
        </button>
      </div>
    </div>
  )
}

// Matches Figma "Modal / Module created" — kicker, heading, body, Assign now / Done.
export function ModuleCreatedModal({ moduleTitle, questions, points, minutes, onAssign, onDone }) {
  return (
    <div className="fixed inset-0 bg-navy-dark/50 flex items-center justify-center p-6 z-50" onClick={onDone}>
      <div className="bg-card border border-navy rounded-[20px] w-full max-w-[540px] p-7" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-[#e9f8f2] border-2 border-[#078b6c] flex items-center justify-center text-[#078b6c] text-2xl shrink-0">✓</div>
          <div>
            <p className="text-[#078b6c] font-bold text-xs tracking-wide">MODULE CREATED</p>
            <p className="text-navy font-bold text-xl mt-0.5">&ldquo;{moduleTitle}&rdquo; is ready</p>
          </div>
        </div>
        <p className="text-ink text-sm mt-4">
          {questions} question{questions === 1 ? '' : 's'} · {points} safety points · {minutes} min. It has been added to your module library and can now be assigned to employees or departments.
        </p>
        <div className="flex gap-3 mt-6">
          <button onClick={onAssign} className="bg-gold hover:bg-gold-dark text-navy font-semibold text-sm px-6 h-12 rounded-full cursor-pointer">
            Assign to employees →
          </button>
          <button onClick={onDone} className="border border-navy text-navy font-semibold text-sm px-8 h-12 rounded-full cursor-pointer hover:bg-chip">
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

// Matches Figma "Create module card" — used standalone (18C) and embedded
// under "New Training" on Assign Training. `kicker` and `secondaryLabel`
// differ between those two contexts, everything else is identical.
export function CreateModuleCard({ kicker, draft, setDraft, onOpenQuestion, onCreate, secondaryLabel, onSecondary }) {
  return (
    <div className="bg-white border border-[#d8d0b4] rounded-[16px] p-7 mt-5">
      <p className="text-gold font-semibold text-[11px] tracking-wide">{kicker}</p>
      <p className="text-navy font-bold text-[22px] mt-1">{kicker === 'NEW TRAINING' ? 'Create a module' : 'Module details'}</p>
      <p className="text-slate2 text-sm mt-1">Add a title and questions{kicker === 'NEW TRAINING' ? ', then assign it to employees or departments.' : '.'} Every module can mix multiple-choice and type-your-own practice.</p>

      <div className="grid grid-cols-[1fr_160px_160px] gap-4 mt-5">
        <div>
          <p className="text-slate2 font-semibold text-xs">MODULE TITLE</p>
          <input
            value={draft.title}
            onChange={e => setDraft(d => ({ ...d, title: e.target.value }))}
            placeholder="e.g. AI Tools at Work: Staying Compliant & Safe"
            className="w-full border border-[#98a2b3] rounded-[10px] h-12 px-3.5 mt-2 text-sm text-ink outline-none focus:border-navy bg-[#eef2ff]"
          />
        </div>
        <div>
          <p className="text-slate2 font-semibold text-xs">SAFETY POINTS</p>
          <input
            value={draft.points}
            onChange={e => setDraft(d => ({ ...d, points: e.target.value }))}
            placeholder="150"
            className="w-full border border-[#98a2b3] rounded-[10px] h-12 px-3.5 mt-2 text-sm text-ink outline-none focus:border-navy bg-[#eef2ff]"
          />
        </div>
        <div>
          <p className="text-slate2 font-semibold text-xs">EST. TIME (MIN)</p>
          <input
            value={draft.minutes}
            onChange={e => setDraft(d => ({ ...d, minutes: e.target.value }))}
            placeholder="6"
            className="w-full border border-[#98a2b3] rounded-[10px] h-12 px-3.5 mt-2 text-sm text-ink outline-none focus:border-navy bg-[#eef2ff]"
          />
        </div>
      </div>

      <p className="text-slate2 font-semibold text-xs mt-6">QUESTIONS ({draft.questions.length})</p>
      <div className="flex flex-col gap-2.5 mt-2">
        {draft.questions.map((q, i) => (
          <div key={i} className="bg-chip rounded-[10px] px-4 h-12 flex items-center gap-3">
            <span className="text-slate2 text-sm font-semibold w-4">{i + 1}</span>
            <p className="text-ink text-sm flex-1 truncate">{q.question}</p>
            <span className={`text-[11px] font-semibold rounded-full px-2.5 py-1 ${q.type === 'mcq' ? 'bg-[#eef2ff] text-[#365fd9]' : 'bg-green-soft text-green'}`}>
              {q.type === 'mcq' ? 'MCQ' : 'PRACTICE'}
            </span>
            <button
              onClick={() => setDraft(d => ({ ...d, questions: d.questions.filter((_, idx) => idx !== i) }))}
              className="text-slate2 hover:text-[#d92d20] cursor-pointer px-1"
            >
              ✕
            </button>
          </div>
        ))}
        <button
          onClick={onOpenQuestion}
          className="border-2 border-dashed border-[#365fd9] rounded-[10px] h-12 flex items-center justify-center text-[#365fd9] font-semibold text-sm cursor-pointer hover:bg-[#eef2ff]"
        >
          + Add question
        </button>
      </div>

      <div className="h-px bg-[#e5e5ea] my-6" />
      <div className="flex gap-3">
        <button onClick={onCreate} disabled={!draft.title.trim() || draft.questions.length === 0} className="bg-gold hover:bg-gold-dark text-navy font-semibold text-sm px-8 h-12 rounded-full cursor-pointer disabled:opacity-50">
          Create module →
        </button>
        <button onClick={onSecondary} className="border border-navy text-navy font-semibold text-sm px-8 h-12 rounded-full cursor-pointer hover:bg-chip">
          {secondaryLabel}
        </button>
      </div>
    </div>
  )
}
