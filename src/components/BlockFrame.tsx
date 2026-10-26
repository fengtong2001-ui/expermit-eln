import { Component, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ArrowDown, ArrowUp, Copy, GripVertical, MoreHorizontal, Plus, Trash2 } from 'lucide-react'
import type { Block } from '@/lib/types'
import { defOf, type BlockType } from '@/blocks/defs'
import { EDITORS, FallbackIcon, ICONS } from '@/blocks/registry'
import { saveBlockData } from '@/lib/repo'
import { useDebouncedSave } from '@/lib/useDebouncedSave'
import { cn, formatTime } from '@/lib/util'
import { Button, Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger, Tip } from './ui'
import { InsertPopover } from './BlockMenu'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from './context-menu'

class Boundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  render() {
    if (this.state.error)
      return (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-[13px] text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
          这个内容块显示出错了，数据仍完整保存着。可以刷新页面重试，或在「设置与备份」里导出数据。
        </div>
      )
    return this.props.children
  }
}

export interface BlockFrameProps {
  block: Block
  kind: string
  readOnly: boolean
  highlighted: boolean
  onInsertAfter: (type: BlockType) => void
  onDelete: () => void
  onDuplicate: () => void
  onMove: (dir: -1 | 1) => void
  isFirst: boolean
  isLast: boolean
  onBeforeEdit?: () => Promise<boolean>
}

export function BlockFrame({ block, kind, readOnly, highlighted, onInsertAfter, onDelete, onDuplicate, onMove, isFirst, isLast }: BlockFrameProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: block.id, disabled: readOnly })
  const def = defOf(block.type)
  const Editor = EDITORS[block.type as BlockType]
  const Icon = ICONS[block.type as BlockType] ?? FallbackIcon

  // 本地草稿优先：外部实时查询回流的数据不覆盖正在编辑的内容
  const [data, setData] = useState(block.data)
  const save = useDebouncedSave(`block:${block.id}`, (d: unknown) => saveBlockData(block.id, d))
  const lastExternal = useRef(block.updatedAt)
  useEffect(() => {
    if (block.updatedAt !== lastExternal.current && !save.isDirty()) setData(block.data)
    lastExternal.current = block.updatedAt
  }, [block.updatedAt, block.data, save])

  const onChange = useCallback(
    (d: unknown) => {
      setData(d)
      save.schedule(d)
    },
    [save],
  )

  const [insertOpen, setInsertOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (highlighted) ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [highlighted])

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild disabled={readOnly}>
        <div
          ref={(n) => {
            setNodeRef(n)
            ref.current = n
          }}
          id={`block-${block.id}`}
          style={{ transform: CSS.Translate.toString(transform), transition }}
          className={cn('group/block relative print-break', isDragging && 'z-10 opacity-80')}
        >
      <div
        className={cn(
          'relative rounded-xl transition',
          isDragging && 'bg-white shadow-pop ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700',
          highlighted && 'ring-2 ring-amber-300/80 ring-offset-4 ring-offset-white dark:ring-offset-slate-950',
        )}
      >
        {/* 左侧手柄：桌面悬停出现 */}
        {!readOnly && (
          <div className="no-print absolute top-0.5 -left-16 hidden w-14 justify-end gap-0.5 opacity-0 transition group-hover/block:opacity-100 focus-within:opacity-100 lg:flex">
            <InsertPopover kind={kind} onPick={onInsertAfter}>
              <Button variant="ghost" size="icon-sm" aria-label="在下方插入" className="text-slate-500">
                <Plus />
              </Button>
            </InsertPopover>
            <Tip label="拖动排序" side="left">
              <button
                ref={setActivatorNodeRef}
                {...attributes}
                {...listeners}
                aria-label="拖动排序"
                className="flex size-7 cursor-grab touch-none items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 active:cursor-grabbing dark:hover:bg-slate-800"
              >
                <GripVertical className="size-4" />
              </button>
            </Tip>
          </div>
        )}

        {/* 块头：类型 + 菜单 */}
        <div className="mb-2 flex h-7 items-center gap-2">
          {/* 桌面：标签压在页边线上，带这块内容的最后保存时间 */}
          <span className="eyebrow -ml-5 hidden items-center gap-1.5 bg-white pr-2.5 lg:inline-flex dark:bg-slate-950">
            <Icon className="size-3.5" />
            {def?.label ?? '未知内容'}
            <span className="font-mono text-[10px] font-normal opacity-60">{formatTime(block.updatedAt)}</span>
          </span>
          <span className="eyebrow inline-flex items-center gap-1.5 lg:hidden">
            <Icon className="size-3.5" />
            {def?.label ?? '未知内容'}
          </span>
          <div className="flex-1" />
          {!readOnly && (
            <div className="no-print flex items-center opacity-100 transition lg:opacity-0 lg:group-hover/block:opacity-100 lg:focus-within:opacity-100">
              <button
                {...attributes}
                {...listeners}
                aria-label="拖动排序"
                className="flex size-8 cursor-grab touch-none items-center justify-center rounded-md text-slate-500 lg:hidden"
              >
                <GripVertical className="size-4" />
              </button>
              <Menu>
                <MenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label="内容块操作" className="text-slate-500">
                    <MoreHorizontal />
                  </Button>
                </MenuTrigger>
                <MenuContent>
                  <MenuItem icon={<Plus />} onSelect={() => setTimeout(() => setInsertOpen(true), 50)}>
                    在下方插入
                  </MenuItem>
                  <MenuItem icon={<Copy />} onSelect={onDuplicate}>
                    复制一份
                  </MenuItem>
                  <MenuItem icon={<ArrowUp />} onSelect={() => onMove(-1)} disabled={isFirst} shortcut="⌥↑">
                    上移
                  </MenuItem>
                  <MenuItem icon={<ArrowDown />} onSelect={() => onMove(1)} disabled={isLast} shortcut="⌥↓">
                    下移
                  </MenuItem>
                  <MenuSeparator />
                  <MenuItem icon={<Trash2 />} danger onSelect={onDelete}>
                    删除
                  </MenuItem>
                </MenuContent>
              </Menu>
              <InsertPopover kind={kind} onPick={onInsertAfter} open={insertOpen} onOpenChange={setInsertOpen}>
                <span />
              </InsertPopover>
            </div>
          )}
        </div>

        <div
          onKeyDown={(e) => {
            if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && !readOnly) {
              e.preventDefault()
              onMove(e.key === 'ArrowUp' ? -1 : 1)
            }
          }}
        >
          <Boundary>
            {Editor ? (
              <Editor data={data} onChange={onChange} readOnly={readOnly} blockId={block.id} experimentId={block.experimentId} />
            ) : (
              <p className="rounded-lg bg-slate-50 p-3 text-[13px] text-slate-500 dark:bg-slate-900">这个内容块的类型在当前版本中不可用，数据已原样保留。</p>
            )}
          </Boundary>
        </div>
      </div>
        </div>
      </ContextMenuTrigger>
      {!readOnly && (
        <ContextMenuContent>
          <ContextMenuItem icon={<Copy />} onSelect={onDuplicate}>
            复制一份
          </ContextMenuItem>
          <ContextMenuItem icon={<ArrowUp />} onSelect={() => onMove(-1)} disabled={isFirst}>
            上移
          </ContextMenuItem>
          <ContextMenuItem icon={<ArrowDown />} onSelect={() => onMove(1)} disabled={isLast}>
            下移
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem icon={<Trash2 />} danger onSelect={onDelete}>
            删除
          </ContextMenuItem>
        </ContextMenuContent>
      )}
    </ContextMenu>
  )
}
