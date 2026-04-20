import { useEffect, useState } from 'react'
import { alertsAPI, formatAxiosError } from '../services/api'
import { useToast } from '../context/ToastContext'

const CHANNEL_BADGES = {
  email: 'bg-sky-50 text-sky-700',
  sms: 'bg-emerald-50 text-emerald-700',
  in_app: 'bg-violet-50 text-violet-700',
}

const STATUS_BADGES = {
  sent: 'bg-emerald-50 text-emerald-700',
  queued: 'bg-slate-100 text-slate-600',
  failed: 'bg-rose-50 text-rose-700',
  skipped: 'bg-amber-50 text-amber-700',
}

export default function AlertsPage() {
  const { showToast } = useToast()
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState('')
  const [channelStatus, setChannelStatus] = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const params = { limit: 200 }
      if (typeFilter) params.alert_type = typeFilter
      const { data } = await alertsAPI.list(params)
      setAlerts(data.alerts || [])
    } catch (err) {
      showToast(formatAxiosError(err, 'Failed to load alerts'), 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    
  }, [typeFilter])

  const testChannels = async () => {
    try {
      const { data } = await alertsAPI.testChannels()
      setChannelStatus(data)
      showToast('Channel check complete', 'success')
    } catch (err) {
      showToast(formatAxiosError(err, 'Channel check failed'), 'error')
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Alert history</h1>
          <p className="text-sm text-slate-500">
            Outbound email and SMS parent notifications triggered automatically.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
          >
            <option value="">All types</option>
            <option value="low_grade">Low grade</option>
            <option value="low_attendance">Low attendance</option>
          </select>
          <button
            onClick={testChannels}
            className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Check channels
          </button>
        </div>
      </header>

      {channelStatus && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-700 shadow-sm">
          <p>
            Email configured: <strong>{channelStatus.email_configured ? 'yes' : 'no'}</strong>
          </p>
          <p>
            SMS configured: <strong>{channelStatus.sms_configured ? 'yes' : 'no'}</strong>
          </p>
          <p>Cooldown: {channelStatus.cooldown_hours}h</p>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Sent</th>
              <th className="px-4 py-3">Student</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Channel</th>
              <th className="px-4 py-3">Recipient</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                  Loading…
                </td>
              </tr>
            ) : alerts.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                  No alerts have been sent.
                </td>
              </tr>
            ) : (
              alerts.map((a) => (
                <tr key={a.id}>
                  <td className="whitespace-nowrap px-4 py-2 text-xs text-slate-500">
                    {a.sent_at?.replace('T', ' ').slice(0, 19)}
                  </td>
                  <td className="px-4 py-2">{a.student_name || `#${a.student_id}`}</td>
                  <td className="px-4 py-2">{a.alert_type}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${CHANNEL_BADGES[a.channel] || 'bg-slate-100 text-slate-600'}`}>
                      {a.channel}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-slate-500">{a.recipient || '—'}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGES[a.status] || 'bg-slate-100 text-slate-600'}`}>
                      {a.status}
                    </span>
                    {a.error_message && (
                      <span className="ml-2 text-xs text-rose-500">{a.error_message.slice(0, 60)}</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
