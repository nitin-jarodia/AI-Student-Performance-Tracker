import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { metaForPath } from '../config/nav'
import { notificationsAPI } from '../services/api'

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

export default function Navbar() {
  const { pathname } = useLocation()
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const meta = metaForPath(pathname)

  const [open, setOpen] = useState(false)
  const [items, setItems] = useState([])
  const [unread, setUnread] = useState(0)
  const popRef = useRef(null)

  const fetchNotifications = async () => {
    if (!user) return
    try {
      const { data } = await notificationsAPI.list({ limit: 8 })
      setItems(data.notifications || [])
      setUnread(data.unread_count || 0)
    } catch (_) {
      // Silent: keep previous state (endpoint may be missing during first-time setup).
    }
  }

  useEffect(() => {
    fetchNotifications()
    const iv = setInterval(fetchNotifications, POLL_MS)
    return () => clearInterval(iv)
    
  }, [user?.email])

  useEffect(() => {
    if (!open) return
    const onClick = (e) => {
      if (popRef.current && !popRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const handleOpenItem = async (n) => {
    setOpen(false)
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

  return (
    <header className="no-print sticky top-0 z-40 flex items-center justify-between border-b border-slate-200/80 bg-white/90 px-6 py-4 shadow-soft backdrop-blur-md">
      <div>
        <h2 className="font-heading text-lg font-bold tracking-tight text-slate-900">
          {meta.title}
        </h2>
        {meta.subtitle && (
          <p className="mt-0.5 text-sm text-slate-500">{meta.subtitle}</p>
        )}
      </div>

      <div className="flex items-center gap-4">
        <time className="hidden text-sm text-slate-500 sm:block" dateTime={new Date().toISOString()}>
          {formatToday()}
        </time>

        <div className="relative" ref={popRef}>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="relative rounded-xl p-2 text-slate-400 transition-colors duration-200 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Notifications"
          >
            <span className="text-lg">🔔</span>
            {unread > 0 && (
              <span className="absolute right-0.5 top-0.5 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white ring-2 ring-white">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </button>

          {open && (
            <div className="absolute right-0 z-50 mt-2 w-80 rounded-2xl border border-slate-200 bg-white shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
                <p className="text-sm font-semibold text-slate-900">Notifications</p>
                <button
                  onClick={markAll}
                  className="text-xs font-semibold text-indigo-600 hover:underline"
                >
                  Mark all read
                </button>
              </div>
              <div className="max-h-80 overflow-y-auto">
                {items.length === 0 ? (
                  <p className="p-4 text-sm text-slate-500">You're all caught up.</p>
                ) : (
                  items.map((n) => (
                    <button
                      key={n.id}
                      onClick={() => handleOpenItem(n)}
                      className={`block w-full border-b border-slate-50 px-3 py-2 text-left last:border-none hover:bg-slate-50 ${
                        n.is_read ? '' : 'bg-indigo-50/40'
                      }`}
                    >
                      <p className="line-clamp-1 text-sm font-medium text-slate-900">{n.title}</p>
                      <p className="line-clamp-2 text-xs text-slate-500">{n.message}</p>
                      <p className="mt-0.5 text-[10px] uppercase tracking-wide text-slate-400">
                        {timeAgo(n.created_at)}
                      </p>
                    </button>
                  ))
                )}
              </div>
              <div className="border-t border-slate-100 px-3 py-2 text-center">
                <button
                  onClick={() => {
                    setOpen(false)
                    navigate('/notifications')
                  }}
                  className="text-xs font-semibold text-indigo-600 hover:underline"
                >
                  View all notifications
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="hidden h-8 w-px bg-slate-200 sm:block" />

        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-sm font-medium text-slate-800">
              {user?.full_name || 'Teacher'}
            </p>
            <span
              className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                user?.role === 'admin'
                  ? 'bg-amber-100 text-amber-900 ring-1 ring-amber-200'
                  : user?.role === 'student'
                    ? 'bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200'
                    : 'bg-slate-100 text-slate-600 ring-1 ring-slate-200'
              }`}
            >
              {user?.role || 'teacher'}
            </span>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-sky-500 font-heading text-sm font-bold text-white shadow-md">
            {(user?.full_name || 'T').charAt(0).toUpperCase()}
          </div>
        </div>

        <button
          type="button"
          onClick={async () => {
            await logout()
            navigate('/login')
          }}
          className="rounded-xl px-3 py-2 text-sm font-medium text-slate-500 transition-colors duration-200 hover:bg-slate-100 hover:text-red-600"
        >
          Log out
        </button>
      </div>
    </header>
  )
}
