import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const MailIcon = () => (
  <svg className="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
  </svg>
)

const LockIcon = () => (
  <svg className="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
  </svg>
)

function redirectForRole(role) {
  if (role === 'student') return '/student-dashboard'
  return '/dashboard'
}

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [forgotOpen, setForgotOpen] = useState(false)

  const { user, login, isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const params = new URLSearchParams(location.search)
  const nextPath = params.get('next') || ''

  if (isAuthenticated && user) {
    const target = nextPath && nextPath.startsWith('/') ? nextPath : redirectForRole(user.role)
    return <Navigate to={target} replace />
  }

  const handleSubmit = async (e) => {
    e?.preventDefault?.()
    setError('')
    if (!email.trim() || !password) {
      setError('Please enter both email and password.')
      return
    }
    try {
      setLoading(true)
      const fresh = await login(email.trim(), password)
      const target =
        nextPath && nextPath.startsWith('/') ? nextPath : redirectForRole(fresh.role)
      navigate(target, { replace: true })
    } catch (err) {
      setError(err?.message || 'Login failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-indigo-600 via-violet-700 to-slate-900">
      <div className="pointer-events-none absolute -left-32 top-20 h-72 w-72 rounded-full bg-sky-400/30 blur-3xl" />
      <div className="pointer-events-none absolute -right-24 bottom-0 h-96 w-96 rounded-full bg-fuchsia-500/20 blur-3xl" />

      <div className="relative mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4 py-12">
        <div className="card mb-8 overflow-hidden border-0 shadow-2xl shadow-indigo-950/40">
          <div className="bg-gradient-to-r from-indigo-600 to-violet-600 px-8 py-10 text-center text-white">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/15 text-3xl shadow-lg backdrop-blur">
              🎓
            </div>
            <h1 className="font-heading text-2xl font-bold tracking-tight">
              AI Student Performance Tracker
            </h1>
            <p className="mt-2 text-sm text-indigo-100/90">
              Sign in to continue. Admins create teacher and student accounts.
            </p>
          </div>

          <form className="p-8" onSubmit={handleSubmit}>
            {error && (
              <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {error}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="label" htmlFor="login-email">Email</label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
                    <MailIcon />
                  </span>
                  <input
                    id="login-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@school.com"
                    className="input pl-11"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="label" htmlFor="login-password">Password</label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
                    <LockIcon />
                  </span>
                  <input
                    id="login-password"
                    type={showPw ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Your password"
                    className="input pl-11 pr-24"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-xs font-semibold text-indigo-600 hover:bg-indigo-50"
                  >
                    {showPw ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary mt-6 flex w-full items-center justify-center gap-2 py-3 text-base disabled:opacity-60"
            >
              {loading ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-b-2 border-white/80" />
                  Signing in…
                </>
              ) : (
                'Sign in'
              )}
            </button>

            <div className="mt-4 text-right">
              <button
                type="button"
                onClick={() => setForgotOpen((v) => !v)}
                className="text-xs font-semibold text-indigo-600 hover:underline"
              >
                Forgot password?
              </button>
            </div>

            {forgotOpen && (
              <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                Contact your administrator to reset your password.
              </div>
            )}

            <p className="mt-8 text-center text-xs text-slate-400">
              Secured with JWT • No third-party auth providers
            </p>
          </form>
        </div>
      </div>
    </div>
  )
}
