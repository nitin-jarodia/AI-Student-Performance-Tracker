import { cn } from '../../lib/cn'

export function Skeleton({ className, ...rest }) {
  return <div className={cn('skeleton', className)} {...rest} />
}

export function SkeletonText({ lines = 3, className }) {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn('h-3 w-full', i === lines - 1 && 'w-2/3')}
        />
      ))}
    </div>
  )
}

export function SkeletonCard({ className }) {
  return (
    <div className={cn('card p-5 space-y-3', className)}>
      <Skeleton className="h-10 w-10 rounded-xl" />
      <Skeleton className="h-6 w-2/3" />
      <SkeletonText lines={2} />
    </div>
  )
}

export function SkeletonTable({ rows = 5, cols = 5, className }) {
  return (
    <div className={cn('card overflow-hidden', className)}>
      <div className="border-b border-slate-200 bg-slate-50/60 p-4 dark:border-slate-700 dark:bg-slate-800/40">
        <Skeleton className="h-5 w-40" />
      </div>
      <div className="divide-y divide-slate-100 dark:divide-slate-700/60">
        {Array.from({ length: rows }).map((_, r) => (
          <div
            key={r}
            className="grid gap-4 p-4"
            style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: cols }).map((_, c) => (
              <Skeleton key={c} className="h-4 w-full" />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export function SkeletonChart({ className }) {
  return (
    <div className={cn('card p-5', className)}>
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-5 w-16" />
      </div>
      <Skeleton className="mt-4 h-48 w-full" />
    </div>
  )
}

export default Skeleton
