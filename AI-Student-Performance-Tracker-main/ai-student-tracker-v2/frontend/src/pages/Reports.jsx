import { useEffect, useState } from 'react'
import { studentAPI, performanceAPI } from '../services/api'
import { useToast } from '../context/ToastContext'

export default function Reports() {
  const { showToast } = useToast()
  const [students, setStudents] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [report, setReport] = useState('')
  const [prediction, setPrediction] = useState(null)
  const [loading, setLoading] = useState(false)
  const [boot, setBoot] = useState(true)

  useEffect(() => {
    studentAPI
      .getAll()
      .then((res) => setStudents(res.data.students || []))
      .catch(() => showToast('Could not load students', 'error'))
      .finally(() => setBoot(false))
  }, [showToast])

  const generate = async () => {
    if (!selectedId) {
      showToast('Pick a student first', 'warning')
      return
    }
    try {
      setLoading(true)
      setReport('')
      setPrediction(null)
      const [repRes, predRes] = await Promise.all([
        performanceAPI.getReport(selectedId),
        performanceAPI.predict(selectedId),
      ])
      if (repRes.data?.report) setReport(repRes.data.report)
      else showToast(repRes.data?.message || 'No report data yet', 'warning')
      setPrediction(predRes.data)
    } catch {
      showToast('Generation failed — is the API running?', 'error')
    } finally {
      setLoading(false)
    }
  }

  const selected = students.find((s) => String(s.id) === String(selectedId))

  const riskCard =
    prediction?.prediction?.risk_level === 'HIGH'
      ? 'border-red-400 bg-red-50'
      : prediction?.prediction?.risk_level === 'MEDIUM'
        ? 'border-amber-400 bg-amber-50'
        : prediction?.prediction?.risk_level === 'LOW'
          ? 'border-emerald-400 bg-emerald-50'
          : 'border-slate-200 bg-white'

  if (boot) {
    return (
      <div className="grid gap-4">
        <div className="skeleton h-10 w-64 rounded-xl" />
        <div className="skeleton h-14 rounded-2xl" />
        <div className="skeleton h-64 rounded-2xl" />
      </div>
    )
  }

  return (
    <div className="animate-fade-in mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">AI reports</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">One-click narrative feedback powered by your gradebook data.</p>
      </div>

      <div className="card p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="label">Student</label>
            <select className="input" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
              <option value="">Select a student…</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.roll_number} · {s.class_name}
                </option>
              ))}
            </select>
          </div>
          <button type="button" className="btn-primary px-8" disabled={loading || !selectedId} onClick={generate}>
            {loading ? 'Generating…' : 'Generate'}
          </button>
        </div>
      </div>

      {loading && (
        <div className="card p-10 text-center">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
          <p className="mt-4 text-sm font-semibold text-slate-700">Drafting report & risk assessment…</p>
        </div>
      )}

      {prediction?.prediction && !loading && (
        <div className={`card border-l-4 p-6 ${riskCard}`}>
          <p className="font-heading text-lg font-bold text-slate-900">Risk assessment</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-white/70 p-4 ring-1 ring-slate-200">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Avg score</p>
              <p className="mt-1 font-heading text-2xl font-bold text-slate-900">{prediction.avg_score ?? '—'}%</p>
            </div>
            <div className="rounded-2xl bg-white/70 p-4 ring-1 ring-slate-200">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Attendance (est.)</p>
              <p className="mt-1 font-heading text-2xl font-bold text-slate-900">{prediction.attendance ?? '—'}%</p>
            </div>
            <div className="rounded-2xl bg-white/70 p-4 ring-1 ring-slate-200">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Risk score</p>
              <p className="mt-1 font-heading text-2xl font-bold text-slate-900">{prediction.prediction.risk_score}</p>
            </div>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-slate-800">{prediction.prediction.recommendation}</p>
        </div>
      )}

      {!!report && !loading && (
        <div className="card no-print p-6">
          <div className="flex items-center justify-between gap-3">
            <p className="font-heading text-lg font-bold text-slate-900">Report {selected ? `· ${selected.name}` : ''}</p>
            <button type="button" className="btn-secondary text-sm" onClick={() => window.print()}>
              Print
            </button>
          </div>
          <pre className="mt-4 whitespace-pre-wrap rounded-2xl bg-slate-50 p-6 font-sans text-sm leading-relaxed text-slate-800 ring-1 ring-slate-200">
            {report}
          </pre>
        </div>
      )}

      {!report && !loading && (
        <div className="card p-12 text-center">
          <div className="text-5xl opacity-80">📋</div>
          <p className="mt-4 font-heading text-lg font-semibold text-slate-800">No report yet</p>
          <p className="mt-2 text-sm text-slate-500">Choose a learner and generate to preview narrative feedback.</p>
        </div>
      )}
    </div>
  )
}
