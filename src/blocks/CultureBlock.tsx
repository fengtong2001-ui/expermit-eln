import type { BlockEditorProps } from './types'
import { newVessel, type CultureData, type Vessel } from './defs'
import { AddRow, Panel, RowDelete } from './kit'
import { todayStr, daysUntil } from '@/lib/util'
import { pushUndo } from '@/lib/undo'

// 常见培养容器；面积等规格因厂商而异，这里不写死数值，请以耗材说明书为准
export const VESSELS = ['T25 培养瓶', 'T75 培养瓶', 'T175 培养瓶', '35 mm 培养皿', '60 mm 培养皿', '100 mm 培养皿', '150 mm 培养皿', '6 孔板', '12 孔板', '24 孔板', '96 孔板', '15 mL 离心管', '冻存管']

function FlaskIcon({ vessel }: { vessel: string }) {
  const isDish = /皿/.test(vessel)
  const isPlate = /孔板/.test(vessel)
  if (isDish)
    return (
      <svg viewBox="0 0 40 40" className="size-10 text-pink-400" aria-hidden>
        <ellipse cx="20" cy="22" rx="17" ry="9" fill="currentColor" opacity=".25" />
        <ellipse cx="20" cy="20" rx="17" ry="9" fill="none" stroke="currentColor" strokeWidth="2" />
      </svg>
    )
  if (isPlate)
    return (
      <svg viewBox="0 0 40 40" className="size-10 text-slate-500" aria-hidden>
        <rect x="3" y="10" width="34" height="22" rx="3" fill="none" stroke="currentColor" strokeWidth="2" />
        {[0, 1].map((r) => [0, 1, 2].map((c) => <circle key={`${r}${c}`} cx={11 + c * 9} cy={17 + r * 8} r="3" fill="currentColor" opacity=".35" />))}
      </svg>
    )
  return (
    <svg viewBox="0 0 40 40" className="size-10 text-pink-400" aria-hidden>
      <path d="M6 14h22l8 6v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V16a2 2 0 0 1 2-2Z" fill="currentColor" opacity=".2" />
      <path d="M6 14h22l8 6v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V16a2 2 0 0 1 2-2Z" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="28" y="6" width="7" height="6" rx="1" fill="none" stroke="currentColor" strokeWidth="2" transform="rotate(35 31 9)" />
    </svg>
  )
}

export function CultureBlock({ data, onChange, readOnly }: BlockEditorProps<CultureData>) {
  const set = (vessels: Vessel[]) => onChange({ vessels })
  const update = (id: string, patch: Partial<Vessel>) => set(data.vessels.map((v) => (v.id === id ? { ...v, ...patch } : v)))
  return (
    <Panel>
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {data.vessels.map((v) => {
          const days = v.seededOn ? -daysUntil(v.seededOn) : null
          return (
            <div key={v.id} className="group/row flex gap-3 p-3">
              <FlaskIcon vessel={v.vessel} />
              <div className="grid min-w-0 flex-1 grid-cols-2 gap-x-2 gap-y-1 sm:grid-cols-4">
                <label className="col-span-2 sm:col-span-1">
                  <span className="label !mb-0.5 px-2">容器</span>
                  <input className="cell font-medium" list="eln-vessels" value={v.vessel} readOnly={readOnly} onChange={(e) => update(v.id, { vessel: e.target.value })} />
                </label>
                <label>
                  <span className="label !mb-0.5 px-2">细胞</span>
                  <input className="cell" value={v.cellLine} readOnly={readOnly} onChange={(e) => update(v.id, { cellLine: e.target.value })} />
                </label>
                <label>
                  <span className="label !mb-0.5 px-2">代次</span>
                  <div className="flex items-center">
                    <span className="pl-2 text-[13px] text-slate-500">P</span>
                    <input className="cell" inputMode="numeric" value={v.passage} readOnly={readOnly} onChange={(e) => update(v.id, { passage: e.target.value })} />
                  </div>
                </label>
                <label>
                  <span className="label !mb-0.5 px-2">
                    接种日期{days !== null && days >= 0 && <span className="ml-1 text-brand-600">第 {days} 天</span>}
                  </span>
                  <input type="date" className="cell" value={v.seededOn} readOnly={readOnly} onChange={(e) => update(v.id, { seededOn: e.target.value })} />
                </label>
                <label>
                  <span className="label !mb-0.5 px-2">接种密度</span>
                  <input className="cell" value={v.density} readOnly={readOnly} onChange={(e) => update(v.id, { density: e.target.value })} />
                </label>
                <label>
                  <span className="label !mb-0.5 px-2">汇合度</span>
                  <input className="cell" value={v.confluence} readOnly={readOnly} onChange={(e) => update(v.id, { confluence: e.target.value })} />
                </label>
                <label className="col-span-2">
                  <span className="label !mb-0.5 px-2">观察</span>
                  <input className="cell" value={v.note} readOnly={readOnly} onChange={(e) => update(v.id, { note: e.target.value })} />
                </label>
              </div>
              {!readOnly && <RowDelete onClick={() => { pushUndo('删除容器', () => set(structuredClone(data.vessels))); set(data.vessels.filter((x) => x.id !== v.id)) }} label="删除容器" />}
            </div>
          )
        })}
      </div>
      {!readOnly && (
        <div className="flex flex-wrap items-center border-t border-slate-100 dark:border-slate-800">
          <div className="flex-1">
            <AddRow onClick={() => set([...data.vessels, newVessel(data.vessels.at(-1)?.vessel)])}>添加容器</AddRow>
          </div>
          <button
            className="cursor-pointer px-3 text-xs text-slate-500 hover:text-slate-700"
            onClick={() =>
              set([
                ...data.vessels,
                ...data.vessels.map((v) => ({ ...newVessel(v.vessel), cellLine: v.cellLine, passage: v.passage ? String(Number(v.passage) + 1 || v.passage) : '', seededOn: todayStr() })),
              ])
            }
            title="为每个容器添加下一代（代次 +1，接种日期为今天）"
          >
            传代 +1
          </button>
        </div>
      )}
      <datalist id="eln-vessels">
        {VESSELS.map((x) => (
          <option key={x} value={x} />
        ))}
      </datalist>
    </Panel>
  )
}
