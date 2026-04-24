import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import NProgress from 'nprogress'
import 'nprogress/nprogress.css'

NProgress.configure({ showSpinner: false, trickleSpeed: 120, minimum: 0.18 })

/**
 * Triggers the NProgress bar on every route change. Mount inside <Router>.
 */
export default function RouteProgress() {
  const location = useLocation()
  const mounted = useRef(false)
  const timer = useRef(null)

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true
      return
    }
    NProgress.start()
    clearTimeout(timer.current)
    timer.current = setTimeout(() => NProgress.done(), 400)
    return () => clearTimeout(timer.current)
  }, [location.pathname])

  return null
}
