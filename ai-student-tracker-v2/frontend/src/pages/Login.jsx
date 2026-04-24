import { useRef, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  GraduationCap,
  BarChart3,
  Sparkles,
  ShieldCheck,
  Loader2,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { cn } from '../lib/cn'

function redirectForRole(role) {
  if (role === 'student') return '/student-dashboard'
  return '/dashboard'
}

const features = [
  {
    icon: BarChart3,
    title: 'AI-powered insights',
    desc: 'Real-time class health, risk detection, and predictive analytics.',
  },
  {
    icon: Sparkles,
    title: 'Automated reports',
    desc: 'Generate narrative feedback and parent-ready PDFs in seconds.',
  },
  {
    icon: ShieldCheck,
    title: 'Secure by design',
    desc: 'JWT authentication, role-based access, and audit logging.',
  },
]

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [shake, setShake] = useState(0)
  const formRef = useRef(null)

  const { user, login, isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const params = new URLSearchParams(location.search)
  const nextPath = params.get('next') || ''

  if (isAuthenticated && user) {
    const target = nextPath && nextPath.startsWith('/') ? nextPath : redirectForRole(user.role)
    return <Navigate to={target} replace />
  }

  const triggerShake = () => setShake((v) => v + 1)

  const handleSubmit = async (e) => {
    e?.preventDefault?.()
    setError('')
    if (!email.trim() || !password) {
      setError('Please enter both email and password.')
      triggerShake()
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
      triggerShake()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-surface-secondary">
      <div className="grid min-h-screen lg:grid-cols-2">
        {/* Left — hero panel */}
        <div className="relative hidden overflow-hidden bg-slate-950 lg:flex">
          {/* Animated mesh gradient */}
          <div className="absolute inset-0 bg-login-mesh" aria-hidden="true" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(99,102,241,0.25),transparent_60%)]" />

          {/* Floating particles */}
          {Array.from({ length: 16 }).map((_, i) => (
            <motion.div
              key={i}
              className="absolute h-1.5 w-1.5 rounded-full bg-white/30"
              style={{
                left: `${(i * 53) % 100}%`,
                top: `${(i * 37) % 100}%`,
              }}
              animate={{
                y: [0, -20, 0],
                opacity: [0.3, 0.8, 0.3],
              }}
              transition={{
                duration: 4 + (i % 5),
                repeat: Infinity,
                delay: i * 0.2,
              }}
              aria-hidden="true"
            />
          ))}

          <div className="relative z-10 flex w-full flex-col justify-between p-12 text-white">
            <div>
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 shadow-inner-glow backdrop-blur">
                  <GraduationCap className="h-6 w-6" aria-hidden="true" />
                </div>
                <span className="text-sm font-semibold tracking-tight">
                  AI Student Tracker
                </span>
              </div>
            </div>

            <div className="max-w-md">
              <motion.h1
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.6 }}
                className="text-balance text-4xl font-bold leading-tight tracking-tight xl:text-5xl"
              >
                The AI co-pilot for{' '}
                <span className="bg-gradient-to-r from-cyan-300 to-brand-300 bg-clip-text text-transparent">
                  modern classrooms
                </span>
              </motion.h1>
              <motion.p
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.6 }}
                className="mt-4 text-base text-slate-300"
              >
                Track performance, spot at-risk students early, and deliver insight-driven
                reports — without the spreadsheets.
              </motion.p>

              <div className="mt-10 space-y-4">
                {features.map((f, i) => {
                  const Icon = f.icon
                  return (
                    <motion.div
                      key={f.title}
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.3 + i * 0.1, duration: 0.45 }}
                      className="flex items-start gap-3"
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-cyan-300 ring-1 ring-white/10 backdrop-blur">
                        <Icon className="h-4 w-4" aria-hidden="true" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold">{f.title}</p>
                        <p className="mt-0.5 text-sm text-slate-400">{f.desc}</p>
                      </div>
                    </motion.div>
                  )
                })}
              </div>
            </div>

            <div className="flex items-center gap-6 text-xs text-slate-400">
              <span>React · FastAPI · Scikit-learn</span>
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                All systems operational
              </span>
            </div>
          </div>
        </div>

        {/* Right — form */}
        <div className="flex min-h-screen items-center justify-center px-4 py-12 sm:px-6">
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="w-full max-w-md"
          >
            <div className="mb-8 flex items-center gap-3 lg:hidden">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-glow-sm">
                <GraduationCap className="h-6 w-6" aria-hidden="true" />
              </div>
              <div>
                <p className="text-base font-semibold text-slate-900">AI Student Tracker</p>
                <p className="text-xs text-slate-500">Performance & risk insights</p>
              </div>
            </div>

            <div>
              <h2 className="text-3xl font-bold tracking-tight text-slate-900">
                Welcome back
              </h2>
              <p className="mt-2 text-sm text-slate-500">
                Sign in to continue. Admins create teacher and student accounts.
              </p>
            </div>

            <motion.form
              key={shake}
              ref={formRef}
              onSubmit={handleSubmit}
              animate={shake > 0 ? { x: [0, -8, 8, -6, 6, -3, 3, 0] } : { x: 0 }}
              transition={{ duration: 0.4 }}
              className="mt-8 space-y-5"
            >
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800"
                  role="alert"
                >
                  {error}
                </motion.div>
              )}

              <div>
                <label className="label" htmlFor="login-email">
                  Email
                </label>
                <div className="relative">
                  <Mail
                    className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                    aria-hidden="true"
                  />
                  <input
                    id="login-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@school.com"
                    className="input pl-10"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="label" htmlFor="login-password">
                  Password
                </label>
                <div className="relative">
                  <Lock
                    className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                    aria-hidden="true"
                  />
                  <input
                    id="login-password"
                    type={showPw ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Your password"
                    className="input px-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    aria-label={showPw ? 'Hide password' : 'Show password'}
                  >
                    {showPw ? (
                      <EyeOff className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Eye className="h-4 w-4" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className={cn('btn-primary w-full py-3 text-base', loading && 'opacity-70')}
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Signing in…
                  </>
                ) : (
                  'Sign in'
                )}
              </button>

              <p className="text-center text-xs text-slate-400">
                Secured with JWT · No third-party auth providers
              </p>
            </motion.form>
          </motion.div>
        </div>
      </div>
    </div>
  )
}
