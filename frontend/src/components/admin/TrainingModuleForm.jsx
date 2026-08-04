// Shared pieces of the Training module-authoring flow — matches Figma
// "18C Admin • Create module", "Overlay / Add question", "Overlay / Assign
// Training" and "Modal / Module created". Used by both the standalone
// Create-module page and the embedded "New Training" card on Assign Training.
import { useState } from 'react'
import { DEPARTMENTS, EMPLOYEES, departmentName, employeesInDepartment } from '../../lib/employees.js'
import { addAssignment, assignedEmployeeIds, resolveRecipients } from '../../lib/assignments.js'
import { trainingIssue } from '../../lib/trainingLibrary.js'

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
    <div className="fixed inset-0 bg-navy-dark/50 flex items-center justify-center p-4 sm:p-6 z-50" onClick={onCancel}>
      <div className="bg-[#fffefa] border-[1.5px] border-[#0a204f] rounded-[20px] shadow-[0px_10px_30px_0px_rgba(0,0,0,0.22)] w-full max-w-[620px] p-5 sm:p-[30px] max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <p className="text-[#d9b32c] font-semibold text-[11px]">ADD A QUESTION</p>
        <p className="text-[#0a204f] font-bold text-[24px] mt-1">New question</p>

        <p className="text-[#8a7d56] font-semibold text-[11px] mt-6">QUESTION TYPE</p>
        <div className="flex flex-wrap gap-3 mt-2.5">
          <button
            onClick={() => setType('mcq')}
            className={`w-full sm:w-[180px] h-10 rounded-full text-[13px] font-semibold cursor-pointer ${type === 'mcq' ? 'bg-[#3b6be5] text-white' : 'bg-white border border-[#ccccd1] text-[#667085]'}`}
          >
            Multiple choice
          </button>
          <button
            onClick={() => setType('practice')}
            className={`w-full sm:w-[180px] h-10 rounded-full text-[13px] font-semibold cursor-pointer ${type === 'practice' ? 'bg-[#3b6be5] text-white' : 'bg-white border border-[#ccccd1] text-[#667085]'}`}
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

        <div className="flex flex-wrap justify-end gap-3 mt-7">
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

// Rows shared by the employee picker and the department picker.
function PickerRow({ selected, multi, disabled, title, meta, tag, onClick }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full text-left rounded-[12px] border-[1.5px] px-3.5 py-2.5 flex items-center gap-3 ${
        disabled ? 'border-[#e5e5ea] bg-[#f7f7fa] cursor-not-allowed' : selected ? 'bg-[#eef2ff] border-[#365fd9] cursor-pointer' : 'border-[#d8d0b4] cursor-pointer hover:border-navy'
      }`}
    >
      <span
        className={`w-4 h-4 shrink-0 border-2 flex items-center justify-center text-white text-[9px] font-bold ${multi ? 'rounded-[4px]' : 'rounded-full'} ${
          selected ? 'border-[#365fd9] bg-[#365fd9]' : 'border-[#98a2b3]'
        }`}
      >
        {selected && multi ? '✓' : ''}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-navy font-semibold text-sm">{title}</p>
        <p className="text-slate2 text-xs mt-0.5">{meta}</p>
      </div>
      {tag && <span className="shrink-0 text-[10px] font-semibold rounded-full px-2.5 py-1 bg-[#ededf2] text-slate2">{tag}</span>}
    </button>
  )
}

// Assign Training wizard — Select type → Select target → Confirmation → Confirm.
// Cancelling or closing at any step writes nothing. Confirm is the only place
// that creates an assignment record, and it never assigns an employee twice.
export function AssignModal({ training, moduleTitle, onCancel, onAssigned }) {
  // Call sites pass either a library/created training record or just a title.
  const subject = training || (moduleTitle ? { title: moduleTitle, questions: 1 } : null)
  const issue = trainingIssue(subject)

  const [step, setStep] = useState('type') // 'type' | 'target' | 'confirm'
  const [type, setType] = useState(null) // 'employee' | 'department'
  const [employeeIds, setEmployeeIds] = useState([])
  const [department, setDepartment] = useState(null)
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')

  const deptEmployees = department ? employeesInDepartment(department) : []
  const { targeted, duplicates, fresh } = issue
    ? { targeted: [], duplicates: [], fresh: [] }
    : resolveRecipients({ training: subject, type, department, employeeIds })
  // Everyone who already has this training — flagged in the picker so the admin
  // sees it before selecting, not only on the confirmation step.
  const already = issue ? new Set() : assignedEmployeeIds(subject)

  const stepNo = { type: 1, target: 2, confirm: 3 }[step]
  const heading = {
    type: 'Who should get this training?',
    target: type === 'department' ? 'Select a department' : 'Select employees',
    confirm: 'Confirm this assignment',
  }[step]

  function toggleEmployee(id) {
    setError('')
    setEmployeeIds(ids => (ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]))
  }

  function chooseType(next) {
    setError('')
    setType(next)
    // Switching type clears the other type's selection so the confirmation can
    // never show recipients the admin didn't pick for the type they chose.
    if (next === 'employee') setDepartment(null)
    else setEmployeeIds([])
  }

  function toTarget() {
    if (!type) return setError('Choose whether this training goes to employees or to a department.')
    setError('')
    setStep('target')
  }

  function toConfirm() {
    if (type === 'employee' && employeeIds.length === 0) return setError('Select at least one employee.')
    if (type === 'department' && !department) return setError('Select a department.')
    if (type === 'department' && deptEmployees.length === 0) {
      return setError(`${departmentName(department)} has no employees, so there is nobody to assign this training to.`)
    }
    setError('')
    setStep('confirm')
  }

  function confirm() {
    if (issue) return setError(issue)
    if (fresh.length === 0) {
      return setError(targeted.length
        ? 'Everyone selected already has this training — nothing new to assign.'
        : 'Select at least one recipient.')
    }
    const result = addAssignment({ training: subject, type, department, employeeIds })
    if (!result) return setError('Nothing new to assign — these employees already have this training.')
    onAssigned(result)
  }

  const term = search.trim().toLowerCase()
  const filtered = term
    ? EMPLOYEES.filter(e => `${e.id} ${e.dept} ${departmentName(e.dept)}`.toLowerCase().includes(term))
    : EMPLOYEES
  const allShownSelected = filtered.length > 0 && filtered.every(e => employeeIds.includes(e.id))
  const nothingNew = step === 'confirm' && fresh.length === 0

  return (
    <div className="fixed inset-0 bg-navy-dark/50 flex items-center justify-center p-4 sm:p-6 z-50" onClick={onCancel}>
      <div className="bg-card border border-navy rounded-[20px] w-full max-w-[560px] p-5 sm:p-7 sm:pt-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {issue ? (
          <>
            <p className="text-[#d92d20] font-semibold text-[13px]">CANNOT ASSIGN</p>
            <p className="text-navy font-bold text-[24px] mt-1">This training isn&rsquo;t ready</p>
            <p className="text-ink text-sm mt-2.5">{issue}</p>
            <button onClick={onCancel} className="border border-navy text-navy font-semibold text-sm px-8 h-12 rounded-full cursor-pointer hover:bg-chip mt-7">
              Close
            </button>
          </>
        ) : (
          <>
            <p className="text-gold font-semibold text-[13px]">ASSIGN TRAINING · STEP {stepNo} OF 3</p>
            <p className="text-navy font-bold text-[22px] sm:text-[26px] mt-1">{heading}</p>
            <p className="text-ink text-sm mt-2.5">
              Assigning &ldquo;{subject.title}&rdquo;. Employees see it in their training list once assigned.
            </p>

            {/* Step 1 — assignment type */}
            {step === 'type' && (
              <div className="flex flex-col gap-2.5 mt-5">
                <PickerRow
                  selected={type === 'employee'}
                  title="Employee"
                  meta="Pick one or more specific employees."
                  onClick={() => chooseType('employee')}
                />
                <PickerRow
                  selected={type === 'department'}
                  title="Department"
                  meta="Pick a department — everyone in it is assigned automatically."
                  onClick={() => chooseType('department')}
                />
              </div>
            )}

            {/* Step 2a — employees */}
            {step === 'target' && type === 'employee' && (
              <>
                <div className="flex items-center gap-2.5 mt-5">
                  <div className="bg-[#fffcef] border border-sand rounded-[9px] h-10 flex-1 flex items-center px-2.5 gap-2">
                    <span className="text-slate2 text-[17px]">⌕</span>
                    <input
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder="Search employee ID or department"
                      className="flex-1 bg-transparent outline-none text-xs text-ink placeholder-slate2"
                    />
                    {search && <button onClick={() => setSearch('')} className="text-slate2 text-sm cursor-pointer px-1">×</button>}
                  </div>
                  {/* Acts on what the search currently shows, without dropping
                      selections made under a different search term. */}
                  <button
                    onClick={() => {
                      setError('')
                      setEmployeeIds(ids => (allShownSelected
                        ? ids.filter(id => !filtered.some(e => e.id === id))
                        : [...new Set([...ids, ...filtered.map(e => e.id)])]))
                    }}
                    className="border border-navy text-navy font-semibold text-xs px-4 h-10 rounded-full cursor-pointer hover:bg-chip shrink-0"
                  >
                    {allShownSelected ? 'Clear all' : 'Select all'}
                  </button>
                </div>

                <div className="flex flex-col gap-2 mt-3 max-h-[300px] overflow-y-auto pr-0.5">
                  {filtered.map(e => (
                    <PickerRow
                      key={e.id}
                      multi
                      selected={employeeIds.includes(e.id)}
                      title={`${e.avatar} · ${e.id}`}
                      meta={`${departmentName(e.dept)} · License ${e.level}`}
                      tag={already.has(e.id) ? 'Already assigned' : null}
                      onClick={() => toggleEmployee(e.id)}
                    />
                  ))}
                  {filtered.length === 0 && <p className="text-slate2 text-sm text-center py-8">No employees match that search.</p>}
                </div>
                <p className="text-slate2 text-xs mt-3">{employeeIds.length} selected</p>
              </>
            )}

            {/* Step 2b — department */}
            {step === 'target' && type === 'department' && (
              <div className="flex flex-col gap-2 mt-5 max-h-[340px] overflow-y-auto pr-0.5">
                {DEPARTMENTS.map(d => {
                  const members = employeesInDepartment(d.code)
                  return (
                    <PickerRow
                      key={d.code}
                      selected={department === d.code}
                      disabled={members.length === 0}
                      title={d.name}
                      meta={members.length === 0 ? 'No employees in this department' : `${members.length} employee${members.length === 1 ? '' : 's'} will be assigned`}
                      tag={members.length === 0 ? 'Empty' : null}
                      onClick={() => { setError(''); setDepartment(d.code) }}
                    />
                  )
                })}
              </div>
            )}

            {/* Step 3 — confirmation */}
            {step === 'confirm' && (
              <div className="bg-[#eef2ff] rounded-[14px] p-4 mt-5">
                <div className="flex justify-between py-2 border-b border-sand">
                  <span className="text-slate2 text-[13px] font-medium">Training</span>
                  <span className="text-navy text-[13px] font-semibold text-right">{subject.title}</span>
                </div>
                {type === 'department' ? (
                  <div className="flex justify-between py-2 border-b border-sand">
                    <span className="text-slate2 text-[13px] font-medium">Department</span>
                    <span className="text-navy text-[13px] font-semibold text-right">{departmentName(department)}</span>
                  </div>
                ) : (
                  <div className="flex justify-between gap-6 py-2 border-b border-sand">
                    <span className="text-slate2 text-[13px] font-medium shrink-0">Employees</span>
                    <span className="text-navy text-[13px] font-semibold text-right">{employeeIds.join(', ')}</span>
                  </div>
                )}
                <div className="flex justify-between py-2">
                  <span className="text-slate2 text-[13px] font-medium">Employees assigned</span>
                  <span className="text-navy text-[13px] font-semibold text-right">{fresh.length}</span>
                </div>
                {duplicates.length > 0 && (
                  <p className="text-slate2 text-xs mt-1.5">
                    {duplicates.length} of the {targeted.length} selected already {duplicates.length === 1 ? 'has' : 'have'} this training and will be skipped — no duplicate records are created.
                  </p>
                )}
                {nothingNew && (
                  <p className="text-[#d92d20] text-xs font-medium mt-1.5">
                    There is nobody new to assign. Go back and pick different recipients.
                  </p>
                )}
              </div>
            )}

            {error && <p className="text-[#d92d20] text-[13px] font-medium mt-4">{error}</p>}

            <div className="flex flex-wrap gap-3 mt-7">
              <button
                onClick={step === 'type' ? onCancel : () => { setError(''); setStep(step === 'confirm' ? 'target' : 'type') }}
                className="border border-navy text-navy font-semibold text-sm px-6 h-12 rounded-full cursor-pointer hover:bg-chip"
              >
                {step === 'type' ? 'Cancel' : step === 'confirm' ? 'Back / Edit' : 'Back'}
              </button>
              {step === 'confirm' ? (
                <button
                  onClick={confirm}
                  disabled={nothingNew}
                  className={`font-semibold text-sm flex-1 h-12 rounded-full ${nothingNew ? 'bg-chip text-slate2 border border-sand cursor-not-allowed' : 'bg-gold hover:bg-gold-dark text-navy cursor-pointer'}`}
                >
                  Confirm Assignment&nbsp;&nbsp;→
                </button>
              ) : (
                <button
                  onClick={step === 'type' ? toTarget : toConfirm}
                  className="bg-gold hover:bg-gold-dark text-navy font-semibold text-sm flex-1 h-12 rounded-full cursor-pointer"
                >
                  Continue&nbsp;&nbsp;→
                </button>
              )}
              {step !== 'type' && (
                <button onClick={onCancel} className="border border-sand text-slate2 font-semibold text-sm px-5 h-12 rounded-full cursor-pointer hover:bg-chip">
                  Cancel
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export function InfoToast({ kicker, title, body, onClose }) {
  return (
    <div className="fixed inset-0 bg-navy-dark/50 flex items-center justify-center p-4 sm:p-6 z-50" onClick={onClose}>
      <div className="bg-card border-2 border-[#078b6c] rounded-[20px] w-full max-w-[480px] p-5 sm:p-7" onClick={e => e.stopPropagation()}>
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
    <div className="fixed inset-0 bg-navy-dark/50 flex items-center justify-center p-4 sm:p-6 z-50" onClick={onDone}>
      <div className="bg-card border border-navy rounded-[20px] w-full max-w-[540px] p-5 sm:p-7" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-[#e9f8f2] border-2 border-[#078b6c] flex items-center justify-center text-[#078b6c] text-2xl shrink-0">✓</div>
          <div>
            <p className="text-[#078b6c] font-bold text-xs tracking-wide">MODULE CREATED</p>
            <p className="text-navy font-bold text-xl mt-0.5">&ldquo;{moduleTitle}&rdquo; is ready</p>
          </div>
        </div>
        <p className="text-ink text-sm mt-4">
          {questions} question{questions === 1 ? '' : 's'} · {points} XP · {minutes} min. It has been added to your module library and can now be assigned to employees or departments.
        </p>
        <div className="flex flex-wrap gap-3 mt-6">
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
    <div className="bg-white border border-[#d8d0b4] rounded-[16px] p-5 sm:p-7 mt-5">
      <p className="text-gold font-semibold text-[11px] tracking-wide">{kicker}</p>
      <p className="text-navy font-bold text-[22px] mt-1">{kicker === 'NEW TRAINING' ? 'Create a module' : 'Module details'}</p>
      <p className="text-slate2 text-sm mt-1">Add a title and questions{kicker === 'NEW TRAINING' ? ', then assign it to employees or departments.' : '.'} Every module can mix multiple-choice and type-your-own practice.</p>

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_160px_160px] gap-4 mt-5">
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
          {/* The module's XP value — an employee earns it once, scaled by their
              best score on this module. */}
          <p className="text-slate2 font-semibold text-xs">XP VALUE</p>
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
      <div className="flex flex-wrap gap-3">
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
