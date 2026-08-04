// Admin · Training module → Edit questions.
//
// The step the Edit button on Training modules opens:
//   Training module → Question list → Edit a question → Confirm module
//
// Everything on this page is held locally until Confirm. That is deliberate:
// a module can already be published and assigned, so an employee could be
// sitting the assessment while it is being edited. Saving each keystroke would
// change the questions under them; saving once, on Confirm, means the module
// they are taking is always a complete set an admin signed off.
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useToast } from '../../components/Toast.jsx'
import { MAX_QUESTIONS, QuestionList, QuestionModal } from '../../components/admin/TrainingModuleForm.jsx'
import { saveModule } from '../../lib/trainingStore.js'
import { useTrainingLibrary } from '../../lib/useTraining.js'

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

export default function EditQuestions() {
  const { moduleId } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const { modules, loaded } = useTrainingLibrary()
  const module = modules.find(m => m.id === Number(moduleId)) || null

  // The working copy. Seeded from the saved module once it arrives, and left
  // alone afterwards so the 5-second library poll can never overwrite an edit
  // in progress.
  const [draft, setDraft] = useState(null)
  const [editing, setEditing] = useState(null) // question index | 'new' | null
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (module && !draft) {
      setDraft({
        title: module.title,
        points: String(module.points ?? ''),
        minutes: String(module.minutes ?? ''),
        questions: module.questions || [],
      })
    }
  }, [module, draft])

  const dirty = useMemo(() => {
    if (!module || !draft) return false
    return (
      draft.title !== module.title ||
      Number(draft.points) !== module.points ||
      Number(draft.minutes) !== module.minutes ||
      !same(draft.questions, module.questions)
    )
  }, [module, draft])

  if (!loaded && !module) {
    return <p className="text-[#667085] text-sm py-10">Loading the training module…</p>
  }
  if (!module || !draft) {
    return (
      <div>
        <h1 className="text-[28px] font-bold text-[#17213a]">Training module not found</h1>
        <p className="text-[#667085] text-sm mt-2">This module is no longer in the library. It may have been removed.</p>
        <Link to="/admin/training" className="border-[1.5px] border-navy-header text-navy-header font-semibold text-sm px-6 h-12 rounded-full inline-flex items-center mt-6 hover:bg-chip">
          ←&nbsp;&nbsp;Back to Training modules
        </Link>
      </div>
    )
  }

  const full = draft.questions.length >= MAX_QUESTIONS

  function openNew() {
    if (full) {
      return setError(`This module already has the maximum of ${MAX_QUESTIONS} questions. Delete one before adding another — editing the existing questions is still fine.`)
    }
    setError('')
    setEditing('new')
  }

  function saveQuestion(q) {
    setDraft(d => ({
      ...d,
      questions: editing === 'new'
        ? [...d.questions, q]
        : d.questions.map((old, i) => (i === editing ? q : old)),
    }))
    setEditing(null)
    setError('')
  }

  function deleteQuestion() {
    setDraft(d => ({ ...d, questions: d.questions.filter((_, i) => i !== editing) }))
    setEditing(null)
    setError('')
  }

  // The only write on this page. One request carries the finished question set,
  // so the module is never stored half-edited.
  async function confirmModule() {
    if (draft.questions.length === 0) {
      return setError('A training module needs at least one question. Add one before saving.')
    }
    setSaving(true)
    const result = await saveModule(module.id, {
      title: draft.title,
      points: Number(draft.points) || 0,
      minutes: Number(draft.minutes) || 0,
      questions: draft.questions,
    })
    setSaving(false)
    if (!result.ok) return setError(result.error)
    toast(`"${draft.title}" saved — ${draft.questions.length} question${draft.questions.length === 1 ? '' : 's'} are now live for everyone assigned to it.`)
    navigate('/admin/training')
  }

  return (
    <div>
      <Link to="/admin/training" className="text-[#667085] hover:text-navy-header font-semibold text-[13px] inline-flex items-center">
        ←&nbsp;&nbsp;Back to Training modules
      </Link>

      <div className="flex flex-col sm:flex-row items-start justify-between gap-3 mt-3">
        <div>
          <p className="text-gold font-semibold text-[11px] tracking-wide">EDIT QUESTIONS</p>
          <h1 className="text-[28px] font-bold text-[#17213a] mt-1">{module.title}</h1>
          <p className="text-[#667085] text-sm mt-1.5">
            Select a question to edit its wording and answers, or add a new one. Nothing is saved until you confirm the module.
          </p>
        </div>
        <span className={`text-[11.5px] font-semibold rounded-full px-3 py-1.5 shrink-0 ${module.status === 'live' ? 'bg-[#e7f4ee] text-[#328768]' : 'bg-[#ededf2] text-slate2'}`}>
          {module.status === 'live' ? 'Live · visible to employees' : 'Draft · hidden from employees'}
        </span>
      </div>

      {dirty && (
        <div className="bg-[#fff5de] border border-[#e8c877] rounded-[12px] px-4 py-3 mt-5 flex flex-wrap items-center gap-3">
          <p className="text-[#8a6410] text-[13px] font-medium flex-1 min-w-[240px]">
            Unsaved changes. Employees keep seeing the current questions until you confirm the module.
          </p>
          <button
            onClick={() => setDraft({ title: module.title, points: String(module.points), minutes: String(module.minutes), questions: module.questions })}
            className="text-[#8a6410] font-semibold text-[13px] underline cursor-pointer"
          >
            Discard changes
          </button>
        </div>
      )}

      <div className="bg-white border border-[#d8d0b4] rounded-[16px] p-5 sm:p-7 mt-5">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_160px_160px] gap-4">
          <div>
            <p className="text-slate2 font-semibold text-xs">MODULE TITLE</p>
            <input
              value={draft.title}
              onChange={e => setDraft(d => ({ ...d, title: e.target.value }))}
              className="w-full border border-[#98a2b3] rounded-[10px] h-12 px-3.5 mt-2 text-sm text-ink outline-none focus:border-navy bg-[#eef2ff]"
            />
          </div>
          <div>
            <p className="text-slate2 font-semibold text-xs">XP VALUE</p>
            <input
              value={draft.points}
              onChange={e => setDraft(d => ({ ...d, points: e.target.value }))}
              className="w-full border border-[#98a2b3] rounded-[10px] h-12 px-3.5 mt-2 text-sm text-ink outline-none focus:border-navy bg-[#eef2ff]"
            />
          </div>
          <div>
            <p className="text-slate2 font-semibold text-xs">EST. TIME (MIN)</p>
            <input
              value={draft.minutes}
              onChange={e => setDraft(d => ({ ...d, minutes: e.target.value }))}
              className="w-full border border-[#98a2b3] rounded-[10px] h-12 px-3.5 mt-2 text-sm text-ink outline-none focus:border-navy bg-[#eef2ff]"
            />
          </div>
        </div>

        <div className="mt-7">
          <QuestionList
            questions={draft.questions}
            onAdd={openNew}
            onEdit={i => { setError(''); setEditing(i) }}
          />
        </div>

        {error && <p className="text-[#d92d20] text-[13px] font-medium mt-4">{error}</p>}

        <div className="h-px bg-[#e5e5ea] my-6" />
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={confirmModule}
            disabled={saving || draft.questions.length === 0}
            className="bg-gold hover:bg-gold-dark text-navy font-semibold text-sm px-8 h-12 rounded-full cursor-pointer disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Confirm training module →'}
          </button>
          <Link to="/admin/training" className="border border-navy text-navy font-semibold text-sm px-8 h-12 rounded-full inline-flex items-center cursor-pointer hover:bg-chip">
            Cancel
          </Link>
          <p className="text-slate2 text-xs ml-auto">
            {draft.questions.length} of {MAX_QUESTIONS} questions · saved once you confirm
          </p>
        </div>
      </div>

      {editing !== null && (
        <QuestionModal
          initial={editing === 'new' ? null : draft.questions[editing]}
          index={editing === 'new' ? draft.questions.length : editing}
          total={editing === 'new' ? draft.questions.length + 1 : draft.questions.length}
          onCancel={() => setEditing(null)}
          onSave={saveQuestion}
          onDelete={editing === 'new' ? undefined : deleteQuestion}
        />
      )}
    </div>
  )
}
