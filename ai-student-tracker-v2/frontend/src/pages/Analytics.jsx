import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { mlAPI, performanceAPI } from '../services/api'
import { GradeDistributionBar, RiskPieChart } from '../components/Charts'
import { useToast } from '../context/ToastContext'

export default function Analytics() {
  const { showToast } = useToast()
  const navigate = useNavigate()

  const [summary, setSummary] = useState(null)
  const [analytics, setAnalytics] = useState(null)
  const [model, setModel] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    try {
      setLoading(true)
      const [sum, cls, ms] = await Promise.all([
        performanceAPI.getAllSummary(),
        mlAPI.classAnalytics(),
        mlAPI.modelStatus(),
      ])
      setSummary(sum.data)
      setAnalytics(cls.data)
      setModel(ms.data)
    } catch {
      showToast('Could not load analytics', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const gradeDist = useMemo(() => {
    const rows = summary?.students || []
    const buckets = {}
    rows.forEach((s) => {
      const g = s.grade || '—'
      buckets[g] = (buckets[g] || 0) + 1
    })
    return Object.entries(buckets)
      .map(([grade, count]) => ({ grade, count }))
      .sort((a, b) => b.count - a.count)
  }, [summary])

  const students = summary?.students || []

  const factorDist = useMemo(() => {
    const raw = analytics?.risk_factor_distribution || {}
    return Object.entries(raw).map(([name, count]) => ({
      name: name.length > 22 ? `${name.slice(0, 20)}…` : name,
      count,
    }))
  }, [analytics])

  if (loading) {
    return (
      <div className="grid gap-4">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="skeleton h-28 rounded-2xl" />
          <div className="skeleton h-28 rounded-2xl" />
          <div className="skeleton h-28 rounded-2xl" />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="skeleton h-80 rounded-2xl" />
          <div className="skeleton h-80 rounded-2xl" />
        </div>
      </div>
    )
  }

  return (
    <div className="animate-fade-in mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Analytics</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Class modeling, distributions, and drill-down.</p>
        </div>
        <button type="button" className="btn-secondary" onClick={load}>
          Refresh
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="stat-card border-l-indigo-600 p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Class average</p>
          <p className="mt-2 font-heading text-3xl font-bold text-indigo-700">{analytics?.class_average ?? '—'}%</p>
          <p className="mt-1 text-xs text-slate-500">Mean across learners</p>
        </div>
        <div className="stat-card border-l-sky-500 p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Attendance avg</p>
          <p className="mt-2 font-heading text-3xl font-bold text-sky-700">{analytics?.attendance_avg ?? '—'}%</p>
          <p className="mt-1 text-xs text-slate-500">Across roster estimates</p>
        </div>
        <div className="stat-card border-l-emerald-500 p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Model</p>
          <p className="mt-2 text-sm font-semibold text-slate-900">{model?.model_type || 'Rule-based'}</p>
          <p className="mt-1 text-xs text-slate-500">{model?.status || ''}</p>
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <div className="card p-6">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="font-heading font-bold text-slate-900">Grade distribution</p>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
              Class grade: {analytics?.class_grade || '—'}
            </span>
          </div>
          <GradeDistributionBar data={gradeDist} />
        </div>
        <div className="card p-6">
          <p className="mb-2 font-heading font-bold text-slate-900">Risk distribution</p>
          <RiskPieChart high={summary?.high_risk} medium={summary?.medium_risk} low={summary?.low_risk} />
          <p className="mt-3 text-xs text-slate-500">
            Health: <span className="font-semibold text-slate-800">{analytics?.class_health || '—'}</span>
          </p>
        </div>
      </div>

      <div className="card p-6">
        <p className="font-heading font-bold text-slate-900">Risk factor breakdown</p>
        <p className="mt-1 text-xs text-slate-500">Counts of primary concerns across students (explainability)</p>
        {factorDist.length ? (
          <div className="mt-6 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={factorDist} layout="vertical" margin={{ left: 12, right: 12 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" allowDecimals={false} />
                <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#6366f1" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="mt-6 text-sm text-slate-400">No distribution data.</p>
        )}
      </div>

      <div className="card overflow-hidden">
        <div className="border-b border-slate-100 px-6 py-4">
          <p className="font-heading font-bold text-slate-900">All students</p>
          <p className="text-xs text-slate-500">Sorted by risk score</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Student</th>
                <th className="px-4 py-3">Roll</th>
                <th className="px-4 py-3">Class</th>
                <th className="px-4 py-3">Avg</th>
                <th className="px-4 py-3">Grade</th>
                <th className="px-4 py-3">Attendance</th>
                <th className="px-4 py-3">Risk</th>
                <th className="px-4 py-3 text-right">Open</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.id} className="border-t border-slate-100 hover:bg-slate-50/70">
                  <td className="px-4 py-3 font-semibold text-slate-900">{s.name}</td>
                  <td className="px-4 py-3 text-slate-600">{s.roll}</td>
                  <td className="px-4 py-3 text-slate-700">
                    {s.class}-{s.section}
                  </td>
                  <td className="px-4 py-3">{Number(s.avg_score).toFixed(1)}%</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold ring-1 ring-slate-200">{s.grade}</span>
                  </td>
                  <td className="px-4 py-3">{Number(s.attendance).toFixed(0)}%</td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        s.risk_level === 'HIGH'
                          ? 'badge-high'
                          : s.risk_level === 'MEDIUM'
                            ? 'badge-medium'
                            : 'badge-low'
                      }
                    >
                      {s.risk_level}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button type="button" className="btn-ghost px-3 py-2 text-xs" onClick={() => navigate(`/students/${s.id}`)}>
                      View
                    </button>
                  </td>
                </tr>
              ))}
              {!students.length && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-400">
                    No student rows
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
