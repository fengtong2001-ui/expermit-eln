import { Command } from 'cmdk'
import { useState, type ReactNode } from 'react'
import { BLOCK_ORDER, DEFS, RECOMMENDED, type BlockType } from '@/blocks/defs'
import { ICONS } from '@/blocks/registry'
import { Popover, PopoverContent, PopoverTrigger } from './ui'

const itemCls =
  'flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 data-[selected=true]:bg-slate-100 dark:data-[selected=true]:bg-slate-800'
const groupCls = '[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-slate-400'

function Item({ t, onPick }: { t: BlockType; onPick: (t: BlockType) => void }) {
  const d = DEFS[t]
  const Icon = ICONS[t]
  return (
    <Command.Item value={`${d.label} ${d.keywords} ${t}`} onSelect={() => onPick(t)} className={itemCls}>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 dark:border-slate-700 dark:bg-slate-800">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-medium text-slate-800 dark:text-slate-100">{d.label}</span>
        <span className="block truncate text-xs text-slate-500">{d.description}</span>
      </span>
    </Command.Item>
  )
}

/** 插入块的选择器：按实验类型把推荐块排在最前，支持拼音/关键词搜索 */
export function BlockPicker({ kind, onPick, autoFocus = true }: { kind: string; onPick: (t: BlockType) => void; autoFocus?: boolean }) {
  const rec = RECOMMENDED[kind] ?? RECOMMENDED.general
  const rest = BLOCK_ORDER.filter((t) => !rec.includes(t))
  return (
    <Command loop className="w-80">
      <div className="border-b border-slate-100 p-2 dark:border-slate-800">
        <Command.Input
          autoFocus={autoFocus}
          placeholder="搜索内容块类型…"
          className="h-8 w-full rounded-md bg-transparent px-2 text-[13px] outline-none placeholder:text-slate-400"
        />
      </div>
      <Command.List className="max-h-80 overflow-y-auto p-1.5">
        <Command.Empty className="py-6 text-center text-xs text-slate-500">没有匹配的类型</Command.Empty>
        <Command.Group heading="推荐" className={groupCls}>
          {rec.map((t) => (
            <Item key={t} t={t} onPick={onPick} />
          ))}
        </Command.Group>
        <Command.Group heading="更多" className={groupCls}>
          {rest.map((t) => (
            <Item key={t} t={t} onPick={onPick} />
          ))}
        </Command.Group>
      </Command.List>
    </Command>
  )
}

export function InsertPopover({ kind, onPick, children, open, onOpenChange }: { kind: string; onPick: (t: BlockType) => void; children: ReactNode; open?: boolean; onOpenChange?: (v: boolean) => void }) {
  const [inner, setInner] = useState(false)
  const isOpen = open ?? inner
  const setOpen = onOpenChange ?? setInner
  return (
    <Popover open={isOpen} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="p-0">
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
