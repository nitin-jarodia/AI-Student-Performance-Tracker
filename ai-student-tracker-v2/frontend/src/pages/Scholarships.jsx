import { useEffect, useMemo, useState } from 'react'
import { scholarshipAPI, studentAPI, formatAxiosError } from '../services/api'
import { useToast } from '../context/ToastContext'

export default function Scholarships() {
  const { showToast } = useToast()
  const [tab, setTab] = useState('schemes')
  const [schemes, setSchemes] = useState([])
  const [eligible, setEligible] = useState([])
  const [schemeId, setSchemeId] = useState('')
  const [studentQuery, setStudentQuery] = useState('')
  const [students, setStudents] = useState([])
  const [pickedStudent, setPickedStudent] = useState(null)
  const [studentSchemes, setStudentSchemes] = useState([])
  const [loading, setLoading] = useState(true)

  const [form, setForm] = useState({
    name: '',
    description: '',
    min_attendance: 85,
    min_avg_score: 75,
    max_failed_subjects: 0,
    min_consecutive_months: 2,
  })

  const loadSchemes = async () => {
    try {
      const res = await scholarshipAPI.listSchemes()
      const rows = res.data.schemes || []
      setSchemes(rows)
      if (!schemeId && rows[0]?.id) setSchemeId(String(rows[0].id))
    } catch (err) {
      showToast(formatAxiosError(err), 'error')
    }
  }

  const loadStudents = async () => {
    try {
      const res = await studentAPI.getAll()
      setStudents(res.data.students || [])
    } catch {
      showToast('Could not load students', 'error')
    }
  }

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      await Promise.all([loadSchemes(), loadStudents()])
      setLoading(false)
    })()
  }, [])

  useEffect(() => {
    const run = async () => {
      if (!schemeId || tab !== 'eligible') return
      try {
        const res = await scholarshipAPI.eligible(parseInt(schemeId, 10))
        setEligible(res.data.students || [])
      } catch (err) {
        showToast(formatAxiosError(err), 'error')
      }
    }
    run()
  }, [schemeId, tab])

  const saveScheme = async (e) => {
    e.preventDefault()
    try {
      await scholarshipAPI.createScheme(form)
      showToast('Scheme saved', 'success')
      await loadSchemes()
      setForm({
        name: '',
        description: '',
        min_attendance: 85,
        min_avg_score: 75,
        max_failed_subjects: 0,
        min_consecutive_months: 2,
      })
    } catch (err) {
      showToast(formatAxiosError(err), 'error')
    }
  }

  const evaluate = async () => {
    if (!schemeId) return
    try {
      await scholarshipAPI.evaluate(parseInt(schemeId, 10))
      showToast('Evaluation complete', 'success')
      const res = await scholarshipAPI.eligible(parseInt(schemeId, 10))
      setEligible(res.data.students || [])
    } catch (err) {
      showToast(formatAxiosError(err), 'error')
    }
  }

  const lookupStudent = async () => {
    const id = parseInt(studentQuery, 10)
    if (!id) {
      showToast('Enter numeric student ID', 'warning')
      return
    }
    try {
      const res = await scholarshipAPI.forStudent(id)
      setPickedStudent(id)
      setStudentSchemes(res.data.schemes || [])
    } catch (err) {
      showToast(formatAxiosError(err), 'error')
    }
  }

  const filteredStudentPicker = useMemo(() => {
    const q = studentQuery.trim().toLowerCase()
    if (!q) return students.slice(0, 8)
    return students.filter(
      (s) =>
        String(s.id) === q ||
        s.name?.toLowerCase().includes(q) ||
        String(s.roll_number || '').toLowerCase().includes(q),
    )
  }, [students, studentQuery])

  return (
    <div className="animate-fade-in mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Scholarships</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Define schemes, evaluate eligibility, and audit student matches.</p>
      </div>

      <div className="flex flex-wrap gap-2 rounded-2xl bg-slate-100 p-1">
        {[
          { id: 'schemes', label: 'Schemes' },
          { id: 'eligible', label: 'Eligible students' },
          { id: 'student', label: 'Student check' },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            className={`flex-1 rounded-xl px-4 py-2 text-sm font-semibold transition-all ${
              tab === t.id ? 'bg-white text-indigo-800 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'schemes' && (
        <div className="grid gap-6 lg:grid-cols-2">
          <form className="card space-y-4 p-6" onSubmit={saveScheme}>
            <p className="font-heading font-bold text-slate-900">Create scheme</p>
            <div>
              <label className="label">Name</label>
              <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div>
              <label className="label">Description</label>
              <textarea className="input min-h-[90px]" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label">Min attendance %</label>
                <input
                  className="input"
                  type="number"
                  value={form.min_attendance}
                  onChange={(e) => setForm({ ...form, min_attendance: parseFloat(e.target.value) })}
                />
              </div>
              <div>
                <label className="label">Min average score %</label>
                <input
                  className="input"
                  type="number"
                  value={form.min_avg_score}
                  onChange={(e) => setForm({ ...form, min_avg_score: parseFloat(e.target.value) })}
                />
              </div>
              <div>
                <label className="label">Max failed subjects</label>
                <input
                  className="input"
                  type="number"
                  value={form.max_failed_subjects}
                  onChange={(e) => setForm({ ...form, max_failed_subjects: parseInt(e.target.value, 10) })}
                />
              </div>
              <div>
                <label className="label">Consecutive strong months</label>
                <input
                  className="input"
                  type="number"
                  value={form.min_consecutive_months}
                  onChange={(e) => setForm({ ...form, min_consecutive_months: parseInt(e.target.value, 10) })}
                />
              </div>
            </div>
            <button type="submit" className="btn-primary w-full">
              Save scheme
            </button>
          </form>

          <div className="card p-6">
            <p className="font-heading font-bold text-slate-900">Existing schemes</p>
            <div className="mt-4 space-y-3">
              {loading ? (
                <div className="skeleton h-24 rounded-xl" />
              ) : (
                schemes.map((s) => (
                  <div key={s.id} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                    <p className="font-semibold text-slate-900">{s.name}</p>
                    <p className="text-xs text-slate-500">
                      Attendance ≥ {s.min_attendance}% · Avg ≥ {s.min_avg_score}% · Max fails {s.max_failed_subjects} · Months {s.min_consecutive_months}
                    </p>
                  </div>
                ))
              )}
              {!schemes.length && !loading && <p className="text-sm text-slate-400">No schemes yet.</p>}
            </div>
          </div>
        </div>
      )}

      {tab === 'eligible' && (
        <div className="card space-y-4 p-6">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="label">Scheme</label>
              <select className="input min-w-[220px]" value={schemeId} onChange={(e) => setSchemeId(e.target.value)}>
                {schemes.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <button type="button" className="btn-primary" onClick={evaluate}>
              Run evaluation
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[860px] w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Student</th>
                  <th className="px-4 py-3">Class</th>
                  <th className="px-4 py-3">Attendance %</th>
                  <th className="px-4 py-3">Avg score</th>
                  <th className="px-4 py-3">Notes</th>
                </tr>
              </thead>
              <tbody>
                {eligible.map((s) => (
                  <tr key={s.student_id} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-semibold text-slate-900">{s.name}</td>
                    <td className="px-4 py-3">
                      {s.class_name}-{s.section}
                    </td>
                    <td className="px-4 py-3">{Number(s.attendance_pct || 0).toFixed(1)}%</td>
                    <td className="px-4 py-3">{Number(s.avg_score || 0).toFixed(1)}%</td>
                    <td className="px-4 py-3 text-xs text-slate-600">{s.notes}</td>
                  </tr>
                ))}
                {!eligible.length && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-400">
                      No eligible rows — run evaluation after picking a scheme.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'student' && (
        <div className="card space-y-4 p-6">
          <div className="flex flex-wrap gap-3">
            <input
              className="input max-w-md flex-1"
              placeholder="Search roster or enter student ID"
              value={studentQuery}
              onChange={(e) => setStudentQuery(e.target.value)}
              list="student-pick"
            />
            <datalist id="student-pick">
              {filteredStudentPicker.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.roll_number}
                </option>
              ))}
            </datalist>
            <button type="button" className="btn-primary" onClick={lookupStudent}>
              Check eligibility
            </button>
          </div>
          {pickedStudent != null && (
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4">
              <p className="text-sm font-semibold text-emerald-900">Student #{pickedStudent}</p>
              <ul className="mt-3 space-y-2 text-sm text-emerald-900">
                {studentSchemes.map((sch) => (
                  <li key={sch.scheme_id} className="rounded-xl bg-white/80 px-3 py-2 ring-1 ring-emerald-100">
                    <span className="font-bold">{sch.name}</span>
                    <span className="ml-2 text-xs text-emerald-700">
                      Attendance {Number(sch.attendance_pct || 0).toFixed(1)}% · Avg {Number(sch.avg_score || 0).toFixed(1)}%
                    </span>
                  </li>
                ))}
                {!studentSchemes.length && <li className="text-emerald-800">No active matching schemes.</li>}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
