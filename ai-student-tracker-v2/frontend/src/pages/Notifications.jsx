import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { notificationsAPI, formatAxiosError } from '../services/api'
import { useToast } from '../context/ToastContext'

export default function NotificationsPage() {
  const { showToast } = useToast()
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [unread, setUnread] = useState(0)
  const [loading, setLoading] = useState(true)
  const [unreadOnly, setUnreadOnly] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await notificationsAPI.list({ unread_only: unreadOnly })
      setItems(data.notifications || [])
      setUnread(data.unread_count || 0)
    } catch (err) {
      showToast(formatAxiosError(err, 'Failed to load notifications'), 'error')
    } finally {
      setLoading(false)
    }
  }, [unreadOnly, showToast])

  useEffect(() => {
    load()
  }, [load])

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

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Notifications</h1>
          <p className="text-sm text-slate-500">
            You have {unread} unread notification{unread === 1 ? '' : 's'}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="inline-flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={unreadOnly}
              onChange={(e) => setUnreadOnly(e.target.checked)}
            />
            Unread only
          </label>
          <button
            onClick={markAll}
            className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Mark all read
          </button>
        </div>
      </header>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="p-6 text-center text-slate-400">Loading…</div>
        ) : items.length === 0 ? (
          <div className="p-6 text-center text-slate-400">You're all caught up.</div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((n) => (
              <li
                key={n.id}
                className={`flex items-start gap-3 px-4 py-3 ${n.is_read ? 'bg-white' : 'bg-indigo-50/40'}`}
              >
                <div className="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-indigo-500" style={{ opacity: n.is_read ? 0 : 1 }} />
                <button
                  onClick={() => handleOpen(n)}
                  className="flex-1 text-left"
                >
                  <p className="text-sm font-semibold text-slate-900">{n.title}</p>
                  <p className="mt-0.5 text-sm text-slate-600">{n.message}</p>
                  <p className="mt-1 text-xs text-slate-400">{n.created_at?.replace('T', ' ').slice(0, 19)}</p>
                </button>
                <button
                  onClick={() => removeOne(n.id)}
                  className="rounded-lg px-2 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
