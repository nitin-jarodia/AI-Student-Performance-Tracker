import { useEffect, useMemo, useState } from 'react'
import {
  DndContext,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { reportBuilderAPI, studentAPI, formatAxiosError } from '../services/api'
import { ScoreTrendChart } from '../components/Charts'
import { useToast } from '../context/ToastContext'

const LIBRARY = [
  { id: 'student_info', title: 'Student info', preview: 'Name, class, section, roll number' },
  { id: 'performance', title: 'Overall performance', preview: 'Average score, grade, totals' },
  { id: 'subject_table', title: 'Subject-wise scores', preview: 'Table of exam rows' },
  { id: 'attendance', title: 'Attendance summary', preview: 'Present/absent + %' },
  { id: 'risk', title: 'Risk assessment', preview: 'Latest AI risk signals' },
  { id: 'learning_style', title: 'Learning style', preview: 'Badge + classifier output' },
  { id: 'score_trend', title: 'Score trend chart', preview: 'Mini trend data' },
  { id: 'ai_comments', title: 'AI comments', preview: 'GPT narrative if configured' },
]

function SortableRow({ id, title, preview }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <button
        type="button"
        className="mt-1 cursor-grab rounded-lg bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600"
        {...attributes}
        {...listeners}
      >
        ⋮⋮
      </button>
      <div>
        <p className="font-semibold text-slate-900">{title}</p>
        <p className="text-xs text-slate-500">{preview}</p>
      </div>
    </div>
  )
}

export default function ReportBuilder() {
  const { showToast } = useToast()
  const [students, setStudents] = useState([])
  const [studentId, setStudentId] = useState('')
  const [blocks, setBlocks] = useState(LIBRARY.map((b) => b.id))
  const [filters, setFilters] = useState({ start: '', end: '' })
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState(false)
  const [templates, setTemplates] = useState([])
  const [tplName, setTplName] = useState('')

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  useEffect(() => {
    studentAPI
      .getAll()
      .then((res) => setStudents(res.data.students || []))
      .catch(() => showToast('Could not load students', 'error'))
  }, [])

  useEffect(() => {
    reportBuilderAPI
      .listTemplates()
      .then((res) => setTemplates(res.data.templates || []))
      .catch(() => {})
  }, [])

  const orderedLibrary = useMemo(
    () => blocks.map((id) => LIBRARY.find((b) => b.id === id)).filter(Boolean),
    [blocks],
  )

  const generatePreview = async () => {
    const sid = parseInt(studentId, 10)
    if (!sid) {
      showToast('Pick a student', 'warning')
      return
    }
    try {
      setBusy(true)
      const body = {
        student_id: sid,
        blocks,
        filters: {
          date_range:
            filters.start || filters.end
              ? {
                  start: filters.start || null,
                  end: filters.end || null,
                }
              : {},
        },
      }
      const res = await reportBuilderAPI.custom(body)
      setPreview(res.data)
      showToast('Preview ready', 'success')
    } catch (err) {
      showToast(formatAxiosError(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  const saveTemplate = async () => {
    if (!tplName.trim()) {
      showToast('Template name required', 'warning')
      return
    }
    try {
      await reportBuilderAPI.saveTemplate({
        name: tplName.trim(),
        blocks,
        filters: {
          date_range:
            filters.start || filters.end
              ? {
                  start: filters.start || null,
                  end: filters.end || null,
                }
              : {},
        },
      })
      showToast('Template saved', 'success')
      const res = await reportBuilderAPI.listTemplates()
      setTemplates(res.data.templates || [])
      setTplName('')
    } catch (err) {
      showToast(formatAxiosError(err), 'error')
    }
  }

  const exportPdf = () => window.print()

  const handleDragEnd = (event) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = blocks.indexOf(active.id)
    const newIndex = blocks.indexOf(over.id)
    setBlocks((items) => arrayMove(items, oldIndex, newIndex))
  }

  const toggleBlock = (id) => {
    setBlocks((prev) => (prev.includes(id) ? prev.filter((b) => b !== id) : [...prev, id]))
  }

  const trendData =
    preview?.blocks?.score_trend?.map((row, idx) => ({
      label: row.exam_date || idx,
      avg: row.percentage ?? row.avg ?? 0,
    })) || []

  return (
    <div className="animate-fade-in mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-bold text-slate-900">Report builder</h1>
          <p className="mt-1 text-sm text-slate-500">Compose modular report blocks, preview, print to PDF.</p>
        </div>
        <button type="button" className="btn-secondary no-print" onClick={exportPdf}>
          Export PDF / Print
        </button>
      </div>

      <div className="card no-print grid gap-4 p-5 lg:grid-cols-3">
        <div>
          <label className="label">Student</label>
          <select className="input" value={studentId} onChange={(e) => setStudentId(e.target.value)}>
            <option value="">Select…</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {s.class_name}-{s.section}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Date start</label>
          <input className="input" type="date" value={filters.start} onChange={(e) => setFilters({ ...filters, start: e.target.value })} />
        </div>
        <div>
          <label className="label">Date end</label>
          <input className="input" type="date" value={filters.end} onChange={(e) => setFilters({ ...filters, end: e.target.value })} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card no-print space-y-4 p-5">
          <p className="font-heading font-bold text-slate-900">Blocks library</p>
          <div className="flex flex-wrap gap-2">
            {LIBRARY.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => toggleBlock(b.id)}
                className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${
                  blocks.includes(b.id) ? 'bg-indigo-600 text-white ring-indigo-600' : 'bg-white text-slate-600 ring-slate-200'
                }`}
              >
                {b.title}
              </button>
            ))}
          </div>
          <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
            <SortableContext items={blocks} strategy={verticalListSortingStrategy}>
              <div className="space-y-3">
                {orderedLibrary.map((b) => (
                  <SortableRow key={b.id} id={b.id} title={b.title} preview={b.preview} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>

        <div className="card no-print space-y-4 p-5">
          <p className="font-heading font-bold text-slate-900">Actions</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primary" disabled={busy} onClick={generatePreview}>
              {busy ? 'Building…' : 'Generate preview'}
            </button>
          </div>
          <div className="rounded-2xl border border-dashed border-slate-200 p-4">
            <label className="label">Save template</label>
            <div className="flex gap-2">
              <input className="input flex-1" value={tplName} onChange={(e) => setTplName(e.target.value)} placeholder="Template name" />
              <button type="button" className="btn-secondary" onClick={saveTemplate}>
                Save
              </button>
            </div>
            <p className="mt-3 text-xs text-slate-500">
              Saved templates: {templates.map((t) => t.name).join(', ') || 'none yet'}
            </p>
          </div>
        </div>
      </div>

      {preview && (
        <div className="card space-y-6 p-6">
          <div className="flex items-center justify-between gap-3">
            <p className="font-heading text-lg font-bold text-slate-900">Live preview</p>
            <p className="text-xs text-slate-500">Student #{preview.student_id}</p>
          </div>

          {preview.blocks?.student_info && (
            <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-100">
              <p className="text-xs font-semibold uppercase text-slate-500">Student info</p>
              <div className="mt-2 grid gap-2 text-sm text-slate-800 md:grid-cols-2">
                <p>
                  <span className="font-semibold">Name:</span> {preview.blocks.student_info.name}
                </p>
                <p>
                  <span className="font-semibold">Class:</span> {preview.blocks.student_info.class_name}-{preview.blocks.student_info.section}
                </p>
                <p>
                  <span className="font-semibold">Roll:</span> {preview.blocks.student_info.roll_number}
                </p>
              </div>
            </div>
          )}

          {preview.blocks?.overall_performance && (
            <div className="rounded-2xl bg-indigo-50/70 p-4 ring-1 ring-indigo-100">
              <p className="text-xs font-semibold uppercase text-indigo-700">Overall performance</p>
              <p className="mt-2 text-sm text-indigo-900">
                Avg {preview.blocks.overall_performance.average_score}% · Grade {preview.blocks.overall_performance.grade} · Records{' '}
                {preview.blocks.overall_performance.total_records}
              </p>
            </div>
          )}

          {preview.blocks?.subject_scores && (
            <div className="overflow-x-auto rounded-2xl ring-1 ring-slate-100">
              <table className="min-w-[720px] w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Subject</th>
                    <th className="px-3 py-2">%</th>
                    <th className="px-3 py-2">Exam</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.blocks.subject_scores.map((row, idx) => (
                    <tr key={idx} className="border-t border-slate-100">
                      <td className="px-3 py-2">{row.subject}</td>
                      <td className="px-3 py-2">{row.percentage}%</td>
                      <td className="px-3 py-2 capitalize">{String(row.exam_type).replace('_', ' ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {preview.blocks?.attendance && (
            <div className="rounded-2xl bg-sky-50 p-4 ring-1 ring-sky-100">
              <p className="text-xs font-semibold uppercase text-sky-800">Attendance</p>
              <p className="mt-2 text-sm text-sky-900">
                Present {preview.blocks.attendance.present} · Absent {preview.blocks.attendance.absent} · Late {preview.blocks.attendance.late} ·{' '}
                {preview.blocks.attendance.percentage}%
              </p>
            </div>
          )}

          {preview.blocks?.risk && (
            <div className="rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-100">
              <p className="text-xs font-semibold uppercase text-amber-900">Risk</p>
              <p className="mt-2 text-sm text-amber-950">
                {preview.blocks.risk.risk_level} ({preview.blocks.risk.risk_score}) — {preview.blocks.risk.recommendation}
              </p>
            </div>
          )}

          {preview.blocks?.learning_style && (
            <div className="rounded-2xl bg-purple-50 p-4 ring-1 ring-purple-100">
              <p className="text-xs font-semibold uppercase text-purple-900">Learning style</p>
              <p className="mt-2 text-sm text-purple-950">{preview.blocks.learning_style.label || '—'}</p>
            </div>
          )}

          {preview.blocks?.score_trend && (
            <div>
              <p className="mb-2 font-heading font-bold text-slate-900">Score trend</p>
              <ScoreTrendChart data={trendData} />
            </div>
          )}

          {preview.blocks?.ai_comments && (
            <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-100">
              <p className="text-xs font-semibold uppercase text-slate-500">AI comments</p>
              <pre className="mt-3 whitespace-pre-wrap font-sans text-sm text-slate-800">{preview.blocks.ai_comments}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
