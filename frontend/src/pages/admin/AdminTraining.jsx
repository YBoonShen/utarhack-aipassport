// 18 Admin · Training modules — matches Figma "18 Admin • Assign Training"
// (layer-named "Assign Training" but its H1 reads "Training modules").
//
// The list is the shared training library, which is the same record set the
// employee training pages read: publishing a module here puts it in its
// assignees' lists, hiding it takes it out again, and both survive a reload
// because neither is stored in this browser.
//
// Each row has the three things an admin does with a module: edit its questions,
// publish or hide it, and assign it.
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useToast } from '../../components/Toast.jsx'
import { AssignModal, InfoToast } from '../../components/admin/TrainingModuleForm.jsx'
import { assignmentSummary, assignedCount, setModuleStatus } from '../../lib/trainingStore.js'
import { useTrainingLibrary } from '../../lib/useTraining.js'

export default function AdminTraining() {
  const { modules, loaded } = useTrainingLibrary()
  const [assignTarget, setAssignTarget] = useState(null) // module being assigned
  const [toastInfo, setToastInfo] = useState(null) // { kicker, title, body }
  const [busy, setBusy] = useState(null) // module id mid-request
  const toast = useToast()
  const navigate = useNavigate()

  async function publish(m) {
    setBusy(m.id)
    const result = await setModuleStatus(m.id, 'live')
    setBusy(null)
    if (!result.ok) return toast(result.error)
    setToastInfo({
      kicker: 'MODULE PUBLISHED',
      title: 'Now live for employees',
      body: 'The module is now visible to the employees it is assigned to and can be assigned to more people or a whole department.',
    })
  }

  // Hide takes a live module out of the employee-visible list (back to draft).
  // Its assignment records are kept, so publishing again restores exactly who
  // had it.
  async function hide(m) {
    setBusy(m.id)
    const result = await setModuleStatus(m.id, 'draft')
    setBusy(null)
    toast(result.ok
      ? `"${m.title}" hidden — no longer visible to employees. Publish to restore.`
      : result.error)
  }

  // `result` comes from the Assign Training wizard — the server has already
  // written the assignment record, skipped anyone who already had this training
  // and notified the rest. The counts here are derived from those records.
  function assign(result) {
    setToastInfo({
      kicker: 'MODULE ASSIGNED',
      title: `Assigned to ${result.assigned} employee${result.assigned === 1 ? '' : 's'}`,
      body: assignmentSummary(result),
    })
    setAssignTarget(null)
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row items-start justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-bold text-[#17213a]">Training modules</h1>
          <p className="text-[#667085] text-sm mt-1.5">Edit a module&rsquo;s questions, publish it, and assign it to employees or departments.</p>
        </div>
        {/* Straight to the create form, not to the choice in front of it —
            this button has already made the choice. */}
        <Link to="/admin/training/assign?mode=new" className="bg-gold-brand hover:bg-gold text-navy-header font-semibold text-sm px-6 h-12 rounded-full flex items-center cursor-pointer shrink-0">
          + Create module
        </Link>
      </div>

      {!loaded && modules.length === 0 && (
        <p className="text-[#667085] text-sm mt-8">Loading the training library…</p>
      )}

      <div className="flex flex-col gap-3 mt-6">
        {modules.map((m, i) => (
          <div key={m.id} className={`border rounded-[12px] px-5 py-4.5 flex flex-wrap items-center gap-4 ${m.status === 'live' ? 'bg-white border-[#e0e0e5]' : 'bg-[#f7f7fa] border-[#e0e0e5]'}`}>
            <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0 ${m.status === 'live' ? 'bg-navy' : 'bg-[#ccccd1]'}`}>
              {i + 1}
            </div>
            <div className="flex-1 min-w-0">
              <p className={`font-bold text-[15px] ${m.status === 'live' ? 'text-navy' : 'text-slate2'}`}>{m.title}</p>
              <p className="text-slate2 text-[12.5px] mt-1">
                {m.questionCount} question{m.questionCount === 1 ? '' : 's'} · +{m.points} XP{' '}
                {m.status === 'live' ? `· assigned to ${assignedCount(m)} · ${m.done}% done` : '· not assigned'}
              </p>
            </div>
            <span className={`text-[11.5px] font-semibold rounded-full px-3 py-1.5 shrink-0 ${m.status === 'live' ? 'bg-[#e7f4ee] text-[#328768]' : 'bg-[#ededf2] text-slate2'}`}>
              {m.status === 'live' ? 'Live · visible to employees' : 'Draft · hidden from employees'}
            </span>
            {/* Edit opens the question editor for THIS module — the saved
                questions, their answers, and the confirm step that stores them. */}
            <button
              onClick={() => navigate(`/admin/training/${m.id}/questions`)}
              className="text-[#365fd9] text-[12.5px] font-semibold cursor-pointer shrink-0 hover:underline"
            >
              Edit questions
            </button>
            <button
              onClick={() => (m.status === 'live' ? hide(m) : publish(m))}
              disabled={busy === m.id}
              className="text-slate2 text-[12.5px] font-semibold cursor-pointer shrink-0 hover:text-navy disabled:opacity-50"
            >
              {m.status === 'live' ? 'Hide' : 'Publish'}
            </button>
            {m.status === 'live' ? (
              <button onClick={() => setAssignTarget(m)} className="bg-gold-brand hover:bg-gold text-navy-header font-semibold text-[13px] px-4 h-9 rounded-full cursor-pointer shrink-0">
                Assign →
              </button>
            ) : (
              <button onClick={() => publish(m)} disabled={busy === m.id} className="bg-gold-brand hover:bg-gold text-navy-header font-semibold text-[13px] px-4 h-9 rounded-full cursor-pointer shrink-0 disabled:opacity-50">
                Publish →
              </button>
            )}
          </div>
        ))}
      </div>

      {assignTarget && <AssignModal training={assignTarget} onCancel={() => setAssignTarget(null)} onAssigned={assign} />}
      {toastInfo && <InfoToast {...toastInfo} onClose={() => setToastInfo(null)} />}
    </div>
  )
}
