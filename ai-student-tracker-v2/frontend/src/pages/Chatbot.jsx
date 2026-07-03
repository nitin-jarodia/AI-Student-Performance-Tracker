import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Bot,
  Send,
  Sparkles,
  User as UserIcon,
  AlertTriangle,
  Mic,
} from 'lucide-react'
import { chatbotAPI, formatAxiosError } from '../services/api'
import { useToast } from '../context/ToastContext'
import EmptyState from '../components/ui/EmptyState'
import { cn } from '../lib/cn'

const SUGGESTED = [
  'Show HIGH risk students in class 10A',
  'Which students have attendance below 60%?',
  'List top high-risk students this month',
  'Generate a report for Class A',
]

function isTableResult(results) {
  if (!Array.isArray(results) || !results.length) return false
  return typeof results[0] === 'object' && results[0] !== null && !results[0].message
}

function TypingDots() {
  return (
    <div className="flex items-center gap-1">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-brand-500"
          animate={{ opacity: [0.2, 1, 0.2], y: [0, -2, 0] }}
          transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }}
        />
      ))}
    </div>
  )
}

export default function Chatbot() {
  const { showToast } = useToast()
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState([])
  const [busy, setBusy] = useState(false)
  const scrollRef = useRef(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    })
  }, [messages, busy])

  const send = async (text) => {
    const trimmed = text.trim()
    if (!trimmed || busy) return
    setMessages((m) => [...m, { role: 'user', text: trimmed }])
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
        { role: 'assistant', summary, results, warn, action: res.data.action },
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
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            AI assistant
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Ask about students, attendance, exams, or risk. Responses stay inside your roster.
          </p>
        </div>
      </div>

      <div className="card flex h-[calc(100vh-14rem)] min-h-[520px] flex-col overflow-hidden">
        {/* Scrollable messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 sm:p-6">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-6 py-8 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-cyan-500 text-white shadow-glow">
                <Sparkles className="h-7 w-7" aria-hidden="true" />
              </div>
              <div>
                <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  How can I help?
                </p>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Start with one of these suggestions, or type your own.
                </p>
              </div>
              <div className="flex max-w-2xl flex-wrap justify-center gap-2">
                {SUGGESTED.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => send(s)}
                    className="rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 shadow-soft transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:text-brand-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {messages.map((msg, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn(
                    'flex items-start gap-3',
                    msg.role === 'user' ? 'flex-row-reverse' : '',
                  )}
                >
                  <div
                    className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-white shadow-soft',
                      msg.role === 'user'
                        ? 'bg-gradient-to-br from-slate-700 to-slate-900'
                        : 'bg-gradient-to-br from-brand-500 to-cyan-500',
                    )}
                  >
                    {msg.role === 'user' ? (
                      <UserIcon className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Bot className="h-4 w-4" aria-hidden="true" />
                    )}
                  </div>
                  <div
                    className={cn(
                      'max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-soft',
                      msg.role === 'user'
                        ? 'bg-brand-600 text-white'
                        : 'border border-slate-200 bg-white text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200',
                    )}
                  >
                    {msg.role === 'user' ? (
                      <p className="whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                    ) : (
                      <>
                        {msg.warn && (
                          <div className="mb-2 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900 ring-1 ring-amber-100 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-900/40">
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                            {msg.warn}
                          </div>
                        )}
                        {msg.action && (
                          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            Action: {msg.action}
                          </p>
                        )}
                        <p className="whitespace-pre-wrap leading-relaxed">{msg.summary}</p>
                        {isTableResult(msg.results) && (
                          <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                            <table className="min-w-full text-xs">
                              <thead className="bg-slate-50 text-left font-semibold uppercase text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
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
                                  <tr
                                    key={ridx}
                                    className="border-t border-slate-100 dark:border-slate-700/60"
                                  >
                                    {Object.keys(msg.results[0]).map((k) => (
                                      <td
                                        key={k}
                                        className="px-3 py-2 text-slate-700 dark:text-slate-300"
                                      >
                                        {row[k] === null || row[k] === undefined
                                          ? '—'
                                          : String(row[k])}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                        {!isTableResult(msg.results) && msg.results?.length > 0 && (
                          <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs text-slate-600 ring-1 ring-slate-100 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700">
                            {JSON.stringify(msg.results, null, 2)}
                          </pre>
                        )}
                      </>
                    )}
                  </div>
                </motion.div>
              ))}
              {busy && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-start gap-3"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-cyan-500 text-white shadow-soft">
                    <Bot className="h-4 w-4" aria-hidden="true" />
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-soft dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    <TypingDots />
                  </div>
                </motion.div>
              )}
            </div>
          )}
        </div>

        {/* Input */}
        <form
          className="flex items-center gap-2 border-t border-slate-100 bg-white p-3 sm:p-4 dark:border-slate-700 dark:bg-slate-800"
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
          <button
            type="button"
            className="btn-ghost hidden sm:inline-flex"
            aria-label="Voice note (coming soon)"
          >
            <Mic className="h-4 w-4" aria-hidden="true" />
          </button>
          <button type="submit" className="btn-primary shrink-0" disabled={busy}>
            <Send className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Send</span>
          </button>
        </form>
      </div>
    </div>
  )
}
