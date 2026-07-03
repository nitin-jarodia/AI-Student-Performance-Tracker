import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { performanceAPI, studentAPI, subjectAPI } from '../services/api'
import { gradeFromPct } from '../lib/grades'
import { useToast } from '../context/ToastContext'

const EXAM_TYPES = [
  { value: 'unit_test', label: 'Unit test' },
  { value: 'midterm', label: 'Midterm' },
  { value: 'final', label: 'Final' },
  { value: 'quiz', label: 'Quiz' },
  { value: 'assignment', label: 'Assignment' },
  { value: 'practical', label: 'Practical' },
]

export default function AddScores() {
  const { showToast } = useToast()
  const navigate = useNavigate()
  const location = useLocation()
  const pre = location.state?.studentId

  const [students, setStudents] = useState([])
  const [subjects, setSubjects] = useState([])
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(null)
  const [scores, setScores] = useState({})
  const [maxMap, setMaxMap] = useState({})
  const [examType, setExamType] = useState('unit_test')
  const [examDate, setExamDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(null)

  useEffect(() => {
    const run = async () => {
      const [st, su] = await Promise.all([studentAPI.getAll(), subjectAPI.getAll()])
      setStudents(st.data.students || [])
      const max = {}
      const ordered = [...(su.data.subjects || [])].sort((a, b) => (a.id || 0) - (b.id || 0))
      setSubjects(ordered)
      ordered.forEach((s) => {
        max[s.id] = '100'
      })
      setMaxMap(max)
    }
    run().catch(() => showToast('Failed to load data', 'error'))
  }, [showToast])

  useEffect(() => {
    if (!pre || !students.length) return
    const found = students.find((s) => s.id === pre)
    if (found) setSel(found)
  }, [pre, students])

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase()
    if (!qq) return students
    return students.filter(
      (s) => s.name?.toLowerCase().includes(qq) || String(s.roll_number).toLowerCase().includes(qq)
    )
  }, [students, q])

  const onChangeScore = (subjectId, v) => {
    setScores((p) => ({ ...p, [subjectId]: v }))
  }
  const onChangeMax = (subjectId, v) => {
    setMaxMap((p) => ({ ...p, [subjectId]: v }))
  }

  const submit = async () => {
    if (!sel) {
      showToast('Select a student first', 'warning')
      return
    }
    const entries = subjects
      .map((su) => {
        const raw = scores[su.id]
        if (raw === undefined || raw === '') return null
        return {
          student_id: sel.id,
          subject_id: su.id,
          score: parseFloat(raw),
          max_score: parseFloat(maxMap[su.id] || '100'),
          exam_type: examType,
          exam_date: examDate,
        }
      })
      .filter(Boolean)

    if (!entries.length) {
      showToast('Enter at least one subject score', 'warning')
      return
    }

    try {
      setSaving(true)
      for (const e of entries) {
        await performanceAPI.add(e)
      }
      setDone({ n: entries.length, student: sel.name })
      setScores({})
      showToast('Scores saved', 'success')
    } catch {
      showToast('Save failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (done) {
    return (
      <div className="mx-auto max-w-2xl animate-fade-in">
        <div className="card p-10 text-center">
          <div className="text-5xl">✅</div>
          <h2 className="mt-4 font-heading text-2xl font-bold text-slate-900">Saved {done.n} scores</h2>
          <p className="mt-2 text-slate-600">
            Recorded for <span className="font-semibold">{done.student}</span>
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <button type="button" className="btn-secondary" onClick={() => setDone(null)}>
              Enter more
            </button>
            <button type="button" className="btn-primary" onClick={() => navigate(`/students/${sel?.id}`)}>
              Open student profile
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="animate-fade-in mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Add scores</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Pick a student, enter any subjects, submit once.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <div className="card p-5">
          <label className="label">Find student</label>
          <input className="input mb-3" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" />
          <div className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
            {filtered.map((s) => {
              const active = sel?.id === s.id
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSel(s)}
                  className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition-all duration-200 ${
                    active ? 'border-indigo-300 bg-indigo-50' : 'border-slate-100 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-sky-500 text-xs font-bold text-white">
                    {(s.name || '?')
                      .split(' ')
                      .map((p) => p[0])
                      .join('')
                      .slice(0, 2)
                      .toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-900">{s.name}</p>
                    <p className="text-xs text-slate-500">
                      {s.roll_number} · {s.class_name}-{s.section}
                    </p>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        <div className="card p-6">
          {!sel ? (
            <div className="flex h-[420px] flex-col items-center justify-center text-center">
              <div className="text-5xl opacity-40">👈</div>
              <p className="mt-4 font-semibold text-slate-700">Select a student</p>
              <p className="mt-2 max-w-sm text-sm text-slate-500">Scores apply to one learner at a time so totals stay accurate.</p>
            </div>
          ) : (
            <>
              <div className="mb-6 flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Student</p>
                  <p className="font-heading text-xl font-bold text-slate-900">{sel.name}</p>
                  <p className="text-sm text-slate-500">
                    Roll {sel.roll_number} · {sel.class_name}-{sel.section}
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="label">Exam type</label>
                    <select className="input" value={examType} onChange={(e) => setExamType(e.target.value)}>
                      {EXAM_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label">Date</label>
                    <input className="input" type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} />
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {subjects.map((su) => {
                  const mx = parseFloat(maxMap[su.id] || '100')
                  const sc = scores[su.id]
                  const pct = sc !== undefined && sc !== '' && mx ? (parseFloat(sc) / mx) * 100 : null
                  const accent = su.color || '#6366f1'
                  return (
                    <div
                      key={su.id}
                      className="rounded-2xl border-2 bg-slate-50/50 p-4 shadow-sm"
                      style={{ borderColor: `${accent}55` }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2">
                          <span className="text-2xl leading-none" aria-hidden>
                            {su.icon || '📘'}
                          </span>
                          <div>
                            <p className="font-heading font-bold text-slate-900">{su.name}</p>
                            <p className="text-xs text-slate-500">{su.code}</p>
                          </div>
                        </div>
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-700 ring-1 ring-slate-200">
                          {pct != null ? gradeFromPct(pct) : '—'}
                        </span>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-3">
                        <div>
                          <label className="label">Score</label>
                          <input
                            className="input"
                            inputMode="decimal"
                            value={scores[su.id] ?? ''}
                            onChange={(e) => onChangeScore(su.id, e.target.value)}
                            placeholder="—"
                          />
                        </div>
                        <div>
                          <label className="label">Max</label>
                          <input
                            className="input"
                            inputMode="decimal"
                            value={maxMap[su.id] ?? '100'}
                            onChange={(e) => onChangeMax(su.id, e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="mt-3">
                        <div className="progress-track">
                          <div
                            className="progress-fill bg-gradient-to-r from-indigo-600 to-sky-400"
                            style={{ width: `${pct != null ? Math.min(100, pct) : 0}%` }}
                          />
                        </div>
                        <p className="mt-2 text-xs text-slate-500">{pct != null ? `${pct.toFixed(1)}%` : 'Optional row'}</p>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="mt-8 flex flex-wrap justify-end gap-3 border-t border-slate-100 pt-6">
                <button type="button" className="btn-secondary" onClick={() => navigate('/students')}>
                  Cancel
                </button>
                <button type="button" className="btn-primary" disabled={saving} onClick={submit}>
                  {saving ? 'Saving…' : 'Submit all entered scores'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
