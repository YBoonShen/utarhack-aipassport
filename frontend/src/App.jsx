import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import EmployeeHeader from './components/EmployeeHeader.jsx'
import AdminLayout from './components/AdminLayout.jsx'
import { NotificationsProvider } from './components/notificationsStore.jsx'
import License from './pages/License.jsx'
import Gateway from './pages/Gateway.jsx'
import Training from './pages/Training.jsx'
import TrainingQuiz from './pages/TrainingQuiz.jsx'
import TrainingResults from './pages/TrainingResults.jsx'
import Visas from './pages/Visas.jsx'
import Transparency from './pages/Transparency.jsx'
import AdminOverview from './pages/AdminOverview.jsx'
import Departments from './pages/admin/Departments.jsx'
import RiskAlerts from './pages/admin/RiskAlerts.jsx'
import AuditLog from './pages/admin/AuditLog.jsx'
import ToolApprovals from './pages/admin/ToolApprovals.jsx'
import Employees from './pages/admin/Employees.jsx'
import Settings from './pages/admin/Settings.jsx'

function EmployeeLayout({ children }) {
  return (
    <div className="min-h-screen bg-cream">
      <EmployeeHeader />
      {children}
    </div>
  )
}

export default function App() {
  return (
    <NotificationsProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/license" replace />} />
          <Route path="/license" element={<EmployeeLayout><License /></EmployeeLayout>} />
          <Route path="/gateway" element={<EmployeeLayout><Gateway /></EmployeeLayout>} />
          <Route path="/training" element={<EmployeeLayout><Training /></EmployeeLayout>} />
          <Route path="/training/quiz" element={<EmployeeLayout><TrainingQuiz /></EmployeeLayout>} />
          <Route path="/training/results" element={<EmployeeLayout><TrainingResults /></EmployeeLayout>} />
          <Route path="/visas" element={<EmployeeLayout><Visas /></EmployeeLayout>} />

          {/* Public — no employee header, reachable without login */}
          <Route path="/transparency" element={<Transparency />} />

          {/* Admin console — shared sidebar layout */}
          <Route path="/admin" element={<EmployeeLayout><AdminLayout /></EmployeeLayout>}>
            <Route index element={<AdminOverview />} />
            <Route path="departments" element={<Departments />} />
            <Route path="risk-alerts" element={<RiskAlerts />} />
            <Route path="audit-log" element={<AuditLog />} />
            <Route path="tool-approvals" element={<ToolApprovals />} />
            <Route path="employees" element={<Employees />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </NotificationsProvider>
  )
}
