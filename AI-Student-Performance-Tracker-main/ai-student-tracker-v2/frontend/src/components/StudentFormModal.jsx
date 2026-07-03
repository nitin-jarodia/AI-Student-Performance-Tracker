import { useState } from 'react'
import { studentAPI } from '../services/api'

const FIELDS = [
  { key: 'name', label: 'Full name', required: true },
  { key: 'email', label: 'Email', type: 'email' },
  { key: 'roll_number', label: 'Roll number', required: true },
  { key: 'class_name', label: 'Class', required: true },
  { key: 'section', label: 'Section', required: true },
  { key: 'parent_name', label: 'Parent name' },
  { key: 'parent_phone', label: 'Parent phone' },
  { key: 'parent_email', label: 'Parent email', type: 'email' },
]

export default function StudentFormModal({ open, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: '',
    email: '',
    roll_number: '',
    class_name: '',
    section: '',
    parent_name: '',
    parent_phone: '',
    parent_email: '',
    address: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  if (!open) return null

  const submit = async () => {
    if (!form.name || !form.roll_number || !form.class_name || !form.section) {
      setError('Name, roll number, class, and section are required.')
      return
    }
    try {
      setLoading(true)
      setError('')
      await studentAPI.create(form)
      onSaved?.()
      onClose()
      setForm({
        name: '',
        email: '',
        roll_number: '',
        class_name: '',
        section: '',
        parent_name: '',
        parent_phone: '',
        parent_email: '',
        address: '',
      })
    } catch (e) {
      setError(e.response?.data?.detail || 'Could not create student')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-content max-w-xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="font-heading text-lg font-bold text-slate-900">Add student</p>
            <p className="text-sm text-slate-500">Creates a profile teachers can track immediately</p>
          </div>
          <button type="button" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100" onClick={onClose}>
            ✕
          </button>
        </div>

        {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {FIELDS.map((f) => (
            <div key={f.key} className={f.key === 'parent_email' ? 'sm:col-span-2' : ''}>
              <label className="label">
                {f.label}
                {f.required ? ' *' : ''}
              </label>
              <input
                className="input"
                type={f.type || 'text'}
                value={form[f.key]}
                onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
              />
            </div>
          ))}
          <div className="sm:col-span-2">
            <label className="label">Address</label>
            <textarea className="input min-h-[84px]" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn-primary" disabled={loading} onClick={submit}>
            {loading ? 'Saving…' : 'Save student'}
          </button>
        </div>
      </div>
    </div>
  )
}
