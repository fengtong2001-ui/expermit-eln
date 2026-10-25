import { Command } from 'cmdk'
import { useState, type ReactNode } from 'react'
import { Plus, TestTube } from 'lucide-react'
import { useReagents, reagentAlerts } from '@/lib/hooks'
import { saveReagent } from '@/lib/repo'
import { formatQty } from '@/lib/units'
import type { Reagent } from '@/lib/types'
import { cn } from '@/lib/util'
import { Popover, PopoverContent, PopoverTrigger } from './ui'

/** 从试剂库挑选；找不到时可就地新建（只填名称，其余稍后补） */
export function ReagentPicker({ onPick, children, filter }: { onPick: (r: Reagent) => void; children: ReactNode; filter?: (r: Reagent) => boolean }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const all = (useReagents() ?? []).filter((r) => (filter ? filter(r) : true))
  const t = q.trim().toLowerCase()
  const reagents = t ? all.filter((r) => `${r.name} ${r.catalogNo} ${r.lot} ${r.vendor} ${r.category}`.toLowerCase().includes(t)) : all
  const exact = all.some((r) => r.name.trim().toLowerCase() === t)
  const pick = (r: Reagent) => {
    setOpen(false)
    setQ('')
    onPick(r)
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-80 p-0">
        <Command loop shouldFilter={false}>
          <div className="border-b border-slate-100 p-2 dark:border-slate-800">
            <Command.Input
              autoFocus
              value={q}
              onValueChange={setQ}
              placeholder="搜索"
              className="h-8 w-full bg-transparent px-2 text-[13px] outline-none placeholder:text-slate-400"
            />
          </div>
          <Command.List className="max-h-72 overflow-y-auto p-1.5">
            {reagents.length === 0 && !t && <p className="px-2 py-4 text-center text-xs text-slate-500">试剂库还是空的，输入名称即可新建</p>}
            {reagents.map((r) => {
              const alerts = reagentAlerts(r)
              return (
                <Command.Item
                  key={r.id}
                  value={`${r.name} ${r.catalogNo} ${r.lot} ${r.vendor} ${r.id}`}
                  onSelect={() => pick(r)}
                  className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 data-[selected=true]:bg-slate-100 dark:data-[selected=true]:bg-slate-800"
                >
                  <TestTube className="size-4 shrink-0 text-slate-500" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-slate-800 dark:text-slate-100">{r.name}</span>
                    <span className="block truncate text-[11px] text-slate-500">{[r.vendor, r.catalogNo, r.lot && `批号 ${r.lot}`].filter(Boolean).join(' · ') || r.category}</span>
                  </span>
                  <span className={cn('text-xs tabular-nums', alerts.some((a) => a.kind === 'out' || a.kind === 'expired') ? 'text-rose-600' : 'text-slate-500')}>
                    {r.stockQty !== null ? `${formatQty(r.stockQty)} ${r.stockUnit}` : ''}
                  </span>
                </Command.Item>
              )
            })}
            {t && !exact && (
              <Command.Item
                value={`__new ${q}`}
                onSelect={async () => {
                  const id = await saveReagent({ name: q.trim() })
                  pick({ id, name: q.trim(), stockQty: null, stockUnit: '' } as Reagent)
                }}
                className="mt-1 flex cursor-pointer items-center gap-2.5 rounded-lg border-t border-slate-100 px-2 py-2 text-[13px] text-brand-700 data-[selected=true]:bg-brand-50 dark:border-slate-800 dark:text-brand-300 dark:data-[selected=true]:bg-brand-500/10"
              >
                <Plus className="size-4" /> 新建试剂「{q.trim()}」
              </Command.Item>
            )}
          </Command.List>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
