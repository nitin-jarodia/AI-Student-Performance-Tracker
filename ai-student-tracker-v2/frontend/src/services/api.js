// services/api.js - FastAPI client with JWT auth, auto-refresh, and API helpers

import axios from 'axios'

export const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

// localStorage keys
export const ACCESS_TOKEN_KEY = 'access_token'
export const REFRESH_TOKEN_KEY = 'refresh_token'
export const USER_KEY = 'user'

export function getAccessToken() {
  try {
    return localStorage.getItem(ACCESS_TOKEN_KEY) || ''
  } catch (_) {
    return ''
  }
}

export function getRefreshToken() {
  try {
    return localStorage.getItem(REFRESH_TOKEN_KEY) || ''
  } catch (_) {
    return ''
  }
}

export function getStoredUser() {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? JSON.parse(raw) : null
  } catch (_) {
    return null
  }
}

export function saveSession({ access_token, refresh_token, user }) {
  if (access_token) localStorage.setItem(ACCESS_TOKEN_KEY, access_token)
  if (refresh_token) localStorage.setItem(REFRESH_TOKEN_KEY, refresh_token)
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user))
}

export function clearSession() {
  localStorage.removeItem(ACCESS_TOKEN_KEY)
  localStorage.removeItem(REFRESH_TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
})

export function formatAxiosError(err, fallback = 'Request failed') {
  const detail = err?.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail) && detail.length) {
    return detail.map((e) => (typeof e === 'string' ? e : e.msg || JSON.stringify(e))).join('; ')
  }
  if (!err?.response) {
    if (err?.code === 'ECONNABORTED') {
      return `Request timed out — large files may need more time; API is ${API_BASE}`
    }
    return `Cannot reach API (${API_BASE}). Run: uvicorn app.main:app --reload --host 127.0.0.1 --port 8000`
  }
  return err?.message || fallback
}

// ── Request interceptor: inject Bearer token ─────────────────────────────
api.interceptors.request.use((config) => {
  const token = getAccessToken()
  if (token) {
    config.headers = config.headers || {}
    config.headers.Authorization = `Bearer ${token}`
  }
  // Let the browser set multipart boundaries for file uploads.
  if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
    if (config.headers?.delete) config.headers.delete('Content-Type')
    else if (config.headers) delete config.headers['Content-Type']
  }
  return config
})

// ── Response interceptor: transparent refresh on 401 ─────────────────────
//
// On the first 401 for an authenticated request we attempt a POST /auth/refresh
// with the stored refresh token. All concurrent 401s wait for the same promise
// so the refresh endpoint is hit at most once, then each request is retried
// with the new access token. If refresh fails the session is cleared and the
// user is redirected to /login.

let _refreshPromise = null

function _onAuthLost() {
  clearSession()
  if (typeof window !== 'undefined' && window.location?.pathname !== '/login') {
    const next = encodeURIComponent(window.location?.pathname || '/')
    window.location.assign(`/login?next=${next}`)
  }
}

async function _refreshTokens() {
  const rt = getRefreshToken()
  if (!rt) throw new Error('No refresh token')
  const resp = await axios.post(
    `${API_BASE}/auth/refresh`,
    { refresh_token: rt },
    { headers: { 'Content-Type': 'application/json' }, timeout: 15000 },
  )
  const { access_token, refresh_token, user } = resp.data || {}
  if (!access_token) throw new Error('Refresh response missing access_token')
  saveSession({ access_token, refresh_token, user })
  return access_token
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error?.response?.status
    const original = error?.config

    const isAuthEndpoint =
      typeof original?.url === 'string' &&
      /\/auth\/(login|refresh|register|token)/.test(original.url)

    if (status === 401 && original && !original._retry && !isAuthEndpoint) {
      original._retry = true
      try {
        if (!_refreshPromise) {
          _refreshPromise = _refreshTokens().finally(() => {
            _refreshPromise = null
          })
        }
        const newAccess = await _refreshPromise
        original.headers = original.headers || {}
        original.headers.Authorization = `Bearer ${newAccess}`
        return api(original)
      } catch (refreshErr) {
        _onAuthLost()
        return Promise.reject(refreshErr)
      }
    }

    if (status === 401 && isAuthEndpoint) {
      // Bad credentials / expired refresh - do not attempt refresh loop.
    }

    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.error('API Error:', error.response?.data || error.message)
    }
    return Promise.reject(error)
  },
)

// ── Auth API ────────────────────────────────────────────────────────────

export const authAPI = {
  login: (email, password) => api.post('/auth/login', { email, password }),
  register: (data) => api.post('/auth/register', data),
  registerStudent: (data) => api.post('/auth/register-student', data),
  refresh: (refresh_token) => api.post('/auth/refresh', { refresh_token }),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me'),
  changePassword: (current_password, new_password) =>
    api.put('/auth/change-password', { current_password, new_password }),
  listUsers: (role) => api.get('/auth/users', { params: role ? { role } : {} }),
  deactivateUser: (userId) => api.put(`/auth/users/${userId}/deactivate`),
  activateUser: (userId) => api.put(`/auth/users/${userId}/activate`),
  // legacy aliases kept for older components
  getUsers: () => api.get('/auth/users'),
}

// Convenience helpers that match the wording used in the migration spec.
export const loginUser = (email, password) => authAPI.login(email, password)
export const registerUser = (email, password, full_name, role) =>
  authAPI.register({ email, password, full_name, role })
export const logoutUser = () => authAPI.logout()
export const refreshToken = (rt) => authAPI.refresh(rt)
export const getCurrentUser = () => authAPI.me()
export const changePassword = (current_password, new_password) =>
  authAPI.changePassword(current_password, new_password)

// ── Domain APIs (unchanged) ──────────────────────────────────────────────

export const studentAPI = {
  getAll: (params) => api.get('/students/', { params }),
  getById: (id) => api.get(`/students/${id}`),
  getLearningStyle: (id) => api.get(`/students/${id}/learning-style`),
  create: (data) => api.post('/students/', data),
  update: (id, data) => api.put(`/students/${id}`, data),
  delete: (id) => api.delete(`/students/${id}`),
}

export const subjectAPI = {
  getAll: (params) => api.get('/subjects/', { params }),
  mySubjects: () => api.get('/subjects/my-subjects'),
  getById: (id) => api.get(`/subjects/${id}`),
  create: (data) => api.post('/subjects/', data),
  update: (id, data) => api.put(`/subjects/${id}`, data),
  delete: (id) => api.delete(`/subjects/${id}`),
}

export const teacherAssignmentAPI = {
  list: (params) => api.get('/teacher-assignments/', { params }),
  create: (data) => api.post('/teacher-assignments/', data),
  delete: (id) => api.delete(`/teacher-assignments/${id}`),
}

export const performanceAPI = {
  getByStudent: (id) => api.get(`/performance/${id}`),
  add: (data) => api.post('/performance/', data),
  predict: (id) => api.get(`/performance/${id}/predict`),
  getReport: (id) => api.get(`/performance/${id}/report`),
  getAllSummary: () => api.get('/performance/summary/all'),
  addAttendance: (data) => api.post('/performance/attendance', data),
  getDayAttendanceSummary: (dateStr) =>
    api.get('/performance/attendance/day-summary', {
      params: dateStr ? { date: dateStr } : {},
    }),
  getStudentAttendance: (studentId) =>
    api.get(`/performance/attendance/student/${studentId}`),
  addAttendanceBulk: (records) =>
    api.post('/performance/attendance/bulk', { records }),
  mySummary: () => api.get('/performance/me/summary'),
}

export const notificationsAPI = {
  list: (params) => api.get('/notifications', { params }),
  markRead: (id) => api.post(`/notifications/${id}/read`),
  markAllRead: () => api.post('/notifications/read-all'),
  delete: (id) => api.delete(`/notifications/${id}`),
}

export const alertsAPI = {
  list: (params) => api.get('/alerts', { params }),
  testChannels: () => api.post('/alerts/test'),
}

export const messagingAPI = {
  listConversations: () => api.get('/messaging/conversations'),
  getConversation: (id) => api.get(`/messaging/conversations/${id}`),
  createConversation: (data) => api.post('/messaging/conversations', data),
  postMessage: (conversationId, data) =>
    api.post(`/messaging/conversations/${conversationId}/messages`, data),
  closeConversation: (id) => api.post(`/messaging/conversations/${id}/close`),
  listContacts: () => api.get('/messaging/contacts'),
}

export const portalAPI = {
  generateLink: (body) => api.post('/portal/generate-link', body),
}

export const portalPublicAPI = {
  getMe: (token) =>
    axios.get(`${API_BASE}/portal/me`, {
      params: { token },
      timeout: 30000,
    }),
  downloadPdf: (token) =>
    axios.get(`${API_BASE}/portal/report/pdf`, {
      params: { token },
      responseType: 'blob',
      timeout: 120000,
    }),
}

export const adminAPI = {
  auditLogs: (params) => api.get('/admin/audit-logs', { params }),
  listUsers: () => api.get('/admin/users'),
  patchUserRole: (userId, role) => api.patch(`/admin/users/${userId}/role`, { role }),
}

export const mlAPI = {
  modelStatus: () => api.get('/ml/model-status'),
  classAnalytics: () => api.get('/ml/class-analytics'),
  learningStyleStats: () => api.get('/ml/learning-style-stats'),
  classifyLearningStyles: () => api.post('/ml/classify-learning-styles'),
  train: () => api.post('/ml/train'),
  trainReal: () => api.post('/ml/train-real'),
  predict: (studentId) => api.get(`/ml/predict/${studentId}`),
}

export const chatbotAPI = {
  query: (message) => api.post('/chatbot/query', { message }),
}

export const integrityAPI = {
  analyze: (examType, examDate) => api.get(`/integrity/analyze/${encodeURIComponent(examType)}/${examDate}`),
  listFlags: () => api.get('/integrity/flags'),
  patchFlag: (flagId, status) => api.patch(`/integrity/flags/${flagId}`, { status }),
}

export const scholarshipAPI = {
  listSchemes: () => api.get('/scholarships/schemes'),
  createScheme: (data) => api.post('/scholarships/schemes', data),
  evaluate: (schemeId) => api.post(`/scholarships/evaluate/${schemeId}`),
  eligible: (schemeId) => api.get(`/scholarships/eligible/${schemeId}`),
  forStudent: (studentId) => api.get(`/scholarships/student/${studentId}`),
}

export const reportBuilderAPI = {
  custom: (body) => api.post('/reports/custom', body),
  listTemplates: () => api.get('/reports/templates'),
  saveTemplate: (body) => api.post('/reports/templates', body),
  getTemplate: (id) => api.get(`/reports/templates/${id}`),
}

export const qrAPI = {
  generate: (body) => api.post('/qr/generate', body),
  sessionStatus: (sessionId) => api.get(`/qr/session/status/${sessionId}`),
  history: () => api.get('/qr/history'),
}

export const qrPublicAPI = {
  scan: (body) =>
    axios.post(`${API_BASE}/qr/scan`, body, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000,
    }),
}

export const bulkAPI = {
  downloadScoresTemplate: () =>
    api.get('/bulk/template/scores', { responseType: 'blob' }),
  downloadStudentsTemplate: () =>
    api.get('/bulk/template/students', { responseType: 'blob' }),
  previewScores: (formData) =>
    api.post('/bulk/preview-scores', formData, { timeout: 120000 }),
  previewStudents: (formData) =>
    api.post('/bulk/preview-students', formData, { timeout: 120000 }),
  uploadScores: (formData) =>
    api.post('/bulk/upload-scores', formData, { timeout: 300000 }),
  uploadStudents: (formData) =>
    api.post('/bulk/upload-students', formData, { timeout: 180000 }),
}

export default api
