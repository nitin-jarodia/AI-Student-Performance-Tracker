import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ToastProvider } from './context/ToastContext'
import ProtectedRoute from './components/ProtectedRoute'
import Dashboard from './pages/Dashboard'
import Students from './pages/Students'
import StudentDetail from './pages/StudentDetail'
import AddScores from './pages/AddScores'
import AttendancePage from './pages/Attendance'
import Reports from './pages/Reports'
import Analytics from './pages/Analytics'
import BulkUpload from './pages/BulkUpload'
import AuditLog from './pages/AuditLog'
import Settings from './pages/Settings'
import PortalView from './pages/PortalView'
import Login from './pages/Login'
import Chatbot from './pages/Chatbot'
import AcademicIntegrity from './pages/AcademicIntegrity'
import Scholarships from './pages/Scholarships'
import ReportBuilder from './pages/ReportBuilder'
import QRAttendance from './pages/QRAttendance'
import StudentScan from './pages/StudentScan'
import Subjects from './pages/Subjects'
import StudentDashboard from './pages/StudentDashboard'
import Messages from './pages/Messages'
import Notifications from './pages/Notifications'
import Alerts from './pages/Alerts'
import Unauthorized from './pages/Unauthorized'
import Navbar from './components/Navbar'
import Sidebar from './components/Sidebar'

function AppShell() {
  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Navbar />
        <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

function RoleHome() {
  const { user } = useAuth()
  if (user?.role === 'student') return <Navigate to="/student-dashboard" replace />
  return <Navigate to="/dashboard" replace />
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Router>
          <Routes>
            {/* Public */}
            <Route path="/login" element={<Login />} />
            <Route path="/scan" element={<StudentScan />} />
            <Route path="/portal/view" element={<PortalView />} />
            <Route path="/unauthorized" element={<Unauthorized />} />

            {/* Authenticated area */}
            <Route
              element={
                <ProtectedRoute>
                  <AppShell />
                </ProtectedRoute>
              }
            >
              <Route path="/" element={<RoleHome />} />

              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute roles={['admin', 'teacher']}>
                    <Dashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/student-dashboard"
                element={
                  <ProtectedRoute roles={['student']}>
                    <StudentDashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/my"
                element={
                  <ProtectedRoute roles={['student']}>
                    <StudentDashboard />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/students"
                element={
                  <ProtectedRoute roles={['admin', 'teacher']}>
                    <Students />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/students/:id"
                element={
                  <ProtectedRoute roles={['admin', 'teacher', 'student']}>
                    <StudentDetail />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/scores"
                element={
                  <ProtectedRoute roles={['admin', 'teacher']}>
                    <AddScores />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/bulk"
                element={
                  <ProtectedRoute roles={['admin', 'teacher']}>
                    <BulkUpload />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/attend"
                element={
                  <ProtectedRoute roles={['admin', 'teacher']}>
                    <AttendancePage />
                  </ProtectedRoute>
                }
              />

              <Route path="/subjects" element={<Subjects />} />
              <Route path="/messages" element={<Messages />} />
              <Route path="/messages/:id" element={<Messages />} />
              <Route path="/notifications" element={<Notifications />} />
              <Route
                path="/alerts"
                element={
                  <ProtectedRoute roles={['admin', 'teacher']}>
                    <Alerts />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/reports"
                element={
                  <ProtectedRoute roles={['admin', 'teacher']}>
                    <Reports />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/analytics"
                element={
                  <ProtectedRoute roles={['admin', 'teacher']}>
                    <Analytics />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/audit"
                element={
                  <ProtectedRoute roles={['admin']}>
                    <AuditLog />
                  </ProtectedRoute>
                }
              />
              <Route path="/settings" element={<Settings />} />
              <Route path="/assistant" element={<Chatbot />} />
              <Route
                path="/integrity"
                element={
                  <ProtectedRoute roles={['admin', 'teacher']}>
                    <AcademicIntegrity />
                  </ProtectedRoute>
                }
              />
              <Route path="/scholarships" element={<Scholarships />} />
              <Route
                path="/report-builder"
                element={
                  <ProtectedRoute roles={['admin', 'teacher']}>
                    <ReportBuilder />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/qr-attendance"
                element={
                  <ProtectedRoute roles={['admin', 'teacher']}>
                    <QRAttendance />
                  </ProtectedRoute>
                }
              />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Router>
      </ToastProvider>
    </AuthProvider>
  )
}
