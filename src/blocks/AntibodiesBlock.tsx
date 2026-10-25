import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronDown } from 'lucide-react'
import type { BlockEditorProps } from './types'
import { antibodyMicroliters, newAntibody, type AntibodiesData, type Antibody } from './defs'
import { db } from '@/lib/db'
import { formatQty } from '@/lib/units'
import { cn } from '@/lib/util'
import { pushUndo } from '@/lib/undo'
import { ReagentPicker } from '@/components/ReagentPicker'
import { AddRow, NumInput, Panel, RowDelete } from './kit'
import { Segmented } from '@/components/ui'

export function AntibodiesBlock({ data, onChange, readOnly }: BlockEditorProps<AntibodiesData>) {
  const ids = data.items.map((i) => i.reagentId).filter((x): x is string => !!x)
  const reagents = useLiveQuery(async () => new Map((await db.reagents.bulkGet(ids)).filter(Boolean).map((r) => [r!.id, r!])), [ids.join(',')], new Map())
  const update = (id: string, patch: Partial<Antibody>) => onChange({ items: data.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) })

  return (
    <Panel>
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {data.items.map((a) => {
          const r = a.reagentId ? reagents.get(a.reagentId) : undefined
          const ul = antibodyMicroliters(a)
          return (
            <div key={a.id} className="group/row flex flex-wrap items-center gap-2 px-3 py-2.5">
              {readOnly ? (
                <span className={cn('rounded-md px-1.5 py-0.5 text-[11px] font-medium', a.kind === '一抗' ? 'bg-violet-50 text-violet-700' : 'bg-sky-50 text-sky-700')}>{a.kind}</span>
              ) : (
                <Segmented size="sm" value={a.kind} onChange={(kind) => update(a.id, { kind })} options={[{ value: '一抗', label: '一抗' }, { value: '二抗', label: '二抗' }]} />
              )}
              <div className="min-w-44 flex-1">
                {readOnly ? (
                  <span className="text-[13px] font-medium">{r?.name ?? a.name}</span>
                ) : (
                  <div className="flex items-center gap-1">
                    <input value={a.name} onChange={(e) => update(a.id, { name: e.target.value, reagentId: r && e.target.value !== r.name ? null : a.reagentId })} placeholder="靶点" aria-label="抗体名称" className="cell font-medium" />
                    <ReagentPicker onPick={(x) => update(a.id, { reagentId: x.id, name: x.name })}>
                      <button className="flex h-8 shrink-0 cursor-pointer items-center gap-0.5 rounded-md px-2 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800">
                        试剂库 <ChevronDown className="size-3" />
                      </button>
                    </ReagentPicker>
                  </div>
                )}
                {r && (
                  <p className="px-2 text-[11px] text-slate-500">
                    {[r.vendor, r.catalogNo && `货号 ${r.catalogNo}`, r.lot && `批号 ${r.lot}`, r.stockQty !== null && `库存 ${formatQty(r.stockQty)} ${r.stockUnit}`].filter(Boolean).join(' · ')}
                  </p>
                )}
              </div>
              <input value={a.host} readOnly={readOnly} onChange={(e) => update(a.id, { host: e.target.value })} placeholder="宿主" aria-label="宿主" className="cell w-20" />
              <div className="flex items-center text-[13px] text-slate-500">
                1 :
                <NumInput value={a.dilution} onChange={(dilution) => update(a.id, { dilution })} readOnly={readOnly} label="稀释倍数" className="w-20" />
              </div>
              <div className="flex items-center gap-1 text-[13px] text-slate-500">
                <NumInput value={a.volumeMl} onChange={(volumeMl) => update(a.id, { volumeMl })} readOnly={readOnly} label="工作液体积 mL" className="w-16" />
                mL
              </div>
              <span className="w-28 text-xs text-slate-500 tabular-nums" title="原液用量 = 工作液体积 ÷ 稀释倍数">
                {ul !== null ? (
                  <>
                    原液 <b className="font-semibold text-slate-800 dark:text-slate-100">{formatQty(ul)} µL</b>
                  </>
                ) : (
                  '—'
                )}
              </span>
              <label className="flex items-center gap-1.5 text-xs text-slate-500" title="勾选后按原液用量从试剂库扣减">
                <input type="checkbox" checked={a.used} disabled={readOnly} onChange={(e) => update(a.id, { used: e.target.checked })} className="size-4 accent-brand-600" />
                已用
              </label>
              {!readOnly && <RowDelete onClick={() => { pushUndo('删除抗体', () => onChange(structuredClone(data))); onChange({ items: data.items.filter((x) => x.id !== a.id) }) }} label="删除抗体" />}
            </div>
          )
        })}
      </div>
      {!readOnly && <AddRow onClick={() => onChange({ items: [...data.items, newAntibody(data.items.at(-1)?.kind ?? '一抗')] })}>添加抗体</AddRow>}
    </Panel>
  )
}
