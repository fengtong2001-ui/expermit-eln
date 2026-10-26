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
          className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-4 transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
        >
          <div className="flex items-center gap-2">
            <span className="eyebrow font-mono tracking-wide">{e.code}</span>
            <Badge className={KIND_STYLES[k.color].badge}>{k.label}</Badge>
            <StatusBadge status={e.status} />
          </div>
          <h3 className="mt-2 line-clamp-2 text-[15.5px] leading-snug font-semibold tracking-[-0.01em] text-slate-900 group-hover:text-brand-700 dark:text-white dark:group-hover:text-brand-300">{e.title}</h3>
          {e.tags.length > 0 && <p className="mt-1.5 truncate text-xs text-slate-500">{e.tags.map((t) => `#${t}`).join('  ')}</p>}
          <div className="num mt-auto flex items-center gap-2 pt-4 text-xs text-slate-500">
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
