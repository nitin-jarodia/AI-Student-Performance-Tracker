import { useEffect, useMemo, useState } from 'react'
import { qrAPI, studentAPI, formatAxiosError } from '../services/api'
import { useToast } from '../context/ToastContext'

export default function QRAttendance() {
  const { showToast } = useToast()
  const [classes, setClasses] = useState([])
  const [cls, setCls] = useState('')
  const [sec, setSec] = useState('')
  const [busy, setBusy] = useState(false)
  const [session, setSession] = useState(null)
  const [expiresAt, setExpiresAt] = useState(null)
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (!session?.session_id) return undefined
    const poll = async () => {
      try {
        const res = await qrAPI.sessionStatus(session.session_id)
        setSession((prev) => ({ ...prev, ...res.data }))
      } catch {
        /* ignore transient */
      }
    }
    poll()
    const id = setInterval(poll, 5000)
    return () => clearInterval(id)
  }, [session?.session_id])

  useEffect(() => {
    async function loadRefs() {
      try {
        const res = await studentAPI.getAll()
        const uniq = {}
        ;(res.data.students || []).forEach((s) => {
          uniq[s.class_name] = true
        })
        setClasses(Object.keys(uniq).sort())
      } catch {
        setClasses([])
      }
    }
    loadRefs()
  }, [])

  const remaining = useMemo(() => {
    if (!expiresAt) return null
    const end = new Date(expiresAt).getTime()
    const ms = Math.max(0, end - now)
    const m = Math.floor(ms / 60000)
    const s = Math.floor((ms % 60000) / 1000)
    return `${m}m ${s}s`
  }, [expiresAt, now])

  const generate = async () => {
    if (!cls || !sec) {
      showToast('Choose class and section', 'warning')
      return
    }
    try {
      setBusy(true)
      const res = await qrAPI.generate({ class_name: cls, section: sec, expires_minutes: 15 })
      setSession({
        session_id: res.data.session_id,
        qr_image_base64: res.data.qr_image_base64,
        scan_url: res.data.scan_url,
        scans: [],
        total: 0,
      })
      setExpiresAt(res.data.expires_at)
      showToast('QR ready', 'success')
    } catch (err) {
      showToast(formatAxiosError(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  const scans = session?.scans || []

  return (
    <div className="animate-fade-in mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">QR attendance</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Project the code — students open the scan URL on their phones.</p>
      </div>

      <div className="card grid gap-4 p-6 md:grid-cols-3">
        <div>
          <label className="label">Class</label>
          <input className="input" list="classes" value={cls} onChange={(e) => setCls(e.target.value)} placeholder="10A / pick" />
          <datalist id="classes">
            {classes.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
        <div>
          <label className="label">Section</label>
          <input className="input" value={sec} onChange={(e) => setSec(e.target.value)} placeholder="A" />
        </div>
        <div className="flex items-end gap-2">
          <button type="button" className="btn-primary flex-1" disabled={busy} onClick={generate}>
            {busy ? 'Generating…' : 'Generate QR'}
          </button>
          <button type="button" className="btn-secondary flex-1" disabled={busy} onClick={generate}>
            Regenerate
          </button>
        </div>
      </div>

      {session?.qr_image_base64 && (
        <div className="card grid gap-6 p-6 lg:grid-cols-2">
          <div className="flex flex-col items-center justify-center">
            <img
              alt="Attendance QR"
              className="h-72 w-72 rounded-3xl bg-white p-4 shadow-inner ring-1 ring-slate-100"
              src={`data:image/png;base64,${session.qr_image_base64}`}
            />
            <p className="mt-4 text-center text-xs text-slate-500 break-all">{session.scan_url}</p>
            {remaining && (
              <p className="mt-3 rounded-full bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900 ring-1 ring-amber-100">
                Expires in {remaining}
              </p>
            )}
          </div>
          <div>
            <p className="font-heading font-bold text-slate-900">Live scans</p>
            <p className="text-xs text-slate-500">Polling every 5 seconds</p>
            <div className="mt-4 max-h-[360px] space-y-2 overflow-y-auto rounded-2xl border border-slate-100 bg-slate-50 p-3">
              {scans.map((s) => (
                <div key={`${s.student_id}-${s.scanned_at}`} className="flex items-center justify-between rounded-xl bg-white px-3 py-2 text-sm shadow-sm ring-1 ring-slate-100">
                  <span className="font-semibold text-slate-900">{s.name}</span>
                  <span className="text-xs text-slate-500">{s.scanned_at}</span>
                </div>
              ))}
              {!scans.length && <p className="text-center text-sm text-slate-400">Waiting for scans…</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
