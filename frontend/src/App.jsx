import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import EmployeeHeader from './components/EmployeeHeader.jsx'
import AdminLayout from './components/AdminLayout.jsx'
import { NotificationsProvider } from './components/notificationsStore.jsx'
import { currentUser } from './lib/api.js'
import Auth from './pages/Auth.jsx'
import License from './pages/License.jsx'
import Gateway from './pages/Gateway.jsx'
import Training from './pages/Training.jsx'
import TrainingQuiz from './pages/TrainingQuiz.jsx'
import TrainingResults from './pages/TrainingResults.jsx'
import Visas from './pages/Visas.jsx'
import Notifications from './pages/Notifications.jsx'
import Transparency from './pages/Transparency.jsx'
import Extension from './pages/Extension.jsx'
import AdminOverview from './pages/AdminOverview.jsx'
import Departments from './pages/admin/Departments.jsx'
import RiskAlerts from './pages/admin/RiskAlerts.jsx'
import AuditLog from './pages/admin/AuditLog.jsx'
import ToolApprovals from './pages/admin/ToolApprovals.jsx'
import Employees from './pages/admin/Employees.jsx'
import Settings from './pages/admin/Settings.jsx'

function RequireRole({ role, children }) {
  const user = currentUser()
  if (!user) return <Navigate to="/login" replace />
  if (role && user.role !== role) return <Navigate to={user.role === 'admin' ? '/admin' : '/license'} replace />
  return children
}

function HomeRedirect() {
  const user = currentUser()
  if (!user) return <Navigate to="/login" replace />
  return <Navigate to={user.role === 'admin' ? '/admin' : '/license'} replace />
}

function EmployeePage({ children }) {
  return (
    <RequireRole role="employee">
      <div className="min-h-screen bg-cream">
        <EmployeeHeader />
        {children}
      </div>
    </RequireRole>
  )
}

export default function App() {
  return (
    <NotificationsProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomeRedirect />} />
          <Route path="/login" element={<Auth />} />

          {/* Employee side */}
          <Route path="/license" element={<EmployeePage><License /></EmployeePage>} />
          <Route path="/gateway" element={<EmployeePage><Gateway /></EmployeePage>} />
          <Route path="/training" element={<EmployeePage><Training /></EmployeePage>} />
          <Route path="/training/quiz" element={<EmployeePage><TrainingQuiz /></EmployeePage>} />
          <Route path="/training/results" element={<EmployeePage><TrainingResults /></EmployeePage>} />
          <Route path="/visas" element={<EmployeePage><Visas /></EmployeePage>} />
          <Route path="/notifications" element={<EmployeePage><Notifications /></EmployeePage>} />

          {/* Public — no login required */}
          <Route path="/transparency" element={<Transparency />} />
          <Route path="/extension" element={<Extension />} />

          {/* Admin console — separate full-screen layout */}
          <Route path="/admin" element={<RequireRole role="admin"><AdminLayout /></RequireRole>}>
            <Route index element={<AdminOverview />} />
            <Route path="departments" element={<Departments />} />
            <Route path="risk-alerts" element={<RiskAlerts />} />
            <Route path="audit-log" element={<AuditLog />} />
            <Route path="tool-approvals" element={<ToolApprovals />} />
            <Route path="employees" element={<Employees />} />
            <Route path="settings" element={<Settings />} />
          </Route>

          <Route path="*" element={<HomeRedirect />} />
        </Routes>
      </BrowserRouter>
    </NotificationsProvider>
  )
}
