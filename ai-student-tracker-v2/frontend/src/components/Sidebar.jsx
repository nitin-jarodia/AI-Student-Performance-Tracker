import { useEffect, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  LayoutDashboard,
  Users,
  BookOpen,
  ClipboardList,
  Upload,
  CalendarCheck,
  QrCode,
  FileText,
  FilePlus2,
  BarChart3,
  Bot,
  Shield,
  Trophy,
  MessageSquare,
  Bell,
  AlertCircle,
  Lock,
  Settings2,
  Home,
  BookMarked,
  Sparkles,
  GraduationCap,
  PanelLeftClose,
  PanelLeftOpen,
  LogOut,
  X,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import Tooltip from './ui/Tooltip'
import { cn } from '../lib/cn'

const teacherMenu = [
  { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', desc: 'Overview & KPIs' },
  { path: '/students', icon: Users, label: 'Students', desc: 'Directory & profiles' },
  { path: '/subjects', icon: BookOpen, label: 'Subjects', desc: 'Manage curriculum' },
  { path: '/scores', icon: ClipboardList, label: 'Add scores', desc: 'Multi-subject entry' },
  { path: '/bulk', icon: Upload, label: 'Bulk upload', desc: 'Upload 200+ scores' },
  { path: '/attend', icon: CalendarCheck, label: 'Attendance', desc: 'Daily roll call' },
  { path: '/qr-attendance', icon: QrCode, label: 'QR attendance', desc: 'Live scan roster' },
  { path: '/reports', icon: FileText, label: 'AI reports', desc: 'Narrative insights' },
  { path: '/report-builder', icon: FilePlus2, label: 'Report builder', desc: 'Custom PDF blocks' },
  { path: '/analytics', icon: BarChart3, label: 'Analytics', desc: 'Charts & tables' },
  { path: '/assistant', icon: Bot, label: 'AI assistant', desc: 'Chat with your data' },
  { path: '/integrity', icon: Shield, label: 'Integrity', desc: 'Cheating risk review' },
  { path: '/scholarships', icon: Trophy, label: 'Scholarships', desc: 'Eligibility schemes' },
  { path: '/messages', icon: MessageSquare, label: 'Messages', desc: 'Chat with students' },
  { path: '/notifications', icon: Bell, label: 'Notifications', desc: 'Inbox' },
  { path: '/alerts', icon: AlertCircle, label: 'Alert history', desc: 'Email/SMS log' },
]

const adminExtras = [
  { path: '/audit', icon: Lock, label: 'Audit log', desc: 'Compliance events' },
  { path: '/settings', icon: Settings2, label: 'ML & registry', desc: 'Train models' },
]

const studentMenu = [
  { path: '/student-dashboard', icon: Home, label: 'My dashboard', desc: 'Your snapshot' },
  { path: '/subjects', icon: BookMarked, label: 'My subjects', desc: 'Enrolled courses' },
  { path: '/messages', icon: MessageSquare, label: 'Messages', desc: 'Contact teachers' },
  { path: '/notifications', icon: Bell, label: 'Notifications', desc: 'Inbox' },
  { path: '/assistant', icon: Sparkles, label: 'Study helper', desc: 'AI Q&A' },
  { path: '/scholarships', icon: Trophy, label: 'Scholarships', desc: 'Opportunities' },
]

function menuFor(role) {
  if (role === 'student') return studentMenu
  if (role === 'admin') return [...teacherMenu, ...adminExtras]
  return teacherMenu
}

const ROLE_BADGE = {
  admin: 'bg-amber-400/20 text-amber-200 ring-1 ring-amber-300/30',
  teacher: 'bg-blue-400/20 text-blue-200 ring-1 ring-blue-300/30',
  student: 'bg-emerald-400/20 text-emerald-200 ring-1 ring-emerald-300/30',
}

function SidebarInner({ collapsed, onToggleCollapse, onCloseMobile, mobile = false }) {
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
    <div className="flex h-full flex-col bg-sidebar-gradient text-white">
      {/* Brand */}
      <div
        className={cn(
          'flex items-center border-b border-white/10 px-4 py-5',
          collapsed ? 'justify-center' : 'gap-3',
        )}
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-400 to-cyan-400 text-slate-900 shadow-glow-sm">
          <GraduationCap className="h-5 w-5" aria-hidden="true" />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate text-sm font-bold leading-tight">AI Student Tracker</p>
            <p className="truncate text-xs text-slate-300">Performance & risk insights</p>
          </div>
        )}
        {mobile && (
          <button
            type="button"
            onClick={onCloseMobile}
            className="ml-auto rounded-lg p-1.5 text-slate-300 hover:bg-white/10 hover:text-white"
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* User card */}
      <div className="border-b border-white/10 p-3">
        <div
          className={cn(
            'flex items-center gap-3 rounded-xl bg-white/5 p-3',
            collapsed && 'justify-center p-2',
          )}
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-400 to-brand-500 text-xs font-bold text-white shadow-inner-glow">
            {initials}
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">
                {user?.full_name || (role === 'student' ? 'Student' : 'Teacher')}
              </p>
              <p className="truncate text-xs text-slate-300">{user?.email || '—'}</p>
              <span
                className={cn(
                  'mt-1 inline-block rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                  ROLE_BADGE[role] || ROLE_BADGE.teacher,
                )}
              >
                {role}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
        {items.map((item) => {
          const Icon = item.icon
          const active = isActivePath(item.path)
          const link = (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              onClick={() => mobile && onCloseMobile?.()}
              className={cn(
                'sidebar-link',
                active ? 'sidebar-link-active' : 'sidebar-link-idle',
                collapsed && 'justify-center px-2',
              )}
              aria-label={item.label}
            >
              {active && (
                <motion.span
                  layoutId="sidebar-active-pill"
                  className="absolute inset-0 rounded-xl bg-white/15 shadow-inner-glow"
                  transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                />
              )}
              <span className="relative z-10 flex shrink-0 items-center">
                <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
              </span>
              {!collapsed && (
                <div className="relative z-10 min-w-0 flex-1">
                  <p className="truncate font-semibold">{item.label}</p>
                  <p className="truncate text-[11px] text-slate-300/80">{item.desc}</p>
                </div>
              )}
            </NavLink>
          )

          return collapsed ? (
            <Tooltip key={item.path} content={item.label} side="right">
              {link}
            </Tooltip>
          ) : (
            link
          )
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-white/10 p-3">
        <button
          type="button"
          onClick={handleLogout}
          className={cn(
            'sidebar-link sidebar-link-idle w-full',
            collapsed && 'justify-center px-2',
          )}
          aria-label="Log out"
        >
          <LogOut className="h-[18px] w-[18px]" aria-hidden="true" />
          {!collapsed && <span className="font-semibold">Log out</span>}
        </button>

        {!mobile && (
          <button
            type="button"
            onClick={onToggleCollapse}
            className={cn(
              'mt-2 flex w-full items-center gap-3 rounded-xl px-3 py-2 text-xs font-semibold text-slate-300 transition-colors hover:bg-white/10 hover:text-white',
              collapsed && 'justify-center px-2',
            )}
          >
            {collapsed ? (
              <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />
            ) : (
              <>
                <PanelLeftClose className="h-4 w-4" aria-hidden="true" />
                <span>Collapse</span>
              </>
            )}
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * Primary desktop/mobile aware sidebar.
 * Desktop (lg+): fixed collapsible aside.
 * Mobile: hidden — rendered as drawer via MobileSidebar in App shell.
 */
export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('sidebar_collapsed') === '1'
    } catch {
      return false
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem('sidebar_collapsed', collapsed ? '1' : '0')
    } catch {}
  }, [collapsed])

  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? 72 : 260 }}
      transition={{ type: 'spring', stiffness: 320, damping: 30 }}
      className="no-print sticky top-0 hidden h-screen shrink-0 overflow-hidden shadow-xl lg:block"
    >
      <SidebarInner
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((v) => !v)}
      />
    </motion.aside>
  )
}

/** Mobile drawer variant. */
export function MobileSidebar({ open, onClose }) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            initial={{ x: -280 }}
            animate={{ x: 0 }}
            exit={{ x: -280 }}
            transition={{ type: 'spring', stiffness: 340, damping: 32 }}
            className="fixed inset-y-0 left-0 z-50 w-[260px] overflow-hidden shadow-2xl lg:hidden"
          >
            <SidebarInner collapsed={false} onCloseMobile={onClose} mobile />
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}
