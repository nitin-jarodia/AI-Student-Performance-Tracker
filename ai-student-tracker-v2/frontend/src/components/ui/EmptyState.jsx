import { Inbox } from 'lucide-react'
import { cn } from '../../lib/cn'

export default function EmptyState({
  icon: Icon = Inbox,
  title = 'Nothing here yet',
  description,
  action,
  className,
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50/40 p-10 text-center dark:border-slate-700 dark:bg-slate-800/30',
        className,
      )}
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 ring-1 ring-brand-200/60 dark:bg-brand-950/40 dark:text-brand-300">
        <Icon className="h-7 w-7" aria-hidden="true" />
      </div>
      <div>
        <p className="section-title">{title}</p>
        {description && (
          <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500 dark:text-slate-400">
            {description}
          </p>
        )}
      </div>
      {action}
    </div>
  )
}
