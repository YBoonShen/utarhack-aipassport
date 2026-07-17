import { Outlet } from 'react-router-dom'
import AdminSidebar from './AdminSidebar.jsx'

export default function AdminLayout() {
  return (
    <div className="flex min-h-screen bg-[#f8f5ea]">
      <AdminSidebar />
      <main className="flex-1 px-7 py-6 min-w-0">
        <Outlet />
      </main>
    </div>
  )
}
