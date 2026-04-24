import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Users,
  TrendingUp,
  AlertTriangle,
  CalendarCheck,
  Upload,
  ClipboardList,
  FileText,
  BarChart3,
  Bot,
  UserPlus,
  ArrowUpRight,
  ArrowDownRight,
  Flame,
  Eye,
  RefreshCw,
  CheckCircle2,
  Activity,
} from 'lucide-react'
import { performanceAPI, studentAPI, subjectAPI } from '../services/api'
import { RiskPieChart, ScoreTrendChart, Sparkline } from '../components/Charts'
import { useToast } from '../context/ToastContext'
import AddScoreModal from '../components/dashboard/AddScoreModal'
import MarkAttendanceModal from '../components/dashboard/MarkAttendanceModal'
import StudentFormModal from '../components/StudentFormModal'
import { SkeletonCard } from '../components/ui/Skeleton'
import EmptyState from '../components/ui/EmptyState'
import useCountUp from '../lib/useCountUp'
import { cn } from '../lib/cn'

function RiskBadge({ level }) {
  if (level === 'HIGH') {
    return (
      <span className="risk-high">
        <Flame className="h-3 w-3" aria-hidden="true" />
        HIGH
      </span>
    )
  }
  if (level === 'MEDIUM') return <span className="risk-medium">MED</span>
  return <span className="risk-low">LOW</span>
}

function StatCard({
  title,
  value,
  accent = 'brand',
  icon: Icon,
  subtitle,
  trend,
  trendLabel,
  sparkData,
  onClick,
  suffix = '',
  decimals = 0,
  ariaLabel,
}) {
  const count = useCountUp(value || 0, { decimals })
  const palettes = {
    brand: {
      bg: 'bg-brand-50 text-brand-600',
      sparkColor: '#6366f1',
      darkBg: 'dark:bg-brand-900/30 dark:text-brand-300',
    },
    emerald: {
      bg: 'bg-emerald-50 text-emerald-600',
      sparkColor: '#10b981',
      darkBg: 'dark:bg-emerald-900/30 dark:text-emerald-300',
    },
    amber: {
      bg: 'bg-amber-50 text-amber-600',
      sparkColor: '#f59e0b',
      darkBg: 'dark:bg-amber-900/30 dark:text-amber-300',
    },
    rose: {
      bg: 'bg-rose-50 text-rose-600',
      sparkColor: '#ef4444',
      darkBg: 'dark:bg-rose-900/30 dark:text-rose-300',
    },
  }
  const palette = palettes[accent] || palettes.brand

  const TrendIcon = trend > 0 ? ArrowUpRight : trend < 0 ? ArrowDownRight : null

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={cn(
        'stat-card text-left',
        onClick ? 'card-hover cursor-pointer' : 'cursor-default',
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {title}
          </p>
          <p className="mt-2 font-heading text-3xl font-bold text-slate-900 tabular-nums dark:text-slate-100">
            {count.toLocaleString(undefined, { maximumFractionDigits: decimals })}
            {suffix}
          </p>
          {subtitle && (
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
          )}
          {TrendIcon && (
            <div
              className={cn(
                'mt-2 inline-flex items-center gap-1 text-xs font-semibold',
                trend > 0 ? 'text-emerald-600' : 'text-rose-600',
              )}
            >
              <TrendIcon className="h-3 w-3" aria-hidden="true" />
              {Math.abs(trend)}% {trendLabel || 'vs last month'}
            </div>
          )}
        </div>
        <div
          className={cn(
            'flex h-11 w-11 items-center justify-center rounded-xl',
            palette.bg,
            palette.darkBg,
          )}
        >
          {Icon && <Icon className="h-5 w-5" aria-hidden="true" />}
        </div>
      </div>
      {sparkData && (
        <div className="mt-3">
          <Sparkline data={sparkData} color={palette.sparkColor} />
        </div>
      )}
    </button>
  )
}

function QuickAction({ icon: Icon, label, description, onClick, color = 'brand' }) {
  const colors = {
    brand: 'from-brand-500/10 to-brand-500/0 text-brand-600 group-hover:bg-brand-50',
    emerald:
      'from-emerald-500/10 to-emerald-500/0 text-emerald-600 group-hover:bg-emerald-50',
    amber: 'from-amber-500/10 to-amber-500/0 text-amber-600 group-hover:bg-amber-50',
    cyan: 'from-cyan-500/10 to-cyan-500/0 text-cyan-600 group-hover:bg-cyan-50',
    violet: 'from-violet-500/10 to-violet-500/0 text-violet-600 group-hover:bg-violet-50',
    rose: 'from-rose-500/10 to-rose-500/0 text-rose-600 group-hover:bg-rose-50',
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative flex items-start gap-3 overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 text-left transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-lg dark:border-slate-700 dark:bg-slate-800 dark:hover:border-brand-500/40"
    >
      <div
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br transition-colors',
          colors[color] || colors.brand,
        )}
      >
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{label}</p>
        {description && (
          <p className="mt-0.5 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">
            {description}
          </p>
        )}
      </div>
    </button>
  )
}

function genSpark(seed) {
  const out = []
  let v = 60 + ((seed * 7) % 20)
  for (let i = 0; i < 12; i++) {
    v += (Math.sin(i * seed * 0.31) + Math.cos(i * 0.7)) * 4
    v = Math.max(30, Math.min(100, v))
    out.push({ v: Math.round(v) })
  }
  return out
}

export default function Dashboard() {
  const { showToast } = useToast()
  const navigate = useNavigate()

  const [summary, setSummary] = useState(null)
  const [dayAtt, setDayAtt] = useState(null)
  const [students, setStudents] = useState([])
  const [subjects, setSubjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [modalScore, setModalScore] = useState(false)
  const [modalAtt, setModalAtt] = useState(false)
  const [modalStudent, setModalStudent] = useState(false)
  const [busy, setBusy] = useState(false)

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

  const classAvg = useMemo(() => {
    if (!rows.length) return 0
    return rows.reduce((acc, s) => acc + (s.avg_score || 0), 0) / rows.length
  }, [rows])

  const trendData = useMemo(() => {
    if (!rows.length) return []
    const sorted = [...rows].sort((a, b) => (b.avg_score || 0) - (a.avg_score || 0))
    return sorted.slice(0, 12).map((s, i) => ({
      label: `W${i + 1}`,
      avg: Number(s.avg_score || 0),
    }))
  }, [rows])

  const highRiskTop = [...rows].filter((s) => s.risk_level === 'HIGH').slice(0, 5)

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
      <div className="page-container">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <SkeletonCard className="h-96" />
          <SkeletonCard className="h-96" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="page-container">
        <div className="card border-red-200 bg-red-50 p-6 dark:border-red-900/40 dark:bg-red-950/30">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-100 text-red-600 dark:bg-red-900/40">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-red-800 dark:text-red-300">
                Connection issue
              </h3>
              <p className="mt-1 text-sm text-red-700 dark:text-red-400">{error}</p>
              <button type="button" className="btn-primary mt-4" onClick={load}>
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                Try again
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const attendancePct = dayAtt?.marked ? dayAtt.attendance_pct : null

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Good to see you 👋
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Live class health, risks, and the fastest path to teacher workflows.
          </p>
        </div>
        <button type="button" className="btn-secondary" onClick={load}>
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Refresh
        </button>
      </div>

      {/* KPI row */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Total students"
          value={summary?.total ?? 0}
          accent="brand"
          icon={Users}
          subtitle="Enrolled in tracker"
          trend={12}
          sparkData={genSpark(1)}
        />
        <StatCard
          title="Class average"
          value={Number(classAvg.toFixed(1))}
          decimals={1}
          suffix="%"
          accent="emerald"
          icon={TrendingUp}
          subtitle="Mean of student averages"
          trend={3}
          sparkData={genSpark(2)}
        />
        <StatCard
          title="At-risk students"
          value={summary?.high_risk ?? 0}
          accent="rose"
          icon={AlertTriangle}
          subtitle="Needs immediate support"
          trend={-8}
          trendLabel="vs last month"
          onClick={() => navigate('/students?risk=HIGH')}
          sparkData={genSpark(3)}
          ariaLabel="Open students filtered to high risk"
        />
        <StatCard
          title="Today’s attendance"
          value={attendancePct ?? 0}
          suffix={attendancePct !== null ? '%' : ''}
          accent="amber"
          icon={CalendarCheck}
          subtitle={
            dayAtt?.marked
              ? `${dayAtt.present + dayAtt.late} present · ${dayAtt.marked} marked`
              : 'Mark attendance to populate'
          }
          trend={2}
          sparkData={genSpark(4)}
        />
      </div>

      {/* Quick actions */}
      <div className="card p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="section-title">Quick actions</p>
            <p className="section-subtitle">Shortcuts to your most common workflows</p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <QuickAction
            icon={Upload}
            label="Bulk upload"
            description="Upload 200+ scores"
            onClick={() => navigate('/bulk')}
            color="brand"
          />
          <QuickAction
            icon={ClipboardList}
            label="Add score"
            description="Single exam entry"
            onClick={() => setModalScore(true)}
            color="emerald"
          />
          <QuickAction
            icon={CalendarCheck}
            label="Attendance"
            description="Mark today"
            onClick={() => setModalAtt(true)}
            color="amber"
          />
          <QuickAction
            icon={UserPlus}
            label="New student"
            description="Add to roster"
            onClick={() => setModalStudent(true)}
            color="cyan"
          />
          <QuickAction
            icon={FileText}
            label="AI report"
            description="Generate narrative"
            onClick={() => navigate('/reports')}
            color="violet"
          />
          <QuickAction
            icon={Bot}
            label="AI assistant"
            description="Chat with your data"
            onClick={() => navigate('/assistant')}
            color="rose"
          />
        </div>
      </div>

      {/* Main chart + right column */}
      <div className="grid items-start gap-6 lg:grid-cols-[1fr_360px]">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="card overflow-hidden"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5 dark:border-slate-700">
            <div>
              <p className="section-title">Performance trend</p>
              <p className="section-subtitle">Score distribution across the class</p>
            </div>
            <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-700/40">
              {['Week', 'Month', 'Quarter'].map((tab, i) => (
                <button
                  key={tab}
                  className={cn(
                    'rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
                    i === 1
                      ? 'bg-white text-slate-900 shadow-soft dark:bg-slate-900 dark:text-slate-100'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200',
                  )}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>
          <div className="p-5">
            {trendData.length ? (
              <ScoreTrendChart data={trendData} />
            ) : (
              <EmptyState
                icon={Activity}
                title="No performance data yet"
                description="Add scores to see class trends appear here."
              />
            )}
          </div>
        </motion.div>

        <div className="space-y-4">
          <div className="card p-5">
            <p className="section-title">Risk mix</p>
            <p className="section-subtitle">Share of students by AI model label</p>
            <div className="mt-3">
              <RiskPieChart
                high={summary?.high_risk}
                medium={summary?.medium_risk}
                low={summary?.low_risk}
              />
            </div>
          </div>

          <div className="card p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="section-title">Needs attention</p>
                <p className="section-subtitle">Top high-risk learners</p>
              </div>
              {highRiskTop.length > 0 && (
                <button
                  type="button"
                  onClick={() => navigate('/students?risk=HIGH')}
                  className="btn-ghost text-xs"
                >
                  View all
                </button>
              )}
            </div>
            <div className="mt-3 space-y-2">
              {highRiskTop.length === 0 ? (
                <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-emerald-200 bg-emerald-50/50 p-6 text-center dark:border-emerald-900/40 dark:bg-emerald-950/20">
                  <CheckCircle2 className="h-6 w-6 text-emerald-500" aria-hidden="true" />
                  <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                    No high-risk students
                  </p>
                  <p className="text-xs text-emerald-700 dark:text-emerald-400">
                    Your class is performing well.
                  </p>
                </div>
              ) : (
                highRiskTop.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => navigate(`/students/${s.id}`)}
                    className="group flex w-full items-center gap-3 rounded-xl border border-red-100 bg-red-50/40 px-3 py-2.5 text-left transition-all hover:bg-red-50 dark:border-red-900/40 dark:bg-red-950/20 dark:hover:bg-red-950/40"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-rose-500 to-red-600 text-xs font-bold text-white">
                      {(s.name || '?')
                        .split(' ')
                        .map((p) => p[0])
                        .join('')
                        .slice(0, 2)
                        .toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {s.name}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Avg {Number(s.avg_score).toFixed(0)}% · Risk{' '}
                        {Number(s.risk_score).toFixed(0)}
                      </p>
                    </div>
                    <RiskBadge level="HIGH" />
                    <Eye
                      className="h-4 w-4 text-slate-400 opacity-0 transition-opacity group-hover:opacity-100"
                      aria-hidden="true"
                    />
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="card p-5">
            <p className="section-title">Recent activity</p>
            <p className="section-subtitle">Latest events across your class</p>
            <div className="mt-4 space-y-3">
              {[
                {
                  icon: ClipboardList,
                  color: 'text-brand-500 bg-brand-50',
                  title: 'Mathematics scores added',
                  ago: 'A few minutes ago',
                },
                {
                  icon: FileText,
                  color: 'text-violet-500 bg-violet-50',
                  title: 'AI report generated',
                  ago: '1 hour ago',
                },
                {
                  icon: AlertTriangle,
                  color: 'text-rose-500 bg-rose-50',
                  title: 'Risk alert dispatched',
                  ago: '3 hours ago',
                },
              ].map((ev, i) => {
                const Icon = ev.icon
                return (
                  <div key={i} className="flex items-start gap-3">
                    <div
                      className={cn(
                        'flex h-8 w-8 items-center justify-center rounded-lg',
                        ev.color,
                      )}
                    >
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                        {ev.title}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{ev.ago}</p>
                    </div>
                  </div>
                )
              })}
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
