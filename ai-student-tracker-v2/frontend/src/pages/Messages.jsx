import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { messagingAPI, formatAxiosError } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'

const POLL_MS = 6000

function formatTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString()
}

export default function MessagesPage() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const role = (user?.role || 'teacher').toLowerCase()

  const [conversations, setConversations] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [selected, setSelected] = useState(null)
  const [messages, setMessages] = useState([])
  const [contacts, setContacts] = useState([])
  const [composing, setComposing] = useState(false)
  const [composeForm, setComposeForm] = useState({ contact_id: '', subject_line: '', body: '', send_email: false })
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)

  const bottomRef = useRef(null)

  const fetchConversations = useCallback(async () => {
    try {
      const { data } = await messagingAPI.listConversations()
      setConversations(data.conversations || [])
    } catch (err) {
      showToast(formatAxiosError(err, 'Failed to load conversations'), 'error')
    }
  }, [showToast])

  const fetchConversation = useCallback(async (id) => {
    if (!id) return
    try {
      const { data } = await messagingAPI.getConversation(id)
      setSelected(data.conversation)
      setMessages(data.messages || [])
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 0)
    } catch (err) {
      showToast(formatAxiosError(err, 'Failed to load conversation'), 'error')
    }
  }, [showToast])

  useEffect(() => {
    fetchConversations()
    messagingAPI.listContacts().then((r) => setContacts(r.data.contacts || [])).catch(() => {})
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
  }

  const openCompose = () => {
    setComposing(true)
    setSelectedId(null)
    setSelected(null)
    setMessages([])
    setComposeForm({ contact_id: '', subject_line: '', body: '', send_email: false })
  }

  const submitCompose = async (e) => {
    e.preventDefault()
    if (!composeForm.contact_id || !composeForm.subject_line.trim() || !composeForm.body.trim()) {
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
      await messagingAPI.postMessage(selectedId, { message_body: draft.trim(), message_type: 'in_app' })
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
    () => (c) => (role === 'student' ? `${c.full_name} · ${c.email}` : `${c.full_name} · Roll ${c.roll_number || ''}`),
    [role],
  )

  return (
    <div className="flex h-[calc(100vh-180px)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <aside className="flex w-80 flex-shrink-0 flex-col border-r border-slate-200">
        <div className="flex items-center justify-between border-b border-slate-100 p-3">
          <h2 className="text-sm font-semibold text-slate-900">Conversations</h2>
          <button
            onClick={openCompose}
            className="rounded-lg bg-indigo-600 px-3 py-1 text-xs font-semibold text-white hover:bg-indigo-500"
          >
            + New
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <div className="p-4 text-sm text-slate-500">No conversations yet.</div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {conversations.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => selectConversation(c.id)}
                    className={`w-full px-4 py-3 text-left transition ${
                      selectedId === c.id ? 'bg-indigo-50' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <p className="truncate text-sm font-medium text-slate-900">{c.subject_line}</p>
                      {c.unread_count > 0 && (
                        <span className="ml-2 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-indigo-600 px-1.5 text-[10px] font-semibold text-white">
                          {c.unread_count}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {role === 'student' ? c.teacher_name || c.teacher_email : c.student_name}
                    </p>
                    <p className="mt-0.5 text-[10px] uppercase tracking-wide text-slate-400">
                      {formatTime(c.last_message_at || c.created_at)}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      <section className="flex flex-1 flex-col">
        {composing ? (
          <form onSubmit={submitCompose} className="flex h-full flex-col p-6">
            <h3 className="text-lg font-semibold text-slate-900">New message</h3>
            <label className="mt-4 text-sm">
              <span className="mb-1 block text-slate-600">
                {role === 'student' ? 'Teacher' : 'Student'}
              </span>
              <select
                value={composeForm.contact_id}
                onChange={(e) => setComposeForm({ ...composeForm, contact_id: e.target.value })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="">Select…</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {contactLabel(c)}
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-3 text-sm">
              <span className="mb-1 block text-slate-600">Subject</span>
              <input
                value={composeForm.subject_line}
                onChange={(e) => setComposeForm({ ...composeForm, subject_line: e.target.value })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </label>
            <label className="mt-3 flex-1 text-sm">
              <span className="mb-1 block text-slate-600">Message</span>
              <textarea
                rows={6}
                value={composeForm.body}
                onChange={(e) => setComposeForm({ ...composeForm, body: e.target.value })}
                className="h-full w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </label>
            <label className="mt-3 inline-flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={composeForm.send_email}
                onChange={(e) => setComposeForm({ ...composeForm, send_email: e.target.checked })}
              />
              Also send by email
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setComposing(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={sending}
                className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
              >
                {sending ? 'Sending…' : 'Send message'}
              </button>
            </div>
          </form>
        ) : selected ? (
          <>
            <div className="border-b border-slate-100 px-6 py-4">
              <h3 className="text-lg font-semibold text-slate-900">{selected.subject_line}</h3>
              <p className="text-xs text-slate-500">
                {role === 'student'
                  ? `With ${selected.teacher_name || selected.teacher_email}`
                  : `With ${selected.student_name || ''}`}
                {selected.status !== 'open' && <span className="ml-2 text-rose-500">[{selected.status}]</span>}
              </p>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto px-6 py-4">
              {messages.map((m) => {
                const mine = m.sender_id === user?.user_id
                return (
                  <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm shadow-sm ${
                        mine ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-800'
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{m.message_body}</p>
                      <p className={`mt-1 text-[10px] uppercase tracking-wide ${mine ? 'text-indigo-100/80' : 'text-slate-500'}`}>
                        {m.sender_role} · {formatTime(m.sent_at)} · {m.message_type}
                      </p>
                    </div>
                  </div>
                )
              })}
              <div ref={bottomRef} />
            </div>
            {selected.status === 'open' && (
              <form onSubmit={sendReply} className="flex items-end gap-2 border-t border-slate-100 p-4">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={2}
                  placeholder="Type a reply…"
                  className="flex-1 resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
                <button
                  type="submit"
                  disabled={sending || !draft.trim()}
                  className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
                >
                  {sending ? 'Sending…' : 'Send'}
                </button>
              </form>
            )}
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
            Select a conversation or start a new one.
          </div>
        )}
      </section>
    </div>
  )
}
