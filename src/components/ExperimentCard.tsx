import { Link, useNavigate } from 'react-router'
import { ArrowRight, Copy, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { Experiment, Project } from '@/lib/types'
import { KIND_STYLES, STATUS_META, kindOf } from '@/lib/kinds'
import { cn, formatDateTime, relativeTime } from '@/lib/util'
import { duplicateExperiment, restoreExperiment, trashExperiment } from '@/lib/repo'
import { pushUndo, undoById } from '@/lib/undo'
import { Badge } from './ui'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from './context-menu'

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
  const navigate = useNavigate()
  const k = kindOf(e.kind)

  const duplicate = async () => {
    const copy = await duplicateExperiment(e.id)
    toast.success(`已复制为「${copy.title}」。步骤勾选和图片没有带过来。`)
  }
  const moveToTrash = async () => {
    await trashExperiment(e.id)
    const uid = pushUndo('移到回收站', () => void restoreExperiment(e.id))
    toast('已移到回收站，30 天内可恢复', { action: { label: '撤销', onClick: () => undoById(uid) }, duration: 8000 })
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <Link
          to={`/experiments/${e.id}`}
          className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 transition hover:border-slate-300 hover:shadow-md md:flex-col md:items-stretch md:gap-0 md:rounded-2xl md:p-4 md:hover:-translate-y-0.5 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
        >
          <div className="flex shrink-0 flex-col items-start gap-1 md:flex-row md:items-center md:gap-2">
            <span className="eyebrow font-mono tracking-wide">{e.code}</span>
            <Badge className={cn(KIND_STYLES[k.color].badge, 'max-md:hidden')}>{k.label}</Badge>
            <StatusBadge status={e.status} />
          </div>
          <div className="min-w-0 flex-1 md:mt-2">
            <h3 className="line-clamp-1 text-[14px] leading-snug font-semibold tracking-[-0.01em] text-slate-900 group-hover:text-brand-700 md:line-clamp-2 md:text-[15.5px] dark:text-white dark:group-hover:text-brand-300">{e.title}</h3>
            {e.tags.length > 0 && <p className="mt-1 hidden truncate text-xs text-slate-500 md:block">{e.tags.map((t) => `#${t}`).join('  ')}</p>}
          </div>
          <span className="num shrink-0 text-[11px] text-slate-500 md:hidden">{relativeTime(e.updatedAt)}</span>
          <div className="num mt-auto hidden items-center gap-2 pt-4 text-xs text-slate-500 md:flex">
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
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem icon={<ArrowRight />} onSelect={() => navigate(`/experiments/${e.id}`)}>
          打开
        </ContextMenuItem>
        <ContextMenuItem icon={<Copy />} onSelect={duplicate}>
          复制为新实验
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem icon={<Trash2 />} danger onSelect={() => void moveToTrash()}>
          移到回收站
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
