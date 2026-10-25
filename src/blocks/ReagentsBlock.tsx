import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router'
import { ChevronDown, PackageCheck, TriangleAlert } from 'lucide-react'
import type { BlockEditorProps } from './types'
import { newReagentLine, type ReagentLine, type ReagentsData } from './defs'
import { db } from '@/lib/db'
import { convert, COMMON_UNITS, formatQty } from '@/lib/units'
import { reagentAlerts } from '@/lib/hooks'
import { cn } from '@/lib/util'
import { pushUndo } from '@/lib/undo'
import { ReagentPicker } from '@/components/ReagentPicker'
import { AddRow, NumInput, Panel, RowDelete } from './kit'

export function ReagentsBlock({ data, onChange, readOnly }: BlockEditorProps<ReagentsData>) {
  const ids = data.items.map((i) => i.reagentId).filter((x): x is string => !!x)
  const reagents = useLiveQuery(async () => new Map((await db.reagents.bulkGet(ids)).filter(Boolean).map((r) => [r!.id, r!])), [ids.join(',')], new Map())

  const update = (id: string, patch: Partial<ReagentLine>) => onChange({ items: data.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) })
  const remove = (id: string) => onChange({ items: data.items.filter((i) => i.id !== id) })
  const add = () => onChange({ items: [...data.items, newReagentLine()] })

  const deducted = data.items.filter((i) => i.used && i.reagentId && i.amount).length

  return (
    <Panel>
      <div className="hidden grid-cols-[28px_minmax(0,1fr)_96px_80px_minmax(0,0.8fr)_32px] items-center gap-2 border-b border-slate-100 px-3 py-2 text-[11px] font-medium text-slate-500 sm:grid dark:border-slate-800">
        <span title="勾选 = 已使用，从库存扣减">用</span>
        <span>试剂</span>
        <span>用量</span>
        <span>单位</span>
        <span>备注</span>
        <span />
      </div>
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {data.items.map((it) => {
          const r = it.reagentId ? reagents.get(it.reagentId) : undefined
          const conv = r && it.amount && r.stockQty !== null ? convert(it.amount, it.unit || r.stockUnit, r.stockUnit) : null
          const cantConvert = r && it.amount && r.stockQty !== null && conv === null
          const alerts = r ? reagentAlerts(r) : []
          return (
            <div key={it.id} className="group/row grid grid-cols-[28px_minmax(0,1fr)_32px] items-center gap-x-2 gap-y-1 px-3 py-1.5 sm:grid-cols-[28px_minmax(0,1fr)_96px_80px_minmax(0,0.8fr)_32px]">
              <input
                type="checkbox"
                checked={it.used}
                disabled={readOnly}
                onChange={(e) => update(it.id, { used: e.target.checked })}
                aria-label="已使用（从库存扣减）"
                className="size-4 cursor-pointer accent-brand-600"
              />
              <div className="min-w-0">
                {readOnly ? (
                  <span className="text-[13px]">{r?.name ?? it.name}</span>
                ) : (
                  <ReagentPicker onPick={(x) => update(it.id, { reagentId: x.id, name: x.name, unit: it.unit || x.stockUnit })}>
                    <button className={cn('flex h-9 w-full cursor-pointer items-center gap-1 rounded-md px-2 text-left text-[13px] hover:bg-slate-50 dark:hover:bg-slate-800', !it.reagentId && 'text-slate-500')}>
                      <span className="truncate">{r?.name ?? (it.name || '从试剂库选择…')}</span>
                      <ChevronDown className="size-3.5 shrink-0 text-slate-400" />
                    </button>
                  </ReagentPicker>
                )}
                {r && (
                  <div className="flex flex-wrap items-center gap-x-2 px-2 text-[11px] text-slate-500">
                    {r.stockQty !== null && (
                      <Link to={`/reagents?id=${r.id}`} className={cn('hover:underline', r.stockQty < 0 && 'text-rose-600')}>
                        库存 {formatQty(r.stockQty)} {r.stockUnit}
                      </Link>
                    )}
                    {r.lot && <span>批号 {r.lot}</span>}
                    {alerts.map((a) => (
                      <span key={a.kind} className={a.kind === 'expired' || a.kind === 'out' ? 'text-rose-600' : 'text-amber-600'}>
                        {a.text}
                      </span>
                    ))}
                    {cantConvert && (
                      <span className="inline-flex items-center gap-0.5 text-amber-600">
                        <TriangleAlert className="size-3" /> {it.unit} 无法换算为 {r.stockUnit}，不扣库存
                      </span>
                    )}
                  </div>
                )}
              </div>
              <div className="col-start-2 row-start-2 flex gap-2 sm:col-start-auto sm:row-start-auto sm:contents">
                <NumInput value={it.amount} onChange={(amount) => update(it.id, { amount })} placeholder="用量" readOnly={readOnly} className="w-24 sm:w-auto" />
                <input
                  list="eln-units"
                  value={it.unit}
                  readOnly={readOnly}
                  onChange={(e) => update(it.id, { unit: e.target.value })}
                  placeholder="单位"
                  aria-label="单位"
                  className="cell w-20 sm:w-auto"
                />
                <input value={it.note} readOnly={readOnly} onChange={(e) => update(it.id, { note: e.target.value })} placeholder="备注" aria-label="备注" className="cell" />
              </div>
              {!readOnly ? <RowDelete onClick={() => { pushUndo('删除试剂行', () => onChange(structuredClone(data))); remove(it.id) }} /> : <span />}
            </div>
          )
        })}
      </div>
      {!readOnly && <AddRow onClick={add}>添加试剂</AddRow>}
      <datalist id="eln-units">
        {COMMON_UNITS.map((u) => (
          <option key={u} value={u} />
        ))}
      </datalist>
      {deducted > 0 && (
        <div className="flex items-center gap-1.5 border-t border-slate-100 px-3 py-2 text-[11px] text-slate-500 dark:border-slate-800">
          <PackageCheck className="size-3.5 text-emerald-500" /> 已从库存扣减 {deducted} 项；取消勾选或删除即自动归还
        </div>
      )}
    </Panel>
  )
}
