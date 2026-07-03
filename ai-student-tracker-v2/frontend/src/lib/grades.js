/** Percentage (0–100) → letter grade */
export function gradeFromPct(pct) {
  if (pct == null || Number.isNaN(pct)) return '—'
  if (pct >= 90) return 'A+'
  if (pct >= 80) return 'A'
  if (pct >= 70) return 'B'
  if (pct >= 60) return 'C'
  if (pct >= 40) return 'D'
  return 'F'
}
