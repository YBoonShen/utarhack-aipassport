// Admin · Assign Training — matches Figma frame "18B Admin • Training •
// Module created" background (layer-named after its overlay, but its actual
// content reads "Assign Training"): two quick-assign presets plus an
// embedded "New Training" create-module card. Reached from Risk Alerts'
// "Assign training" action.
import { useState } from 'react'
import { emptyDraft, seedDraft, QuestionModal, AssignModal, ModuleCreatedModal, CreateModuleCard } from '../../components/admin/TrainingModuleForm.jsx'

const presets = [
  { id: 'data-privacy', kicker: 'TRAINING: REFRESHER', title: 'Data Privacy', meta: '3 questions · 5 minutes', dark: true },
  { id: 'safe-ai-prompt', kicker: 'TRAINING', title: 'Safe AI prompt', meta: '5 questions · 10 minutes · 250 safety points', dark: false },
]

export default function AssignTraining() {
  const [draft, setDraft] = useState(seedDraft)
  const [questionModal, setQuestionModal] = useState(false)
  const [assignTarget, setAssignTarget] = useState(null) // { title } of whatever is being assigned
  const [created, setCreated] = useState(null)

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

  return (
    <div>
      <h1 className="text-[28px] font-bold text-[#17213a]">Assign Training</h1>
      <p className="text-[#667085] text-sm mt-1.5">Click to assign training to the respective employee(s).</p>

      <div className="grid grid-cols-2 gap-4 mt-5">
        {presets.map(p => (
          <button
            key={p.id}
            onClick={() => setAssignTarget({ title: p.title })}
            className={`text-left rounded-[14px] px-4 py-4 flex items-center justify-between cursor-pointer ${p.dark ? 'bg-navy-header' : 'bg-white border border-[#d8d0b4] hover:border-navy-header'}`}
          >
            <div>
              <p className={`font-semibold text-[11px] ${p.dark ? 'text-gold-brand' : 'text-[#667085]'}`}>{p.kicker}</p>
              <p className={`font-bold text-[26px] mt-1.5 ${p.dark ? 'text-white' : 'text-[#17213a]'}`}>{p.title}</p>
              <p className={`text-[11px] font-medium mt-1.5 ${p.dark ? 'text-[#fff0f0]' : 'text-[#078b6c]'}`}>{p.meta}</p>
            </div>
            <span className={`text-2xl ${p.dark ? 'text-white' : 'text-[#07183a]'}`}>›</span>
          </button>
        ))}
      </div>

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
          moduleTitle={assignTarget.title}
          onCancel={() => setAssignTarget(null)}
          onAssigned={() => setAssignTarget(null)}
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
    </div>
  )
}
