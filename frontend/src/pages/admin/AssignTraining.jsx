// Admin · Assign Training — matches Figma frame "18B Admin • Training •
// Module created" background (layer-named after its overlay, but its actual
// content reads "Assign Training"): pick a training, then an embedded "New
// Training" create-module card. Reached from Risk Alerts' "Assign training"
// action and from Training modules' "+ Create module".
//
// Flow: select training → select type (employee / department) → select target →
// confirmation → confirm. The wizard lives in AssignModal.
import { useState } from 'react'
import { emptyDraft, seedDraft, QuestionModal, AssignModal, ModuleCreatedModal, CreateModuleCard, InfoToast } from '../../components/admin/TrainingModuleForm.jsx'
import { TRAINING_LIBRARY } from '../../lib/trainingLibrary.js'
import { assignmentSummary, getAssignments } from '../../lib/assignments.js'
import { departmentName } from '../../lib/employees.js'
import { useToast } from '../../components/Toast.jsx'

export default function AssignTraining() {
  const [draft, setDraft] = useState(seedDraft)
  const [questionModal, setQuestionModal] = useState(false)
  const [assignTarget, setAssignTarget] = useState(null) // training being assigned
  const [created, setCreated] = useState(null)
  const [toastInfo, setToastInfo] = useState(null)
  const [assignments, setAssignments] = useState(getAssignments)
  const toast = useToast()

  function saveQuestion(q) {
    setDraft(d => ({ ...d, questions: [...d.questions, q] }))
    setQuestionModal(false)
  }

  function createModule() {
    if (!draft.title.trim() || draft.questions.length === 0) return
    const newModule = {
      title: draft.title,
      questions: draft.questions.length,
      points: Number(draft.points) || 0,
      minutes: Number(draft.minutes) || 0,
    }
    setDraft(emptyDraft)
    setCreated(newModule)
  }

  // The wizard has already written the assignment record by this point.
  function assigned(result) {
    setAssignTarget(null)
    setAssignments(getAssignments())
    setToastInfo({
      kicker: 'TRAINING ASSIGNED',
      title: `Assigned to ${result.assigned} employee${result.assigned === 1 ? '' : 's'}`,
      body: assignmentSummary(result),
    })
  }

  return (
    <div>
      <h1 className="text-[28px] font-bold text-[#17213a]">Assign Training</h1>
      <p className="text-[#667085] text-sm mt-1.5">Pick a training, choose the employees or department that should receive it, then confirm.</p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-5">
        {TRAINING_LIBRARY.map((t, i) => {
          const assignable = t.status === 'live' && t.questions > 0
          const dark = i === 0
          return (
            <button
              key={t.id}
              onClick={() => (assignable ? setAssignTarget(t) : toast(t.questions === 0 ? `"${t.title}" has no questions yet — add questions before assigning it.` : `"${t.title}" is a draft — publish it on Training modules before assigning.`))}
              className={`text-left rounded-[14px] px-4 py-4 flex items-center justify-between cursor-pointer ${
                dark ? 'bg-navy-header' : assignable ? 'bg-white border border-[#d8d0b4] hover:border-navy-header' : 'bg-[#f7f7fa] border border-[#e0e0e5]'
              }`}
            >
              <div>
                <p className={`font-semibold text-[11px] ${dark ? 'text-gold-brand' : assignable ? 'text-[#667085]' : 'text-[#98a2b3]'}`}>
                  {assignable ? 'TRAINING' : t.questions === 0 ? 'DRAFT · NO QUESTIONS YET' : 'DRAFT · NOT PUBLISHED'}
                </p>
                <p className={`font-bold text-[22px] mt-1.5 ${dark ? 'text-white' : assignable ? 'text-[#17213a]' : 'text-[#667085]'}`}>{t.title}</p>
                <p className={`text-[11px] font-medium mt-1.5 ${dark ? 'text-[#fff0f0]' : assignable ? 'text-[#078b6c]' : 'text-[#98a2b3]'}`}>
                  {t.questions} question{t.questions === 1 ? '' : 's'} · {t.minutes} minutes · {t.points} safety points
                </p>
              </div>
              <span className={`text-2xl ${dark ? 'text-white' : assignable ? 'text-[#07183a]' : 'text-[#98a2b3]'}`}>›</span>
            </button>
          )
        })}
      </div>

      {assignments.length > 0 && (
        <>
          <h2 className="text-[22px] font-bold text-[#17213a] mt-8">Recent assignments</h2>
          <div className="flex flex-col gap-2 mt-3">
            {assignments.slice(0, 5).map(a => (
              <div key={a.id} className="bg-white border border-[#e0e0e5] rounded-[12px] px-5 py-3 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-navy font-semibold text-sm">{a.trainingTitle}</p>
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

      <h2 className="text-[28px] font-bold text-[#17213a] mt-8">New Training</h2>
      <p className="text-[#667085] text-sm mt-1.5">Create new training to assign with.</p>

      <CreateModuleCard
        kicker="NEW TRAINING"
        draft={draft}
        setDraft={setDraft}
        onOpenQuestion={() => setQuestionModal(true)}
        onCreate={createModule}
        secondaryLabel="Clear"
        onSecondary={() => setDraft(emptyDraft)}
      />

      {questionModal && <QuestionModal onCancel={() => setQuestionModal(false)} onSave={saveQuestion} />}
      {assignTarget && (
        <AssignModal
          training={assignTarget}
          onCancel={() => setAssignTarget(null)}
          onAssigned={assigned}
        />
      )}
      {created && (
        <ModuleCreatedModal
          moduleTitle={created.title}
          questions={created.questions}
          points={created.points}
          minutes={created.minutes}
          onAssign={() => { setAssignTarget(created); setCreated(null) }}
          onDone={() => setCreated(null)}
        />
      )}
      {toastInfo && <InfoToast {...toastInfo} onClose={() => setToastInfo(null)} />}
    </div>
  )
}
