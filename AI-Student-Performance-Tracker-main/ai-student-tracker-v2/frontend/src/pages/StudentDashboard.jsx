import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  performanceAPI,
  subjectAPI,
  notificationsAPI,
  alertsAPI,
  formatAxiosError,
} from '../services/api'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'

function Stat({ label, value, hint, tone = 'indigo' }) {
  const colors = {
    indigo: 'from-indigo-500 to-violet-500',
    emerald: 'from-emerald-500 to-teal-500',
    amber: 'from-amber-500 to-orange-500',
    rose: 'from-rose-500 to-pink-500',
  }
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-2 bg-gradient-to-r ${colors[tone]} bg-clip-text text-3xl font-bold text-transparent`}>
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  )
}

export default function StudentDashboard() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [summary, setSummary] = useState(null)
  const [subjects, setSubjects] = useState([])
  const [notifications, setNotifications] = useState([])
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancel = false
    const load = async () => {
      setLoading(true)
      try {
        const [sumRes, subjRes, notifRes, alertRes] = await Promise.all([
          performanceAPI.mySummary().catch(() => ({ data: null })),
          subjectAPI.mySubjects().catch(() => ({ data: { subjects: [] } })),
          notificationsAPI.list({ limit: 5 }).catch(() => ({ data: { notifications: [] } })),
          alertsAPI.list({ limit: 10 }).catch(() => ({ data: { alerts: [] } })),
        ])
        if (cancel) return
        setSummary(sumRes?.data || null)
        setSubjects(subjRes?.data?.subjects || [])
        setNotifications(notifRes?.data?.notifications || [])
        setAlerts(alertRes?.data?.alerts || [])
      } catch (err) {
        showToast(formatAxiosError(err, 'Failed to load your dashboard'), 'error')
      } finally {
        if (!cancel) setLoading(false)
      }
    }
    load()
    return () => {
      cancel = true
    }
  }, [showToast])

  if (loading) {
    return <div className="text-sm text-slate-500">Loading your dashboard…</div>
  }

  const lowGrade = (summary?.average_pct ?? 100) < 40
  const lowAttendance = (summary?.attendance_pct ?? 100) < 75

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">
          Welcome{user?.full_name ? `, ${user.full_name.split(' ')[0]}` : ''}
        </h1>
        <p className="text-sm text-slate-500">
          Here is a snapshot of your academic standing and recent alerts.
        </p>
      </header>

      {(lowGrade || lowAttendance) && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          {lowGrade && <p>• Your average is below the passing threshold (40%). Please speak with your teacher.</p>}
          {lowAttendance && <p>• Your attendance is below 75%. Please attend upcoming classes.</p>}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Average" value={`${summary?.average_pct ?? 0}%`} hint={`Grade ${summary?.grade || '—'}`} />
        <Stat
          label="Attendance"
          value={`${summary?.attendance_pct ?? 0}%`}
          hint={`${summary?.attendance_total || 0} days marked`}
          tone={lowAttendance ? 'amber' : 'emerald'}
        />
        <Stat label="Subjects" value={subjects.length} hint="Active enrolments" tone="emerald" />
        <Stat label="Unread alerts" value={notifications.filter((n) => !n.is_read).length} tone="rose" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">My subjects</h2>
            <Link to="/subjects" className="text-xs font-semibold text-indigo-600 hover:underline">
              View all
            </Link>
          </div>
          {subjects.length === 0 ? (
            <p className="text-sm text-slate-500">No subjects yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {subjects.map((s) => (
                <li key={s.id} className="flex items-center justify-between py-2 text-sm">
                  <span>
                    <span className="mr-2">{s.icon || '📘'}</span>
                    <span className="font-medium text-slate-800">{s.name}</span>
                    <span className="ml-2 text-xs text-slate-500">{s.code}</span>
                  </span>
                  <span className="text-xs text-slate-400">{s.class_name}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Recent notifications</h2>
            <Link to="/notifications" className="text-xs font-semibold text-indigo-600 hover:underline">
              Open inbox
            </Link>
          </div>
          {notifications.length === 0 ? (
            <p className="text-sm text-slate-500">No notifications.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {notifications.map((n) => (
                <li key={n.id} className="py-2 text-sm">
                  <p className="font-medium text-slate-800">{n.title}</p>
                  <p className="line-clamp-2 text-xs text-slate-500">{n.message}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Alert history</h2>
          <Link to="/alerts" className="text-xs font-semibold text-indigo-600 hover:underline">
            View all
          </Link>
        </div>
        {alerts.length === 0 ? (
          <p className="text-sm text-slate-500">No alerts have been sent on your account.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-100">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left">When</th>
                  <th className="px-3 py-2 text-left">Type</th>
                  <th className="px-3 py-2 text-left">Channel</th>
                  <th className="px-3 py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {alerts.map((a) => (
                  <tr key={a.id}>
                    <td className="px-3 py-2 text-slate-500">{a.sent_at?.slice(0, 19).replace('T', ' ')}</td>
                    <td className="px-3 py-2">{a.alert_type}</td>
                    <td className="px-3 py-2">{a.channel}</td>
                    <td className="px-3 py-2">{a.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
