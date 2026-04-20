import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { qrPublicAPI, formatAxiosError } from '../services/api'

export default function StudentScan() {
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const [studentId, setStudentId] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  const ready = useMemo(() => Boolean(token), [token])

  const submit = async (e) => {
    e.preventDefault()
    if (!token) {
      setMsg({ type: 'error', text: 'Missing token in URL. Ask your teacher to rescan the class QR.' })
      return
    }
    const sid = parseInt(studentId, 10)
    if (!sid) {
      setMsg({ type: 'error', text: 'Enter a valid student ID.' })
      return
    }
    try {
      setBusy(true)
      const res = await qrPublicAPI.scan({ token, student_id: sid })
      const status = res.data.status
      if (status === 'success') {
        setMsg({ type: 'success', text: res.data.message || 'Attendance marked.' })
      } else if (status === 'already_marked') {
        setMsg({ type: 'warning', text: res.data.message || 'Already marked today for this QR.' })
      } else {
        setMsg({ type: 'info', text: res.data.message || 'Done.' })
      }
    } catch (err) {
      const detail = formatAxiosError(err)
      setMsg({ type: 'error', text: detail })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-indigo-900 to-slate-900 px-4 py-10">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-2xl ring-1 ring-slate-100">
        <div className="mb-6 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600 text-2xl text-white shadow-lg">
            📱
          </div>
          <h1 className="mt-4 font-heading text-xl font-bold text-slate-900">Mark attendance</h1>
          <p className="mt-2 text-sm text-slate-500">
            Use the QR link from your teacher. Tokens expire quickly for security.
          </p>
        </div>

        {!ready && (
          <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900 ring-1 ring-amber-100">
            No token found. Open the URL that ends with <span className="font-mono">?token=...</span>
          </div>
        )}

        <form className="mt-6 space-y-4" onSubmit={submit}>
          <div>
            <label className="label">Student ID</label>
            <input className="input" inputMode="numeric" value={studentId} onChange={(e) => setStudentId(e.target.value)} placeholder="e.g. 12" />
          </div>
          <button type="submit" className="btn-primary w-full" disabled={busy || !ready}>
            {busy ? 'Submitting…' : 'Mark attendance'}
          </button>
        </form>

        {msg && (
          <div
            className={`mt-6 rounded-2xl px-4 py-3 text-sm font-semibold ring-1 ${
              msg.type === 'success'
                ? 'bg-emerald-50 text-emerald-900 ring-emerald-100'
                : msg.type === 'warning'
                  ? 'bg-amber-50 text-amber-900 ring-amber-100'
                  : msg.type === 'info'
                    ? 'bg-sky-50 text-sky-900 ring-sky-100'
                    : 'bg-red-50 text-red-900 ring-red-100'
            }`}
          >
            {msg.text}
          </div>
        )}
      </div>
    </div>
  )
}
