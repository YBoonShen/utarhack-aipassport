// 16 Admin · Employees — matches Figma frame "16 Admin • Employees"
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
// Toast is no longer imported here: the only thing this screen ever raised one
// for was the "More filters" demo notice, and that button is gone.
import { AssignModal, InfoToast } from '../../components/admin/TrainingModuleForm.jsx'
import { EMPLOYEES, DEPARTMENT_CODES } from '../../lib/employees.js'
import { assignmentSummary } from '../../lib/trainingStore.js'
import { useTrainingLibrary } from '../../lib/useTraining.js'
import { api } from '../../lib/api.js'
import { levelFor, barXP, nextLevelLabel } from '../../lib/levels.js'

const statusChip = {
  'On track': 'bg-[#e9f8f2] text-[#078b6c]',
  Refresher: 'bg-[#fff5de] text-[#d97706]',
  'Support due': 'bg-[#fff0f0] text-[#d92d20]',
  Review: 'bg-[#fff5de] text-[#d97706]',
  Ambassador: 'bg-[#eef2ff] text-[#365fd9]',
  'New starter': 'bg-[#f0f5ff] text-[#1447b2]',
}

// The directory records now live in lib/employees.js so Assign Training picks
// recipients from exactly the same people this table shows.
const employees = EMPLOYEES

/**
 * A directory row for somebody the seeded list has never heard of.
 *
 * New starters exist only in the backend — they registered after this build
 * shipped — so their row is built entirely from /api/progression. Without this
 * the admin could not see an account at all until somebody hard-coded them
 * here, which meant the audit log could show `Employee F-301 signed in` for an
 * id the directory had no row for.
 */
function rowFromLive(record) {
  return {
    avatar: record.initials || record.id.slice(0, 2),
    id: record.id,
    dept: record.dept,
    level: `L${record.level}`,
    training: record.assignedModules
      ? Math.round((record.modulesCompleted / record.assignedModules) * 100)
      : 0,
    protectedCount: record.promptsProtected || 0,
    alerts: record.openAlerts || 0,
    status: statusFor(record),
    xp: record.totalXP,
    modules: record.modules || [],
    live: true,
  }
}

/**
 * The status chip for a live row.
 *
 * The seeded rows carry a hand-written status; these have to derive one, and it
 * is derived in the order the admin would triage in — an open alert outranks
 * outstanding training, which outranks everything else. A brand-new account is
 * called what it is rather than "On track": nothing has gone wrong, but nothing
 * has happened yet either, and those are not the same report.
 */
function statusFor(record) {
  if (record.openAlerts > 0) return 'Support due'
  if (record.assignedModules > record.modulesCompleted) return 'Refresher'
  if (record.level >= 3) return 'Ambassador'
  if (!record.totalXP && !record.modulesCompleted) return 'New starter'
  return 'On track'
}

// Employee progression detail — level, total XP and what each training module
// actually contributed. Attempts are shown next to the XP so a module retaken
// ten times is visible as effort without ever appearing as ten rewards.
function ProgressionModal({ employee, onClose }) {
  const lvl = levelFor(employee.xp, 0)
  const modules = employee.modules || []
  const trainingXP = modules.reduce((n, m) => n + m.pointsEarned, 0)

  return (
    <div className="fixed inset-0 bg-[#081737]/40 flex items-center justify-center p-4 sm:p-6 z-50" onClick={onClose}>
      <div
        className="bg-white border border-[#d8d0b4] rounded-[16px] shadow-[0px_10px_30px_rgba(0,0,0,0.2)] w-full max-w-[560px] p-6 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <span className="w-11 h-11 rounded-full bg-[#edf2ff] text-navy font-bold text-xs flex items-center justify-center shrink-0">{employee.avatar}</span>
          <div>
            <p className="text-[#667085] font-semibold text-[10px] tracking-[1px]">EMPLOYEE PROGRESSION</p>
            <p className="text-[#17213a] font-bold text-lg">{employee.id} · {employee.dept}</p>
          </div>
          {employee.live && (
            <span className="ml-auto bg-[#e9f8f2] text-[#078b6c] font-semibold text-[10px] px-3 py-1.5 rounded-full shrink-0">LIVE RECORD</span>
          )}
        </div>

        <div className="bg-[#fffcef] border border-[#e5dec7] rounded-[12px] px-4 py-3.5 mt-5">
          <div className="flex flex-wrap justify-between gap-2">
            <p className="text-[#17213a] font-semibold text-sm">Level {lvl.level} · {lvl.levelName}</p>
            <p className="text-[#17213a] font-semibold text-sm">{lvl.totalXP.toLocaleString()} points total</p>
          </div>
          <div className="h-2.5 rounded-full bg-[#f1eddf] mt-2.5">
            <div className="h-2.5 rounded-full bg-gold-brand" style={{ width: `${lvl.progressPercentage}%` }} />
          </div>
          <div className="flex flex-wrap justify-between gap-2 mt-2">
            <p className="text-[#667085] text-[11px]">{barXP(lvl).toLocaleString()} / {lvl.nextLevelXP.toLocaleString()} points in this level</p>
            <p className="text-[#667085] text-[11px]">{nextLevelLabel(lvl)}</p>
          </div>
        </div>

        <p className="text-[#667085] font-semibold text-[10px] tracking-[1px] mt-5">TRAINING CONTRIBUTION</p>
        <div className="grid grid-cols-[1fr_70px_70px_74px] gap-1 bg-navy-header rounded-[8px] text-gold-brand font-semibold text-[10px] px-3 h-9 items-center mt-2">
          <p>Module</p><p>Best</p><p>Attempts</p><p className="text-right">Points earned</p>
        </div>
        {modules.length === 0 ? (
          <p className="text-[#667085] text-sm text-center py-6">No training completed yet.</p>
        ) : (
          modules.map((m, i) => (
            <div key={m.moduleId} className={`grid grid-cols-[1fr_70px_70px_74px] gap-1 px-3 h-12 items-center border-b border-[#eee6d4] ${i % 2 === 1 ? 'bg-[#fffcef]' : 'bg-white'}`}>
              <p className="text-[#17213a] text-[12px] font-medium truncate">{m.title}</p>
              <p className="text-[#475467] text-[11px]">{m.bestScorePct}%</p>
              <p className="text-[#475467] text-[11px]">{m.attempts}</p>
              <p className="text-[#17213a] text-[11px] font-semibold text-right">{m.pointsEarned} / {m.modulePoints}</p>
            </div>
          ))
        )}

        <div className="flex flex-wrap justify-between gap-2 mt-3">
          <p className="text-[#667085] text-[11px]">
            Training points {trainingXP.toLocaleString()}&nbsp;&nbsp;·&nbsp;&nbsp;Other safe-use points {(lvl.totalXP - trainingXP).toLocaleString()}
          </p>
          <p className="text-[#667085] text-[11px]">Best result per module only</p>
        </div>

        <div className="bg-[#eef2ff] rounded-[10px] px-4 py-3 mt-4">
          <p className="text-[#365fd9] font-semibold text-[10px]">HOW POINTS ARE COUNTED</p>
          <p className="text-[#17213a] text-[11.5px] mt-1.5 leading-relaxed">
            Each module contributes its best result once. Repeat attempts raise the attempt count but never the points, so
            this record reflects learning rather than how often a module was reopened.
          </p>
        </div>

        <button onClick={onClose} className="border-[1.5px] border-navy-header text-navy-header font-semibold text-[13px] px-6 h-11 rounded-full cursor-pointer mt-5 w-full sm:w-auto">
          Close
        </button>
      </div>
    </div>
  )
}

const kpis = [
  { label: 'ACTIVE EMPLOYEES', value: '303', note: 'Across 6 departments', dark: true, noteColor: 'text-[#e9f8f2]' },
  { label: 'AVERAGE LICENSE', value: '2.1', note: '↑ from 1.6', noteColor: 'text-[#078b6c]' },
  { label: 'TRAINING COMPLETE', value: '78%', note: '236 employees', noteColor: 'text-[#365fd9]' },
  { label: 'NEEDS ATTENTION', value: '3', note: 'Learning support due', noteColor: 'text-[#d92d20]' },
]

const distribution = [
  { label: 'Level 1 · Trainee', count: 72, pct: 24, color: '#98a2b3' },
  { label: 'Level 2 · Navigator', count: 188, pct: 62, color: '#365fd9' },
  { label: 'Level 3 · Ambassador', count: 37, pct: 12, color: '#d9b32c' },
  { label: 'Level 4 · Guardian', count: 6, pct: 2, color: '#078b6c' },
]

const cols = 'grid grid-cols-[150px_82px_70px_150px_86px_64px_1fr] items-center gap-1'

const departments = DEPARTMENT_CODES
const levels = ['L1', 'L2', 'L3', 'L4']
const PAGE_SIZE = 8

export default function Employees() {
  const [assignOpen, setAssignOpen] = useState(false)
  const [toastInfo, setToastInfo] = useState(null)
  const [search, setSearch] = useState('')
  const [dept, setDept] = useState('All')
  const [level, setLevel] = useState('All')
  const [menu, setMenu] = useState(null) // 'dept' | 'level' | null
  const [detail, setDetail] = useState(null) // employee whose progression is open

  const [page, setPage] = useState(0)

  // The "next training cohort" panel assigns the first module in the library.
  const { modules: library } = useTrainingLibrary()
  const cohortTraining = library[0] || null

  // Progression is real for every employee who has signed in — read it from the
  // backend so the admin sees exactly the XP and per-module contributions those
  // employees earned, from the same records the employees see.
  const [live, setLive] = useState([])
  useEffect(() => {
    let alive = true
    const load = () => api.get('/progression').then(p => alive && setLive(p.employees || [])).catch(() => {})
    load()
    const t = setInterval(load, 5000)
    return () => { alive = false; clearInterval(t) }
  }, [])

  // Two sources, one directory. The seeded records are the organisation as it
  // stood when this build shipped, enriched with whatever those employees have
  // actually earned since; anyone the backend knows and this list does not is a
  // new starter, appended with a row built from their progression alone.
  const seeded = employees.map(e => {
    const record = live.find(l => l.id === e.id)
    if (!record) return e
    return {
      ...e,
      live: true,
      level: `L${record.level}`,
      xp: record.totalXP,
      modules: record.modules,
      training: record.assignedModules
        ? Math.round((record.modulesCompleted / record.assignedModules) * 100)
        : 0,
    }
  })

  const seededIds = new Set(employees.map(e => e.id))
  // Newest first: the admin opening this page after somebody registered should
  // not have to page to the end to find them.
  const newStarters = live.filter(l => !seededIds.has(l.id)).map(rowFromLive).reverse()
  const directory = [...newStarters, ...seeded]

  const filtered = directory.filter(e =>
    (dept === 'All' || e.dept === dept) &&
    (level === 'All' || e.level === level) &&
    (search.trim() === '' || `${e.id} ${e.dept}`.toLowerCase().includes(search.trim().toLowerCase()))
  )
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const current = Math.min(page, totalPages - 1)
  const slice = filtered.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE)

  function assign(result) {
    setAssignOpen(false)
    setToastInfo({
      kicker: 'MODULE ASSIGNED',
      title: `Assigned to ${result.assigned} employee${result.assigned === 1 ? '' : 's'}`,
      body: assignmentSummary(result),
    })
  }

  return (
    // One screen, no scrolling: the page is a column the height of the admin
    // main area and the directory row is what flexes, so the KPIs, the filters
    // and the insights panel are all visible without scrolling past them.
    // Below lg the sidebar stacks on top, so the fixed height is lifted.
    <div className="flex flex-col gap-3 lg:h-[calc(100vh-3rem)] lg:overflow-y-auto">
      <div className="flex flex-col sm:flex-row items-start justify-between gap-3 shrink-0">
        <div>
          <h1 className="text-[28px] font-bold text-[#17213a]">Employees</h1>
          <p className="text-[#667085] text-sm mt-1.5">Support AI literacy and safe use with role-appropriate training and controls.</p>
        </div>
        <Link to="/admin/training" className="bg-gold-brand hover:bg-gold text-navy-header font-semibold text-[13px] px-6 h-11 rounded-full flex items-center cursor-pointer shrink-0">Assign Training</Link>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 shrink-0">
        {kpis.map(k => (
          <div key={k.label} className={`rounded-[14px] px-4 py-2.5 ${k.dark ? 'bg-navy-header' : 'bg-white border border-[#d8d0b4]'}`}>
            <p className={`font-semibold text-[11px] ${k.dark ? 'text-gold-brand' : 'text-[#667085]'}`}>{k.label}</p>
            <p className={`font-bold text-[24px] mt-0.5 ${k.dark ? 'text-white' : 'text-[#17213a]'}`}>{k.value}</p>
            <p className={`font-medium text-[11px] ${k.noteColor}`}>{k.note}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white border border-[#d8d0b4] rounded-[12px] px-4 py-2 flex flex-wrap items-center gap-2.5 shrink-0">
        <div className="bg-[#fffcef] border border-[#d8d0b4] rounded-[9px] h-10 w-full sm:w-[326px] flex items-center px-2.5 gap-2">
          <span className="text-[#667085] text-[17px]">⌕</span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search employee ID or department"
            className="flex-1 bg-transparent outline-none text-xs text-[#17213a] placeholder-[#667085]"
          />
          {search && <button onClick={() => setSearch('')} className="text-[#667085] text-sm cursor-pointer px-1">×</button>}
        </div>

        {/* Department filter */}
        <div className="relative">
          <button onClick={() => setMenu(m => (m === 'dept' ? null : 'dept'))} className="bg-navy-header text-white font-semibold text-[13px] h-11 px-5 rounded-full cursor-pointer">
            {dept === 'All' ? 'All departments' : dept}&nbsp;&nbsp;▾
          </button>
          {menu === 'dept' && (
            <div className="absolute left-0 top-12 z-20 bg-white border border-[#d8d0b4] rounded-[10px] shadow-[0px_8px_20px_rgba(0,0,0,0.12)] py-1.5 w-44">
              {['All', ...departments].map(d => (
                <button key={d} onClick={() => { setDept(d); setMenu(null) }} className={`block w-full text-left px-4 py-2 text-[13px] cursor-pointer hover:bg-chip ${dept === d ? 'text-[#365fd9] font-semibold' : 'text-[#17213a]'}`}>
                  {d === 'All' ? 'All departments' : d}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* License level filter */}
        <div className="relative">
          <button onClick={() => setMenu(m => (m === 'level' ? null : 'level'))} className={`font-semibold text-[13px] h-11 px-5 rounded-full cursor-pointer ${level === 'All' ? 'border-[1.5px] border-navy-header text-navy-header hover:bg-chip' : 'bg-navy-header text-white'}`}>
            {level === 'All' ? 'License level' : `Level ${level.slice(1)}`}&nbsp;&nbsp;▾
          </button>
          {menu === 'level' && (
            <div className="absolute left-0 top-12 z-20 bg-white border border-[#d8d0b4] rounded-[10px] shadow-[0px_8px_20px_rgba(0,0,0,0.12)] py-1.5 w-40">
              {['All', ...levels].map(l => (
                <button key={l} onClick={() => { setLevel(l); setMenu(null) }} className={`block w-full text-left px-4 py-2 text-[13px] cursor-pointer hover:bg-chip ${level === l ? 'text-[#365fd9] font-semibold' : 'text-[#17213a]'}`}>
                  {l === 'All' ? 'All levels' : `Level ${l.slice(1)}`}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* No "More filters" here. It was a button that only ever raised a
            "not in this demo" toast, and the same control on Audit Log and Risk
            Alerts does real filtering — so on this screen alone it taught the
            admin that the button is a dead end. Department and License level
            above are the filters this directory actually has. */}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4 flex-1 min-h-0 lg:items-stretch items-start">
        {/* Employee directory */}
        <div className="bg-white border border-[#d8d0b4] rounded-[14px] p-4 flex flex-col min-h-0">
          <p className="text-[#17213a] font-bold text-lg shrink-0">Employee directory</p>
          <p className="text-[#667085] text-xs mt-0.5 shrink-0">303 active records · privacy-minimised view · select a row for points detail</p>

          <div className={`${cols} bg-navy-header rounded-[8px] text-gold-brand font-semibold text-[11px] px-3 h-10 mt-3 shrink-0`}>
            <p>Employee</p><p>Dept</p><p>License</p><p>Training · Points</p><p>Protected</p><p>Alerts</p><p>Status</p>
          </div>
          {/* The rows are the one part allowed to overflow, and paging keeps
              even that rare — everything around them stays on screen. */}
          <div className="flex-1 min-h-0 overflow-y-auto">
          {/* A row opens that employee's progression detail (level, total XP,
              per-module contribution). */}
          {slice.map((e, i) => (
            <button
              key={e.id}
              onClick={() => setDetail(e)}
              className={`${cols} w-full text-left px-3 h-[52px] border-b border-[#eee6d4] cursor-pointer hover:bg-[#f7f4e8] ${i % 2 === 1 ? 'bg-[#fffcef]' : 'bg-white'}`}
            >
              <div className="flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-full bg-[#edf2ff] text-navy font-bold text-[10px] flex items-center justify-center shrink-0">{e.avatar}</span>
                <p className="text-[#17213a] font-semibold text-[13px]">{e.id}</p>
              </div>
              <p className="text-[#475467] text-xs">{e.dept}</p>
              <p><span className="inline-block bg-[#edf2ff] text-navy font-semibold text-[11px] rounded-full px-3 py-1">{e.level}</span></p>
              <div className="flex items-center gap-2 pr-3">
                <div className="h-2 rounded-full bg-[#f1eddf] flex-1">
                  <div className="h-2 rounded-full bg-[#365fd9]" style={{ width: `${e.training}%` }} />
                </div>
                <p className="text-[#475467] text-[11px] w-11 shrink-0">{e.xp.toLocaleString()}</p>
              </div>
              <p className="text-[#17213a] font-medium text-xs">{e.protectedCount}</p>
              <p className={`font-medium text-xs ${e.alerts > 0 ? 'text-[#d92d20]' : 'text-[#475467]'}`}>{e.alerts}</p>
              <p><span className={`inline-block font-semibold text-[11px] rounded-full px-3.5 py-1.5 ${statusChip[e.status]}`}>{e.status}</span></p>
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="text-[#667085] text-sm text-center py-10">No employees match your search or filters.</p>
          )}
          </div>

          <div className="flex items-center justify-between mt-3 shrink-0">
            <p className="text-[#667085] text-xs">Showing {slice.length} of {filtered.length} employees</p>
            {totalPages > 1 && (
              <div className="flex items-center gap-3">
                <p className="text-[#667085] font-medium text-xs">{current + 1} of {totalPages}</p>
                <button onClick={() => setPage(current - 1)} disabled={current === 0} className="w-8 h-8 rounded-full bg-[#fffcef] border border-[#d8d0b4] text-[#667085] text-lg cursor-pointer disabled:opacity-40 disabled:cursor-default">‹</button>
                <button onClick={() => setPage(current + 1)} disabled={current >= totalPages - 1} className="w-8 h-8 rounded-full bg-[#fffcef] border border-[#d8d0b4] text-[#667085] text-lg cursor-pointer disabled:opacity-40 disabled:cursor-default">›</button>
              </div>
            )}
          </div>
        </div>

        {/* Employee insights — the distribution bars absorb the spare height so
            the cohort action underneath them is always reachable.
            `min-h-0` is deliberately absent from the card and the bar list. It
            was on both, and on a short viewport it did exactly what it says:
            let them shrink past their own content, so the four bars spilled out
            of their box and the Guardian row was drawn over "NEXT TRAINING
            COHORT". A flex item's default `min-height: auto` is the floor that
            stops that, and the page root already carries `overflow-y-auto`, so
            a card that no longer fits scrolls rather than overlapping. */}
        <div className="flex flex-col gap-3">
          <div className="bg-white border border-[#d8d0b4] rounded-[14px] p-4 flex flex-col flex-1">
            <p className="text-[#17213a] font-bold text-base shrink-0">License distribution</p>
            <p className="text-[#667085] text-xs mt-0.5 shrink-0">Organisation-wide readiness</p>
            {/* `gap` guarantees the spacing that `justify-around` only provides
                when there happens to be room left over. */}
            <div className="flex flex-col justify-around flex-1 gap-2.5 mt-3">
              {distribution.map(d => (
                <div key={d.label}>
                  <div className="flex justify-between">
                    <p className="text-[#17213a] font-medium text-xs">{d.label}</p>
                    <p className="text-[#17213a] font-semibold text-xs">{d.count}</p>
                  </div>
                  <div className="h-2.5 rounded-full bg-[#f1eddf] mt-1.5">
                    <div className="h-2.5 rounded-full" style={{ width: `${d.pct}%`, backgroundColor: d.color }} />
                  </div>
                </div>
              ))}
            </div>
            <div className="h-px bg-[#d8d0b4] my-3 shrink-0" />
            <p className="text-gold font-semibold text-[10px] shrink-0">NEXT TRAINING COHORT</p>
            <p className="text-[#17213a] font-semibold text-sm mt-1 shrink-0">{cohortTraining?.title || 'Loading the training library…'}</p>
            <p className="text-[#667085] text-xs mt-0.5 shrink-0">24 employees · due 23 Jul</p>
            <button
              onClick={() => setAssignOpen(true)}
              disabled={!cohortTraining}
              className="bg-gold-brand hover:bg-gold text-navy-header font-semibold text-xs w-full h-10 rounded-full mt-3 cursor-pointer disabled:opacity-50 shrink-0"
            >
              Assign Training
            </button>
          </div>

          <div className="bg-[#eef2ff] rounded-[14px] p-4 shrink-0">
            <p className="text-[#365fd9] font-semibold text-[10px]">PEOPLE-FIRST GOVERNANCE</p>
            <p className="text-[#17213a] text-xs mt-1.5 leading-relaxed">
              Use alerts to guide learning and safer workflows—not to rank employee performance.
            </p>
            <p className="text-[#667085] text-[11px] mt-1.5">Directory shows employee IDs and role data only.</p>
          </div>
        </div>
      </div>

      {detail && <ProgressionModal employee={detail} onClose={() => setDetail(null)} />}
      {assignOpen && cohortTraining && <AssignModal training={cohortTraining} onCancel={() => setAssignOpen(false)} onAssigned={assign} />}
      {toastInfo && <InfoToast {...toastInfo} onClose={() => setToastInfo(null)} />}
    </div>
  )
}
