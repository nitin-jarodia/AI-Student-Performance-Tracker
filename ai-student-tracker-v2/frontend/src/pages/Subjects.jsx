import { useEffect, useMemo, useState } from 'react'
import { subjectAPI, formatAxiosError } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'

const emptyForm = {
  id: null,
  name: '',
  code: '',
  class_name: 'ALL',
  teacher_id: '',
  description: '',
  is_active: true,
}

export default function SubjectsPage() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const notify = (msg, type) => showToast(msg, type)
  const role = (user?.role || 'teacher').toLowerCase()
  const canManage = role === 'admin' || role === 'teacher'

  const [subjects, setSubjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [classFilter, setClassFilter] = useState('')
  const [includeInactive, setIncludeInactive] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  const fetchSubjects = async () => {
    setLoading(true)
    try {
      const params = {}
      if (includeInactive && role === 'admin') params.include_inactive = true
      if (classFilter) params.class_name = classFilter
      if (search.trim()) params.search = search.trim()
      const { data } = await subjectAPI.getAll(params)
      setSubjects(data.subjects || [])
    } catch (err) {
      notify(formatAxiosError(err, 'Failed to load subjects'), 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSubjects()
    
  }, [includeInactive, classFilter])

  const filtered = useMemo(() => {
    if (!search.trim()) return subjects
    const q = search.trim().toLowerCase()
    return subjects.filter(
      (s) =>
        s.name?.toLowerCase().includes(q) ||
        s.code?.toLowerCase().includes(q) ||
        s.class_name?.toLowerCase().includes(q),
    )
  }, [subjects, search])

  const openCreate = () => {
    setForm({ ...emptyForm })
    setModalOpen(true)
  }

  const openEdit = (s) => {
    setForm({
      id: s.id,
      name: s.name || '',
      code: s.code || '',
      class_name: s.class_name || 'ALL',
      teacher_id: s.teacher_id || '',
      description: s.description || '',
      is_active: Boolean(s.is_active),
    })
    setModalOpen(true)
  }

  const submitForm = async (e) => {
    e.preventDefault()
    if (!form.name.trim() || !form.code.trim() || !form.class_name.trim()) {
      notify('Name, code and class are required', 'error')
      return
    }
    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        code: form.code.trim(),
        class_name: form.class_name.trim(),
        teacher_id: form.teacher_id ? Number(form.teacher_id) : null,
        description: form.description?.trim() || null,
        is_active: form.is_active,
      }
      if (form.id) {
        await subjectAPI.update(form.id, payload)
        notify('Subject updated', 'success')
      } else {
        await subjectAPI.create(payload)
        notify('Subject created', 'success')
      }
      setModalOpen(false)
      fetchSubjects()
    } catch (err) {
      notify(formatAxiosError(err, 'Failed to save subject'), 'error')
    } finally {
      setSaving(false)
    }
  }

  const deactivate = async (s) => {
    if (!confirm(`Deactivate subject "${s.name}"? Historical scores are preserved.`)) return
    try {
      await subjectAPI.delete(s.id)
      notify('Subject deactivated', 'success')
      fetchSubjects()
    } catch (err) {
      notify(formatAxiosError(err, 'Failed to deactivate subject'), 'error')
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Subjects</h1>
          <p className="text-sm text-slate-500">
            Manage the subject catalog used for scores, reports, and attendance.
          </p>
        </div>
        {canManage && (
          <button
            onClick={openCreate}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
          >
            + New subject
          </button>
        )}
      </header>

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, code, or class"
          className="min-w-[220px] flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400"
        />
        <input
          value={classFilter}
          onChange={(e) => setClassFilter(e.target.value)}
          placeholder="Filter class (e.g. 10)"
          className="w-40 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400"
        />
        {role === 'admin' && (
          <label className="inline-flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(e) => setIncludeInactive(e.target.checked)}
            />
            Show inactive
          </label>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Subject</th>
              <th className="px-4 py-3">Code</th>
              <th className="px-4 py-3">Class</th>
              <th className="px-4 py-3">Teacher</th>
              <th className="px-4 py-3">Status</th>
              {canManage && <th className="px-4 py-3 text-right">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                  Loading…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                  No subjects match the current filters.
                </td>
              </tr>
            ) : (
              filtered.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">
                    <span className="mr-2">{s.icon || '📘'}</span>
                    {s.name}
                    {s.description && (
                      <div className="mt-0.5 line-clamp-1 text-xs text-slate-500">{s.description}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">{s.code}</td>
                  <td className="px-4 py-3">{s.class_name}</td>
                  <td className="px-4 py-3">{s.teacher_id || '—'}</td>
                  <td className="px-4 py-3">
                    {s.is_active ? (
                      <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                        Inactive
                      </span>
                    )}
                  </td>
                  {canManage && (
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => openEdit(s)}
                        className="rounded-lg px-3 py-1 text-xs font-semibold text-indigo-600 hover:bg-indigo-50"
                      >
                        Edit
                      </button>
                      {s.is_active && (
                        <button
                          onClick={() => deactivate(s)}
                          className="ml-1 rounded-lg px-3 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                        >
                          Deactivate
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <form
            onSubmit={submitForm}
            className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl"
          >
            <h2 className="text-lg font-semibold text-slate-900">
              {form.id ? 'Edit subject' : 'New subject'}
            </h2>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-sm">
                <span className="mb-1 block text-slate-600">Name</span>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  required
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-slate-600">Code</span>
                <input
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm uppercase"
                  required
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-slate-600">Class</span>
                <input
                  value={form.class_name}
                  onChange={(e) => setForm({ ...form, class_name: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  required
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-slate-600">Teacher (user ID)</span>
                <input
                  type="number"
                  value={form.teacher_id}
                  onChange={(e) => setForm({ ...form, teacher_id: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  placeholder="Optional"
                />
              </label>
              <label className="sm:col-span-2 text-sm">
                <span className="mb-1 block text-slate-600">Description</span>
                <textarea
                  rows={2}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                />
                Active
              </label>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
              >
                {saving ? 'Saving…' : form.id ? 'Save changes' : 'Create subject'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
