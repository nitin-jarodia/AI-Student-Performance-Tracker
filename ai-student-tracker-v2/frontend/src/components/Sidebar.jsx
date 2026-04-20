import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const teacherMenu = [
  { path: '/dashboard', icon: '📊', label: 'Dashboard', desc: 'Overview & KPIs' },
  { path: '/students', icon: '🎓', label: 'Students', desc: 'Directory & profiles' },
  { path: '/subjects', icon: '📘', label: 'Subjects', desc: 'Manage curriculum' },
  { path: '/scores', icon: '📝', label: 'Add scores', desc: 'Multi-subject entry' },
  { path: '/bulk', icon: '📤', label: 'Bulk Upload', desc: 'Upload 200+ scores' },
  { path: '/attend', icon: '📅', label: 'Attendance', desc: 'Daily roll call' },
  { path: '/qr-attendance', icon: '📷', label: 'QR attendance', desc: 'Live scan roster' },
  { path: '/reports', icon: '📋', label: 'AI reports', desc: 'Narrative insights' },
  { path: '/report-builder', icon: '📑', label: 'Report builder', desc: 'Custom PDF blocks' },
  { path: '/analytics', icon: '📈', label: 'Analytics', desc: 'Charts & tables' },
  { path: '/assistant', icon: '💬', label: 'AI assistant', desc: 'Chat with your data' },
  { path: '/integrity', icon: '🛡', label: 'Integrity', desc: 'Cheating risk review' },
  { path: '/scholarships', icon: '🏆', label: 'Scholarships', desc: 'Eligibility schemes' },
  { path: '/messages', icon: '✉️', label: 'Messages', desc: 'Chat with students' },
  { path: '/notifications', icon: '🔔', label: 'Notifications', desc: 'Inbox' },
  { path: '/alerts', icon: '📣', label: 'Alert history', desc: 'Email/SMS log' },
]

const adminExtras = [
  { path: '/audit', icon: '🔒', label: 'Audit Log', desc: 'Compliance events' },
  { path: '/settings', icon: '⚙️', label: 'ML & registry', desc: 'Train models' },
]

const studentMenu = [
  { path: '/student-dashboard', icon: '🏠', label: 'My dashboard', desc: 'Your snapshot' },
  { path: '/subjects', icon: '📘', label: 'My subjects', desc: 'Enrolled courses' },
  { path: '/messages', icon: '✉️', label: 'Messages', desc: 'Contact teachers' },
  { path: '/notifications', icon: '🔔', label: 'Notifications', desc: 'Inbox' },
  { path: '/assistant', icon: '💬', label: 'Study helper', desc: 'AI Q&A' },
  { path: '/scholarships', icon: '🏆', label: 'Scholarships', desc: 'Opportunities' },
]

function menuFor(role) {
  if (role === 'student') return studentMenu
  if (role === 'admin') return [...teacherMenu, ...adminExtras]
  return teacherMenu
}

export default function Sidebar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const role = (user?.role || 'teacher').toLowerCase()
  const items = menuFor(role)
  const initials = (user?.full_name || user?.email || (role === 'student' ? 'S' : 'T'))
    .trim()
    .charAt(0)
    .toUpperCase()

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  const isActivePath = (path) => {
    if (path === '/') return pathname === '/'
    return pathname === path || pathname.startsWith(`${path}/`)
  }

  return (
    <aside className="no-print flex w-72 shrink-0 flex-col bg-gradient-to-b from-indigo-700 via-indigo-800 to-slate-900 text-white shadow-xl">
      <div className="border-b border-white/10 p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-white to-indigo-100 text-xl shadow-lg">
            🎓
          </div>
          <div>
            <p className="font-heading text-sm font-bold leading-tight text-white">
              AI Student Tracker
            </p>
            <p className="text-xs text-indigo-200">Performance & risk insights</p>
          </div>
        </div>
      </div>

      <div className="border-b border-white/10 p-4">
        <div className="flex items-center gap-3 rounded-2xl bg-white/5 p-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-sky-400 to-indigo-500 text-sm font-bold text-white">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">
              {user?.full_name || (role === 'student' ? 'Student' : 'Teacher')}
            </p>
            <p className="truncate text-xs text-indigo-200">{user?.email || '—'}</p>
            <span className="mt-1 inline-block rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-100">
              {role}
            </span>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            title="Log out"
            className="rounded-lg bg-white/5 px-2 py-1 text-[11px] font-semibold text-indigo-100 transition-colors hover:bg-white/15"
          >
            Log out
          </button>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-4">
        {items.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            className={() =>
              `sidebar-link ${isActivePath(item.path) ? 'sidebar-link-active' : 'sidebar-link-idle'}`
            }
          >
            <span className="text-xl leading-none">{item.icon}</span>
            <div className="min-w-0 flex-1">
              <p className="font-heading font-semibold">{item.label}</p>
              <p className="mt-0.5 text-xs text-indigo-100/70">{item.desc}</p>
            </div>
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-white/10 p-4">
        <p className="mb-2 text-center text-[10px] font-semibold uppercase tracking-wider text-indigo-300">
          Stack
        </p>
        <div className="flex flex-wrap justify-center gap-1">
          {['React', 'Vite', 'FastAPI', 'PostgreSQL', 'JWT', 'ML'].map((t) => (
            <span
              key={t}
              className="rounded-full bg-black/20 px-2 py-0.5 text-[10px] font-medium text-indigo-100"
            >
              {t}
            </span>
          ))}
        </div>
      </div>
    </aside>
  )
}
