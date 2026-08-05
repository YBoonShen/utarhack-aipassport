// Admin · Assign Training — matches Figma frame "18B Admin • Training •
// Module created". Reached from Risk Alerts' "Assign training" action and from
// Training modules' "+ Create module".
//
// The page opens on a choice rather than on a form: assign one of the trainings
// that already exist, or create a new one. The create-module card is only
// mounted once "New Training" is chosen, so the default path — assigning
// something that exists — is not buried under a form for something that does
// not. There is still exactly one create form in the app; this is where it
// lives.
//
// Assign flow: select training → select type (employee / department) →
// select target → confirmation → confirm. The wizard lives in AssignModal.
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { emptyDraft, seedDraft, QuestionModal, AssignModal, ModuleCreatedModal, CreateModuleCard, InfoToast, MAX_QUESTIONS } from '../../components/admin/TrainingModuleForm.jsx'
import { assignmentSummary, createModule } from '../../lib/trainingStore.js'
import { useTrainingLibrary } from '../../lib/useTraining.js'
import { departmentName } from '../../lib/employees.js'
import { useToast } from '../../components/Toast.jsx'

// One heading component for both sections, so "Existing trainings" and "New
// Training" differ only in the colour of their accent — never in size, weight
// or spacing.
function SectionHeading({ accent, title, subtitle }) {
  return (
    <div className="mt-8">
      <div className="flex items-center gap-3">
        <span className={`w-1.5 h-7 rounded-full shrink-0 ${accent}`} />
        <h2 className="text-[22px] font-bold text-[#17213a]">{title}</h2>
      </div>
      <p className="text-[#667085] text-sm mt-1.5 pl-4.5">{subtitle}</p>
    </div>
  )
}

export default function AssignTraining() {
  const { modules, assignments, loaded } = useTrainingLibrary()
  // 'choose' → the two entry points; 'existing' → the library; 'new' → the form.
  // "+ Create module" on Training modules arrives with ?mode=new, so it lands on
  // the create form with Option 2 already active rather than on a choice the
  // admin has plainly made by pressing that button.
  const [params] = useSearchParams()
  const [mode, setMode] = useState(() => (params.get('mode') === 'new' ? 'new' : params.get('mode') === 'existing' ? 'existing' : 'choose'))
  // Set when a risk alert sent the admin here to assign a refresher: the
  // assignment wizard opens on that employee instead of on an empty picker.
  const presetEmployee = params.get('employee')
  const [draft, setDraft] = useState(seedDraft)
  // null = closed, 'new' = adding, a number = editing that question.
  const [questionModal, setQuestionModal] = useState(null)
  const [assignTarget, setAssignTarget] = useState(null) // training being assigned
  const [selectedId, setSelectedId] = useState(null) // the card that stays highlighted
  const [created, setCreated] = useState(null)
  const [toastInfo, setToastInfo] = useState(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const toast = useToast()

  // Add and edit are the same save: a question written here can be reopened and
  // corrected before the module is created, exactly as it can afterwards.
  function saveQuestion(q) {
    setDraft(d => ({
      ...d,
      questions: questionModal === 'new'
        ? [...d.questions, q]
        : d.questions.map((old, i) => (i === questionModal ? q : old)),
    }))
    setQuestionModal(null)
  }

  function deleteQuestion() {
    setDraft(d => ({ ...d, questions: d.questions.filter((_, i) => i !== questionModal) }))
    setQuestionModal(null)
  }

  // The new module joins the shared library on the server, so it carries a real
  // id from here on: it appears on Training modules, it can be assigned, and the
  // assignment record points at that id rather than at a title that could change.
  async function create() {
    setError('')
    setSaving(true)
    const result = await createModule({
      title: draft.title,
      points: Number(draft.points) || 0,
      minutes: Number(draft.minutes) || 0,
      questions: draft.questions,
    })
    setSaving(false)
    if (!result.ok) return setError(result.error)
    setDraft(emptyDraft)
    setCreated(result.module)
  }

  // The wizard has already written the assignment record and notified the
  // employees by this point.
  function assigned(result) {
    setAssignTarget(null)
    setToastInfo({
      kicker: 'TRAINING ASSIGNED',
      title: `Assigned to ${result.assigned} employee${result.assigned === 1 ? '' : 's'}`,
      body: assignmentSummary(result),
    })
  }

  function openAssign(t) {
    if (t.status !== 'live') return toast(`"${t.title}" is a draft — publish it on Training modules before assigning.`)
    if (!t.questionCount) return toast(`"${t.title}" has no questions yet — add questions before assigning it.`)
    setSelectedId(t.id)
    setAssignTarget(t)
  }

  return (
    <div>
      <h1 className="text-[28px] font-bold text-[#17213a]">Assign Training</h1>
      <p className="text-[#667085] text-sm mt-1.5">
        Pick an existing module or create one, then choose the employees or department that should receive it.
      </p>
      {presetEmployee && (
        <div className="bg-[#eef2ff] border border-[#c7d4f5] rounded-[12px] px-4 py-3 mt-4">
          <p className="text-[#365fd9] font-semibold text-[11px]">FROM A RISK ALERT</p>
          <p className="text-[#17213a] text-[13px] mt-1">
            Pick the refresher for <span className="font-semibold">{presetEmployee}</span>. The assignment wizard opens
            on them, so you only have to choose the training.
          </p>
        </div>
      )}

      {/* The two entry points. Nothing else is rendered until one is picked, so
          the create form is never in the way of an ordinary assignment.
          Each option owns a colour and keeps it all the way down the page —
          blue for "assign something that exists", gold for "write something
          new" — so it is obvious at a glance which of the two you are in. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <button
          onClick={() => { setMode('existing'); setError('') }}
          className={`text-left rounded-[14px] px-5 py-5 cursor-pointer border-[1.5px] border-l-[6px] transition-colors ${
            mode === 'existing'
              ? 'bg-[#eef2ff] border-[#365fd9] border-l-[#365fd9]'
              : 'bg-white border-[#d8d0b4] border-l-[#365fd9] hover:bg-[#f7f9ff]'
          }`}
        >
          <p className="text-[#365fd9] font-semibold text-[11px] tracking-wide">OPTION 1 · EXISTING</p>
          <p className="font-bold text-[22px] mt-2 text-[#17213a]">Select from existing trainings</p>
          <p className="text-[12.5px] mt-1.5 text-[#667085]">
            {modules.length} module{modules.length === 1 ? '' : 's'} in the library. Assign one to employees or a department.
          </p>
        </button>
        <button
          onClick={() => { setMode('new'); setError('') }}
          className={`text-left rounded-[14px] px-5 py-5 cursor-pointer border-[1.5px] border-l-[6px] transition-colors ${
            mode === 'new'
              ? 'bg-[#fffcef] border-gold-brand border-l-gold-brand'
              : 'bg-white border-[#d8d0b4] border-l-gold-brand hover:bg-[#fffdf6]'
          }`}
        >
          <p className="text-[#8a6410] font-semibold text-[11px] tracking-wide">OPTION 2 · CREATE</p>
          <p className="font-bold text-[22px] mt-2 text-[#17213a]">New Training</p>
          <p className="text-[12.5px] mt-1.5 text-[#667085]">
            Write a module from scratch — title, points value and up to {MAX_QUESTIONS} questions.
          </p>
        </button>
      </div>

      {mode === 'choose' && (
        <p className="text-[#667085] text-sm mt-6">Pick one of the two options above to continue.</p>
      )}

      {/* Option 1 — the existing library */}
      {mode === 'existing' && (
        <>
          <SectionHeading accent="bg-[#365fd9]" title="Existing trainings" subtitle="Select a training to choose who receives it." />
          {!loaded && modules.length === 0 && <p className="text-[#667085] text-sm mt-5">Loading the training library…</p>}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-5">
            {modules.map(t => {
              const assignable = t.status === 'live' && t.questionCount > 0
              // The training currently being assigned. It stays highlighted
              // after the wizard closes, so it is never ambiguous which of the
              // cards the confirmation on screen belongs to.
              const selected = selectedId === t.id
              return (
                <button
                  key={t.id}
                  onClick={() => openAssign(t)}
                  aria-pressed={selected}
                  className={`text-left rounded-[14px] px-4 py-4 flex items-center justify-between cursor-pointer border border-l-[5px] transition-colors ${
                    selected
                      ? 'bg-navy-header border-navy-header border-l-gold-brand shadow-[0px_8px_20px_rgba(9,30,71,0.25)]'
                      : assignable
                        ? 'bg-white border-[#d8d0b4] border-l-[#365fd9] hover:border-navy-header hover:border-l-[#365fd9]'
                        : 'bg-[#f7f7fa] border-[#e0e0e5] border-l-[#ccccd1]'
                  }`}
                >
                  <div className="min-w-0">
                    {/* Selection is a colour change only — the same label, in
                        the same place, so nothing on the card moves when it is
                        picked. */}
                    <p className={`font-semibold text-[11px] ${selected ? 'text-gold-brand' : assignable ? 'text-[#365fd9]' : 'text-[#98a2b3]'}`}>
                      {assignable ? 'READY TO ASSIGN' : t.questionCount === 0 ? 'DRAFT · NO QUESTIONS YET' : 'DRAFT · NOT PUBLISHED'}
                    </p>
                    <p className={`font-bold text-[22px] mt-1.5 ${selected ? 'text-white' : assignable ? 'text-[#17213a]' : 'text-[#667085]'}`}>{t.title}</p>
                    <p className={`text-[11px] font-medium mt-1.5 ${selected ? 'text-[#cbd5e1]' : assignable ? 'text-[#078b6c]' : 'text-[#98a2b3]'}`}>
                      {t.questionCount} question{t.questionCount === 1 ? '' : 's'} · {t.minutes} minutes · {t.points} safety points
                    </p>
                  </div>
                  <span className={`text-2xl shrink-0 ${selected ? 'text-gold-brand' : assignable ? 'text-[#365fd9]' : 'text-[#98a2b3]'}`}>›</span>
                </button>
              )
            })}
          </div>
        </>
      )}

      {/* Option 2 — the one create-module form in the app */}
      {mode === 'new' && (
        <>
          <SectionHeading accent="bg-gold-brand" title="New Training" subtitle="Create new training, then assign it from the list above." />

          <CreateModuleCard
            kicker="NEW TRAINING"
            draft={draft}
            setDraft={setDraft}
            onOpenQuestion={() => setQuestionModal('new')}
            onEditQuestion={i => setQuestionModal(i)}
            onCreate={create}
            secondaryLabel="Clear"
            onSecondary={() => { setDraft(emptyDraft); setError('') }}
            error={error}
            saving={saving}
          />
        </>
      )}

      {assignments.length > 0 && (
        <>
          <h2 className="text-[22px] font-bold text-[#17213a] mt-8">Recent assignments</h2>
          <div className="flex flex-col gap-2 mt-3">
            {assignments.slice(0, 5).map(a => (
              <div key={a.id} className="bg-white border border-[#e0e0e5] rounded-[12px] px-5 py-3 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-navy font-semibold text-sm">{a.moduleTitle}</p>
                  <p className="text-slate2 text-xs mt-0.5">
                    {a.type === 'department' ? `${departmentName(a.department)} department` : 'Selected employees'} · {a.employeeIds.join(', ')}
                  </p>
                </div>
                <span className="bg-[#e7f4ee] text-[#328768] text-[11px] font-semibold rounded-full px-3 py-1.5 shrink-0">
                  {a.employeeIds.length} assigned
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {questionModal !== null && (
        <QuestionModal
          initial={questionModal === 'new' ? null : draft.questions[questionModal]}
          index={questionModal === 'new' ? draft.questions.length : questionModal}
          total={questionModal === 'new' ? draft.questions.length + 1 : draft.questions.length}
          onCancel={() => setQuestionModal(null)}
          onSave={saveQuestion}
          onDelete={questionModal === 'new' ? undefined : deleteQuestion}
        />
      )}
      {assignTarget && (
        <AssignModal
          training={assignTarget}
          presetEmployee={presetEmployee}
          onCancel={() => setAssignTarget(null)}
          onAssigned={assigned}
        />
      )}
      {created && (
        <ModuleCreatedModal
          moduleTitle={created.title}
          questions={created.questionCount}
          points={created.points}
          minutes={created.minutes}
          onAssign={() => { setAssignTarget(created); setCreated(null) }}
          onDone={() => { setCreated(null); setMode('existing') }}
        />
      )}
      {toastInfo && <InfoToast {...toastInfo} onClose={() => setToastInfo(null)} />}
    </div>
  )
}
