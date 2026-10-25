import type { BlockEditorProps } from './types'
import { newLane, type Lane, type LanesData } from './defs'
import { AddRow, BlockTitle, Panel, RowDelete } from './kit'
import { Button } from '@/components/ui'
import { cn } from '@/lib/util'

const PRESETS = [10, 12, 15]

export function LanesBlock({ data, onChange, readOnly }: BlockEditorProps<LanesData>) {
  const set = (lanes: Lane[]) => onChange({ ...data, lanes })
  const update = (id: string, patch: Partial<Lane>) => set(data.lanes.map((l) => (l.id === id ? { ...l, ...patch } : l)))

  const resize = (n: number) => {
    const lanes = [...data.lanes]
    while (lanes.length < n) lanes.push(newLane())
    // 只裁掉尾部空泳道，避免误删已填内容
    while (lanes.length > n && !lanes[lanes.length - 1].sample && !lanes[lanes.length - 1].treatment && !lanes[lanes.length - 1].load) lanes.pop()
    set(lanes)
  }

  return (
    <div>
      <BlockTitle value={data.title} onChange={(title) => onChange({ ...data, title })} placeholder="泳道表名称" readOnly={readOnly} />

      {/* 胶图示意 */}
      <div className="mb-3 overflow-x-auto">
        <div className="inline-flex min-w-full items-end gap-1 rounded-xl bg-gradient-to-b from-slate-100 to-slate-50 px-3 pt-3 pb-2 dark:from-slate-800 dark:to-slate-900">
          {data.lanes.map((l, i) => (
            <div key={l.id} className="flex w-11 shrink-0 flex-col items-center gap-1">
              <div className={cn('h-2.5 w-9 rounded-sm', l.sample ? (i === 0 && /marker/i.test(l.sample) ? 'bg-sky-400/70' : 'bg-violet-400/70') : 'bg-slate-300/60 dark:bg-slate-700')} />
              <span className="text-[10px] font-semibold text-slate-500 tabular-nums">{i + 1}</span>
              <span className="line-clamp-2 h-7 w-full text-center text-[10px] leading-tight text-slate-600 dark:text-slate-300">{l.sample}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-2">
        <input
          value={data.gel}
          readOnly={readOnly}
          onChange={(e) => onChange({ ...data, gel: e.target.value })}
          placeholder="凝胶规格，如：10% SDS-PAGE · 10 孔"
          aria-label="凝胶规格"
          className="cell max-w-72 flex-1 text-[13px]"
        />
        {!readOnly && (
          <div className="flex items-center gap-1 text-xs text-slate-500">
            孔数
            {PRESETS.map((n) => (
              <Button key={n} size="sm" variant={data.lanes.length === n ? 'subtle' : 'ghost'} onClick={() => resize(n)}>
                {n}
              </Button>
            ))}
          </div>
        )}
      </div>

      <Panel>
        <div className="hidden grid-cols-[32px_minmax(0,1.2fr)_90px_minmax(0,1fr)_32px] gap-2 border-b border-slate-100 px-3 py-2 text-[11px] font-medium text-slate-500 sm:grid dark:border-slate-800">
          <span>泳道</span>
          <span>样品</span>
          <span>上样量</span>
          <span>处理 / 说明</span>
          <span />
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {data.lanes.map((l, i) => (
            <div key={l.id} className="group/row grid grid-cols-[32px_minmax(0,1fr)_32px] items-center gap-x-2 px-3 py-1 sm:grid-cols-[32px_minmax(0,1.2fr)_90px_minmax(0,1fr)_32px]">
              <span className="text-center text-xs font-semibold text-slate-500 tabular-nums">{i + 1}</span>
              <input
                value={l.sample}
                readOnly={readOnly}
                onChange={(e) => update(l.id, { sample: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && i === data.lanes.length - 1 && !readOnly) {
                    set([...data.lanes, newLane()])
                    setTimeout(() => (document.querySelector(`[data-lane-input="${data.lanes.length}"]`) as HTMLInputElement | null)?.focus(), 30)
                  }
                }}
                data-lane-input={i}
                placeholder="样品"
                aria-label={`泳道 ${i + 1} 样品`}
                className="cell"
              />
              {!readOnly ? <RowDelete onClick={() => set(data.lanes.filter((x) => x.id !== l.id))} label="删除泳道" /> : <span />}
              <div className="col-span-2 col-start-2 flex gap-2 pb-1 sm:col-span-2 sm:col-start-3 sm:row-start-1 sm:pb-0">
                <input value={l.load} readOnly={readOnly} onChange={(e) => update(l.id, { load: e.target.value })} placeholder="如 20 µg" aria-label="上样量" className="cell w-[90px] shrink-0" />
                <input value={l.treatment} readOnly={readOnly} onChange={(e) => update(l.id, { treatment: e.target.value })} placeholder="处理" aria-label="处理" className="cell" />
              </div>
            </div>
          ))}
        </div>
        {!readOnly && <AddRow onClick={() => set([...data.lanes, newLane()])}>添加泳道</AddRow>}
      </Panel>
    </div>
  )
}
