// 18 Admin · Training modules — matches Figma "18 Admin • Assign Training"
// (layer-named "Assign Training" but its H1 reads "Training modules").
// "+ Create module" goes to the dedicated Assign Training page (same
// destination as Risk Alerts' "Assign training" action) — the prototype
// reuses one create-and-assign hub for both entry points.
// Demo-local state: assign/publish live in this component's state and reset
// on page reload — no backend persistence yet.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useToast } from '../../components/Toast.jsx'
import { AssignModal, InfoToast } from '../../components/admin/TrainingModuleForm.jsx'

const seedModules = [
  { id: 1, title: 'Spotting Personal Data in Prompts', questions: 3, points: 150, status: 'live', assigned: 303, done: 78 },
  { id: 2, title: 'Safe AI Tool Selection', questions: 3, points: 180, status: 'live', assigned: 210, done: 54 },
  { id: 3, title: 'Human Review in AI Decisions', questions: 3, points: 200, status: 'live', assigned: 96, done: 30 },
  { id: 4, title: 'Advanced AI Ethics', questions: 3, points: 220, status: 'draft', assigned: 0, done: 0 },
  { id: 5, title: 'AI Tools at Work: Staying Compliant & Safe', questions: 3, points: 150, status: 'draft', assigned: 0, done: 0 },
]

export default function AdminTraining() {
  const [modules, setModules] = useState(seedModules)
  const [assignTarget, setAssignTarget] = useState(null) // module being assigned
  const [toastInfo, setToastInfo] = useState(null) // { kicker, title, body }
  const toast = useToast()

  function publish(id) {
    setModules(ms => ms.map(m => (m.id === id ? { ...m, status: 'live' } : m)))
    setToastInfo({ kicker: 'MODULE PUBLISHED', title: 'Now live for employees', body: 'The module is now visible in every employee’s training list and can be assigned to a group.' })
  }

  function assign(target) {
    const count = target === 'everyone' ? 303 : target === 'department' ? 84 : 12
    setModules(ms => ms.map(m => (m.id === assignTarget.id ? { ...m, assigned: count } : m)))
    setToastInfo({ kicker: 'MODULE ASSIGNED', title: `Assigned to ${count} employees`, body: 'They will see it in their training list and get a notification. Progress appears here as they complete it.' })
    setAssignTarget(null)
  }

  return (
    <div>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[28px] font-bold text-[#17213a]">Training modules</h1>
          <p className="text-[#667085] text-sm mt-1.5">Assign modules to employees or departments, or create a new one.</p>
        </div>
        <Link to="/admin/training/assign" className="bg-gold-brand hover:bg-gold text-navy-header font-semibold text-sm px-6 h-12 rounded-full flex items-center cursor-pointer">
          + Create module
        </Link>
      </div>

      <div className="flex flex-col gap-3 mt-6">
        {modules.map((m, i) => (
          <div key={m.id} className={`border rounded-[12px] px-5 py-4.5 flex items-center gap-4 ${m.status === 'live' ? 'bg-white border-[#e0e0e5]' : 'bg-[#f7f7fa] border-[#e0e0e5]'}`}>
            <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0 ${m.status === 'live' ? 'bg-navy' : 'bg-[#ccccd1]'}`}>
              {i + 1}
            </div>
            <div className="flex-1 min-w-0">
              <p className={`font-bold text-[15px] ${m.status === 'live' ? 'text-navy' : 'text-slate2'}`}>{m.title}</p>
              <p className="text-slate2 text-[12.5px] mt-1">
                {m.questions} questions · +{m.points} pts{' '}
                {m.status === 'live' ? `· assigned to ${m.assigned} · ${m.done}% done` : '· not assigned'}
              </p>
            </div>
            <span className={`text-[11.5px] font-semibold rounded-full px-3 py-1.5 shrink-0 ${m.status === 'live' ? 'bg-[#e7f4ee] text-[#328768]' : 'bg-[#ededf2] text-slate2'}`}>
              {m.status === 'live' ? 'Live · visible to employees' : 'Draft · hidden from employees'}
            </span>
            <button onClick={() => toast(m.status === 'live' ? 'Editing modules is coming soon.' : 'Editing modules is coming soon.')} className="text-slate2 text-[12.5px] font-semibold cursor-pointer shrink-0">
              {m.status === 'live' ? 'Hide' : 'Edit'}
            </button>
            {m.status === 'live' ? (
              <button onClick={() => setAssignTarget(m)} className="bg-gold-brand hover:bg-gold text-navy-header font-semibold text-[13px] px-4 h-9 rounded-full cursor-pointer shrink-0">
                Assign →
              </button>
            ) : (
              <button onClick={() => publish(m.id)} className="bg-gold-brand hover:bg-gold text-navy-header font-semibold text-[13px] px-4 h-9 rounded-full cursor-pointer shrink-0">
                Publish →
              </button>
            )}
          </div>
        ))}
      </div>

      {assignTarget && <AssignModal moduleTitle={assignTarget.title} onCancel={() => setAssignTarget(null)} onAssigned={assign} />}
      {toastInfo && <InfoToast {...toastInfo} onClose={() => setToastInfo(null)} />}
    </div>
  )
}
