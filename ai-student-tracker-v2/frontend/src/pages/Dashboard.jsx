import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { performanceAPI, studentAPI, subjectAPI } from '../services/api'
import { RiskPieChart } from '../components/Charts'
import { useToast } from '../context/ToastContext'
import AddScoreModal from '../components/dashboard/AddScoreModal'
import MarkAttendanceModal from '../components/dashboard/MarkAttendanceModal'
import StudentFormModal from '../components/StudentFormModal'

function RiskBadge({ level }) {
  const cls = level === 'HIGH' ? 'badge-high' : level === 'MEDIUM' ? 'badge-medium' : 'badge-low'
  const label = level === 'HIGH' ? 'HIGH' : level === 'MEDIUM' ? 'MED' : 'LOW'
  return <span className={cls}>🔥 {label}</span>
}

function StatCard({ title, value, accent, icon, subtitle, onClick, ariaLabel }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`stat-card text-left ${onClick ? 'cursor-pointer hover:shadow-md' : 'cursor-default'}`}
      style={{ borderLeftColor: accent }}
      aria-label={ariaLabel}
    >
      <div className="flex items-start justify-between gap-3 p-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
          <p className="mt-1 font-heading text-3xl font-bold" style={{ color: accent }}>
            {value}
          </p>
          {subtitle && <p className="mt-1 text-xs text-slate-500">{subtitle}</p>}
        </div>
        <div className="text-3xl opacity-90">{icon}</div>
      </div>
    </button>
  )
}

const DEFAULT_TASKS = [
  { id: 't1', label: 'Review high risk students', done: false },
  { id: 't2', label: 'Post week’s assignment in Classroom', done: false },
  { id: 't3', label: 'Call 2 parents (low attendance)', done: false },
]

export default function Dashboard() {
  const { showToast } = useToast()
  const navigate = useNavigate()

  const [summary, setSummary] = useState(null)
  const [dayAtt, setDayAtt] = useState(null)
  const [students, setStudents] = useState([])
  const [subjects, setSubjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [q, setQ] = useState('')
  const [sortKey, setSortKey] = useState('risk_score')
  const [sortDir, setSortDir] = useState('desc')
  const [riskFilter, setRiskFilter] = useState('ALL')

  const [tasks, setTasks] = useState(() => {
    try {
      const raw = localStorage.getItem('ast_quick_tasks')
      return raw ? JSON.parse(raw) : DEFAULT_TASKS
    } catch {
      return DEFAULT_TASKS
    }
  })

  const [modalScore, setModalScore] = useState(false)
  const [modalAtt, setModalAtt] = useState(false)
  const [modalStudent, setModalStudent] = useState(false)
  const [busy, setBusy] = useState(false)

  const persistTasks = useCallback((next) => {
    setTasks(next)
    localStorage.setItem('ast_quick_tasks', JSON.stringify(next))
  }, [])

  const load = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const [sumRes, dayRes, stRes, subRes] = await Promise.all([
        performanceAPI.getAllSummary(),
        performanceAPI.getDayAttendanceSummary(),
        studentAPI.getAll(),
        subjectAPI.getAll(),
      ])
      setSummary(sumRes.data)
      setDayAtt(dayRes.data)
      setStudents(stRes.data.students || [])
      setSubjects(subRes.data.subjects || [])
    } catch {
      setError('Could not reach the API. Start FastAPI on port 8000, then retry.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const rows = summary?.students || []

  const filteredRows = useMemo(() => {
    let list = rows.filter((s) => {
      if (riskFilter !== 'ALL' && s.risk_level !== riskFilter) return false
      const qq = q.trim().toLowerCase()
      if (!qq) return true
      return (
        String(s.name || '').toLowerCase().includes(qq) ||
        String(s.roll || '').toLowerCase().includes(qq) ||
        String(s.class || '').toLowerCase().includes(qq)
      )
    })

    list = [...list].sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1
      const av = a[sortKey]
      const bv = b[sortKey]
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir
      return String(av).localeCompare(String(bv)) * dir * -1
    })
    return list
  }, [rows, q, riskFilter, sortKey, sortDir])

  const classAvg = useMemo(() => {
    if (!rows.length) return 0
    const v = rows.reduce((acc, s) => acc + (s.avg_score || 0), 0) / rows.length
    return v.toFixed(1)
  }, [rows])

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir(key === 'name' ? 'asc' : 'desc')
    }
  }

  const onAddScore = async (payload) => {
    try {
      setBusy(true)
      await performanceAPI.add(payload)
      showToast('Score saved successfully', 'success')
      await load()
    } catch {
      showToast('Could not save score', 'error')
    } finally {
      setBusy(false)
    }
  }

  const onBulkAttendance = async (records) => {
    try {
      setBusy(true)
      await performanceAPI.addAttendanceBulk(records)
      showToast('Attendance saved for the class', 'success')
      await load()
    } catch {
      showToast('Attendance save failed', 'error')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="animate-fade-in space-y-6">
        <div className="grid gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton h-28 rounded-2xl" />
          ))}
        </div>
        <div className="skeleton h-24 rounded-2xl" />
        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <div className="skeleton h-[420px] rounded-2xl" />
          <div className="skeleton h-[420px] rounded-2xl" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="card border-red-100 bg-red-50 p-6">
        <h3 className="font-heading text-lg font-bold text-red-800">Connection issue</h3>
        <p className="mt-2 text-sm text-red-700">{error}</p>
        <button type="button" className="btn-primary mt-4" onClick={load}>
          Try again
        </button>
      </div>
    )
  }

  const highRiskTop = [...rows].filter((s) => s.risk_level === 'HIGH').slice(0, 5)

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight text-slate-900">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">Live class health, risks, and fastest teacher workflows</p>
        </div>
        <button type="button" className="btn-secondary" onClick={load}>
          Refresh data
        </button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Total students"
          value={summary?.total ?? 0}
          accent="#4F46E5"
          icon="🎓"
          subtitle="Enrolled in tracker"
        />
        <StatCard
          title="High risk"
          value={summary?.high_risk ?? 0}
          accent="#EF4444"
          icon="⚠️"
          subtitle="Needs immediate support"
          onClick={() => {
            setRiskFilter('HIGH')
            showToast('Filtered table to HIGH risk', 'success')
          }}
          ariaLabel="Filter dashboard table to high risk students"
        />
        <StatCard title="Class average" value={`${classAvg}%`} accent="#10B981" icon="📈" subtitle="Mean of averages" />
        <StatCard
          title="Today’s attendance"
          value={
            dayAtt?.marked
              ? `${dayAtt.attendance_pct}%`
              : '—'
          }
          accent="#F59E0B"
          icon="📅"
          subtitle={
            dayAtt?.marked
              ? `${dayAtt.present + dayAtt.late} attended · ${dayAtt.marked} marked`
              : 'Mark attendance to populate'
          }
        />
      </div>

      {/* Quick actions */}
      <div className="card p-5">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Quick actions</p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <button
            type="button"
            className="btn-secondary justify-start border-indigo-100 bg-indigo-50/50 text-left"
            onClick={() => navigate('/bulk')}
          >
            <span className="block font-semibold text-slate-900">📤 Bulk Upload Scores</span>
            <span className="mt-0.5 block text-xs font-normal text-slate-500">
              Upload Excel for all 200 students at once
            </span>
          </button>
          <button type="button" className="btn-secondary justify-start" onClick={() => setModalScore(true)}>
            📝 Add exam score
          </button>
          <button type="button" className="btn-secondary justify-start" onClick={() => setModalAtt(true)}>
            📅 Mark attendance
          </button>
          <button type="button" className="btn-secondary justify-start" onClick={() => setModalStudent(true)}>
            ➕ Add new student
          </button>
          <button type="button" className="btn-secondary justify-start" onClick={() => navigate('/reports')}>
            🤖 Generate AI report
          </button>
          <button type="button" className="btn-secondary justify-start" onClick={() => navigate('/analytics')}>
            📊 View analytics
          </button>
          <button type="button" className="btn-secondary justify-start" onClick={() => navigate('/students')}>
            👁️ View all students
          </button>
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_340px]">
        {/* Table */}
        <div className="card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5">
            <div>
              <p className="font-heading font-semibold text-slate-900">Class roster</p>
              <p className="text-xs text-slate-500">Search, sort, and jump into profiles</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                className="input max-w-[160px]"
                value={riskFilter}
                onChange={(e) => setRiskFilter(e.target.value)}
              >
                <option value="ALL">All risks</option>
                <option value="HIGH">High risk</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </select>
              <input className="input max-w-xs" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[920px] w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Student</th>
                  <th className="px-4 py-3">
                    <button type="button" className="hover:text-slate-900" onClick={() => toggleSort('roll')}>
                      Roll {sortKey === 'roll' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                    </button>
                  </th>
                  <th className="px-4 py-3">
                    <button type="button" className="hover:text-slate-900" onClick={() => toggleSort('class')}>
                      Class {sortKey === 'class' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                    </button>
                  </th>
                  <th className="px-4 py-3">Avg score</th>
                  <th className="px-4 py-3">Grade</th>
                  <th className="px-4 py-3">Attendance</th>
                  <th className="px-4 py-3">Risk</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((s) => (
                  <tr key={s.id} className="border-t border-slate-100 hover:bg-slate-50/70">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-sky-400 text-xs font-bold text-white">
                          {(s.name || '?')
                            .split(' ')
                            .map((p) => p[0])
                            .join('')
                            .slice(0, 2)
                            .toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold text-slate-900">{s.name}</p>
                          <p className="text-xs text-slate-500">Sec {s.section}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{s.roll}</td>
                    <td className="px-4 py-3 text-slate-700">
                      {s.class}-{s.section}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="progress-track w-28">
                          <div
                            className="progress-fill bg-gradient-to-r from-indigo-500 to-sky-400"
                            style={{ width: `${Math.min(100, s.avg_score || 0)}%` }}
                          />
                        </div>
                        <span className="font-semibold text-slate-900">{Number(s.avg_score || 0).toFixed(1)}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-800 ring-1 ring-slate-200">
                        {s.grade}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="progress-track w-24">
                          <div
                            className="progress-fill bg-amber-400"
                            style={{ width: `${Math.min(100, s.attendance || 0)}%` }}
                          />
                        </div>
                        <span className="text-slate-700">{Number(s.attendance || 0).toFixed(0)}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <RiskBadge level={s.risk_level} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button type="button" className="btn-ghost px-3 py-2 text-xs" onClick={() => navigate(`/students/${s.id}`)}>
                          View
                        </button>
                        <button
                          type="button"
                          className="btn-primary px-3 py-2 text-xs"
                          onClick={() => {
                            navigate('/scores', { state: { studentId: s.id } })
                          }}
                        >
                          Score
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!filteredRows.length && (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-400">
                      No rows match your filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-4">
          <div className="card p-5">
            <p className="font-heading font-semibold text-slate-900">Risk mix</p>
            <p className="mb-3 text-xs text-slate-500">Share of students by model label</p>
            <RiskPieChart high={summary?.high_risk} medium={summary?.medium_risk} low={summary?.low_risk} />
          </div>

          <div className="card p-5">
            <p className="font-heading font-semibold text-slate-900">Needs attention</p>
            <p className="mb-3 text-xs text-slate-500">Top high-risk learners</p>
            <div className="space-y-2">
              {highRiskTop.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => navigate(`/students/${s.id}`)}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-red-100 bg-red-50/40 px-3 py-2 text-left transition-all duration-200 hover:bg-red-50"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-900">{s.name}</p>
                    <p className="text-xs text-slate-500">
                      Avg {Number(s.avg_score).toFixed(0)}% · Score {Number(s.risk_score).toFixed(0)}
                    </p>
                  </div>
                  <span className="badge-high whitespace-nowrap">HIGH</span>
                </button>
              ))}
              {!highRiskTop.length && <p className="text-sm text-slate-400">No high risk students 🎉</p>}
            </div>
          </div>

          <div className="card p-5">
            <p className="font-heading font-semibold text-slate-900">Quick tasks</p>
            <p className="mb-3 text-xs text-slate-500">Local checklist (saved in this browser)</p>
            <div className="space-y-2">
              {tasks.map((t) => (
                <label key={t.id} className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/50 px-3 py-2 hover:bg-slate-50">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={t.done}
                    onChange={(e) => {
                      const next = tasks.map((x) => (x.id === t.id ? { ...x, done: e.target.checked } : x))
                      persistTasks(next)
                    }}
                  />
                  <span className={`text-sm ${t.done ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{t.label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>

      <AddScoreModal
        open={modalScore}
        onClose={() => setModalScore(false)}
        students={students}
        subjects={subjects}
        busy={busy}
        onSubmit={onAddScore}
      />
      <MarkAttendanceModal
        open={modalAtt}
        onClose={() => setModalAtt(false)}
        students={students}
        busy={busy}
        onSubmitAll={onBulkAttendance}
      />
      <StudentFormModal
        open={modalStudent}
        onClose={() => setModalStudent(false)}
        onSaved={async () => {
          showToast('Student created', 'success')
          await load()
        }}
      />
    </div>
  )
}
