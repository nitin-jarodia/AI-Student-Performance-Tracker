import { useCallback, useEffect, useRef, useState } from 'react'
import { bulkAPI, formatAxiosError } from '../services/api'
import { useToast } from '../context/ToastContext'

const EXAM_OPTIONS = [
  { value: 'unit_test', label: 'Unit test' },
  { value: 'midterm', label: 'Midterm' },
  { value: 'final', label: 'Final' },
]

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function DropZone({ disabled, children, onFile }) {
  const [drag, setDrag] = useState(false)
  const inputRef = useRef(null)

  const pick = () => inputRef.current?.click()

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => !disabled && pick()}
      onKeyDown={(e) => e.key === 'Enter' && pick()}
      onDragEnter={(e) => {
        e.preventDefault()
        setDrag(true)
      }}
      onDragLeave={() => setDrag(false)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        setDrag(false)
        const f = e.dataTransfer.files?.[0]
        if (f && !disabled) onFile(f)
      }}
      className={`rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-colors ${
        drag ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 bg-slate-50/80'
      } ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:border-indigo-300'}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.xlsx,.xls"
        className="hidden"
        disabled={disabled}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onFile(f)
          e.target.value = ''
        }}
      />
      {children}
    </div>
  )
}

export default function BulkUpload() {
  const { showToast } = useToast()
  const [tab, setTab] = useState('scores')

  /* --- Scores --- */
  const [examType, setExamType] = useState('unit_test')
  const [examDate, setExamDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [scoreFile, setScoreFile] = useState(null)
  const [scorePreview, setScorePreview] = useState(null)
  const [scoreValBusy, setScoreValBusy] = useState(false)
  const [scoreUploadBusy, setScoreUploadBusy] = useState(false)
  const [scoreProgress, setScoreProgress] = useState(0)
  const [scoreResult, setScoreResult] = useState(null)

  const runScorePreview = useCallback(
    async (file) => {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('override_exam_type', examType)
      fd.append('override_exam_date', examDate)
      const res = await bulkAPI.previewScores(fd)
      setScorePreview(res.data)
    },
    [examType, examDate]
  )

  useEffect(() => {
    if (!scoreFile) return
    let cancelled = false
    const timer = window.setTimeout(() => {
      setScoreValBusy(true)
      runScorePreview(scoreFile)
        .then(() => {
          if (!cancelled) setScoreValBusy(false)
        })
        .catch((err) => {
          if (!cancelled) {
            setScoreValBusy(false)
            showToast(formatAxiosError(err, 'Preview failed'), 'error')
          }
        })
    }, 320)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [examType, examDate, scoreFile, runScorePreview, showToast])

  const onScoreFile = (file) => {
    setScoreFile(file)
    setScoreResult(null)
  }

  const onDownloadScoreTemplate = async () => {
    try {
      const res = await bulkAPI.downloadScoresTemplate()
      downloadBlob(res.data, 'scores_template.xlsx')
    } catch {
      showToast('Download failed', 'error')
    }
  }

  const uploadScores = async () => {
    if (!scoreFile) {
      showToast('Choose a file first', 'warning')
      return
    }
    setScoreUploadBusy(true)
    setScoreProgress(0)
    setScoreResult(null)
    const steps = [15, 40, 65, 90]
    steps.forEach((p, i) => window.setTimeout(() => setScoreProgress(p), 200 * (i + 1)))
    try {
      const fd = new FormData()
      fd.append('file', scoreFile)
      fd.append('override_exam_type', examType)
      fd.append('override_exam_date', examDate)
      const res = await bulkAPI.uploadScores(fd)
      setScoreProgress(100)
      setScoreResult(res.data)
      showToast('Upload complete', 'success')
    } catch (err) {
      showToast(formatAxiosError(err), 'error')
    } finally {
      window.setTimeout(() => setScoreUploadBusy(false), 400)
    }
  }

  /* --- Students --- */
  const [stuFile, setStuFile] = useState(null)
  const [stuPreview, setStuPreview] = useState(null)
  const [stuValBusy, setStuValBusy] = useState(false)
  const [stuUploadBusy, setStuUploadBusy] = useState(false)
  const [stuProgress, setStuProgress] = useState(0)
  const [stuResult, setStuResult] = useState(null)

  const onStudentFile = async (file) => {
    setStuFile(file)
    setStuResult(null)
    setStuValBusy(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await bulkAPI.previewStudents(fd)
      setStuPreview(res.data)
    } catch {
      showToast('Could not read file', 'error')
      setStuPreview(null)
    } finally {
      setStuValBusy(false)
    }
  }

  const onDownloadStudentTemplate = async () => {
    try {
      const res = await bulkAPI.downloadStudentsTemplate()
      downloadBlob(res.data, 'students_template.xlsx')
    } catch {
      showToast('Download failed', 'error')
    }
  }

  const uploadStudents = async () => {
    if (!stuFile) {
      showToast('Choose a file first', 'warning')
      return
    }
    setStuUploadBusy(true)
    setStuProgress(0)
    setStuResult(null)
    ;[20, 55, 80].forEach((p, i) => window.setTimeout(() => setStuProgress(p), 220 * (i + 1)))
    try {
      const fd = new FormData()
      fd.append('file', stuFile)
      const res = await bulkAPI.uploadStudents(fd)
      setStuProgress(100)
      setStuResult(res.data)
      showToast('Students import complete', 'success')
    } catch (err) {
      showToast(formatAxiosError(err), 'error')
    } finally {
      window.setTimeout(() => setStuUploadBusy(false), 400)
    }
  }

  return (
    <div className="animate-fade-in mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Bulk upload</h1>
        <p className="mt-1 text-sm text-slate-500">
          Import many scores or students from Excel / CSV with validation and a clear summary
        </p>
      </div>

      <div className="flex flex-wrap gap-2 rounded-2xl bg-slate-100 p-1">
        <button
          type="button"
          className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold ${
            tab === 'scores' ? 'bg-white text-indigo-800 shadow-sm' : 'text-slate-600'
          }`}
          onClick={() => setTab('scores')}
        >
          Upload scores
        </button>
        <button
          type="button"
          className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold ${
            tab === 'students' ? 'bg-white text-indigo-800 shadow-sm' : 'text-slate-600'
          }`}
          onClick={() => setTab('students')}
        >
          Upload students
        </button>
      </div>

      {tab === 'scores' && (
        <div className="card space-y-6 p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Exam type</label>
              <select className="input" value={examType} onChange={(e) => setExamType(e.target.value)}>
                {EXAM_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Exam date</label>
              <input className="input" type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} />
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button type="button" className="btn-secondary" onClick={onDownloadScoreTemplate}>
              ⬇ Download score template
            </button>
          </div>

          <DropZone disabled={scoreValBusy || scoreUploadBusy} onFile={onScoreFile}>
            <div className="text-4xl">📎</div>
            <p className="mt-3 font-semibold text-slate-800">Drag & drop your file</p>
            <p className="mt-1 text-sm text-slate-500">or click to browse · .xlsx, .csv</p>
            {scoreFile && (
              <p className="mt-3 rounded-lg bg-white/80 px-3 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-200">
                Selected: {scoreFile.name}
              </p>
            )}
            {(scoreValBusy || scoreUploadBusy) && (
              <p className="mt-2 text-sm text-indigo-600">Working…</p>
            )}
          </DropZone>

          {scorePreview && (
            <div className="space-y-4 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-100">
              <p className="font-heading font-bold text-slate-900">Preview (first {Math.min(5, scorePreview.total_rows)} rows)</p>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-xs text-slate-700">
                  <thead>
                    <tr className="border-b border-slate-200">
                      {scorePreview.columns?.map((c) => (
                        <th key={c} className="px-2 py-2 font-semibold">
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {scorePreview.preview_rows?.map((row, i) => (
                      <tr key={i} className="border-b border-slate-100">
                        {scorePreview.columns?.map((c) => (
                          <td key={c} className="px-2 py-1.5">
                            {row[c] == null ? '—' : String(row[c])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
                <p className="text-sm font-semibold text-slate-800">Roll number check</p>
                <p className="mt-2 text-sm text-emerald-700">
                  ✅ {scorePreview.roll_numbers_found} roll numbers matched students
                </p>
                {scorePreview.roll_numbers_missing?.length > 0 && (
                  <p className="mt-2 text-sm text-red-700">
                    ❌ {scorePreview.roll_numbers_missing.length} not found:{' '}
                    {scorePreview.roll_numbers_missing.slice(0, 12).join(', ')}
                    {scorePreview.roll_numbers_missing.length > 12 ? '…' : ''}
                  </p>
                )}
              </div>
            </div>
          )}

          {scoreUploadBusy && (
            <div>
              <div className="progress-track h-3 overflow-hidden rounded-full">
                <div
                  className="h-full bg-gradient-to-r from-indigo-600 to-sky-400 transition-all duration-300"
                  style={{ width: `${scoreProgress}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-slate-500">Uploading & saving…</p>
            </div>
          )}

          {scoreResult && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-5">
              <p className="font-heading font-bold text-emerald-900">Summary</p>
              <ul className="mt-3 space-y-1 text-sm text-emerald-900">
                <li>
                  Scores saved: <strong>{scoreResult.success_count}</strong>
                </li>
                <li>
                  Failed rows: <strong>{scoreResult.failed_count}</strong>
                </li>
                <li>
                  Skipped (duplicate exam): <strong>{scoreResult.skipped_count}</strong>
                </li>
              </ul>
              {scoreResult.errors?.length > 0 && (
                <details className="mt-4">
                  <summary className="cursor-pointer text-sm font-semibold text-slate-700">Error details</summary>
                  <ul className="mt-2 max-h-40 overflow-y-auto text-xs text-red-800">
                    {scoreResult.errors.map((e, i) => (
                      <li key={i}>
                        Row {e.row}: {e.detail}
                      </li>
                    ))}
                  </ul>
                  {scoreResult.errors_truncated && (
                    <p className="text-xs text-slate-500">List truncated — see server logs for more</p>
                  )}
                </details>
              )}
            </div>
          )}

          <div className="flex justify-end border-t border-slate-100 pt-4">
            <button type="button" className="btn-primary" disabled={scoreUploadBusy || !scoreFile} onClick={uploadScores}>
              {scoreUploadBusy ? 'Uploading…' : 'Upload scores'}
            </button>
          </div>
        </div>
      )}

      {tab === 'students' && (
        <div className="card space-y-6 p-6">
          <button type="button" className="btn-secondary" onClick={onDownloadStudentTemplate}>
            ⬇ Download student template
          </button>

          <DropZone disabled={stuValBusy || stuUploadBusy} onFile={onStudentFile}>
            <div className="text-4xl">📎</div>
            <p className="mt-3 font-semibold text-slate-800">Drag & drop student file</p>
            <p className="mt-1 text-sm text-slate-500">.xlsx or .csv</p>
            {stuFile && (
              <p className="mt-3 rounded-lg bg-white/80 px-3 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-200">
                {stuFile.name}
              </p>
            )}
          </DropZone>

          {stuPreview && (
            <div className="space-y-3 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-100">
              <p className="font-heading font-bold text-slate-900">Preview</p>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200">
                      {stuPreview.columns?.map((c) => (
                        <th key={c} className="px-2 py-2">
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {stuPreview.preview_rows?.map((row, i) => (
                      <tr key={i} className="border-b border-slate-100">
                        {stuPreview.columns?.map((c) => (
                          <td key={c} className="px-2 py-1.5">
                            {row[c] == null ? '—' : String(row[c])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="rounded-xl bg-white p-4 text-sm ring-1 ring-slate-200">
                <p className="font-semibold text-slate-800">Duplicate & clash checks</p>
                <p className="mt-1 text-slate-600">
                  Rows in file: <strong>{stuPreview.total_rows}</strong> · Estimated skipped:{' '}
                  <strong>{stuPreview.rows_likely_skipped}</strong>
                </p>
                {stuPreview.duplicate_rolls_in_file?.length > 0 && (
                  <p className="mt-2 text-amber-800">
                    Duplicate rolls in file: {stuPreview.duplicate_rolls_in_file.join(', ')}
                  </p>
                )}
                {stuPreview.duplicate_emails_in_file?.length > 0 && (
                  <p className="mt-2 text-amber-800">
                    Duplicate emails in file: {stuPreview.duplicate_emails_in_file.join(', ')}
                  </p>
                )}
              </div>
            </div>
          )}

          {stuUploadBusy && (
            <div>
              <div className="progress-track h-3 overflow-hidden rounded-full">
                <div
                  className="h-full bg-gradient-to-r from-violet-600 to-indigo-400 transition-all duration-300"
                  style={{ width: `${stuProgress}%` }}
                />
              </div>
            </div>
          )}

          {stuResult && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-5">
              <p className="font-heading font-bold text-emerald-900">Import summary</p>
              <ul className="mt-3 space-y-1 text-sm text-emerald-900">
                <li>
                  Inserted: <strong>{stuResult.inserted}</strong>
                </li>
                <li>
                  Skipped: <strong>{stuResult.skipped}</strong>
                </li>
              </ul>
              {stuResult.errors?.length > 0 && (
                <details className="mt-4">
                  <summary className="cursor-pointer text-sm font-semibold">Skip reasons</summary>
                  <ul className="mt-2 max-h-40 overflow-y-auto text-xs text-slate-700">
                    {stuResult.errors.map((e, i) => (
                      <li key={i}>
                        Row {e.row}: {e.detail}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}

          <div className="flex justify-end border-t border-slate-100 pt-4">
            <button type="button" className="btn-primary" disabled={stuUploadBusy || !stuFile} onClick={uploadStudents}>
              {stuUploadBusy ? 'Uploading…' : 'Upload students'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
