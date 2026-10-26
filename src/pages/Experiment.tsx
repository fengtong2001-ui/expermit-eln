import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { restrictToVerticalAxis } from '@/lib/dnd'
import {
  Archive,
  ArchiveRestore,
  CheckCircle2,
  ChevronRight,
  Copy,
  Download,
  History,
  LayoutTemplate,
  Lock,
  MoreHorizontal,
  Pencil,
  Plus,
  Printer,
  RotateCcw,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { db } from '@/lib/db'
import * as repo from '@/lib/repo'
import { useProjects } from '@/lib/hooks'
import { KIND_STYLES, STATUS_META, kindOf } from '@/lib/kinds'
import { cn, formatDate, formatDateTime, relativeTime } from '@/lib/util'
import { DEFS, type BlockType } from '@/blocks/defs'
import { ICONS } from '@/blocks/registry'
import { PageHeader, SaveIndicator } from '@/components/Shell'
import { BlockFrame } from '@/components/BlockFrame'
import { BlockPicker } from '@/components/BlockMenu'
import { TagInput } from '@/components/TagInput'
import { Badge, Button, Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger, Popover, PopoverContent, PopoverTrigger } from '@/components/ui'
import { promptDialog } from '@/components/prompt'
import { HistoryDrawer } from '@/components/HistoryDrawer'
import { exportExperimentZip } from '@/lib/exporter'
import { useDebouncedSave } from '@/lib/useDebouncedSave'
import { pushUndo, undoById } from '@/lib/undo'
import { RECOMMENDED } from '@/blocks/defs'

export function ExperimentPage() {
  const { id = '' } = useParams()
  const [sp, setSp] = useSearchParams()
  const navigate = useNavigate()
  const exp = useLiveQuery(() => db.experiments.get(id), [id], null)
  const blocks = useLiveQuery(() => repo.liveBlocks(id), [id], undefined)
  const projects = useProjects()
  const [unlocked, setUnlocked] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [order, setOrder] = useState<string[] | null>(null)
  const highlight = sp.get('block')

  useEffect(() => {
    setUnlocked(false)
    if (id) void repo.dailySnapshot(id)
  }, [id])

  useEffect(() => {
    if (!highlight) return
    const t = setTimeout(() => setSp((p) => (p.delete('block'), p), { replace: true }), 2500)
    return () => clearTimeout(t)
  }, [highlight, setSp])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const ordered = useMemo(() => {
    if (!blocks) return []
    if (!order) return blocks
    const m = new Map(blocks.map((b) => [b.id, b]))
    const res = order.map((i) => m.get(i)).filter((b): b is NonNullable<typeof b> => !!b)
    return res.length === blocks.length ? res : blocks
  }, [blocks, order])

  useEffect(() => setOrder(null), [blocks])

  if (exp === null || blocks === undefined) return <div className="p-8" />
  if (!exp || exp.deletedAt)
    return (
      <div className="mx-auto max-w-md p-12 text-center">
        <p className="text-sm text-slate-500">{exp?.deletedAt ? '这个实验在回收站里。' : '没有找到这个实验。'}</p>
        <div className="mt-4 flex justify-center gap-2">
          <Button onClick={() => navigate('/experiments')}>返回实验列表</Button>
          {exp?.deletedAt && (
            <Button variant="primary" onClick={() => repo.restoreExperiment(exp.id)}>
              从回收站恢复
            </Button>
          )}
        </div>
      </div>
    )

  const locked = (exp.status === 'done' || exp.status === 'archived') && !unlocked
  const project = projects.find((p) => p.id === exp.projectId)
  const kind = kindOf(exp.kind)

  const insert = async (type: BlockType, afterId: string | null) => {
    const b = await repo.insertBlock(exp.id, type, DEFS[type].create(), afterId)
    setTimeout(() => {
      const el = document.getElementById(`block-${b.id}`)
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      ;(el?.querySelector('[contenteditable="true"], input, textarea') as HTMLElement | null)?.focus()
    }, 80)
  }

  const removeBlock = async (blockId: string) => {
    const b = blocks.find((x) => x.id === blockId)
    const name = b ? (DEFS[b.type as BlockType]?.label ?? '内容块') : '内容块'
    await repo.deleteBlock(blockId)
    const uid = pushUndo(`删除${name}`, () => void repo.restoreBlock(blockId))
    toast('已删除内容块', { action: { label: '撤销', onClick: () => undoById(uid) }, duration: 8000 })
  }

  const duplicateBlock = async (blockId: string) => {
    const b = blocks.find((x) => x.id === blockId)
    if (!b) return
    await repo.insertBlock(exp.id, b.type, repo.cloneForDuplicate(b), b.id)
  }

  const move = async (blockId: string, dir: -1 | 1) => {
    const ids = ordered.map((b) => b.id)
    const i = ids.indexOf(blockId)
    const j = i + dir
    if (j < 0 || j >= ids.length) return
    const next = arrayMove(ids, i, j)
    setOrder(next)
    await repo.reorderBlocks(exp.id, next)
  }

  const onDragEnd = async (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return
    const ids = ordered.map((b) => b.id)
    const next = arrayMove(ids, ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id)))
    setOrder(next)
    await repo.reorderBlocks(exp.id, next)
  }

  const complete = async () => {
    await repo.saveStateFlush()
    await repo.completeExperiment(exp.id)
    setUnlocked(false)
    const uid = pushUndo('标记完成', () => void repo.reopenExperiment(exp.id))
    toast.success('已标记完成，并自动保存了一个版本', { action: { label: '撤销', onClick: () => undoById(uid) } })
  }

  const unlock = async () => {
    await repo.recordEditAfterClose(exp.id, '解锁编辑')
    setUnlocked(true)
    toast('已解锁编辑。完成后的修改会被记录在历史里。')
  }

  const trash = async () => {
    await repo.trashExperiment(exp.id)
    const uid = pushUndo('移到回收站', () => void repo.restoreExperiment(exp.id))
    navigate('/experiments')
    toast('已移到回收站，30 天内可恢复', { action: { label: '撤销', onClick: () => undoById(uid) }, duration: 8000 })
  }

  const saveTemplate = async () => {
    const r = await promptDialog({
      title: '存为模板',
      label: '模板名称',
      initial: exp.title,
      confirmText: '保存模板',
      multiline: { label: '说明（可选）', placeholder: '这个模板适合什么实验' },
    })
    if (!r) return
    await repo.saveAsTemplate(exp.id, r.value, r.extra)
    toast.success('已存为模板，新建实验时可以直接选用。勾选状态与图片不会带入模板。')
  }

  const duplicate = async () => {
    const copy = await repo.duplicateExperiment(exp.id)
    navigate(`/experiments/${copy.id}`)
    toast.success('已复制。步骤勾选和图片没有带过来。')
  }

  return (
    <div>
      <PageHeader>
        <nav className="flex min-w-0 flex-1 items-center gap-1 text-[13px] text-slate-500" aria-label="位置">
          <Link to="/experiments" className="shrink-0 hover:text-slate-900 dark:hover:text-white">
            实验
          </Link>
          {project && (
            <>
              <ChevronRight className="size-3.5 shrink-0 text-slate-400" />
              <Link to={`/experiments?project=${project.id}`} className="truncate hover:text-slate-900 dark:hover:text-white">
                {project.name}
              </Link>
            </>
          )}
          <ChevronRight className="size-3.5 shrink-0 text-slate-400" />
          <span className="truncate text-slate-900 dark:text-slate-100">{exp.title}</span>
        </nav>
      </PageHeader>

      <div className="mx-auto max-w-3xl px-4 pt-8 pb-32 md:px-8 lg:pl-20">
        {/* —— 题头 —— */}
        <div className="mb-2 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <span className="font-mono text-[11px] tracking-wide text-slate-500 dark:text-slate-400">{exp.code}</span>
          <span className="h-3 w-px bg-slate-200 dark:bg-slate-700" aria-hidden />
          <Badge className={KIND_STYLES[kind.color].badge}>{kind.label}</Badge>
          <StatusPicker status={exp.status} onChange={async (s) => {
            if (s === 'done') return complete()
            if (s === 'archived') return repo.archiveExperiment(exp.id, true)
            if (exp.status === 'done' || exp.status === 'archived') await repo.reopenExperiment(exp.id)
            await repo.updateExperiment(exp.id, { status: s })
          }} />
          <span className="eyebrow num" title={formatDateTime(exp.updatedAt)}>
            编辑于 {relativeTime(exp.updatedAt)}
          </span>
          <div className="sm:hidden">
            <SaveIndicator />
          </div>
        </div>

        <TitleEditor key={exp.id} id={exp.id} value={exp.title} readOnly={locked} />

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="min-w-0 flex-1">
            {locked ? (
              <div className="flex flex-wrap gap-1.5">
                {exp.tags.map((t) => (
                  <span key={t} className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    #{t}
                  </span>
                ))}
              </div>
            ) : (
              <TagInput compact value={exp.tags} onChange={(tags) => repo.updateExperiment(exp.id, { tags })} placeholder="＋ 添加标签" />
            )}
          </div>
          <div className="no-print flex items-center gap-2">
            {exp.status === 'done' || exp.status === 'archived' ? (
              <Button size="sm" onClick={() => repo.reopenExperiment(exp.id).then(() => setUnlocked(false))}>
                <RotateCcw /> 重新打开
              </Button>
            ) : (
              <Button size="sm" variant="primary" onClick={complete}>
                <CheckCircle2 /> 标记完成
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setHistoryOpen(true)} aria-label="历史版本">
              <History /> <span className="hidden sm:inline">历史</span>
            </Button>
            <Menu>
              <MenuTrigger asChild>
                <Button size="icon-sm" variant="ghost" aria-label="更多操作">
                  <MoreHorizontal />
                </Button>
              </MenuTrigger>
              <MenuContent>
                <MenuItem icon={<Copy />} onSelect={duplicate}>
                  复制为新实验
                </MenuItem>
                <MenuItem icon={<LayoutTemplate />} onSelect={saveTemplate}>
                  存为模板
                </MenuItem>
                <MenuSeparator />
                <MenuItem icon={<Printer />} onSelect={() => window.print()}>
                  打印 / 存为 PDF
                </MenuItem>
                <MenuItem icon={<Download />} onSelect={() => void exportExperimentZip(exp.id).then(() => toast.success('已导出'))}>
                  导出（含图片）
                </MenuItem>
                <MenuSeparator />
                {exp.status === 'archived' ? (
                  <MenuItem icon={<ArchiveRestore />} onSelect={() => repo.archiveExperiment(exp.id, false)}>
                    取消归档
                  </MenuItem>
                ) : (
                  <MenuItem
                    icon={<Archive />}
                    onSelect={() =>
                      void repo.archiveExperiment(exp.id, true).then(() => {
                        const uid = pushUndo('归档', () => void repo.archiveExperiment(exp.id, false))
                        toast('已归档，列表里默认不再显示', { action: { label: '撤销', onClick: () => undoById(uid) } })
                      })
                    }
                  >
                    归档
                  </MenuItem>
                )}
                <MenuItem icon={<Trash2 />} danger onSelect={trash}>
                  移到回收站
                </MenuItem>
              </MenuContent>
            </Menu>
          </div>
        </div>

        {(exp.status === 'done' || exp.status === 'archived') && (
          <div
            className={cn(
              'no-print mt-5 flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 text-[13px]',
              locked
                ? 'border-emerald-200 bg-emerald-50/70 text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300'
                : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300',
            )}
          >
            {locked ? <Lock className="size-4" /> : <Pencil className="size-4" />}
            <span className="flex-1">
              {locked
                ? `${formatDate(exp.closedAt ?? exp.updatedAt)} 已完成，内容已锁定。`
                : '正在修改已完成的实验，修改会记录在历史里。'}
              {exp.editsAfterClose > 0 && <span className="ml-1 opacity-75">完成后已修改 {exp.editsAfterClose} 次。</span>}
            </span>
            {locked ? (
              <Button size="sm" onClick={unlock}>
                <Pencil /> 编辑
              </Button>
            ) : (
              <Button size="sm" onClick={() => setUnlocked(false)}>
                <Lock /> 完成修改
              </Button>
            )}
          </div>
        )}

        <div className="mt-8 h-px bg-slate-100 dark:bg-slate-800" />

        {/* —— 内容块 —— 桌面端左侧是记录本页边线，块标签压在上面 */}
        <div className="record-rail mt-8 space-y-10 lg:pl-5">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd} modifiers={[restrictToVerticalAxis]}>
            <SortableContext items={ordered.map((b) => b.id)} strategy={verticalListSortingStrategy}>
              {ordered.map((b, i) => (
                <BlockFrame
                  key={b.id}
                  block={b}
                  kind={exp.kind}
                  readOnly={locked}
                  highlighted={highlight === b.id}
                  isFirst={i === 0}
                  isLast={i === ordered.length - 1}
                  onInsertAfter={(t) => insert(t, b.id)}
                  onDelete={() => removeBlock(b.id)}
                  onDuplicate={() => duplicateBlock(b.id)}
                  onMove={(d) => move(b.id, d)}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>

        {!locked && (
          <div className="no-print mt-10">
            {ordered.length === 0 ? (
              <EmptyInsert kind={exp.kind} onPick={(t) => insert(t, null)} />
            ) : (
              <AddBlockBar kind={exp.kind} onPick={(t) => insert(t, ordered[ordered.length - 1]?.id ?? null)} />
            )}
          </div>
        )}
      </div>

      <HistoryDrawer experimentId={exp.id} open={historyOpen} onOpenChange={setHistoryOpen} />
    </div>
  )
}

function TitleEditor({ id, value, readOnly }: { id: string; value: string; readOnly: boolean }) {
  const [v, setV] = useState(value)
  const ref = useRef<HTMLTextAreaElement>(null)
  const save = useDebouncedSave(`title:${id}`, (t: string) => repo.updateExperiment(id, { title: t.trim() || '未命名实验' }), 500)
  useEffect(() => {
    if (!save.isDirty() && document.activeElement !== ref.current) setV(value)
  }, [value, save])
  useEffect(() => {
    const el = ref.current
    if (el) {
      el.style.height = '0px'
      el.style.height = `${el.scrollHeight}px`
    }
  }, [v])
  return (
    <textarea
      ref={ref}
      rows={1}
      value={v}
      readOnly={readOnly}
      aria-label="实验标题"
      placeholder="未命名实验"
      onChange={(e) => {
        const t = e.target.value.replace(/\n/g, '')
        setV(t)
        save.schedule(t)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          ;(e.target as HTMLTextAreaElement).blur()
        }
      }}
      onBlur={() => void save.flush()}
      className="display block w-full resize-none overflow-hidden bg-transparent text-slate-900 outline-none placeholder:text-slate-300 dark:text-white"
    />
  )
}

function StatusPicker({ status, onChange }: { status: keyof typeof STATUS_META; onChange: (s: keyof typeof STATUS_META) => void }) {
  const m = STATUS_META[status]
  return (
    <Menu>
      <MenuTrigger asChild>
        <button className={cn('inline-flex h-5 cursor-pointer items-center gap-1.5 rounded-md px-1.5 text-[11px] font-medium', m.cls)}>
          <span className={cn('size-1.5 rounded-full', m.dot)} />
          {m.label}
        </button>
      </MenuTrigger>
      <MenuContent align="start">
        {(Object.keys(STATUS_META) as (keyof typeof STATUS_META)[]).map((k) => (
          <MenuItem key={k} icon={<span className={cn('block size-2 rounded-full', STATUS_META[k].dot)} />} onSelect={() => k !== status && onChange(k)}>
            {STATUS_META[k].label}
          </MenuItem>
        ))}
      </MenuContent>
    </Menu>
  )
}

function EmptyInsert({ kind, onPick }: { kind: string; onPick: (t: BlockType) => void }) {
  const rec = RECOMMENDED[kind] ?? RECOMMENDED.general
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 p-6 dark:border-slate-700">
      <p className="text-sm font-medium text-slate-700 dark:text-slate-200">从一个内容块开始</p>
      <p className="mt-1 text-[13px] text-slate-500">之后可以随时在任意位置插入、拖动排序。</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {rec.map((t) => {
          const Icon = ICONS[t]
          return (
            <Button key={t} onClick={() => onPick(t)}>
              <Icon /> {DEFS[t].label}
            </Button>
          )
        })}
        <AddBlockBar kind={kind} onPick={onPick} compact />
      </div>
    </div>
  )
}

function AddBlockBar({ kind, onPick, compact }: { kind: string; onPick: (t: BlockType) => void; compact?: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {compact ? (
          <Button variant="ghost">
            <Plus /> 更多类型
          </Button>
        ) : (
          <button className="group flex w-full cursor-pointer items-center gap-3 rounded-xl border border-dashed border-transparent px-3 py-2.5 text-[13px] text-slate-500 transition hover:border-slate-200 hover:bg-slate-50 hover:text-slate-600 dark:hover:border-slate-700 dark:hover:bg-slate-900">
            <Plus className="size-4" /> 添加内容块
            <span className="ml-auto hidden text-xs opacity-0 transition group-hover:opacity-100 sm:block">文本、图片、孔板、试剂、步骤…</span>
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent className="p-0" side="top">
        <BlockPicker
          kind={kind}
          onPick={(t) => {
            setOpen(false)
            onPick(t)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}
