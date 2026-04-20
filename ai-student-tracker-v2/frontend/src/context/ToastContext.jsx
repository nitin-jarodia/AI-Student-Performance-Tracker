import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'

const ToastContext = createContext(null)

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null)
  const timerRef = useRef(null)

  const showToast = useCallback((message, type = 'success') => {
    if (timerRef.current) window.clearTimeout(timerRef.current)
    setToast({ id: Date.now(), message, type })
    timerRef.current = window.setTimeout(() => setToast(null), 4200)
  }, [])

  const value = useMemo(() => ({ showToast }), [showToast])

  const styles =
    toast?.type === 'error'
      ? 'border-red-200 bg-red-50 text-red-900'
      : toast?.type === 'warning'
        ? 'border-amber-200 bg-amber-50 text-amber-950'
        : 'border-emerald-200 bg-emerald-50 text-emerald-950'

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-[200] max-w-sm rounded-xl border px-4 py-3 text-sm font-medium shadow-lg animate-fade-in ${styles}`}
          role="status"
        >
          {toast.message}
        </div>
      )}
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
