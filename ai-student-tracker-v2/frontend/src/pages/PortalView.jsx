import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatAxiosError, portalPublicAPI } from '../services/api'

function StatRing({ pct, label }) {
  const clamped = Math.min(100, Math.max(0, Number(pct) || 0))
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="relative h-28 w-28">
        <svg className="h-full w-full -rotate-90" viewBox="0 0 36 36">
          <path
            className="text-slate-100"
            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
          />
          <path
            className="text-indigo-600"
            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            fill="none"
            stroke="currentColor"
            strokeDasharray={`${clamped}, 100`}
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-heading text-xl font-bold text-slate-900">{clamped.toFixed(0)}%</span>
        </div>
      </div>
      <p className="mt-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
    </div>
  )
}

export default function PortalView() {
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)
  const [pdfBusy, setPdfBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!token?.trim()) {
        setErr('Missing token in URL.')
        setLoading(false)
        return
      }
      try {
        setLoading(true)
        const res = await portalPublicAPI.getMe(token.trim())
        if (!cancelled) setData(res.data)
      } catch (e) {
        if (!cancelled) setErr(formatAxiosError(e, 'Could not load portal'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [token])

  const downloadPdf = async () => {
    try {
      setPdfBusy(true)
      const res = await portalPublicAPI.downloadPdf(token.trim())
      const blob = new Blob([res.data], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `academic_report_${data?.student?.roll_number || 'student'}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setErr(formatAxiosError(e, 'PDF download failed'))
    } finally {
      setPdfBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="space-y-3 text-center">
          <div className="skeleton mx-auto h-12 w-12 rounded-2xl" />
          <p className="text-sm text-slate-500">Loading portal…</p>
        </div>
      </div>
    )
  }

  if (err || !data?.student) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4">
        <div className="card max-w-md p-8 text-center">
          <p className="font-heading text-lg font-bold text-red-800">Unable to open portal</p>
          <p className="mt-2 text-sm text-slate-600">{err || 'Invalid response'}</p>
        </div>
      </div>
    )
  }

  const chartData = data.chart_scores || []
  const expl = data.explanation || {}

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50/40 px-4 py-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-xl shadow-indigo-950/10">
          <div className="bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-8 text-white">
            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-100">Student portal</p>
            <h1 className="mt-2 font-heading text-2xl font-bold">{data.student.name}</h1>
            <p className="mt-1 text-sm text-indigo-100/90">
              Class {data.student.class_name}-{data.student.section} · Roll {data.student.roll_number}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {data.risk_level && (
                <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-bold ring-1 ring-white/30">
                  {data.risk_level} risk · {data.risk_score ?? '—'}
                </span>
              )}
            </div>
          </div>

          <div className="grid gap-6 p-6 md:grid-cols-2">
            <StatRing pct={data.attendance_pct} label="Attendance" />
            <div className="flex flex-col justify-center rounded-2xl border border-slate-200 bg-slate-50/80 p-5">
              <p className="text-xs font-semibold uppercase text-slate-500">Overall</p>
              <p className="mt-1 font-heading text-3xl font-bold text-slate-900">{data.average}%</p>
              <p className="text-sm text-slate-600">Grade {data.letter_grade}</p>
            </div>
          </div>
        </div>

        {chartData.length > 0 && (
          <div className="card p-6">
            <p className="font-heading font-bold text-slate-900">Subject scores</p>
            <div className="mt-4 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="subject" tick={{ fontSize: 11 }} stroke="#64748b" />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} stroke="#64748b" />
                  <Tooltip />
                  <Bar dataKey="percentage" radius={[6, 6, 0, 0]}>
                    {chartData.map((_, i) => (
                      <Cell key={i} fill={['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#8b5cf6'][i % 5]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {expl?.factors?.length > 0 && (
          <div className="card p-6">
            <p className="font-heading font-bold text-slate-900">Risk factors</p>
            <ul className="mt-4 space-y-3">
              {expl.factors.map((f) => (
                <li
                  key={f.factor}
                  className="rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3 text-sm text-slate-700"
                >
                  <span className="font-semibold text-slate-900">{f.factor}</span>: {f.value}{' '}
                  <span className="text-slate-500">({f.status})</span>
                  <p className="mt-1 text-slate-600">{f.message}</p>
                </li>
              ))}
            </ul>
          </div>
        )}

        {data.recommendation && (
          <div className="card border-indigo-100 bg-indigo-50/40 p-6">
            <p className="font-heading font-bold text-slate-900">Recommendation</p>
            <p className="mt-3 text-sm leading-relaxed text-slate-700">{data.recommendation}</p>
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <button type="button" className="btn-primary px-6 py-3" disabled={pdfBusy} onClick={downloadPdf}>
            {pdfBusy ? 'Preparing PDF…' : 'Download PDF Report'}
          </button>
        </div>

        <p className="text-center text-xs text-slate-400">Read-only portal · Contact your teacher if this link expired.</p>
      </div>
    </div>
  )
}
