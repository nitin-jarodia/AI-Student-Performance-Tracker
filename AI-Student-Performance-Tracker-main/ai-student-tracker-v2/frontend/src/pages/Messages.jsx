import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Plus,
  Send,
  Search,
  MessageSquare,
  Mail,
  ArrowLeft,
  Check,
  CheckCheck,
} from 'lucide-react'
import { messagingAPI, formatAxiosError } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import EmptyState from '../components/ui/EmptyState'
import { cn } from '../lib/cn'

const POLL_MS = 6000

function formatTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function timeAgo(iso) {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const diff = Math.max(0, Date.now() - then)
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'now'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  return `${d}d`
}

function initials(name) {
  return (name || '?')
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

export default function MessagesPage() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const role = (user?.role || 'teacher').toLowerCase()

  const [conversations, setConversations] = useState([])
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [selected, setSelected] = useState(null)
  const [messages, setMessages] = useState([])
  const [contacts, setContacts] = useState([])
  const [composing, setComposing] = useState(false)
  const [composeForm, setComposeForm] = useState({
    contact_id: '',
    subject_line: '',
    body: '',
    send_email: false,
  })
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [showListOnMobile, setShowListOnMobile] = useState(true)

  const bottomRef = useRef(null)

  const fetchConversations = useCallback(async () => {
    try {
      const { data } = await messagingAPI.listConversations()
      setConversations(data.conversations || [])
    } catch (err) {
      showToast(formatAxiosError(err, 'Failed to load conversations'), 'error')
    }
  }, [showToast])

  const fetchConversation = useCallback(
    async (id) => {
      if (!id) return
      try {
        const { data } = await messagingAPI.getConversation(id)
        setSelected(data.conversation)
        setMessages(data.messages || [])
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 0)
      } catch (err) {
        showToast(formatAxiosError(err, 'Failed to load conversation'), 'error')
      }
    },
    [showToast],
  )

  useEffect(() => {
    fetchConversations()
    messagingAPI
      .listContacts()
      .then((r) => setContacts(r.data.contacts || []))
      .catch(() => {})
    const iv = setInterval(fetchConversations, POLL_MS)
    return () => clearInterval(iv)
  }, [fetchConversations])

  useEffect(() => {
    if (!selectedId) return
    fetchConversation(selectedId)
    const iv = setInterval(() => fetchConversation(selectedId), POLL_MS)
    return () => clearInterval(iv)
  }, [selectedId, fetchConversation])

  const selectConversation = (id) => {
    setSelectedId(id)
    setComposing(false)
    setShowListOnMobile(false)
  }

  const openCompose = () => {
    setComposing(true)
    setSelectedId(null)
    setSelected(null)
    setMessages([])
    setComposeForm({ contact_id: '', subject_line: '', body: '', send_email: false })
    setShowListOnMobile(false)
  }

  const submitCompose = async (e) => {
    e.preventDefault()
    if (
      !composeForm.contact_id ||
      !composeForm.subject_line.trim() ||
      !composeForm.body.trim()
    ) {
      showToast('Please select a contact and enter a subject and message', 'error')
      return
    }
    const payload = {
      subject_line: composeForm.subject_line.trim(),
      body: composeForm.body.trim(),
      send_email: Boolean(composeForm.send_email),
    }
    if (role === 'student') payload.teacher_id = Number(composeForm.contact_id)
    else payload.student_id = Number(composeForm.contact_id)

    setSending(true)
    try {
      const { data } = await messagingAPI.createConversation(payload)
      showToast('Message sent', 'success')
      setComposing(false)
      await fetchConversations()
      setSelectedId(data.conversation.id)
    } catch (err) {
      showToast(formatAxiosError(err, 'Failed to send message'), 'error')
    } finally {
      setSending(false)
    }
  }

  const sendReply = async (e) => {
    e.preventDefault()
    if (!draft.trim() || !selectedId) return
    setSending(true)
    try {
      await messagingAPI.postMessage(selectedId, {
        message_body: draft.trim(),
        message_type: 'in_app',
      })
      setDraft('')
      await fetchConversation(selectedId)
      fetchConversations()
    } catch (err) {
      showToast(formatAxiosError(err, 'Failed to send reply'), 'error')
    } finally {
      setSending(false)
    }
  }

  const contactLabel = useMemo(
    () => (c) =>
      role === 'student'
        ? `${c.full_name} · ${c.email}`
        : `${c.full_name} · Roll ${c.roll_number || ''}`,
    [role],
  )

  const filteredConversations = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return conversations
    return conversations.filter(
      (c) =>
        c.subject_line?.toLowerCase().includes(q) ||
        c.teacher_name?.toLowerCase().includes(q) ||
        c.student_name?.toLowerCase().includes(q),
    )
  }, [conversations, search])

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Messages
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {conversations.length} conversation{conversations.length === 1 ? '' : 's'} ·{' '}
            {conversations.reduce((a, c) => a + (c.unread_count || 0), 0)} unread
          </p>
        </div>
        <button type="button" className="btn-primary" onClick={openCompose}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          New message
        </button>
      </div>

      <div className="card flex h-[calc(100vh-14rem)] min-h-[560px] overflow-hidden">
        {/* Conversations list */}
        <aside
          className={cn(
            'flex w-full flex-col border-r border-slate-200 md:w-80 md:shrink-0 dark:border-slate-700',
            !showListOnMobile && 'hidden md:flex',
          )}
        >
          <div className="border-b border-slate-100 p-3 dark:border-slate-700">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <input
                className="input pl-9"
                placeholder="Search conversations…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {filteredConversations.length === 0 ? (
              <div className="p-6 text-center text-sm text-slate-400">
                No conversations yet.
              </div>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-700/60">
                {filteredConversations.map((c) => {
                  const otherName =
                    role === 'student' ? c.teacher_name || c.teacher_email : c.student_name
                  const active = selectedId === c.id
                  return (
                    <li key={c.id}>
                      <button
                        onClick={() => selectConversation(c.id)}
                        className={cn(
                          'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors',
                          active
                            ? 'bg-brand-50 dark:bg-brand-900/20'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-700/30',
                        )}
                      >
                        <div className="relative">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-cyan-500 text-xs font-bold text-white">
                            {initials(otherName)}
                          </div>
                          <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-white dark:ring-slate-800" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                              {otherName || 'Conversation'}
                            </p>
                            <p className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-slate-400">
                              {timeAgo(c.last_message_at || c.created_at)}
                            </p>
                          </div>
                          <div className="mt-0.5 flex items-center justify-between gap-2">
                            <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                              {c.subject_line}
                            </p>
                            {c.unread_count > 0 && (
                              <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-brand-600 px-1.5 text-[10px] font-bold text-white">
                                {c.unread_count}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </aside>

        {/* Thread area */}
        <section
          className={cn(
            'flex flex-1 flex-col',
            showListOnMobile && !composing && !selected && 'hidden md:flex',
          )}
        >
          {composing ? (
            <form onSubmit={submitCompose} className="flex h-full flex-col">
              <div className="flex items-center justify-between gap-3 border-b border-slate-100 p-4 dark:border-slate-700">
                <h3 className="section-title">New message</h3>
                <button
                  type="button"
                  onClick={() => {
                    setComposing(false)
                    setShowListOnMobile(true)
                  }}
                  className="btn-ghost text-xs md:hidden"
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  Back
                </button>
              </div>
              <div className="flex-1 space-y-4 overflow-y-auto p-6">
                <div>
                  <label className="label">
                    {role === 'student' ? 'Teacher' : 'Student'}
                  </label>
                  <select
                    value={composeForm.contact_id}
                    onChange={(e) =>
                      setComposeForm({ ...composeForm, contact_id: e.target.value })
                    }
                    className="input"
                  >
                    <option value="">Select…</option>
                    {contacts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {contactLabel(c)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Subject</label>
                  <input
                    value={composeForm.subject_line}
                    onChange={(e) =>
                      setComposeForm({ ...composeForm, subject_line: e.target.value })
                    }
                    className="input"
                    placeholder="Subject line"
                  />
                </div>
                <div>
                  <label className="label">Message</label>
                  <textarea
                    rows={6}
                    value={composeForm.body}
                    onChange={(e) =>
                      setComposeForm({ ...composeForm, body: e.target.value })
                    }
                    className="input resize-none"
                    placeholder="Write your message…"
                  />
                </div>
                <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={composeForm.send_email}
                    onChange={(e) =>
                      setComposeForm({ ...composeForm, send_email: e.target.checked })
                    }
                    className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                  />
                  <Mail className="h-4 w-4 text-slate-400" aria-hidden="true" />
                  Also send by email
                </label>
              </div>
              <div className="flex justify-end gap-2 border-t border-slate-100 p-4 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setComposing(false)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" disabled={sending} className="btn-primary">
                  <Send className="h-4 w-4" aria-hidden="true" />
                  {sending ? 'Sending…' : 'Send'}
                </button>
              </div>
            </form>
          ) : selected ? (
            <>
              <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => {
                    setShowListOnMobile(true)
                    setSelectedId(null)
                    setSelected(null)
                  }}
                  className="btn-ghost text-xs md:hidden"
                  aria-label="Back to conversations"
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                </button>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-cyan-500 text-xs font-bold text-white">
                  {initials(
                    role === 'student'
                      ? selected.teacher_name || selected.teacher_email
                      : selected.student_name,
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-bold text-slate-900 dark:text-slate-100">
                    {selected.subject_line}
                  </h3>
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                    {role === 'student'
                      ? `With ${selected.teacher_name || selected.teacher_email}`
                      : `With ${selected.student_name || ''}`}
                    {selected.status !== 'open' && (
                      <span className="ml-2 text-rose-500">[{selected.status}]</span>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50/50 px-4 py-4 dark:bg-slate-900/30">
                {messages.map((m) => {
                  const mine = m.sender_id === user?.user_id || m.sender_id === user?.id
                  return (
                    <motion.div
                      key={m.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={cn('flex', mine ? 'justify-end' : 'justify-start')}
                    >
                      <div
                        className={cn(
                          'max-w-[75%] rounded-2xl px-4 py-2.5 text-sm shadow-soft',
                          mine
                            ? 'bg-brand-600 text-white'
                            : 'border border-slate-200 bg-white text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200',
                        )}
                      >
                        <p className="whitespace-pre-wrap leading-relaxed">
                          {m.message_body}
                        </p>
                        <p
                          className={cn(
                            'mt-1 flex items-center gap-1 text-[10px] uppercase tracking-wide',
                            mine ? 'text-indigo-100/80' : 'text-slate-500',
                          )}
                        >
                          {formatTime(m.sent_at)}
                          {mine && <CheckCheck className="h-3 w-3" aria-hidden="true" />}
                        </p>
                      </div>
                    </motion.div>
                  )
                })}
                <div ref={bottomRef} />
              </div>
              {selected.status === 'open' && (
                <form
                  onSubmit={sendReply}
                  className="flex items-end gap-2 border-t border-slate-100 p-3 dark:border-slate-700"
                >
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    rows={1}
                    placeholder="Type a reply…"
                    className="input min-h-[42px] resize-none"
                  />
                  <button
                    type="submit"
                    disabled={sending || !draft.trim()}
                    className="btn-primary shrink-0"
                  >
                    <Send className="h-4 w-4" aria-hidden="true" />
                    <span className="hidden sm:inline">Send</span>
                  </button>
                </form>
              )}
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center p-6">
              <EmptyState
                icon={MessageSquare}
                title="No conversation selected"
                description="Pick a conversation from the list, or start a new one."
                action={
                  <button className="btn-primary" onClick={openCompose}>
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    New message
                  </button>
                }
              />
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
