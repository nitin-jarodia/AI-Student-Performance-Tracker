import { useEffect, useMemo, useState } from 'react'
import { integrityAPI, formatAxiosError } from '../services/api'
import { useToast } from '../context/ToastContext'

const EXAMS = [
  { value: 'unit_test', label: 'Unit test' },
  { value: 'midterm', label: 'Midterm' },
  { value: 'final', label: 'Final' },
]

export default function AcademicIntegrity() {
  const { showToast } = useToast()
  const [flags, setFlags] = useState([])
  const [examType, setExamType] = useState('unit_test')
  const [examDate, setExamDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [loading, setLoading] = useState(true)
  const [analyzeBusy, setAnalyzeBusy] = useState(false)

  const loadFlags = async () => {
    try {
      setLoading(true)
      const res = await integrityAPI.listFlags()
      setFlags(res.data.flags || [])
    } catch (err) {
      showToast(formatAxiosError(err), 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadFlags()
  }, [])

  const runAnalyze = async () => {
    try {
      setAnalyzeBusy(true)
      const res = await integrityAPI.analyze(examType, examDate)
      showToast(res.data.message || 'Analysis finished', 'success')
      await loadFlags()
    } catch (err) {
      showToast(formatAxiosError(err), 'error')
    } finally {
      setAnalyzeBusy(false)
    }
  }

  const severity = (sim) => {
    if (sim == null) return 'bg-slate-100 text-slate-700 ring-slate-200'
    if (sim > 0.98) return 'bg-red-100 text-red-900 ring-red-200'
    if (sim > 0.95) return 'bg-orange-100 text-orange-900 ring-orange-200'
    return 'bg-amber-50 text-amber-900 ring-amber-100'
  }

  const simPct = (sim) => (sim == null ? '—' : `${(sim * 100).toFixed(1)}%`)

  const sorted = useMemo(() => flags, [flags])

  const updateStatus = async (id, status) => {
    try {
      await integrityAPI.patchFlag(id, status)
      showToast('Flag updated', 'success')
      loadFlags()
    } catch (err) {
      showToast(formatAxiosError(err), 'error')
    }
  }

  return (
    <div className="animate-fade-in mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-bold text-slate-900">Academic integrity</h1>
          <p className="mt-1 text-sm text-slate-500">
            Detect similar score vectors and unusual jumps for a given exam sitting.
          </p>
        </div>
      </div>

      <div className="card flex flex-wrap items-end gap-4 p-5">
        <div>
          <label className="label">Exam type</label>
          <select className="input" value={examType} onChange={(e) => setExamType(e.target.value)}>
            {EXAMS.map((e) => (
              <option key={e.value} value={e.value}>
                {e.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Exam date</label>
          <input className="input" type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} />
        </div>
        <button type="button" className="btn-primary" disabled={analyzeBusy} onClick={runAnalyze}>
          {analyzeBusy ? 'Analyzing…' : 'Run analysis'}
        </button>
      </div>

      <div className="card overflow-hidden">
        <div className="border-b border-slate-100 px-6 py-4">
          <p className="font-heading font-bold text-slate-900">Flagged cases</p>
          <p className="text-xs text-slate-500">Cosine &gt; 0.95 for pairs; percentile jumps &gt; 30 points.</p>
        </div>
        {loading ? (
          <div className="p-8">
            <div className="skeleton h-40 rounded-2xl" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[1080px] w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Students</th>
                  <th className="px-4 py-3">Exam</th>
                  <th className="px-4 py-3">Similarity</th>
                  <th className="px-4 py-3">Reason</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((f) => (
                  <tr key={f.id} className="border-t border-slate-100 align-top">
                    <td className="px-4 py-3">
                      <div className="grid gap-2 md:grid-cols-2">
                        <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
                          <p className="text-xs font-semibold uppercase text-slate-500">Student A</p>
                          <p className="font-semibold text-slate-900">{f.student_one?.name || '—'}</p>
                          <p className="text-xs text-slate-500">
                            {f.student_one?.class_name}-{f.student_one?.section}
                          </p>
                        </div>
                        <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
                          <p className="text-xs font-semibold uppercase text-slate-500">Student B</p>
                          <p className="font-semibold text-slate-900">{f.student_two?.name || '—'}</p>
                          <p className="text-xs text-slate-500">
                            {f.student_two ? `${f.student_two.class_name}-${f.student_two.section}` : 'Solo anomaly'}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold capitalize text-slate-900">{String(f.exam_type).replace('_', ' ')}</p>
                      <p className="text-xs text-slate-500">{f.exam_date}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ring-1 ${severity(f.similarity_score)}`}>
                        {simPct(f.similarity_score)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{f.flag_reason}</td>
                    <td className="px-4 py-3">
                      <select
                        className="input text-sm"
                        value={f.status}
                        onChange={(e) => updateStatus(f.id, e.target.value)}
                      >
                        <option value="pending">pending</option>
                        <option value="reviewed">reviewed</option>
                        <option value="cleared">cleared</option>
                      </select>
                    </td>
                  </tr>
                ))}
                {!sorted.length && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-400">
                      No flags yet — run analysis for an exam above.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
