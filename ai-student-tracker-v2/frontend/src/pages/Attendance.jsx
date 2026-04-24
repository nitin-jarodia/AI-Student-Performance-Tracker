import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  CheckCircle2,
  XCircle,
  Clock,
  CalendarCheck,
  QrCode,
  Save,
  Users,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { studentAPI, performanceAPI } from '../services/api'
import { useToast } from '../context/ToastContext'
import { Skeleton } from '../components/ui/Skeleton'
import EmptyState from '../components/ui/EmptyState'
import { cn } from '../lib/cn'

function initials(name) {
  return (name || '?')
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

const STATUS_META = {
  present: { label: 'Present', Icon: CheckCircle2, color: 'emerald' },
  absent: { label: 'Absent', Icon: XCircle, color: 'red' },
  late: { label: 'Late', Icon: Clock, color: 'amber' },
}

function StatusButton({ status, active, onClick }) {
  const meta = STATUS_META[status]
  const Icon = meta.Icon
  const base =
    status === 'present'
      ? 'bg-emerald-600 text-white shadow-soft'
      : status === 'absent'
        ? 'bg-red-600 text-white shadow-soft'
        : 'bg-amber-500 text-white shadow-soft'
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all',
        active
          ? base + ' scale-[1.02]'
          : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-slate-700',
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {meta.label}
    </button>
  )
}

export default function AttendancePage() {
  const { showToast } = useToast()
  const navigate = useNavigate()
  const [students, setStudents] = useState([])
  const [day, setDay] = useState(() => new Date().toISOString().slice(0, 10))
  const [map, setMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const loadStudents = async () => {
    const res = await studentAPI.getAll()
    setStudents(res.data.students || [])
  }

  useEffect(() => {
    loadStudents()
      .catch(() => showToast('Could not load students', 'error'))
      .finally(() => setLoading(false))
  }, [showToast])

  useEffect(() => {
    const next = {}
    students.forEach((s) => {
      next[s.id] = 'present'
    })
    setMap(next)
  }, [students])

  const counts = useMemo(() => {
    let p = 0,
      a = 0,
      l = 0
    students.forEach((s) => {
      const st = map[s.id] || 'present'
      if (st === 'present') p += 1
      if (st === 'absent') a += 1
      if (st === 'late') l += 1
    })
    const marked = students.length
    const attended = p + l
    const pct = marked ? Math.round((attended / marked) * 1000) / 10 : 0
    return { p, a, l, marked, pct }
  }, [map, students])

  const setAll = (status) => {
    const next = {}
    students.forEach((s) => (next[s.id] = status))
    setMap(next)
  }

  const submit = async () => {
    try {
      setSaving(true)
      const records = students.map((s) => ({
        student_id: s.id,
        date: day,
        status: map[s.id] || 'present',
        remarks: null,
      }))
      await performanceAPI.addAttendanceBulk(records)
      showToast('Attendance saved', 'success')
    } catch {
      showToast('Save failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="page-container">
        <Skeleton className="h-20 w-full" />
        <div className="grid gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Attendance
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Mark the entire class, then save once.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <label className="label">Date</label>
            <input
              className="input"
              type="date"
              value={day}
              onChange={(e) => setDay(e.target.value)}
            />
          </div>
          <button
            type="button"
            onClick={() => navigate('/qr-attendance')}
            className="btn-secondary"
          >
            <QrCode className="h-4 w-4" aria-hidden="true" />
            QR mode
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="stat-card"
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Present
              </p>
              <p className="mt-1 text-3xl font-bold text-emerald-600 tabular-nums">
                {counts.p}
              </p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300">
              <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
            </div>
          </div>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="stat-card"
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Absent
              </p>
              <p className="mt-1 text-3xl font-bold text-red-600 tabular-nums">
                {counts.a}
              </p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-300">
              <XCircle className="h-5 w-5" aria-hidden="true" />
            </div>
          </div>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="stat-card"
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Late
              </p>
              <p className="mt-1 text-3xl font-bold text-amber-600 tabular-nums">
                {counts.l}
              </p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300">
              <Clock className="h-5 w-5" aria-hidden="true" />
            </div>
          </div>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="stat-card"
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Attendance rate
              </p>
              <p className="mt-1 text-3xl font-bold text-brand-600 tabular-nums">
                {counts.pct}%
              </p>
              <p className="mt-1 text-xs text-slate-500">Present + late / class size</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-300">
              <CalendarCheck className="h-5 w-5" aria-hidden="true" />
            </div>
          </div>
        </motion.div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-success text-xs"
          onClick={() => setAll('present')}
        >
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
          Mark all present
        </button>
        <button
          type="button"
          className="btn-danger text-xs"
          onClick={() => setAll('absent')}
        >
          <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
          Mark all absent
        </button>
      </div>

      <div className="card overflow-hidden">
        {students.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No students yet"
            description="Add students to your roster to mark attendance."
          />
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-700/60">
            {students.map((s) => {
              const st = map[s.id] || 'present'
              return (
                <div
                  key={s.id}
                  className={cn(
                    'flex flex-wrap items-center justify-between gap-4 px-4 py-3.5 transition-colors',
                    st === 'present' && 'bg-emerald-50/30 dark:bg-emerald-950/10',
                    st === 'absent' && 'bg-red-50/30 dark:bg-red-950/10',
                    st === 'late' && 'bg-amber-50/30 dark:bg-amber-950/10',
                  )}
                >
                  <div className="flex min-w-[240px] items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-cyan-500 text-sm font-bold text-white">
                      {initials(s.name)}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {s.name}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {s.roll_number} · {s.class_name}-{s.section}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {['present', 'absent', 'late'].map((key) => (
                      <StatusButton
                        key={key}
                        status={key}
                        active={st === key}
                        onClick={() => setMap((p) => ({ ...p, [s.id]: key }))}
                      />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          className="btn-primary px-10"
          disabled={!students.length || saving}
          onClick={submit}
        >
          <Save className="h-4 w-4" aria-hidden="true" />
          {saving ? 'Saving…' : 'Save attendance'}
        </button>
      </div>
    </div>
  )
}
