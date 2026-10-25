import { Link } from 'react-router'
import type { Experiment, Project } from '@/lib/types'
import { KIND_STYLES, STATUS_META, kindOf } from '@/lib/kinds'
import { cn, formatDateTime, relativeTime } from '@/lib/util'
import { Badge } from './ui'

export function StatusBadge({ status }: { status: Experiment['status'] }) {
  const m = STATUS_META[status]
  return (
    <Badge className={m.cls}>
      <span className={cn('size-1.5 rounded-full', m.dot)} />
      {m.label}
    </Badge>
  )
}

export function ExperimentCard({ e, project }: { e: Experiment; project?: Project }) {
  const k = kindOf(e.kind)
  return (
    <Link
      to={`/experiments/${e.id}`}
      className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-4 transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
    >
      <div className="flex items-center gap-2">
        <Badge className={KIND_STYLES[k.color].badge}>{k.label}</Badge>
        <StatusBadge status={e.status} />
      </div>
      <h3 className="mt-2.5 line-clamp-2 text-[15px] leading-snug font-semibold text-slate-900 group-hover:text-brand-700 dark:text-white dark:group-hover:text-brand-300">{e.title}</h3>
      {e.tags.length > 0 && <p className="mt-1.5 truncate text-xs text-slate-500">{e.tags.map((t) => `#${t}`).join('  ')}</p>}
      <div className="mt-auto flex items-center gap-2 pt-4 text-xs text-slate-500">
        {project && (
          <span className="flex min-w-0 items-center gap-1.5">
            <span className={cn('size-1.5 shrink-0 rounded-full', KIND_STYLES[project.color]?.dot)} />
            <span className="truncate">{project.name}</span>
          </span>
        )}
        <span className="ml-auto shrink-0" title={formatDateTime(e.updatedAt)}>
          {relativeTime(e.updatedAt)}
        </span>
      </div>
    </Link>
  )
}
