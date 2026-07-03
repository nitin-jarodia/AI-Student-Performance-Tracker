import { useState } from 'react'
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  Outlet,
  useLocation,
} from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ToastProvider } from './context/ToastContext'
import { ThemeProvider, useTheme } from './context/ThemeContext'
import ProtectedRoute from './components/ProtectedRoute'
import ErrorBoundary from './components/ui/ErrorBoundary'
import RouteProgress from './components/RouteProgress'
import Navbar from './components/Navbar'
import Sidebar, { MobileSidebar } from './components/Sidebar'
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

const pageVariants = {
  initial: { opacity: 0, y: 12 },
  in: { opacity: 1, y: 0 },
  out: { opacity: 0, y: -8 },
}

const pageTransition = {
  duration: 0.25,
  ease: [0.16, 1, 0.3, 1],
}

function AnimatedOutlet() {
  const location = useLocation()
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        initial="initial"
        animate="in"
        exit="out"
        variants={pageVariants}
        transition={pageTransition}
        className="h-full"
      >
        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
      </motion.div>
    </AnimatePresence>
  )
}

function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false)
  return (
    <div className="flex min-h-screen bg-surface-secondary dark:bg-surface-dark">
      <Sidebar />
      <MobileSidebar open={mobileOpen} onClose={() => setMobileOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Navbar onOpenMobileMenu={() => setMobileOpen(true)} />
        <main className="flex-1 overflow-x-hidden px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <AnimatedOutlet />
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

function ThemedToaster() {
  const { isDark } = useTheme()
  return (
    <Toaster
      position="bottom-right"
      toastOptions={{
        duration: 3500,
        className: 'toast-rounded',
        style: {
          background: isDark ? '#1e293b' : '#ffffff',
          color: isDark ? '#f1f5f9' : '#0f172a',
          border: isDark ? '1px solid #334155' : '1px solid #e2e8f0',
        },
        success: {
          iconTheme: { primary: '#10b981', secondary: '#fff' },
        },
        error: {
          iconTheme: { primary: '#ef4444', secondary: '#fff' },
        },
      }}
    />
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ToastProvider>
          <Router>
            <RouteProgress />
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
          <ThemedToaster />
        </ToastProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}
