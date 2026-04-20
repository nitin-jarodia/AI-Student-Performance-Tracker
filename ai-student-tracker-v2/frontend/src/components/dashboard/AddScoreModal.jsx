import { useMemo, useState } from 'react'
import { gradeFromPct } from '../../lib/grades'

const EXAM_TYPES = [
  'unit_test',
  'midterm',
  'final',
  'quiz',
  'assignment',
  'practical',
]

function initials(name) {
  return (name || '?')
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

export default function AddScoreModal({ open, onClose, students, subjects, onSubmit, busy }) {
  const [step, setStep] = useState(1)
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState(null)
  const [subjectId, setSubjectId] = useState('')
  const [score, setScore] = useState('')
  const [maxScore, setMaxScore] = useState('100')
  const [examType, setExamType] = useState('unit_test')
  const [examDate, setExamDate] = useState(() => new Date().toISOString().slice(0, 10))

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return students
    return students.filter(
      (st) =>
        st.name?.toLowerCase().includes(s) ||
        String(st.roll_number || '').toLowerCase().includes(s)
    )
  }, [students, q])

  const pct = useMemo(() => {
    const sc = parseFloat(score)
    const mx = parseFloat(maxScore)
    if (!mx || Number.isNaN(sc) || Number.isNaN(mx)) return null
    return Math.min(100, Math.max(0, (sc / mx) * 100))
  }, [score, maxScore])

  if (!open) return null

  const resetAndClose = () => {
    setStep(1)
    setQ('')
    setSelected(null)
    setSubjectId('')
    setScore('')
    setMaxScore('100')
    setExamType('unit_test')
    setExamDate(new Date().toISOString().slice(0, 10))
    onClose()
  }

  const handleSubmit = async () => {
    if (!selected || !subjectId || score === '') return
    await onSubmit({
      student_id: selected.id,
      subject_id: parseInt(subjectId, 10),
      score: parseFloat(score),
      max_score: parseFloat(maxScore || '100'),
      exam_type: examType,
      exam_date: examDate,
    })
    resetAndClose()
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal-content max-w-lg">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="font-heading text-lg font-bold text-slate-900">Add exam score</p>
            <p className="text-sm text-slate-500">Step {step} of 2 · live grade preview</p>
          </div>
          <button type="button" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100" onClick={resetAndClose}>
            ✕
          </button>
        </div>

        {step === 1 && (
          <>
            <input className="input mb-3" placeholder="Search by name or roll…" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {filtered.map((st) => {
                const active = selected?.id === st.id
                return (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => setSelected(st)}
                    className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all duration-200 ${
                      active ? 'border-indigo-300 bg-indigo-50' : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-sky-400 text-sm font-bold text-white">
                      {initials(st.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-slate-900">{st.name}</p>
                      <p className="text-xs text-slate-500">
                        Roll {st.roll_number} · Class {st.class_name}-{st.section}
                      </p>
                    </div>
                  </button>
                )
              })}
              {!filtered.length && <p className="py-8 text-center text-sm text-slate-400">No matches</p>}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={resetAndClose}>
                Cancel
              </button>
              <button type="button" className="btn-primary" disabled={!selected} onClick={() => setStep(2)}>
                Next
              </button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div className="mb-4 rounded-xl bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Student</p>
              <p className="font-semibold text-slate-900">{selected?.name}</p>
            </div>

            <div className="grid gap-3">
              <div>
                <label className="label">Subject</label>
                <div className="flex flex-wrap gap-2">
                  {[...subjects]
                    .sort((a, b) => (a.id || 0) - (b.id || 0))
                    .map((su) => {
                      const active = String(subjectId) === String(su.id)
                      const accent = su.color || '#6366f1'
                      return (
                        <button
                          key={su.id}
                          type="button"
                          onClick={() => setSubjectId(String(su.id))}
                          className={`rounded-xl border-2 px-3 py-2 text-left text-sm font-semibold transition-all ${
                            active ? 'shadow-sm ring-2 ring-indigo-400/80' : 'border-slate-200 bg-white hover:bg-slate-50'
                          }`}
                          style={
                            active
                              ? { borderColor: accent, backgroundColor: `${accent}14` }
                              : { borderColor: '#e2e8f0' }
                          }
                        >
                          <span className="mr-1">{su.icon || '📘'}</span>
                          {su.name}
                        </button>
                      )
                    })}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Score</label>
                  <input className="input" inputMode="decimal" value={score} onChange={(e) => setScore(e.target.value)} />
                </div>
                <div>
                  <label className="label">Max score</label>
                  <input className="input" inputMode="decimal" value={maxScore} onChange={(e) => setMaxScore(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="label">Exam type</label>
                <select className="input" value={examType} onChange={(e) => setExamType(e.target.value)}>
                  {EXAM_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t.replace('_', ' ')}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Exam date</label>
                <input className="input" type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} />
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50/50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">Preview</p>
              <div className="mt-2 flex items-end justify-between gap-3">
                <div>
                  <p className="text-sm text-slate-600">Percentage</p>
                  <p className="font-heading text-3xl font-bold text-indigo-700">
                    {pct != null ? `${pct.toFixed(1)}%` : '—'}
                  </p>
                </div>
                <div className="rounded-full bg-white px-4 py-2 text-lg font-bold text-slate-900 shadow-sm ring-1 ring-slate-200">
                  {pct != null ? gradeFromPct(pct) : '—'}
                </div>
              </div>
              <div className="progress-track mt-3">
                <div
                  className="progress-fill bg-gradient-to-r from-indigo-500 to-sky-400"
                  style={{ width: `${pct != null ? pct : 0}%` }}
                />
              </div>
            </div>

            <div className="mt-6 flex justify-between gap-2">
              <button type="button" className="btn-secondary" onClick={() => setStep(1)}>
                Back
              </button>
              <button type="button" className="btn-primary" disabled={busy || !subjectId || score === ''} onClick={handleSubmit}>
                {busy ? 'Saving…' : 'Save score'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
