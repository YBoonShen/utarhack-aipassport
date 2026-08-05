// The top-left "back to …" control.
//
// These were plain text with an arrow, which read as a caption rather than
// something you could press. They are now a quiet bordered pill in the existing
// sand/cream palette — the same shape as the app's other secondary actions, one
// step lighter so it stays subordinate to the page title beneath it. Nothing
// about position, wording or destination changes.
import { Link } from 'react-router-dom'

const CLASS =
  'inline-flex items-center gap-2 h-10 px-4 rounded-full border border-[#d8d0b4] bg-[#fffefa] ' +
  'text-[#667085] text-[13px] font-semibold hover:bg-chip hover:text-navy-header hover:border-navy-header/40 ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-header transition-colors'

export default function BackLink({ to, children, className = '' }) {
  return (
    <Link to={to} className={`${CLASS} ${className}`}>
      <span aria-hidden="true">←</span>
      {children}
    </Link>
  )
}
