// context/AuthContext.jsx - JWT auth context (no Firebase)

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import {
  authAPI,
  clearSession,
  formatAxiosError,
  getStoredUser,
  saveSession,
} from '../services/api'

const AuthContext = createContext(null)

function normalizeUser(raw) {
  if (!raw) return null
  return {
    id: raw.id ?? raw.user_id ?? null,
    email: raw.email || '',
    full_name: raw.full_name || raw.email || '',
    role: (raw.role || 'teacher').toLowerCase(),
    student_id: raw.student_id ?? null,
    is_active: raw.is_active ?? true,
    must_change_password: raw.must_change_password ?? false,
    created_at: raw.created_at || null,
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => normalizeUser(getStoredUser()))
  const [loading, setLoading] = useState(true)

  const initializeAuth = useCallback(async () => {
    try {
      const { data } = await authAPI.me()
      const fresh = normalizeUser(data)
      setUser(fresh)
      saveSession({ user: fresh })
    } catch (_) {
      clearSession()
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    initializeAuth()
  }, [initializeAuth])

  const login = useCallback(async (email, password) => {
    try {
      const { data } = await authAPI.login(email, password)
      const fresh = normalizeUser(data.user)
      saveSession({ user: fresh })
      setUser(fresh)
      return fresh
    } catch (err) {
      throw new Error(formatAxiosError(err, 'Login failed'))
    }
  }, [])

  const logout = useCallback(async () => {
    try {
      await authAPI.logout()
    } catch (_) {
      // Best-effort: even if the server call fails we still clear local state.
    }
    clearSession()
    setUser(null)
  }, [])

  const changePassword = useCallback(async (current_password, new_password) => {
    try {
      const { data } = await authAPI.changePassword(current_password, new_password)
      // Password change invalidates refresh token — force re-login locally.
      clearSession()
      setUser(null)
      return data
    } catch (err) {
      throw new Error(formatAxiosError(err, 'Password change failed'))
    }
  }, [])

  const value = useMemo(() => {
    const role = user?.role || null
    return {
      user,
      loading,
      login,
      logout,
      changePassword,
      isAuthenticated: !!user,
      isAdmin: role === 'admin',
      isTeacher: role === 'teacher',
      isStudent: role === 'student',
      refreshUser: initializeAuth,
    }
  }, [user, loading, login, logout, changePassword, initializeAuth])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used inside <AuthProvider>')
  }
  return ctx
}
