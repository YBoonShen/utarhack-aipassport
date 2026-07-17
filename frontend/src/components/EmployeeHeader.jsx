import { NavLink } from 'react-router-dom'

const linkClass = ({ isActive }) =>
  isActive ? 'text-gold font-bold' : 'text-slate-300 hover:text-white'

export default function EmployeeHeader() {
  return (
    <header className="bg-navy px-10 h-20 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-full border-2 border-gold flex items-center justify-center text-gold font-bold">✈</div>
        <div>
          <p className="text-white font-bold tracking-[0.15em]">AI PASSPORT</p>
          <p className="text-gold text-[10px] tracking-[0.12em]">SAFE AI FOR EVERY EMPLOYEE</p>
        </div>
      </div>
      <nav className="flex items-center gap-8 text-sm">
        <NavLink to="/license" className={linkClass}>My License</NavLink>
        <NavLink to="/training" className={linkClass}>Training</NavLink>
        <NavLink to="/visas" className={linkClass}>My Visas</NavLink>
        <NavLink to="/gateway" className={linkClass}>Smart Gateway</NavLink>
        <NavLink to="/admin" className={linkClass}>Admin</NavLink>
      </nav>
      <div className="w-10 h-10 rounded-full bg-gold flex items-center justify-center text-navy font-bold text-sm">JY</div>
    </header>
  )
}
