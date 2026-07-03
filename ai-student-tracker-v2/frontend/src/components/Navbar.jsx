import { Fragment, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import * as Dialog from '@radix-ui/react-dialog'
import {
  Bell,
  Search,
  Sun,
  Moon,
  User as UserIcon,
  Settings,
  LogOut,
  Menu,
  ChevronRight,
  Command as CommandIcon,
  X,
  ArrowRight,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { metaForPath, ROUTE_META } from '../config/nav'
import { notificationsAPI } from '../services/api'
import { cn } from '../lib/cn'

const POLL_MS = 20000

function formatToday() {
  return new Intl.DateTimeFormat('en', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date())
}

function timeAgo(iso) {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const diff = Math.max(0, Date.now() - then)
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

function Breadcrumbs({ meta, pathname }) {
  const segments = pathname.split('/').filter(Boolean)
  if (!segments.length) return null
  return (
    <nav
      aria-label="Breadcrumb"
      className="hidden items-center gap-1 text-xs text-slate-500 md:flex dark:text-slate-400"
    >
      <Link to="/" className="hover:text-slate-700 dark:hover:text-slate-200">
        Home
      </Link>
      <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
      <span className="font-semibold text-slate-700 dark:text-slate-200">
        {meta.title}
      </span>
    </nav>
  )
}

function ThemeToggle() {
  const { isDark, toggleTheme } = useTheme()
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label="Toggle color mode"
      className="relative flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
    >
      <AnimatePresence mode="wait" initial={false}>
        {isDark ? (
          <motion.span
            key="moon"
            initial={{ rotate: -60, opacity: 0 }}
            animate={{ rotate: 0, opacity: 1 }}
            exit={{ rotate: 60, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="absolute"
          >
            <Moon className="h-[18px] w-[18px]" aria-hidden="true" />
          </motion.span>
        ) : (
          <motion.span
            key="sun"
            initial={{ rotate: 60, opacity: 0 }}
            animate={{ rotate: 0, opacity: 1 }}
            exit={{ rotate: -60, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="absolute"
          >
            <Sun className="h-[18px] w-[18px]" aria-hidden="true" />
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  )
}

function CommandPalette({ open, onOpenChange }) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')

  const routes = Object.entries(ROUTE_META)
    .filter(([p]) => p !== '/' && p !== '/unauthorized')
    .map(([path, meta]) => ({ path, ...meta }))

  const filtered = query
    ? routes.filter(
        (r) =>
          r.title.toLowerCase().includes(query.toLowerCase()) ||
          (r.subtitle || '').toLowerCase().includes(query.toLowerCase()),
      )
    : routes.slice(0, 8)

  const go = (path) => {
    onOpenChange(false)
    setQuery('')
    navigate(path)
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild>
              <motion.div
                className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              />
            </Dialog.Overlay>
            <Dialog.Content asChild>
              <motion.div
                initial={{ opacity: 0, y: -8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.98 }}
                transition={{ duration: 0.18 }}
                className="fixed left-1/2 top-[14vh] z-50 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl focus:outline-none dark:border-slate-700 dark:bg-slate-900"
              >
                <div className="flex items-center gap-3 border-b border-slate-100 px-4 dark:border-slate-700">
                  <Search
                    className="h-5 w-5 text-slate-400"
                    aria-hidden="true"
                  />
                  <input
                    autoFocus
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search pages, students, reports…"
                    className="w-full bg-transparent py-4 text-sm text-slate-800 placeholder-slate-400 focus:outline-none dark:text-slate-100"
                  />
                  <kbd className="hidden rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 md:inline-block dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400">
                    ESC
                  </kbd>
                </div>
                <div className="max-h-80 overflow-y-auto p-2">
                  {filtered.length === 0 ? (
                    <p className="px-3 py-6 text-center text-sm text-slate-500">
                      No pages match “{query}”
                    </p>
                  ) : (
                    filtered.map((r) => (
                      <button
                        key={r.path}
                        type="button"
                        onClick={() => go(r.path)}
                        className="group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-brand-50 dark:hover:bg-slate-800"
                      >
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-100 text-brand-600 dark:bg-brand-900/40 dark:text-brand-300">
                          <CommandIcon className="h-4 w-4" aria-hidden="true" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                            {r.title}
                          </p>
                          {r.subtitle && (
                            <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                              {r.subtitle}
                            </p>
                          )}
                        </div>
                        <ArrowRight
                          className="h-4 w-4 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-500"
                          aria-hidden="true"
                        />
                      </button>
                    ))
                  )}
                </div>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  )
}

export default function Navbar({ onOpenMobileMenu }) {
  const { pathname } = useLocation()
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const meta = metaForPath(pathname)

  const [popOpen, setPopOpen] = useState(false)
  const [items, setItems] = useState([])
  const [unread, setUnread] = useState(0)
  const [searchOpen, setSearchOpen] = useState(false)
  const popRef = useRef(null)

  const role = (user?.role || 'teacher').toLowerCase()
  const initials = (user?.full_name || 'T').charAt(0).toUpperCase()

  const fetchNotifications = async () => {
    if (!user) return
    try {
      const { data } = await notificationsAPI.list({ limit: 8 })
      setItems(data.notifications || [])
      setUnread(data.unread_count || 0)
    } catch (_) {
      // Silent.
    }
  }

  useEffect(() => {
    fetchNotifications()
    const iv = setInterval(fetchNotifications, POLL_MS)
    return () => clearInterval(iv)
  }, [user?.email])

  useEffect(() => {
    if (!popOpen) return
    const onClick = (e) => {
      if (popRef.current && !popRef.current.contains(e.target)) setPopOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [popOpen])

  // Cmd/Ctrl+K global shortcut
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearchOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const handleOpenItem = async (n) => {
    setPopOpen(false)
    if (!n.is_read) {
      try {
        await notificationsAPI.markRead(n.id)
        fetchNotifications()
      } catch (_) {}
    }
    navigate(n.link || '/notifications')
  }

  const markAll = async () => {
    try {
      await notificationsAPI.markAllRead()
      fetchNotifications()
    } catch (_) {}
  }

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  const roleBadgeCls = {
    admin: 'bg-amber-100 text-amber-800 ring-1 ring-amber-200',
    teacher: 'bg-blue-100 text-blue-800 ring-1 ring-blue-200',
    student: 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200',
  }[role] || 'bg-slate-100 text-slate-700 ring-1 ring-slate-200'

  return (
    <Fragment>
      <header className="no-print sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-slate-200/80 bg-white/80 px-4 py-3 shadow-soft backdrop-blur-md sm:px-6 dark:border-slate-700/70 dark:bg-slate-900/80">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onOpenMobileMenu}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 lg:hidden dark:text-slate-400 dark:hover:bg-slate-800"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>

          <div className="min-w-0">
            <AnimatePresence mode="wait">
              <motion.h2
                key={meta.title}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                transition={{ duration: 0.18 }}
                className="truncate text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100"
              >
                {meta.title}
              </motion.h2>
            </AnimatePresence>
            <div className="mt-0.5 flex items-center gap-2">
              <Breadcrumbs meta={meta} pathname={pathname} />
              {meta.subtitle && (
                <p className="hidden truncate text-xs text-slate-400 md:inline-block dark:text-slate-500">
                  · {meta.subtitle}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Search */}
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="hidden items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-500 shadow-soft transition-all hover:border-slate-300 hover:text-slate-700 md:flex dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
            aria-label="Open search"
          >
            <Search className="h-4 w-4" aria-hidden="true" />
            <span className="hidden md:inline">Search…</span>
            <kbd className="ml-4 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-400">
              ⌘K
            </kbd>
          </button>

          {/* Mobile search icon */}
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-700 md:hidden dark:text-slate-400 dark:hover:bg-slate-800"
            aria-label="Search"
          >
            <Search className="h-4 w-4" aria-hidden="true" />
          </button>

          <time
            className="hidden text-xs font-medium text-slate-500 xl:block dark:text-slate-400"
            dateTime={new Date().toISOString()}
          >
            {formatToday()}
          </time>

          <ThemeToggle />

          {/* Notifications bell */}
          <div className="relative" ref={popRef}>
            <button
              type="button"
              onClick={() => setPopOpen((v) => !v)}
              className="relative flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
              aria-label="Notifications"
            >
              <Bell className="h-[18px] w-[18px]" aria-hidden="true" />
              <AnimatePresence>
                {unread > 0 && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 18 }}
                    className="absolute right-1 top-1 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white ring-2 ring-white dark:ring-slate-900"
                  >
                    {unread > 9 ? '9+' : unread}
                  </motion.span>
                )}
              </AnimatePresence>
            </button>

            <AnimatePresence>
              {popOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -6, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.96 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card dark:border-slate-700 dark:bg-slate-800"
                >
                  <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5 dark:border-slate-700">
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      Notifications
                    </p>
                    <button
                      onClick={markAll}
                      className="text-xs font-semibold text-brand-600 hover:underline dark:text-brand-400"
                    >
                      Mark all read
                    </button>
                  </div>
                  <div className="max-h-80 overflow-y-auto">
                    {items.length === 0 ? (
                      <p className="p-5 text-center text-sm text-slate-500">
                        You’re all caught up.
                      </p>
                    ) : (
                      items.map((n) => (
                        <button
                          key={n.id}
                          onClick={() => handleOpenItem(n)}
                          className={cn(
                            'block w-full border-b border-slate-50 px-4 py-2.5 text-left last:border-none hover:bg-slate-50 dark:border-slate-700/50 dark:hover:bg-slate-700/40',
                            !n.is_read && 'bg-brand-50/50 dark:bg-brand-900/10',
                          )}
                        >
                          <p className="line-clamp-1 text-sm font-medium text-slate-900 dark:text-slate-100">
                            {n.title}
                          </p>
                          <p className="line-clamp-2 text-xs text-slate-500 dark:text-slate-400">
                            {n.message}
                          </p>
                          <p className="mt-0.5 text-[10px] uppercase tracking-wide text-slate-400">
                            {timeAgo(n.created_at)}
                          </p>
                        </button>
                      ))
                    )}
                  </div>
                  <div className="border-t border-slate-100 px-4 py-2 text-center dark:border-slate-700">
                    <button
                      onClick={() => {
                        setPopOpen(false)
                        navigate('/notifications')
                      }}
                      className="text-xs font-semibold text-brand-600 hover:underline dark:text-brand-400"
                    >
                      View all notifications
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Avatar dropdown */}
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                type="button"
                className="flex items-center gap-2 rounded-xl p-1 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Account menu"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-cyan-500 text-sm font-bold text-white shadow-glow-sm">
                  {initials}
                </div>
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="end"
                sideOffset={8}
                className="z-50 w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-card will-change-[opacity,transform] data-[state=open]:animate-fade-in dark:border-slate-700 dark:bg-slate-800"
              >
                <div className="flex items-center gap-3 p-2.5">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-cyan-500 text-sm font-bold text-white">
                    {initials}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {user?.full_name || 'User'}
                    </p>
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                      {user?.email || '—'}
                    </p>
                    <span
                      className={cn(
                        'mt-1 inline-block rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide',
                        roleBadgeCls,
                      )}
                    >
                      {role}
                    </span>
                  </div>
                </div>
                <DropdownMenu.Separator className="my-1 h-px bg-slate-100 dark:bg-slate-700" />

                <DropdownMenu.Item
                  onSelect={() => navigate('/settings')}
                  className="flex cursor-pointer select-none items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-slate-700 outline-none data-[highlighted]:bg-slate-100 dark:text-slate-200 dark:data-[highlighted]:bg-slate-700"
                >
                  <UserIcon className="h-4 w-4" aria-hidden="true" />
                  Profile
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  onSelect={() => navigate('/settings')}
                  className="flex cursor-pointer select-none items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-slate-700 outline-none data-[highlighted]:bg-slate-100 dark:text-slate-200 dark:data-[highlighted]:bg-slate-700"
                >
                  <Settings className="h-4 w-4" aria-hidden="true" />
                  Settings
                </DropdownMenu.Item>

                <DropdownMenu.Separator className="my-1 h-px bg-slate-100 dark:bg-slate-700" />

                <DropdownMenu.Item
                  onSelect={handleLogout}
                  className="flex cursor-pointer select-none items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-semibold text-red-600 outline-none data-[highlighted]:bg-red-50 dark:text-red-400 dark:data-[highlighted]:bg-red-900/30"
                >
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                  Log out
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </header>

      <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} />
    </Fragment>
  )
}
