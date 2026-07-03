import { useEffect, useRef, useState } from 'react'

/**
 * Smooth count-up animation hook.
 * Returns the current animated value (rounded).
 */
export default function useCountUp(target, { duration = 1200, decimals = 0 } = {}) {
  const [value, setValue] = useState(0)
  const frameRef = useRef()
  const startRef = useRef(null)

  useEffect(() => {
    cancelAnimationFrame(frameRef.current)
    startRef.current = null
    const end = Number(target) || 0

    const tick = (ts) => {
      if (!startRef.current) startRef.current = ts
      const elapsed = ts - startRef.current
      const progress = Math.min(1, elapsed / duration)
      const eased = 1 - Math.pow(1 - progress, 3) // easeOutCubic
      setValue(end * eased)
      if (progress < 1) frameRef.current = requestAnimationFrame(tick)
    }

    frameRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frameRef.current)
  }, [target, duration])

  return Number(value.toFixed(decimals))
}
