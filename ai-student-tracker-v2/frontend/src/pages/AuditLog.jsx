import { useCallback, useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { adminAPI, formatAxiosError } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'

export default function AuditLog() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [actionQ, setActionQ] = useState('')
  const [actorQ, setActorQ] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [actorFilter, setActorFilter] = useState('')
  const [selected, setSelected] = useState(null)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const res = await adminAPI.auditLogs({
        page,
        limit: 40,
        action: actionFilter || undefined,
        actor: actorFilter || undefined,
      })
      setItems(res.data.items || [])
      setTotal(res.data.total || 0)
    } catch (e) {
      showToast(formatAxiosError(e), 'error')
    } finally {
      setLoading(false)
    }
  }, [page, actionFilter, actorFilter, showToast])

  useEffect(() => {
    load()
  }, [load])

  const applyFilters = () => {
    setActionFilter(actionQ.trim())
    setActorFilter(actorQ.trim())
    setPage(1)
  }

  if (user?.role !== 'admin') {
    return <Navigate to="/" replace />
  }

  const pages = Math.max(1, Math.ceil(total / 40))

  return (
    <div className="animate-fade-in mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold text-slate-900">Audit log</h1>
        <p className="mt-1 text-sm text-slate-500">Immutable record of administrative and teaching actions</p>
      </div>

      <div className="card flex flex-wrap items-end gap-4 p-4">
        <div>
          <label className="label">Action</label>
          <input
            className="input w-48"
            value={actionQ}
            onChange={(e) => setActionQ(e.target.value)}
            placeholder="e.g. ADD_SCORE"
          />
        </div>
        <div>
          <label className="label">Actor email contains</label>
          <input
            className="input w-56"
            value={actorQ}
            onChange={(e) => setActorQ(e.target.value)}
            placeholder="partial match"
          />
        </div>
        <button type="button" className="btn-secondary self-end" onClick={applyFilters}>
          Apply filters
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card overflow-hidden lg:col-span-2">
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="text-xs font-semibold uppercase text-slate-500">{total} events</p>
          </div>
          <div className="max-h-[560px] overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">When</th>
                  <th className="px-3 py-2">Actor</th>
                  <th className="px-3 py-2">Action</th>
                  <th className="px-3 py-2">Target</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-8 text-center text-slate-400">
                      Loading…
                    </td>
                  </tr>
                ) : (
                  items.map((row) => (
                    <tr
                      key={row.id}
                      className={`cursor-pointer border-t border-slate-100 hover:bg-indigo-50/40 ${selected?.id === row.id ? 'bg-indigo-50/60' : ''}`}
                      onClick={() => setSelected(row)}
                    >
                      <td className="whitespace-nowrap px-3 py-2 text-slate-600">{row.created_at}</td>
                      <td className="max-w-[140px] truncate px-3 py-2 text-slate-800">{row.actor_email}</td>
                      <td className="px-3 py-2 font-medium text-indigo-800">{row.action}</td>
                      <td className="px-3 py-2 text-slate-600">
                        {row.target_type || '—'} {row.target_id != null ? `#${row.target_id}` : ''}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3">
            <button type="button" className="btn-ghost text-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </button>
            <span className="text-xs text-slate-500">
              Page {page} / {pages}
            </span>
            <button
              type="button"
              className="btn-ghost text-sm"
              disabled={page >= pages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </div>

        <div className="card p-4">
          <p className="font-heading text-sm font-bold text-slate-900">Detail</p>
          {selected ? (
            <pre className="mt-3 max-h-[480px] overflow-auto rounded-xl bg-slate-900 p-4 text-xs leading-relaxed text-emerald-100">
              {JSON.stringify(selected.detail || {}, null, 2)}
            </pre>
          ) : (
            <p className="mt-4 text-sm text-slate-500">Select a row to inspect JSON detail.</p>
          )}
          {selected?.ip_address && (
            <p className="mt-3 text-xs text-slate-500">IP: {selected.ip_address}</p>
          )}
        </div>
      </div>
    </div>
  )
}
