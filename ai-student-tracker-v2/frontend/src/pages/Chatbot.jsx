import { useState } from 'react'
import { chatbotAPI, formatAxiosError } from '../services/api'
import { useToast } from '../context/ToastContext'

const SUGGESTED = [
  'Show HIGH risk students in class 10A',
  'Which students have attendance below 60% in section A',
  'List top high risk students this month',
]

function isTableResult(results) {
  if (!Array.isArray(results) || !results.length) return false
  return typeof results[0] === 'object' && results[0] !== null && !results[0].message
}

export default function Chatbot() {
  const { showToast } = useToast()
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState([])
  const [busy, setBusy] = useState(false)

  const send = async (text) => {
    const trimmed = text.trim()
    if (!trimmed || busy) return
    const userMsg = { role: 'user', text: trimmed }
    setMessages((m) => [...m, userMsg])
    setInput('')
    setBusy(true)
    try {
      const res = await chatbotAPI.query(trimmed)
      const summary = res.data.summary || ''
      const results = res.data.results || []
      const meta = res.data.meta || {}
      const warn =
        meta.plan_warning || meta.summary_warning
          ? `${meta.plan_warning || ''} ${meta.summary_warning || ''}`.trim()
          : null
      setMessages((m) => [
        ...m,
        {
          role: 'assistant',
          summary,
          results,
          warn,
          action: res.data.action,
        },
      ])
    } catch (err) {
      showToast(formatAxiosError(err), 'error')
      setMessages((m) => [
        ...m,
        { role: 'assistant', summary: formatAxiosError(err), results: [], warn: null },
      ])
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="animate-fade-in mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold text-slate-900">AI assistant</h1>
        <p className="mt-1 text-sm text-slate-500">
          Ask about students, attendance, exams, or risk levels. Results stay inside your authenticated roster.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {SUGGESTED.map((s) => (
          <button
            key={s}
            type="button"
            className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-800 ring-1 ring-indigo-100 hover:bg-indigo-100"
            onClick={() => send(s)}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="card min-h-[420px] space-y-4 p-4">
        <div className="max-h-[520px] space-y-4 overflow-y-auto pr-1">
          {!messages.length && (
            <p className="text-center text-sm text-slate-400">Start by typing a question or tap a suggestion.</p>
          )}
          {messages.map((msg, idx) =>
            msg.role === 'user' ? (
              <div key={idx} className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl bg-indigo-600 px-4 py-3 text-sm text-white shadow-md">
                  {msg.text}
                </div>
              </div>
            ) : (
              <div key={idx} className="flex justify-start">
                <div className="max-w-[92%] rounded-2xl bg-slate-100 px-4 py-3 text-sm text-slate-800 shadow-sm ring-1 ring-slate-200">
                  {msg.warn && (
                    <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900 ring-1 ring-amber-100">
                      {msg.warn}
                    </p>
                  )}
                  {msg.action && <p className="mb-1 text-xs font-semibold uppercase text-slate-500">Action: {msg.action}</p>}
                  <p className="whitespace-pre-wrap leading-relaxed">{msg.summary}</p>
                  {isTableResult(msg.results) && (
                    <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white">
                      <table className="min-w-full text-xs">
                        <thead className="bg-slate-50 text-left font-semibold uppercase text-slate-500">
                          <tr>
                            {Object.keys(msg.results[0]).map((k) => (
                              <th key={k} className="px-3 py-2">
                                {k}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {msg.results.map((row, ridx) => (
                            <tr key={ridx} className="border-t border-slate-100">
                              {Object.keys(msg.results[0]).map((k) => (
                                <td key={k} className="px-3 py-2 text-slate-700">
                                  {row[k] === null || row[k] === undefined ? '—' : String(row[k])}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {!isTableResult(msg.results) && msg.results?.length > 0 && (
                    <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-white p-3 text-xs text-slate-600 ring-1 ring-slate-100">
                      {JSON.stringify(msg.results, null, 2)}
                    </pre>
                  )}
                </div>
              </div>
            ),
          )}
          {busy && (
            <div className="flex justify-start">
              <div className="rounded-2xl bg-slate-100 px-4 py-3 text-sm text-slate-600 ring-1 ring-slate-200">
                <span className="inline-flex items-center gap-2">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-indigo-500" />
                  Thinking…
                </span>
              </div>
            </div>
          )}
        </div>

        <form
          className="flex gap-2 border-t border-slate-100 pt-4"
          onSubmit={(e) => {
            e.preventDefault()
            send(input)
          }}
        >
          <input
            className="input flex-1"
            placeholder="Ask anything about your students…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <button type="submit" className="btn-primary shrink-0" disabled={busy}>
            Send
          </button>
        </form>
      </div>
    </div>
  )
}
