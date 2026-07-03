import { useEffect, useMemo, useState } from 'react'

function initials(name) {
  return (name || '?')
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

export default function MarkAttendanceModal({ open, onClose, students, onSubmitAll, busy }) {
  const [day, setDay] = useState(() => new Date().toISOString().slice(0, 10))
  const [map, setMap] = useState({})

  useEffect(() => {
    if (!open) return
    const next = {}
    students.forEach((s) => {
      next[s.id] = 'present'
    })
    setMap(next)
    setDay(new Date().toISOString().slice(0, 10))
  }, [open, students])

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
    return { p, a, l }
  }, [map, students])

  if (!open) return null

  const markAll = (status) => {
    const next = {}
    students.forEach((s) => (next[s.id] = status))
    setMap(next)
  }

  const handleSave = async () => {
    const records = students.map((s) => ({
      student_id: s.id,
      date: day,
      status: map[s.id] || 'present',
      remarks: null,
    }))
    await onSubmitAll(records)
    onClose()
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal-content max-w-3xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="font-heading text-lg font-bold text-slate-900">Mark attendance</p>
            <p className="text-sm text-slate-500">Set status for each student — saved in one request</p>
          </div>
          <button type="button" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <label className="label">Date</label>
            <input className="input max-w-xs" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-success text-sm" onClick={() => markAll('present')}>
              Mark all present
            </button>
            <button type="button" className="btn-danger text-sm" onClick={() => markAll('absent')}>
              Mark all absent
            </button>
          </div>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 sm:grid-cols-4">
          <div className="text-center">
            <p className="text-xs font-semibold text-slate-500">Present</p>
            <p className="font-heading text-xl font-bold text-emerald-700">{counts.p}</p>
          </div>
          <div className="text-center">
            <p className="text-xs font-semibold text-slate-500">Absent</p>
            <p className="font-heading text-xl font-bold text-red-600">{counts.a}</p>
          </div>
          <div className="text-center">
            <p className="text-xs font-semibold text-slate-500">Late</p>
            <p className="font-heading text-xl font-bold text-amber-700">{counts.l}</p>
          </div>
          <div className="text-center">
            <p className="text-xs font-semibold text-slate-500">Class size</p>
            <p className="font-heading text-xl font-bold text-slate-900">{students.length}</p>
          </div>
        </div>

        <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
          {students.map((s) => {
            const st = map[s.id] || 'present'
            return (
              <div
                key={s.id}
                className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-3 py-2 ${
                  st === 'present'
                    ? 'border-emerald-100 bg-emerald-50/40'
                    : st === 'absent'
                      ? 'border-red-100 bg-red-50/40'
                      : 'border-amber-100 bg-amber-50/40'
                }`}
              >
                <div className="flex min-w-[200px] items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-sky-400 text-sm font-bold text-white">
                    {initials(s.name)}
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
                      onClick={() => setMap((prev) => ({ ...prev, [s.id]: key }))}
                      className={`rounded-xl px-3 py-2 text-xs font-semibold transition-all duration-200 ${
                        st === key
                          ? key === 'present'
                            ? 'bg-emerald-600 text-white shadow'
                            : key === 'absent'
                              ? 'bg-red-600 text-white shadow'
                              : 'bg-amber-500 text-white shadow'
                          : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {key === 'present' ? '✅ Present' : key === 'absent' ? '❌ Absent' : '⏰ Late'}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
          {!students.length && <p className="py-8 text-center text-sm text-slate-400">No students in database</p>}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn-primary" disabled={busy || !students.length} onClick={handleSave}>
            {busy ? 'Saving…' : 'Submit attendance'}
          </button>
        </div>
      </div>
    </div>
  )
}
