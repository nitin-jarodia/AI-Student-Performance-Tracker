import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { performanceAPI, studentAPI } from '../services/api'
import StudentFormModal from '../components/StudentFormModal'
import { useToast } from '../context/ToastContext'
import { useAuth } from '../context/AuthContext'

function initials(name) {
  return (name || '?')
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

export default function Students() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()
  const location = useLocation()

  const [students, setStudents] = useState([])
  const [riskMap, setRiskMap] = useState({})
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [styleFilter, setStyleFilter] = useState('')
  const [styleOptions, setStyleOptions] = useState([])

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
    const q = search.trim().toLowerCase()
    if (!q) return students
    return students.filter(
      (s) =>
        s.name?.toLowerCase().includes(q) ||
        String(s.roll_number || '').toLowerCase().includes(q) ||
        String(s.class_name || '').toLowerCase().includes(q)
    )
  }, [students, search])

  const handleDelete = async (id, name) => {
    if (!confirm(`Delete ${name}? This cannot be undone.`)) return
    try {
      await studentAPI.delete(id)
      showToast('Student removed', 'success')
      load()
    } catch {
      showToast('Delete failed', 'error')
    }
  }

  const borderForRisk = (id) => {
    const r = riskMap[id]
    if (r === 'HIGH') return 'border-red-300 ring-red-100'
    if (r === 'MEDIUM') return 'border-amber-300 ring-amber-100'
    if (r === 'LOW') return 'border-emerald-300 ring-emerald-100'
    return 'border-slate-200'
  }

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-bold text-slate-900">Students</h1>
          <p className="mt-1 text-sm text-slate-500">{students.length} profiles · risk-colored borders</p>
        </div>
        <button type="button" className="btn-primary" onClick={() => setShowModal(true)}>
          ➕ Add student
        </button>
      </div>

      <div className="card flex flex-col gap-3 p-4 md:flex-row md:items-center">
        <input
          className="input md:flex-1"
          placeholder="Search name, roll, or class…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="input md:w-64" value={styleFilter} onChange={(e) => setStyleFilter(e.target.value)}>
          <option value="">All learning styles</option>
          {learningStyles.map((ls) => (
            <option key={ls} value={ls}>
              {ls}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton h-44 rounded-2xl" />
          ))}
        </div>
      ) : filtered.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((s) => (
            <div
              key={s.id}
              className={`card ring-1 ring-transparent transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card ${borderForRisk(s.id)} border-l-4`}
              style={{
                borderLeftWidth: '6px',
                borderLeftColor:
                  riskMap[s.id] === 'HIGH'
                    ? '#EF4444'
                    : riskMap[s.id] === 'MEDIUM'
                      ? '#F59E0B'
                      : riskMap[s.id] === 'LOW'
                        ? '#10B981'
                        : '#CBD5E1',
              }}
            >
              <div className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-sky-500 font-heading text-sm font-bold text-white shadow-md">
                      {initials(s.name)}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-heading font-bold text-slate-900">{s.name}</p>
                      <p className="text-xs text-slate-500">
                        Roll {s.roll_number} · Class {s.class_name}-{s.section}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {riskMap[s.id] && (
                      <span
                        className={
                          riskMap[s.id] === 'HIGH'
                            ? 'badge-high'
                            : riskMap[s.id] === 'MEDIUM'
                              ? 'badge-medium'
                              : 'badge-low'
                        }
                      >
                        {riskMap[s.id]}
                      </span>
                    )}
                    {s.scholarship_eligible && (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-900 ring-1 ring-emerald-200">
                        Eligible
                      </span>
                    )}
                    {s.learning_style && (
                      <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-900 ring-1 ring-violet-200">
                        {s.learning_style}
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-4 space-y-1 text-sm text-slate-600">
                  <p>
                    <span className="font-semibold text-slate-700">Parent:</span> {s.parent_name || '—'}
                  </p>
                  <p>
                    <span className="font-semibold text-slate-700">Phone:</span> {s.parent_phone || '—'}
                  </p>
                </div>

                <div className="mt-5 flex gap-2">
                  <button
                    type="button"
                    className={`btn-primary text-sm ${user?.role === 'admin' ? 'flex-1' : 'w-full'}`}
                    onClick={() => navigate(`/students/${s.id}`)}
                  >
                    View details
                  </button>
                  {user?.role === 'admin' && (
                    <button type="button" className="btn-danger flex-1 text-sm" onClick={() => handleDelete(s.id, s.name)}>
                      Delete
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card p-12 text-center">
          <div className="text-5xl">🎓</div>
          <p className="mt-4 font-heading text-lg font-semibold text-slate-800">No students match</p>
          <p className="mt-2 text-sm text-slate-500">Try clearing search or add a new student.</p>
          <button type="button" className="btn-primary mt-6" onClick={() => setShowModal(true)}>
            Add student
          </button>
        </div>
      )}

      <StudentFormModal
        open={showModal}
        onClose={() => setShowModal(false)}
        onSaved={() => {
          showToast('Student created', 'success')
          load()
        }}
      />
    </div>
  )
}
