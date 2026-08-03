import { Outlet } from 'react-router-dom'
import AdminSidebar from './AdminSidebar.jsx'

// Admin stays desktop-first: at lg+ this is the original sidebar + main row.
// Below lg the sidebar stacks on top and main scrolls horizontally instead of
// pushing the viewport wide.
export default function AdminLayout() {
  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-[#f8f5ea]">
      <AdminSidebar />
      <main className="flex-1 px-4 lg:px-7 py-6 min-w-0 overflow-x-auto lg:overflow-x-visible">
        <Outlet />
      </main>
    </div>
  )
}
