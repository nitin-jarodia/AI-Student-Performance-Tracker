import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  Search,
  Plus,
  LayoutGrid,
  List as ListIcon,
  Trash2,
  Eye,
  SlidersHorizontal,
  UserPlus,
  Users,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from 'lucide-react'
import { performanceAPI, studentAPI } from '../services/api'
import StudentFormModal from '../components/StudentFormModal'
import { useToast } from '../context/ToastContext'
import { useAuth } from '../context/AuthContext'
import { SkeletonCard, SkeletonTable } from '../components/ui/Skeleton'
import EmptyState from '../components/ui/EmptyState'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import { cn } from '../lib/cn'

function initials(name) {
  return (name || '?')
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

const GRADIENTS = [
  'from-brand-500 to-cyan-400',
  'from-violet-500 to-fuchsia-400',
  'from-emerald-500 to-teal-400',
  'from-amber-500 to-orange-400',
  'from-rose-500 to-pink-400',
  'from-cyan-500 to-blue-500',
]

function avatarGradient(id) {
  const n = Number(id) || (String(id).charCodeAt(0) || 0)
  return GRADIENTS[n % GRADIENTS.length]
}

function RiskBadge({ level }) {
  if (!level) return null
  if (level === 'HIGH') return <span className="risk-high">HIGH</span>
  if (level === 'MEDIUM') return <span className="risk-medium">MED</span>
  return <span className="risk-low">LOW</span>
}

function useDebounced(value, delay = 250) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return v
}

export default function Students() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()
  const location = useLocation()

  const [students, setStudents] = useState([])
  const [riskMap, setRiskMap] = useState({})
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search, 220)
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [styleFilter, setStyleFilter] = useState('')
  const [riskFilter, setRiskFilter] = useState(() => {
    const params = new URLSearchParams(location.search)
    return params.get('risk') || ''
  })
  const [view, setView] = useState(() => {
    try {
      return localStorage.getItem('students_view') || 'grid'
    } catch {
      return 'grid'
    }
  })
  const [sortKey, setSortKey] = useState('name')
  const [sortDir, setSortDir] = useState('asc')
  const [page, setPage] = useState(1)
  const pageSize = view === 'table' ? 15 : 12
  const [showFilters, setShowFilters] = useState(false)

  const [toDelete, setToDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    try {
      localStorage.setItem('students_view', view)
    } catch {}
  }, [view])

  useEffect(() => {
    if (location.state?.openAdd) setShowModal(true)
  }, [location.state])

  const load = async () => {
    try {
      setLoading(true)
      const params = {}
      if (styleFilter) params.learning_style = styleFilter
      const [stRes, sumRes] = await Promise.all([
        studentAPI.getAll(params),
        performanceAPI.getAllSummary(),
      ])
      setStudents(stRes.data.students || [])
      const m = {}
      ;(sumRes.data.students || []).forEach((s) => {
        m[s.id] = s.risk_level
      })
      setRiskMap(m)
    } catch {
      showToast('Failed to load students', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [styleFilter])

  const learningStyles = useMemo(() => {
    const set = new Set()
    students.forEach((s) => {
      if (s.learning_style) set.add(s.learning_style)
    })
    return Array.from(set).sort()
  }, [students])

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase()
    let rows = students.filter((s) => {
      if (q) {
        const match =
          s.name?.toLowerCase().includes(q) ||
          String(s.roll_number || '').toLowerCase().includes(q) ||
          String(s.class_name || '').toLowerCase().includes(q)
        if (!match) return false
      }
      if (riskFilter && riskMap[s.id] !== riskFilter) return false
      return true
    })
    rows = [...rows].sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1
      const av = a[sortKey] ?? ''
      const bv = b[sortKey] ?? ''
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir
      return String(av).localeCompare(String(bv)) * dir
    })
    return rows
  }, [students, debouncedSearch, riskFilter, riskMap, sortKey, sortDir])

  useEffect(() => setPage(1), [debouncedSearch, riskFilter, styleFilter, view])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize)

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const SortIcon = ({ column }) => {
    if (sortKey !== column) return <ArrowUpDown className="h-3 w-3 opacity-50" aria-hidden="true" />
    return sortDir === 'asc' ? (
      <ArrowUp className="h-3 w-3" aria-hidden="true" />
    ) : (
      <ArrowDown className="h-3 w-3" aria-hidden="true" />
    )
  }

  const confirmDelete = async () => {
    if (!toDelete) return
    try {
      setDeleting(true)
      await studentAPI.delete(toDelete.id)
      showToast('Student removed', 'success')
      setToDelete(null)
      load()
    } catch {
      showToast('Delete failed', 'error')
    } finally {
      setDeleting(false)
    }
  }

  const renderHeader = () => (
    <div className="page-header">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          Students
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {students.length} profiles · showing {filtered.length} result
          {filtered.length === 1 ? '' : 's'}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-0.5 rounded-xl border border-slate-200 bg-white p-1 shadow-soft dark:border-slate-700 dark:bg-slate-800">
          <button
            type="button"
            onClick={() => setView('grid')}
            className={cn(
              'flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-all',
              view === 'grid'
                ? 'bg-brand-600 text-white shadow-glow-sm'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-100',
            )}
            aria-label="Grid view"
          >
            <LayoutGrid className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Grid</span>
          </button>
          <button
            type="button"
            onClick={() => setView('table')}
            className={cn(
              'flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-all',
              view === 'table'
                ? 'bg-brand-600 text-white shadow-glow-sm'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-100',
            )}
            aria-label="Table view"
          >
            <ListIcon className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Table</span>
          </button>
        </div>
        <button type="button" className="btn-primary" onClick={() => setShowModal(true)}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add student
        </button>
      </div>
    </div>
  )

  const renderFilters = () => (
    <div className="card p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative md:flex-1">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            className="input pl-10"
            placeholder="Search name, roll, or class…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button
          type="button"
          className="btn-secondary md:w-auto"
          onClick={() => setShowFilters((v) => !v)}
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
          Filters
          {(styleFilter || riskFilter) && (
            <span className="ml-1 rounded-full bg-brand-600 px-1.5 text-[10px] font-bold text-white">
              {(styleFilter ? 1 : 0) + (riskFilter ? 1 : 0)}
            </span>
          )}
        </button>
      </div>
      {showFilters && (
        <div className="mt-3 grid gap-3 border-t border-slate-100 pt-3 md:grid-cols-3 dark:border-slate-700">
          <div>
            <label className="label">Risk level</label>
            <select
              className="input"
              value={riskFilter}
              onChange={(e) => setRiskFilter(e.target.value)}
            >
              <option value="">All risks</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </select>
          </div>
          <div>
            <label className="label">Learning style</label>
            <select
              className="input"
              value={styleFilter}
              onChange={(e) => setStyleFilter(e.target.value)}
            >
              <option value="">All styles</option>
              {learningStyles.map((ls) => (
                <option key={ls} value={ls}>
                  {ls}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              type="button"
              className="btn-ghost w-full md:w-auto"
              onClick={() => {
                setStyleFilter('')
                setRiskFilter('')
                setSearch('')
              }}
            >
              Clear all
            </button>
          </div>
        </div>
      )}
    </div>
  )

  const renderGrid = () => (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {paged.map((s) => {
        const risk = riskMap[s.id]
        return (
          <div
            key={s.id}
            className="card card-hover overflow-hidden"
            style={{
              borderLeftWidth: '4px',
              borderLeftColor:
                risk === 'HIGH'
                  ? '#ef4444'
                  : risk === 'MEDIUM'
                    ? '#f59e0b'
                    : risk === 'LOW'
                      ? '#10b981'
                      : '#cbd5e1',
            }}
          >
            <div className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div
                    className={cn(
                      'flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br font-heading text-sm font-bold text-white shadow-card',
                      avatarGradient(s.id),
                    )}
                  >
                    {initials(s.name)}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-900 dark:text-slate-100">
                      {s.name}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Roll {s.roll_number} · Class {s.class_name}-{s.section}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <RiskBadge level={risk} />
                  {s.scholarship_eligible && (
                    <span className="badge badge-green">Eligible</span>
                  )}
                </div>
              </div>

              {s.learning_style && (
                <div className="mt-3">
                  <span className="badge-purple">{s.learning_style}</span>
                </div>
              )}

              <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                <div>
                  <p className="text-slate-400">Parent</p>
                  <p className="mt-0.5 truncate font-medium text-slate-700 dark:text-slate-300">
                    {s.parent_name || '—'}
                  </p>
                </div>
                <div>
                  <p className="text-slate-400">Phone</p>
                  <p className="mt-0.5 truncate font-medium text-slate-700 dark:text-slate-300">
                    {s.parent_phone || '—'}
                  </p>
                </div>
              </div>

              <div className="mt-5 flex gap-2">
                <button
                  type="button"
                  className={cn('btn-primary text-xs', user?.role === 'admin' ? 'flex-1' : 'w-full')}
                  onClick={() => navigate(`/students/${s.id}`)}
                >
                  <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                  View
                </button>
                {user?.role === 'admin' && (
                  <button
                    type="button"
                    className="btn-danger flex-1 text-xs"
                    onClick={() => setToDelete(s)}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Delete
                  </button>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )

  const renderTable = () => (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-[880px] w-full text-sm">
          <thead>
            <tr>
              <th className="table-header text-left">
                <button
                  type="button"
                  className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100"
                  onClick={() => toggleSort('name')}
                >
                  Student <SortIcon column="name" />
                </button>
              </th>
              <th className="table-header text-left">
                <button
                  type="button"
                  className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100"
                  onClick={() => toggleSort('roll_number')}
                >
                  Roll <SortIcon column="roll_number" />
                </button>
              </th>
              <th className="table-header text-left">Class</th>
              <th className="table-header text-left">Learning style</th>
              <th className="table-header text-left">Parent</th>
              <th className="table-header text-left">Risk</th>
              <th className="table-header text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((s) => (
              <tr key={s.id} className="table-row">
                <td className="table-cell">
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        'flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br text-xs font-bold text-white',
                        avatarGradient(s.id),
                      )}
                    >
                      {initials(s.name)}
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-slate-100">{s.name}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Sec {s.section}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="table-cell">{s.roll_number}</td>
                <td className="table-cell">
                  {s.class_name}-{s.section}
                </td>
                <td className="table-cell">
                  {s.learning_style ? (
                    <span className="badge-purple">{s.learning_style}</span>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
                <td className="table-cell">
                  <p className="font-medium text-slate-700 dark:text-slate-200">
                    {s.parent_name || '—'}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {s.parent_phone || '—'}
                  </p>
                </td>
                <td className="table-cell">
                  <RiskBadge level={riskMap[s.id]} />
                </td>
                <td className="table-cell text-right">
                  <div className="flex justify-end gap-1">
                    <button
                      type="button"
                      className="btn-ghost px-2 py-1 text-xs"
                      onClick={() => navigate(`/students/${s.id}`)}
                    >
                      <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                      View
                    </button>
                    {user?.role === 'admin' && (
                      <button
                        type="button"
                        onClick={() => setToDelete(s)}
                        className="btn-ghost px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )

  const renderPagination = () => {
    if (filtered.length <= pageSize) return null
    return (
      <div className="flex items-center justify-between gap-3 pt-2">
        <p className="text-xs text-slate-500">
          Page <span className="font-semibold">{page}</span> of{' '}
          <span className="font-semibold">{totalPages}</span> ·{' '}
          {filtered.length} students
        </p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="btn-secondary px-3 py-1.5 text-xs"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            Prev
          </button>
          <button
            type="button"
            className="btn-secondary px-3 py-1.5 text-xs"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
          >
            Next
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="page-container">
      {renderHeader()}
      {renderFilters()}

      {loading ? (
        view === 'table' ? (
          <SkeletonTable rows={6} cols={6} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        )
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No students match your filters"
          description="Try clearing the search or filters, or add a new student."
          action={
            <button
              type="button"
              className="btn-primary"
              onClick={() => setShowModal(true)}
            >
              <UserPlus className="h-4 w-4" aria-hidden="true" />
              Add student
            </button>
          }
        />
      ) : view === 'grid' ? (
        renderGrid()
      ) : (
        renderTable()
      )}

      {renderPagination()}

      <StudentFormModal
        open={showModal}
        onClose={() => setShowModal(false)}
        onSaved={() => {
          showToast('Student created', 'success')
          load()
        }}
      />

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={`Delete ${toDelete?.name}?`}
        description="This will permanently remove the student and all linked scores and attendance. This cannot be undone."
        variant="danger"
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        loading={deleting}
      />
    </div>
  )
}
