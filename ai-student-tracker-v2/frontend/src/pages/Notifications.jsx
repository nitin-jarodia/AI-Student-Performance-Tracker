import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Bell,
  CheckCheck,
  Info,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Trash2,
  BellOff,
} from 'lucide-react'
import { notificationsAPI, formatAxiosError } from '../services/api'
import { useToast } from '../context/ToastContext'
import EmptyState from '../components/ui/EmptyState'
import { Skeleton } from '../components/ui/Skeleton'
import { cn } from '../lib/cn'

const TABS = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'system', label: 'System' },
  { id: 'alerts', label: 'Alerts' },
]

function iconForType(type = '') {
  const t = type.toLowerCase()
  if (t.includes('error') || t.includes('fail')) {
    return { Icon: AlertCircle, color: 'text-red-600 bg-red-50 dark:bg-red-900/30' }
  }
  if (t.includes('warn') || t.includes('alert')) {
    return {
      Icon: AlertTriangle,
      color: 'text-amber-600 bg-amber-50 dark:bg-amber-900/30',
    }
  }
  if (t.includes('success')) {
    return {
      Icon: CheckCircle2,
      color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30',
    }
  }
  return { Icon: Info, color: 'text-brand-600 bg-brand-50 dark:bg-brand-900/30' }
}

function groupByDate(items) {
  const today = []
  const yesterday = []
  const earlier = []
  const now = new Date()
  const todayStr = now.toDateString()
  const yDate = new Date(now)
  yDate.setDate(yDate.getDate() - 1)
  const yStr = yDate.toDateString()

  items.forEach((n) => {
    const d = new Date(n.created_at)
    if (!Number.isFinite(d.getTime())) {
      earlier.push(n)
      return
    }
    const s = d.toDateString()
    if (s === todayStr) today.push(n)
    else if (s === yStr) yesterday.push(n)
    else earlier.push(n)
  })
  return { today, yesterday, earlier }
}

function timeAgo(iso) {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const diff = Math.max(0, Date.now() - then)
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

export default function NotificationsPage() {
  const { showToast } = useToast()
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [unread, setUnread] = useState(0)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('all')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await notificationsAPI.list({
        unread_only: tab === 'unread',
      })
      setItems(data.notifications || [])
      setUnread(data.unread_count || 0)
    } catch (err) {
      showToast(formatAxiosError(err, 'Failed to load notifications'), 'error')
    } finally {
      setLoading(false)
    }
  }, [tab, showToast])

  useEffect(() => {
    load()
  }, [load])

  const filtered = useMemo(() => {
    if (tab === 'system')
      return items.filter((n) => (n.type || '').toLowerCase().includes('system'))
    if (tab === 'alerts')
      return items.filter((n) => {
        const t = (n.type || '').toLowerCase()
        return t.includes('warn') || t.includes('alert') || t.includes('error')
      })
    return items
  }, [items, tab])

  const grouped = useMemo(() => groupByDate(filtered), [filtered])

  const handleOpen = async (n) => {
    if (!n.is_read) {
      try {
        await notificationsAPI.markRead(n.id)
      } catch (_) {}
    }
    if (n.link) navigate(n.link)
    else load()
  }

  const markAll = async () => {
    try {
      await notificationsAPI.markAllRead()
      showToast('All notifications marked as read', 'success')
      load()
    } catch (err) {
      showToast(formatAxiosError(err, 'Failed to update notifications'), 'error')
    }
  }

  const removeOne = async (id) => {
    try {
      await notificationsAPI.delete(id)
      load()
    } catch (err) {
      showToast(formatAxiosError(err, 'Failed to delete notification'), 'error')
    }
  }

  const renderGroup = (title, list) => {
    if (!list?.length) return null
    return (
      <div className="space-y-2">
        <p className="px-1 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          {title}
        </p>
        <div className="card divide-y divide-slate-100 dark:divide-slate-700/60">
          {list.map((n) => {
            const { Icon, color } = iconForType(n.type)
            return (
              <motion.div
                key={n.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  'flex items-start gap-3 px-4 py-3.5 transition-colors',
                  !n.is_read && 'bg-brand-50/50 dark:bg-brand-900/10',
                )}
              >
                <div
                  className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
                    color,
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </div>
                <button
                  type="button"
                  onClick={() => handleOpen(n)}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {n.title}
                    </p>
                    {!n.is_read && (
                      <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
                    )}
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-sm text-slate-600 dark:text-slate-300">
                    {n.message}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">{timeAgo(n.created_at)}</p>
                </button>
                <button
                  type="button"
                  onClick={() => removeOne(n.id)}
                  className="btn-ghost px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30"
                  aria-label="Delete notification"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </motion.div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Notifications
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            You have {unread} unread notification{unread === 1 ? '' : 's'}.
          </p>
        </div>
        <button type="button" className="btn-secondary" onClick={markAll}>
          <CheckCheck className="h-4 w-4" aria-hidden="true" />
          Mark all read
        </button>
      </div>

      {/* Tabs */}
      <div className="card p-1.5">
        <div className="flex flex-wrap gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
                tab === t.id
                  ? 'bg-brand-600 text-white shadow-glow-sm'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700/60',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="card divide-y divide-slate-100 dark:divide-slate-700/60">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex gap-3 p-4">
              <Skeleton className="h-9 w-9 rounded-xl" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={BellOff}
          title="You’re all caught up"
          description="No notifications match this filter."
        />
      ) : (
        <div className="space-y-6">
          {renderGroup('Today', grouped.today)}
          {renderGroup('Yesterday', grouped.yesterday)}
          {renderGroup('Earlier', grouped.earlier)}
        </div>
      )}
    </div>
  )
}
