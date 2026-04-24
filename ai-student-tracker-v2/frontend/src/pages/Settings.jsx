import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { mlAPI, formatAxiosError } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'

export default function Settings() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [trainBusy, setTrainBusy] = useState(false)
  const [trainRealBusy, setTrainRealBusy] = useState(false)
  const [lastTrainMsg, setLastTrainMsg] = useState(null)

  const load = async () => {
    try {
      setLoading(true)
      const res = await mlAPI.modelStatus()
      setStatus(res.data)
    } catch (e) {
      showToast(formatAxiosError(e), 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const runSynthetic = async () => {
    try {
      setTrainBusy(true)
      const res = await mlAPI.train()
      setLastTrainMsg(res.data)
      showToast(res.data?.message || 'Training finished', res.data?.status === 'success' ? 'success' : 'warning')
      await load()
    } catch (e) {
      showToast(formatAxiosError(e), 'error')
    } finally {
      setTrainBusy(false)
    }
  }

  const runReal = async () => {
    try {
      setTrainRealBusy(true)
      const res = await mlAPI.trainReal()
      setLastTrainMsg(res.data)
      showToast('Real-data training completed', 'success')
      await load()
    } catch (e) {
      showToast(formatAxiosError(e), 'error')
    } finally {
      setTrainRealBusy(false)
    }
  }

  if (user?.role !== 'admin') {
    return <Navigate to="/" replace />
  }

  const reg = status?.registry || {}

  return (
    <div className="animate-fade-in mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">ML & model registry</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Training jobs and active checkpoint selection (admin only).</p>
      </div>

      {loading ? (
        <div className="skeleton h-40 rounded-2xl" />
      ) : (
        <div className="card space-y-4 p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase text-slate-500">Active model</p>
              <p className="mt-2 font-heading text-xl font-bold text-slate-900">{status?.active_model || reg.active_model || '—'}</p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase text-slate-500">API status</p>
              <p className="mt-2 text-sm text-slate-700">{status?.status}</p>
            </div>
          </div>

          <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4 text-sm text-slate-700">
            <p>
              <strong>Synthetic accuracy (holdout):</strong> {reg.synthetic_model_accuracy ?? '—'}
            </p>
            <p className="mt-2">
              <strong>Real CV accuracy:</strong> {reg.real_cv_accuracy ?? '—'}
            </p>
            <p className="mt-2">
              <strong>Real model students:</strong> {reg.real_model_students ?? 0}
            </p>
            <p className="mt-1 text-xs text-slate-500">Last real train: {reg.real_model_trained_at || 'never'}</p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button type="button" className="btn-secondary" disabled={trainBusy} onClick={runSynthetic}>
              {trainBusy ? 'Training…' : 'Train synthetic model'}
            </button>
            <button type="button" className="btn-primary" disabled={trainRealBusy} onClick={runReal}>
              {trainRealBusy ? 'Training…' : 'Train on real data'}
            </button>
            <button type="button" className="btn-ghost" onClick={load}>
              Refresh status
            </button>
          </div>

          {lastTrainMsg && (
            <pre className="max-h-48 overflow-auto rounded-xl bg-slate-900 p-4 text-xs text-emerald-100">
              {JSON.stringify(lastTrainMsg, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}
