import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  alertsAPI,
  performanceAPI,
  portalAPI,
  studentAPI,
  subjectAPI,
} from '../services/api'
import { SubjectBarChart } from '../components/Charts'
import { gradeFromPct } from '../lib/grades'
import { useToast } from '../context/ToastContext'
import { useAuth } from '../context/AuthContext'

const EXAM_TYPE_OPTIONS = [
  { value: 'unit_test', label: 'Unit test' },
  { value: 'midterm', label: 'Midterm' },
  { value: 'final', label: 'Final' },
  { value: 'quiz', label: 'Quiz' },
  { value: 'assignment', label: 'Assignment' },
  { value: 'practical', label: 'Practical' },
]

function statusBarClass(st) {
  if (st === 'critical') return 'bg-red-500'
  if (st === 'warning') return 'bg-amber-500'
  return 'bg-emerald-500'
}

export default function StudentDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const { user } = useAuth()

  const [student, setStudent] = useState(null)
  const [perf, setPerf] = useState(null)
  const [boot, setBoot] = useState(true)
  const [att, setAtt] = useState([])
  const [subjects, setSubjects] = useState([])
  const [tab, setTab] = useState('scores')
  const [alerts, setAlerts] = useState([])
  const [alertsLoading, setAlertsLoading] = useState(false)

  const [prediction, setPrediction] = useState(null)
  const [report, setReport] = useState('')
  const [predBusy, setPredBusy] = useState(false)
  const [repBusy, setRepBusy] = useState(false)
  const [portalOpen, setPortalOpen] = useState(false)
  const [portalUrl, setPortalUrl] = useState('')
  const [portalBusy, setPortalBusy] = useState(false)

  const [scoreForm, setScoreForm] = useState({
    subject_id: '',
    score: '',
    max_score: '100',
    exam_type: 'unit_test',
    exam_date: new Date().toISOString().slice(0, 10),
  })

  const [attForm, setAttForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    status: 'present',
  })

  const load = async () => {
    try {
      setBoot(true)
      const [st, pr, at, su] = await Promise.all([
        studentAPI.getById(id),
        performanceAPI.getByStudent(id),
        performanceAPI.getStudentAttendance(id),
        subjectAPI.getAll(),
      ])
      setStudent(st.data)
      setPerf(pr.data)
      setAtt(at.data.records || [])
      const ordered = [...(su.data.subjects || [])].sort((a, b) => (a.id || 0) - (b.id || 0))
      setSubjects(ordered)
      if (!scoreForm.subject_id && ordered[0]?.id) {
        setScoreForm((s) => ({ ...s, subject_id: String(ordered[0].id) }))
      }
    } catch {
      setStudent(null)
      setPerf(null)
      showToast('Student not found or API offline', 'error')
    } finally {
      setBoot(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const predict = async () => {
    try {
      setPredBusy(true)
      const res = await performanceAPI.predict(id)
      setPrediction(res.data)
      if (res.data?.message) showToast(res.data.message, 'warning')
    } catch {
      showToast('Prediction failed', 'error')
    } finally {
      setPredBusy(false)
    }
  }

  const genPortalLink = async () => {
    try {
      setPortalBusy(true)
      const res = await portalAPI.generateLink({
        student_id: parseInt(id, 10),
        role: 'parent',
      })
      setPortalUrl(res.data?.url || '')
      setPortalOpen(true)
      showToast('Portal link generated', 'success')
    } catch {
      showToast('Could not generate portal link', 'error')
    } finally {
      setPortalBusy(false)
    }
  }

  const genReport = async () => {
    try {
      setRepBusy(true)
      const res = await performanceAPI.getReport(id)
      if (res.data?.report) setReport(res.data.report)
      else showToast(res.data?.message || 'No data for report', 'warning')
    } catch {
      showToast('Report failed', 'error')
    } finally {
      setRepBusy(false)
    }
  }

  const saveScore = async (e) => {
    e.preventDefault()
    if (!scoreForm.subject_id || !scoreForm.score) return
    try {
      await performanceAPI.add({
        student_id: parseInt(id, 10),
        subject_id: parseInt(scoreForm.subject_id, 10),
        score: parseFloat(scoreForm.score),
        max_score: parseFloat(scoreForm.max_score || '100'),
        exam_type: scoreForm.exam_type,
        exam_date: scoreForm.exam_date,
      })
      showToast('Score added', 'success')
      await load()
    } catch {
      showToast('Could not add score', 'error')
    }
  }

  const saveAtt = async (e) => {
    e.preventDefault()
    try {
      await performanceAPI.addAttendance({
        student_id: parseInt(id, 10),
        date: attForm.date,
        status: attForm.status,
      })
      showToast('Attendance saved', 'success')
      await load()
    } catch {
      showToast('Attendance save failed', 'error')
    }
  }

  const printReport = () => window.print()

  if (boot) {
    return (
      <div className="grid gap-4">
        <div className="skeleton h-40 rounded-2xl" />
        <div className="skeleton h-96 rounded-2xl" />
      </div>
    )
  }

  if (!student || !perf) {
    return (
      <div className="card border-red-100 bg-red-50 p-8 text-center">
        <p className="font-heading font-bold text-red-900">Unable to load this student</p>
        <button type="button" className="btn-primary mt-4" onClick={() => navigate('/students')}>
          Back to roster
        </button>
      </div>
    )
  }

  const chartData =
    perf.records?.map((r) => ({
      subject: r.subject_name?.slice(0, 14) || 'Subject',
      score: r.percentage,
    })) || []

  const pctPreview =
    scoreForm.score && scoreForm.max_score
      ? (parseFloat(scoreForm.score) / parseFloat(scoreForm.max_score)) * 100
      : null

  return (
    <div className="animate-fade-in mx-auto max-w-6xl space-y-6">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="text-sm font-semibold text-indigo-700 hover:underline"
      >
        ← Back
      </button>

      {perf?.average !== undefined && perf.average < 40 && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
          <p className="font-semibold">Low average alert</p>
          <p>
            This student's overall average is {perf.average}% (below 40%). Parent contacts have
            been notified automatically - see the Alert history tab for details.
          </p>
        </div>
      )}

      <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-violet-600 to-sky-600 p-6 text-white shadow-xl sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <p className="text-sm text-indigo-100/90">Student profile</p>
            <h1 className="mt-2 font-heading text-3xl font-bold tracking-tight">{perf.student_name}</h1>
            <p className="mt-2 text-sm text-indigo-100/90">
              Class {student.class_name}-{student.section} · Roll {student.roll_number}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold backdrop-blur">
                Avg {perf.average}%
              </span>
              <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold backdrop-blur">
                Grade {perf.grade}
              </span>
              <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold backdrop-blur">
                Exams {perf.total_exams}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-secondary bg-white/10 text-white ring-1 ring-white/30" onClick={() => navigate('/scores', { state: { studentId: parseInt(id, 10) } })}>
              Add score
            </button>
            <button type="button" className="btn-secondary bg-white/10 text-white ring-1 ring-white/30" onClick={() => navigate('/attend')}>
              Attendance
            </button>
            <button type="button" className="btn-primary bg-white text-indigo-800 hover:bg-indigo-50" disabled={predBusy} onClick={predict}>
              {predBusy ? '…' : 'AI predict'}
            </button>
            <button type="button" className="btn-primary bg-emerald-500 text-white hover:bg-emerald-600" disabled={repBusy} onClick={genReport}>
              {repBusy ? '…' : 'Generate report'}
            </button>
            {(user?.role === 'teacher' || user?.role === 'admin') && (
              <button
                type="button"
                className="btn-secondary bg-white/10 text-white ring-1 ring-white/30"
                disabled={portalBusy}
                onClick={genPortalLink}
              >
                {portalBusy ? '…' : 'Portal link'}
              </button>
            )}
          </div>
        </div>
      </div>

      {prediction?.prediction && (
        <div
          className={`card border-l-4 p-6 ${
            prediction.prediction.risk_level === 'HIGH'
              ? 'border-red-500 bg-red-50/40'
              : prediction.prediction.risk_level === 'MEDIUM'
                ? 'border-amber-500 bg-amber-50/40'
                : 'border-emerald-500 bg-emerald-50/40'
          }`}
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="font-heading text-lg font-bold text-slate-900">AI risk assessment</p>
              <p className="mt-1 text-xs font-semibold uppercase text-slate-500">
                Primary concern:{' '}
                <span className="text-slate-900">{prediction.prediction.explanation?.primary_concern || '—'}</span>
              </p>
              {prediction.prediction.explanation?.ml_top_factor && (
                <p className="mt-1 text-sm text-slate-600">
                  ML top feature: <strong>{prediction.prediction.explanation.ml_top_factor}</strong>
                </p>
              )}
            </div>
            <span className="rounded-full bg-white px-3 py-1 text-sm font-bold ring-1 ring-slate-200">
              {prediction.prediction.risk_level}
            </span>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-slate-700">
            <span>Risk score: {prediction.prediction.risk_score}</span>
            <span>Avg: {prediction.avg_score}%</span>
            <span>Attendance est: {prediction.attendance}%</span>
          </div>
          {prediction.prediction.explanation?.factors?.length > 0 && (
            <ul className="mt-4 space-y-3">
              {prediction.prediction.explanation.factors.map((f) => (
                <li key={f.factor} className="rounded-xl border border-slate-200 bg-white/80 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold text-slate-900">{f.factor}</span>
                    <span className="text-sm font-bold text-slate-700">{f.value}</span>
                  </div>
                  <div className="progress-track mt-2">
                    <div
                      className={`progress-fill ${statusBarClass(f.status)}`}
                      style={{
                        width: f.status === 'critical' ? '100%' : f.status === 'warning' ? '66%' : '33%',
                      }}
                    />
                  </div>
                  <p className="mt-2 text-sm text-slate-600">{f.message}</p>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 text-sm leading-relaxed text-slate-700">{prediction.prediction.recommendation}</p>
        </div>
      )}

      {portalOpen && (
        <div className="modal-overlay" role="dialog">
          <div className="modal-content max-w-lg">
            <p className="font-heading text-lg font-bold text-slate-900">Parent portal link</p>
            <p className="mt-2 text-sm text-slate-600">Share this read-only URL. It expires in 30 days.</p>
            <input readOnly className="input mt-4 font-mono text-xs" value={portalUrl} onFocus={(e) => e.target.select()} />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setPortalOpen(false)}>
                Close
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  navigator.clipboard.writeText(portalUrl)
                  showToast('Copied to clipboard', 'success')
                }}
              >
                Copy URL
              </button>
            </div>
          </div>
        </div>
      )}

      {report && (
        <div className="card no-print p-6">
          <div className="flex items-start justify-between gap-4">
            <p className="font-heading text-lg font-bold text-slate-900">AI report</p>
            <button type="button" className="btn-secondary text-sm" onClick={printReport}>
              Print
            </button>
          </div>
          <pre className="mt-4 whitespace-pre-wrap rounded-2xl bg-slate-50 p-5 font-sans text-sm leading-relaxed text-slate-800 ring-1 ring-slate-200">
            {report}
          </pre>
        </div>
      )}

      {chartData.length > 0 && (
        <div className="card p-6">
          <p className="font-heading font-bold text-slate-900">Subject performance</p>
          <SubjectBarChart data={chartData} />
        </div>
      )}

      <div className="flex flex-wrap gap-2 rounded-2xl bg-slate-100 p-1">
        <button
          type="button"
          className={`flex-1 rounded-xl px-4 py-2 text-sm font-semibold transition-all duration-200 ${
            tab === 'scores' ? 'bg-white text-indigo-800 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
          onClick={() => setTab('scores')}
        >
          Exam scores
        </button>
        <button
          type="button"
          className={`flex-1 rounded-xl px-4 py-2 text-sm font-semibold transition-all duration-200 ${
            tab === 'attendance' ? 'bg-white text-indigo-800 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
          onClick={() => setTab('attendance')}
        >
          Attendance records
        </button>
        <button
          type="button"
          className={`flex-1 rounded-xl px-4 py-2 text-sm font-semibold transition-all duration-200 ${
            tab === 'alerts' ? 'bg-white text-indigo-800 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
          onClick={async () => {
            setTab('alerts')
            if (alerts.length === 0) {
              setAlertsLoading(true)
              try {
                const { data } = await alertsAPI.list({ student_id: id, limit: 100 })
                setAlerts(data.alerts || [])
              } catch (_) {
                // keep empty, surface silently
              } finally {
                setAlertsLoading(false)
              }
            }
          }}
        >
          Alert history
        </button>
      </div>

      {tab === 'scores' && (
        <>
          <div className="card p-6">
            <p className="font-heading font-bold text-slate-900">Quick add score</p>
            <form className="mt-4 grid gap-3 md:grid-cols-3" onSubmit={saveScore}>
              <div className="md:col-span-3">
                <label className="label">Subject</label>
                <div className="flex flex-wrap gap-2">
                  {subjects.map((s) => {
                    const active = scoreForm.subject_id === String(s.id)
                    const accent = s.color || '#6366f1'
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setScoreForm({ ...scoreForm, subject_id: String(s.id) })}
                        className={`rounded-xl border-2 px-3 py-2 text-sm font-semibold transition-all ${
                          active ? 'shadow-sm ring-2 ring-indigo-400/80' : 'border-slate-200 bg-white hover:bg-slate-50'
                        }`}
                        style={
                          active
                            ? { borderColor: accent, backgroundColor: `${accent}14` }
                            : { borderColor: '#e2e8f0' }
                        }
                      >
                        <span className="mr-1">{s.icon || '📘'}</span>
                        {s.name}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div>
                <label className="label">Score</label>
                <input className="input" value={scoreForm.score} onChange={(e) => setScoreForm({ ...scoreForm, score: e.target.value })} />
              </div>
              <div>
                <label className="label">Max</label>
                <input className="input" value={scoreForm.max_score} onChange={(e) => setScoreForm({ ...scoreForm, max_score: e.target.value })} />
              </div>
              <div>
                <label className="label">Exam type</label>
                <select
                  className="input"
                  value={scoreForm.exam_type}
                  onChange={(e) => setScoreForm({ ...scoreForm, exam_type: e.target.value })}
                >
                  {EXAM_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Date</label>
                <input className="input" type="date" value={scoreForm.exam_date} onChange={(e) => setScoreForm({ ...scoreForm, exam_date: e.target.value })} />
              </div>
              <div className="flex items-end">
                <button type="submit" className="btn-primary w-full">
                  Save score
                </button>
              </div>
              <div className="md:col-span-3 rounded-2xl border border-indigo-100 bg-indigo-50/40 p-4 text-sm text-slate-700">
                Preview:{' '}
                <span className="font-bold text-indigo-800">
                  {pctPreview != null ? `${pctPreview.toFixed(1)}% (${gradeFromPct(pctPreview)})` : '—'}
                </span>
              </div>
            </form>
          </div>

          <div className="card overflow-hidden">
            <div className="border-b border-slate-100 px-6 py-4">
              <p className="font-heading font-bold text-slate-900">Exam records</p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-[900px] w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Subject</th>
                    <th className="px-4 py-3">Score</th>
                    <th className="px-4 py-3">%</th>
                    <th className="px-4 py-3">Grade</th>
                    <th className="px-4 py-3">Exam</th>
                    <th className="px-4 py-3">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {perf.records?.map((r) => (
                    <tr key={r.id} className="border-t border-slate-100">
                      <td className="px-4 py-3 font-semibold text-slate-900">{r.subject_name}</td>
                      <td className="px-4 py-3 text-slate-700">
                        {r.score}/{r.max_score}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="progress-track w-28">
                            <div className="progress-fill bg-gradient-to-r from-indigo-600 to-sky-400" style={{ width: `${r.percentage}%` }} />
                          </div>
                          <span className="font-semibold">{r.percentage}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold ring-1 ring-slate-200">{r.grade}</span>
                      </td>
                      <td className="px-4 py-3 capitalize text-slate-600">{String(r.exam_type).replace('_', ' ')}</td>
                      <td className="px-4 py-3 text-slate-500">{r.exam_date}</td>
                    </tr>
                  ))}
                  {!perf.records?.length && (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-400">
                        No scores yet — add one above.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {tab === 'attendance' && (
        <>
          <div className="card p-6">
            <p className="font-heading font-bold text-slate-900">Mark attendance (this student)</p>
            <form className="mt-4 grid gap-3 md:grid-cols-3" onSubmit={saveAtt}>
              <div>
                <label className="label">Date</label>
                <input className="input" type="date" value={attForm.date} onChange={(e) => setAttForm({ ...attForm, date: e.target.value })} />
              </div>
              <div>
                <label className="label">Status</label>
                <select className="input" value={attForm.status} onChange={(e) => setAttForm({ ...attForm, status: e.target.value })}>
                  <option value="present">Present</option>
                  <option value="absent">Absent</option>
                  <option value="late">Late</option>
                </select>
              </div>
              <div className="flex items-end">
                <button type="submit" className="btn-primary w-full">
                  Save row
                </button>
              </div>
            </form>
          </div>

          <div className="card overflow-hidden">
            <div className="border-b border-slate-100 px-6 py-4">
              <p className="font-heading font-bold text-slate-900">History</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {att.map((r) => (
                    <tr key={r.id} className="border-t border-slate-100">
                      <td className="px-4 py-3 text-slate-700">{r.date}</td>
                      <td className="px-4 py-3 capitalize">
                        <span
                          className={
                            r.status === 'present'
                              ? 'badge-low'
                              : r.status === 'late'
                                ? 'badge-medium'
                                : 'badge-high'
                          }
                        >
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {!att.length && (
                    <tr>
                      <td colSpan={2} className="px-4 py-10 text-center text-sm text-slate-400">
                        No attendance rows yet
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {tab === 'alerts' && (
        <div className="card overflow-hidden">
          <div className="border-b border-slate-100 px-6 py-4">
            <p className="font-heading font-bold text-slate-900">Automated alerts</p>
            <p className="text-xs text-slate-500">
              Outbound parent notifications triggered by this student's grades and attendance.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Sent</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Channel</th>
                  <th className="px-4 py-3">Recipient</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {alertsLoading ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-400">
                      Loading…
                    </td>
                  </tr>
                ) : alerts.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-400">
                      No alerts have been dispatched for this student.
                    </td>
                  </tr>
                ) : (
                  alerts.map((a) => (
                    <tr key={a.id} className="border-t border-slate-100">
                      <td className="px-4 py-2 text-xs text-slate-500">
                        {a.sent_at?.replace('T', ' ').slice(0, 19)}
                      </td>
                      <td className="px-4 py-2">{a.alert_type}</td>
                      <td className="px-4 py-2">{a.channel}</td>
                      <td className="px-4 py-2 text-slate-500">{a.recipient || '—'}</td>
                      <td className="px-4 py-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            a.status === 'sent'
                              ? 'bg-emerald-50 text-emerald-700'
                              : a.status === 'failed'
                                ? 'bg-rose-50 text-rose-700'
                                : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {a.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
