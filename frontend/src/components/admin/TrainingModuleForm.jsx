// Shared pieces of the Training module-authoring flow — matches Figma
// "18C Admin • Create module", "Overlay / Add question", "Overlay / Assign
// Training" and "Modal / Module created". Used by the Create-module card, the
// dedicated question editor and every Assign entry point.
import { useState } from 'react'
import { DEPARTMENTS, EMPLOYEES, departmentName, employeesInDepartment } from '../../lib/employees.js'
import { assignModule, assignedEmployeeIds, trainingIssue } from '../../lib/trainingStore.js'

// The ceiling a module's question set cannot cross. The server enforces the
// same number (MAX_QUESTIONS in backend/src/training.js) — this copy is what
// lets the screen say so before the admin has typed a 41st question.
export const MAX_QUESTIONS = 40

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

const BLANK_ANSWERS = ['', '', '', '']

/**
 * Add-a-question and edit-a-question are the same overlay.
 *
 * `initial` switches it into edit mode: the fields open on the saved question,
 * Delete appears, and the heading says which question is being changed. Keeping
 * one component means an edited question can never end up in a different shape
 * from a newly added one.
 */
export function QuestionModal({ initial, index, total, onCancel, onSave, onDelete }) {
  const editing = Boolean(initial)
  const [type, setType] = useState(initial?.type || 'mcq')
  const [question, setQuestion] = useState(initial?.question || '')
  const [answers, setAnswers] = useState(() => {
    const saved = initial?.answers?.length ? initial.answers : []
    return [...saved, ...BLANK_ANSWERS].slice(0, Math.max(4, saved.length))
  })
  const [correct, setCorrect] = useState(initial?.correct ?? 0)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  function setAnswer(i, v) {
    setError('')
    setAnswers(a => a.map((x, idx) => (idx === i ? v : x)))
  }

  function save() {
    const text = question.trim()
    if (!text) return setError('Write the question before saving it.')
    const filled = answers.map(a => a.trim()).filter(Boolean)
    if (type === 'mcq' && filled.length < 2) {
      return setError('A multiple-choice question needs at least two answers.')
    }
    if (type === 'mcq' && !answers[correct]?.trim()) {
      return setError('Tick which answer is the correct one — the option you ticked is empty.')
    }
    // The tick sits on a row index; dropping the empty rows would move it, so
    // the correct answer is re-found by value rather than by position.
    const correctText = answers[correct]?.trim()
    onSave({
      type,
      question: text,
      answers: type === 'mcq' ? filled : [],
      correct: type === 'mcq' ? Math.max(0, filled.indexOf(correctText)) : null,
    })
  }

  return (
    <div className="fixed inset-0 bg-navy-dark/50 flex items-center justify-center p-4 sm:p-6 z-50" onClick={onCancel}>
      <div className="bg-[#fffefa] border-[1.5px] border-[#0a204f] rounded-[20px] shadow-[0px_10px_30px_0px_rgba(0,0,0,0.22)] w-full max-w-[620px] p-5 sm:p-[30px] max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <p className="text-[#d9b32c] font-semibold text-[11px]">{editing ? 'EDIT A QUESTION' : 'ADD A QUESTION'}</p>
        <p className="text-[#0a204f] font-bold text-[24px] mt-1">
          {editing ? `Question ${index + 1} of ${total}` : 'New question'}
        </p>

        <p className="text-[#8a7d56] font-semibold text-[11px] mt-6">QUESTION TYPE</p>
        <div className="flex flex-wrap gap-3 mt-2.5">
          <button
            onClick={() => { setError(''); setType('mcq') }}
            className={`w-full sm:w-[180px] h-10 rounded-full text-[13px] font-semibold cursor-pointer ${type === 'mcq' ? 'bg-[#3b6be5] text-white' : 'bg-white border border-[#ccccd1] text-[#667085]'}`}
          >
            Multiple choice
          </button>
          <button
            onClick={() => { setError(''); setType('practice') }}
            className={`w-full sm:w-[180px] h-10 rounded-full text-[13px] font-semibold cursor-pointer ${type === 'practice' ? 'bg-[#3b6be5] text-white' : 'bg-white border border-[#ccccd1] text-[#667085]'}`}
          >
            Type-your-own
          </button>
        </div>

        <p className="text-[#8a7d56] font-semibold text-[11px] mt-6">QUESTION</p>
        <input
          value={question}
          onChange={e => { setError(''); setQuestion(e.target.value) }}
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
                    onClick={() => { setError(''); setCorrect(i) }}
                    className={`w-[18px] h-[18px] rounded-full border-2 shrink-0 cursor-pointer flex items-center justify-center ${correct === i ? 'bg-[#328768] border-[#328768] text-white text-[10px]' : 'border-[#ccccd1]'}`}
                    aria-label={`Mark answer ${i + 1} as correct`}
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
            {answers.length < 6 && (
              <button
                onClick={() => setAnswers(a => [...a, ''])}
                className="text-[#365fd9] font-semibold text-[12.5px] mt-2.5 cursor-pointer"
              >
                + Add another answer
              </button>
            )}
          </>
        )}

        {type === 'practice' && (
          <p className="text-[#667085] text-[12.5px] mt-4 bg-[#edf2ff] rounded-[10px] px-3.5 py-3">
            Type-your-own questions have no answer options. The employee writes their own safe prompt and it is checked
            the way the Smart Gateway checks a real one.
          </p>
        )}

        {error && <p className="text-[#d92d20] text-[13px] font-medium mt-4">{error}</p>}

        <div className="flex flex-wrap justify-end gap-3 mt-7">
          {editing && (
            <button
              onClick={() => (confirmDelete ? onDelete() : setConfirmDelete(true))}
              className={`font-semibold text-sm px-6 h-12 rounded-full cursor-pointer mr-auto ${
                confirmDelete ? 'bg-[#d92d20] text-white hover:bg-[#b8241a]' : 'border-[1.5px] border-[#d92d20] text-[#d92d20] hover:bg-[#fff0f0]'
              }`}
            >
              {confirmDelete ? 'Delete for good' : 'Delete question'}
            </button>
          )}
          <button onClick={onCancel} className="border-[1.5px] border-[#0a204f] text-[#0a204f] font-semibold text-sm px-7 h-12 rounded-full cursor-pointer hover:bg-chip">
            Cancel
          </button>
          <button onClick={save} className="bg-[#d9b32c] hover:bg-gold-dark text-[#0a204f] font-semibold text-sm px-9 h-12 rounded-full cursor-pointer">
            {editing ? 'Save changes →' : 'Save question →'}
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
// that creates an assignment record, and the server it posts to refuses to
// assign an employee who already has the training — so a double-click, a retry
// or a re-opened wizard cannot produce a second record or a second notification.
export function AssignModal({ training, presetEmployee, onCancel, onAssigned }) {
  const issue = trainingIssue(training)

  // Arriving from a risk alert, the employee it concerns is already known — the
  // wizard opens on them rather than making the admin find them again.
  const preset = presetEmployee && EMPLOYEES.some(e => e.id === presetEmployee) ? presetEmployee : null
  const [step, setStep] = useState(preset ? 'target' : 'type') // 'type' | 'target' | 'confirm'
  const [type, setType] = useState(preset ? 'employee' : null) // 'employee' | 'department'
  const [employeeIds, setEmployeeIds] = useState(preset ? [preset] : [])
  const [department, setDepartment] = useState(null)
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const deptEmployees = department ? employeesInDepartment(department) : []
  // Everyone who already has this training — flagged in the picker so the admin
  // sees it before selecting, not only on the confirmation step.
  const already = issue ? new Set() : assignedEmployeeIds(training.id)
  const targeted = type === 'department' ? deptEmployees.map(e => e.id) : employeeIds
  const duplicates = targeted.filter(id => already.has(id))
  const fresh = targeted.filter(id => !already.has(id))

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

  async function confirm() {
    if (issue || saving) return setError(issue || '')
    setSaving(true)
    const result = await assignModule({ moduleId: training.id, type, department, employeeIds })
    setSaving(false)
    if (!result.ok) return setError(result.error)
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
              Assigning &ldquo;{training.title}&rdquo;. Employees see it in their training list once assigned.
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
                  <span className="text-navy text-[13px] font-semibold text-right">{training.title}</span>
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
                  disabled={nothingNew || saving}
                  className={`font-semibold text-sm flex-1 h-12 rounded-full ${nothingNew || saving ? 'bg-chip text-slate2 border border-sand cursor-not-allowed' : 'bg-gold hover:bg-gold-dark text-navy cursor-pointer'}`}
                >
                  {saving ? 'Assigning…' : 'Confirm Assignment  →'}
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
          {questions} question{questions === 1 ? '' : 's'} · {points} points · {minutes} min. It has been added to your module library and can now be assigned to employees or departments.
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

/**
 * The question list an admin works through — shared by the create-module card
 * and the dedicated question editor, so adding a question to a new module and
 * editing one on a saved module are the same interaction.
 *
 * `onEdit` is optional: the create card only appends, the editor also opens a
 * question. The 40-question ceiling is stated on the row rather than only when
 * the button is pressed, so the limit is visible before it is reached.
 */
export function QuestionList({ questions, onAdd, onEdit, onRemove }) {
  const full = questions.length >= MAX_QUESTIONS
  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-slate2 font-semibold text-xs">QUESTIONS ({questions.length} OF {MAX_QUESTIONS})</p>
        {full && <p className="text-[#d97706] font-semibold text-[11.5px]">Limit reached — you can still edit or delete questions.</p>}
      </div>
      <div className="flex flex-col gap-2.5 mt-2">
        {questions.map((q, i) => {
          const Row = onEdit ? 'button' : 'div'
          return (
            <Row
              key={i}
              {...(onEdit ? { onClick: () => onEdit(i), type: 'button' } : {})}
              className={`bg-chip rounded-[10px] px-4 py-2.5 flex items-center gap-3 w-full text-left ${onEdit ? 'cursor-pointer hover:bg-[#e6e6ee]' : ''}`}
            >
              <span className="text-slate2 text-sm font-semibold w-5 shrink-0">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <p className="text-ink text-sm truncate">{q.question}</p>
                {/* The saved answer, shown with the question — the list is meant
                    to be readable without opening every row. */}
                <p className="text-slate2 text-[11.5px] truncate mt-0.5">
                  {q.type === 'mcq'
                    ? `Answer: ${q.answers[q.correct] ?? '—'} · ${q.answers.length} options`
                    : 'Employee writes their own safe prompt'}
                </p>
              </div>
              <span className={`text-[11px] font-semibold rounded-full px-2.5 py-1 shrink-0 ${q.type === 'mcq' ? 'bg-[#eef2ff] text-[#365fd9]' : 'bg-green-soft text-green'}`}>
                {q.type === 'mcq' ? 'MCQ' : 'PRACTICE'}
              </span>
              {onEdit && <span className="text-[#365fd9] font-semibold text-[12px] shrink-0">Edit</span>}
              {onRemove && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={e => { e.stopPropagation(); onRemove(i) }}
                  onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); onRemove(i) } }}
                  className="text-slate2 hover:text-[#d92d20] cursor-pointer px-1 shrink-0"
                  aria-label={`Remove question ${i + 1}`}
                >
                  ✕
                </span>
              )}
            </Row>
          )
        })}
        <button
          onClick={onAdd}
          disabled={full}
          title={full ? `A module can hold at most ${MAX_QUESTIONS} questions.` : undefined}
          className={`border-2 border-dashed rounded-[10px] h-12 flex items-center justify-center font-semibold text-sm ${
            full
              ? 'border-[#d8d0b4] text-slate2 cursor-not-allowed'
              : 'border-[#365fd9] text-[#365fd9] cursor-pointer hover:bg-[#eef2ff]'
          }`}
        >
          {full ? `Maximum ${MAX_QUESTIONS} questions reached` : '+ Add question'}
        </button>
      </div>
    </>
  )
}

// Matches Figma "Create module card" — used standalone (18C) and under
// "New Training" on Assign Training.
export function CreateModuleCard({ kicker, draft, setDraft, onOpenQuestion, onEditQuestion, onCreate, secondaryLabel, onSecondary, error, saving }) {
  return (
    <div className="bg-white border border-[#d8d0b4] rounded-[16px] p-5 sm:p-7 mt-5">
      <p className="text-gold font-semibold text-[11px] tracking-wide">{kicker}</p>
      <p className="text-navy font-bold text-[22px] mt-1">{kicker === 'NEW TRAINING' ? 'Create a module' : 'Module details'}</p>
      <p className="text-slate2 text-sm mt-1">Add a title and questions{kicker === 'NEW TRAINING' ? ', then assign it to employees or departments.' : '.'} Every module can mix multiple-choice and type-your-own practice, up to {MAX_QUESTIONS} questions.</p>

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
          <p className="text-slate2 font-semibold text-xs">POINTS VALUE</p>
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

      <div className="mt-6">
        {/* A question added here is editable straight away — the same overlay
            reopens on it, so a typo does not mean deleting and retyping. */}
        <QuestionList
          questions={draft.questions}
          onAdd={onOpenQuestion}
          onEdit={onEditQuestion}
          onRemove={i => setDraft(d => ({ ...d, questions: d.questions.filter((_, idx) => idx !== i) }))}
        />
      </div>

      {error && <p className="text-[#d92d20] text-[13px] font-medium mt-4">{error}</p>}

      <div className="h-px bg-[#e5e5ea] my-6" />
      <div className="flex flex-wrap gap-3">
        <button
          onClick={onCreate}
          disabled={!draft.title.trim() || draft.questions.length === 0 || saving}
          className="bg-gold hover:bg-gold-dark text-navy font-semibold text-sm px-8 h-12 rounded-full cursor-pointer disabled:opacity-50"
        >
          {saving ? 'Creating…' : 'Create module →'}
        </button>
        <button onClick={onSecondary} className="border border-navy text-navy font-semibold text-sm px-8 h-12 rounded-full cursor-pointer hover:bg-chip">
          {secondaryLabel}
        </button>
      </div>
    </div>
  )
}
