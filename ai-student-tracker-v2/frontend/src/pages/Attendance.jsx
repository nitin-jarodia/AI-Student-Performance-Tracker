import { useEffect, useMemo, useState } from 'react'
import { studentAPI, performanceAPI } from '../services/api'
import { useToast } from '../context/ToastContext'

export default function AttendancePage() {
  const { showToast } = useToast()
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
      <div className="grid gap-4">
        <div className="skeleton h-28 rounded-2xl" />
        <div className="skeleton h-96 rounded-2xl" />
      </div>
    )
  }

  return (
    <div className="animate-fade-in mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-bold text-slate-900">Attendance</h1>
          <p className="mt-1 text-sm text-slate-500">Mark the entire class, then save once</p>
        </div>
        <div>
          <label className="label">Date</label>
          <input className="input" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card border-l-4 border-l-emerald-500 p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Present</p>
          <p className="mt-1 font-heading text-3xl font-bold text-emerald-700">{counts.p}</p>
        </div>
        <div className="card border-l-4 border-l-red-500 p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Absent</p>
          <p className="mt-1 font-heading text-3xl font-bold text-red-600">{counts.a}</p>
        </div>
        <div className="card border-l-4 border-l-amber-500 p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Late</p>
          <p className="mt-1 font-heading text-3xl font-bold text-amber-700">{counts.l}</p>
        </div>
        <div className="card border-l-4 border-l-indigo-500 p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Attendance rate</p>
          <p className="mt-1 font-heading text-3xl font-bold text-indigo-700">{counts.pct}%</p>
          <p className="mt-1 text-xs text-slate-500">Present + late / class size</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-success text-sm" onClick={() => setAll('present')}>
          Mark all present
        </button>
        <button type="button" className="btn-danger text-sm" onClick={() => setAll('absent')}>
          Mark all absent
        </button>
      </div>

      <div className="card overflow-hidden">
        <div className="divide-y divide-slate-100">
          {students.map((s) => {
            const st = map[s.id] || 'present'
            return (
              <div
                key={s.id}
                className={`flex flex-wrap items-center justify-between gap-4 px-4 py-4 ${
                  st === 'present'
                    ? 'bg-emerald-50/40'
                    : st === 'absent'
                      ? 'bg-red-50/35'
                      : 'bg-amber-50/35'
                }`}
              >
                <div className="flex min-w-[240px] items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-sky-500 font-heading text-sm font-bold text-white">
                    {(s.name || '?')
                      .split(' ')
                      .map((p) => p[0])
                      .join('')
                      .slice(0, 2)
                      .toUpperCase()}
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900">{s.name}</p>
                    <p className="text-xs text-slate-500">
                      {s.roll_number} · {s.class_name}-{s.section}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {['present', 'absent', 'late'].map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setMap((p) => ({ ...p, [s.id]: key }))}
                      className={`rounded-xl px-4 py-2 text-sm font-semibold transition-all duration-200 ${
                        st === key
                          ? key === 'present'
                            ? 'bg-emerald-600 text-white shadow'
                            : key === 'absent'
                              ? 'bg-red-600 text-white shadow'
                              : 'bg-amber-500 text-white shadow'
                          : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {key === 'present' ? 'Present' : key === 'absent' ? 'Absent' : 'Late'}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
          {!students.length && <div className="p-10 text-center text-sm text-slate-500">No students yet</div>}
        </div>
      </div>

      <div className="flex justify-end">
        <button type="button" className="btn-primary px-10 py-3" disabled={!students.length || saving} onClick={submit}>
          {saving ? 'Saving…' : 'Save attendance'}
        </button>
      </div>
    </div>
  )
}
