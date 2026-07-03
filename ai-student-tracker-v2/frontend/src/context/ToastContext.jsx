import { createContext, useCallback, useContext, useMemo } from 'react'
import toast from 'react-hot-toast'

const ToastContext = createContext(null)

/**
 * Legacy compatibility shim over react-hot-toast.
 * All existing pages call `showToast(message, type)` — we preserve that API
 * but route it through the polished hot-toast renderer registered in App.jsx.
 */
export function ToastProvider({ children }) {
  const showToast = useCallback((message, type = 'success') => {
    if (!message) return
    if (type === 'error') return toast.error(message)
    if (type === 'warning') return toast(message, { icon: '⚠️' })
    if (type === 'loading') return toast.loading(message)
    return toast.success(message)
  }, [])

  const value = useMemo(() => ({ showToast }), [showToast])
  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
