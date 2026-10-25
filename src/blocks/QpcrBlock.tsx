import { useMemo } from 'react'
import { Info, TriangleAlert } from 'lucide-react'
import type { BlockEditorProps } from './types'
import { newQpcrRow, type QpcrData } from './defs'
import { computeDDCt, type QpcrRow } from '@/lib/qpcr'
import { AddRow, NumInput, Panel, RowDelete } from './kit'
import { Field, Popover, PopoverContent, PopoverTrigger } from '@/components/ui'
import { pushUndo } from '@/lib/undo'

/** 从 Excel / 仪器导出粘贴：每行「样品 组别 基因 Ct1 Ct2 …」，制表符或逗号分隔 */
function parsePaste(text: string, replicates: number): QpcrRow[] | null {
  const lines = text.trim().split(/\r?\n/).filter(Boolean)
  if (lines.length < 1) return null
  const rows = lines.map((l) => l.split(/\t|,/).map((s) => s.trim()))
  if (rows.every((r) => r.length < 4)) return null
  const body = rows.filter((r) => r.slice(3).some((x) => x !== '' && !Number.isNaN(Number(x))))
  if (!body.length) return null
  return body.map((r) => {
    const cts = r.slice(3, 3 + Math.max(replicates, r.length - 3)).map((x) => (x === '' || Number.isNaN(Number(x)) ? null : Number(x)))
    return { ...newQpcrRow(replicates), sample: r[0], group: r[1], target: r[2], cts: cts.length ? cts : Array(replicates).fill(null) }
  })
}

export function QpcrBlock({ data, onChange, readOnly }: BlockEditorProps<QpcrData>) {
  const result = useMemo(() => computeDDCt(data.rows, data), [data])
  const n = data.replicates
  const setRows = (rows: QpcrRow[]) => onChange({ ...data, rows })
  const update = (id: string, patch: Partial<QpcrRow>) => setRows(data.rows.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  const targets = [...new Set(result.groups.map((g) => g.target))]
  const maxFold = Math.max(1, ...result.groups.map((g) => g.fold + (Number.isFinite(g.sd) ? g.sd : 0)))

  const setReplicates = (k: number) => {
    const rn = Math.max(1, Math.min(6, k))
    onChange({ ...data, replicates: rn, rows: data.rows.map((r) => ({ ...r, cts: Array.from({ length: rn }, (_, i) => r.cts[i] ?? null) })) })
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="内参基因" className="w-32">
          <input className="field" value={data.reference} readOnly={readOnly} onChange={(e) => onChange({ ...data, reference: e.target.value })} />
        </Field>
        <Field label="对照组" className="w-32">
          <input className="field" value={data.control} readOnly={readOnly} onChange={(e) => onChange({ ...data, control: e.target.value })} placeholder="对照" />
        </Field>
        <Field label="复孔数" className="w-20">
          <input type="number" min={1} max={6} className="field" value={n} readOnly={readOnly} onChange={(e) => setReplicates(Number(e.target.value) || 1)} />
        </Field>
        <Popover>
          <PopoverTrigger asChild>
            <button className="mb-2 flex cursor-pointer items-center gap-1 text-xs text-slate-500 hover:text-slate-700">
              <Info className="size-3.5" /> 怎么算的
            </button>
          </PopoverTrigger>
          <PopoverContent className="max-w-80 p-3.5 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
            <p>采用 2<sup>−ΔΔCt</sup> 法（Livak &amp; Schmittgen, <i>Methods</i> 2001）：</p>
            <p className="mt-1.5 font-mono text-[11px]">ΔCt = Ct(目的基因) − Ct(内参)</p>
            <p className="font-mono text-[11px]">ΔΔCt = ΔCt(样品) − 对照组 ΔCt 均值</p>
            <p className="font-mono text-[11px]">相对表达量 = 2^(−ΔΔCt)</p>
            <p className="mt-1.5 text-slate-500">此法假设目的基因与内参扩增效率接近且约为 100%，请先用标准曲线确认。复孔取均值，同一样品名的内参与目的基因自动配对。</p>
          </PopoverContent>
        </Popover>
      </div>

      <Panel>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-[13px]">
            <thead>
              <tr className="border-b border-slate-100 text-left text-[11px] text-slate-500 dark:border-slate-800">
                <th className="px-2 py-2 pl-3 font-medium">样品</th>
                <th className="px-2 py-2 font-medium">组别</th>
                <th className="px-2 py-2 font-medium">基因</th>
                {Array.from({ length: n }, (_, i) => (
                  <th key={i} className="px-2 py-2 font-medium">
                    Ct {i + 1}
                  </th>
                ))}
                <th className="w-8" />
              </tr>
            </thead>
            <tbody
              className="divide-y divide-slate-100 dark:divide-slate-800"
              onPaste={(e) => {
                if (readOnly) return
                const rows = parsePaste(e.clipboardData.getData('text'), n)
                if (!rows) return
                e.preventDefault()
                const kept = data.rows.filter((r) => r.sample || r.target || r.cts.some((c) => c !== null))
                setRows([...kept, ...rows])
              }}
            >
              {data.rows.map((r) => (
                <tr key={r.id} className="group/row">
                  <td className="px-1 py-0.5 pl-2">
                    <input className="cell" value={r.sample} readOnly={readOnly} onChange={(e) => update(r.id, { sample: e.target.value })} aria-label="样品" />
                  </td>
                  <td className="px-1 py-0.5">
                    <input className="cell" value={r.group} readOnly={readOnly} onChange={(e) => update(r.id, { group: e.target.value })} aria-label="组别" list="qpcr-groups" />
                  </td>
                  <td className="px-1 py-0.5">
                    <input className="cell" value={r.target} readOnly={readOnly} onChange={(e) => update(r.id, { target: e.target.value })} aria-label="基因" list="qpcr-targets" />
                  </td>
                  {Array.from({ length: n }, (_, i) => (
                    <td key={i} className="px-1 py-0.5">
                      <NumInput
                        value={r.cts[i] ?? null}
                        readOnly={readOnly}
                        label={`Ct ${i + 1}`}
                        onChange={(v) => update(r.id, { cts: Array.from({ length: n }, (_, j) => (j === i ? v : (r.cts[j] ?? null))) })}
                        className="w-20"
                      />
                    </td>
                  ))}
                  <td>{!readOnly && <RowDelete onClick={() => { pushUndo('删除行', () => setRows(structuredClone(data.rows))); setRows(data.rows.filter((x) => x.id !== r.id)) }} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <datalist id="qpcr-groups">
          {[...new Set(data.rows.map((r) => r.group).filter(Boolean))].map((g) => (
            <option key={g} value={g} />
          ))}
        </datalist>
        <datalist id="qpcr-targets">
          {[...new Set([data.reference, ...data.rows.map((r) => r.target)].filter(Boolean))].map((g) => (
            <option key={g} value={g} />
          ))}
        </datalist>
        {!readOnly && <AddRow onClick={() => setRows([...data.rows, newQpcrRow(n)])}>添加一行（也可以直接从 Excel 粘贴整张表：样品、组别、基因、Ct…）</AddRow>}
      </Panel>

      {result.issues.length > 0 && (
        <div className="space-y-1 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
          {result.issues.slice(0, 5).map((s) => (
            <p key={s} className="flex items-center gap-1.5">
              <TriangleAlert className="size-3.5 shrink-0" /> {s}
            </p>
          ))}
        </div>
      )}

      {result.groups.length > 0 && (
        <Panel className="p-4">
          <p className="mb-3 text-xs font-medium text-slate-500">相对表达量（2^−ΔΔCt，均值 ± SD，相对于「{data.control}」）</p>
          <div className="space-y-4">
            {targets.map((t) => (
              <div key={t}>
                <p className="mb-1.5 text-[13px] font-semibold text-slate-800 dark:text-slate-100">{t}</p>
                <div className="space-y-1.5">
                  {result.groups
                    .filter((g) => g.target === t)
                    .map((g) => (
                      <div key={g.group} className="grid grid-cols-[88px_1fr_120px] items-center gap-3 text-xs">
                        <span className="truncate text-slate-500">{g.group || '未分组'}</span>
                        <div className="relative h-5 rounded bg-slate-100 dark:bg-slate-800">
                          <div className="absolute inset-y-0 left-0 rounded bg-sky-500/80" style={{ width: `${(g.fold / maxFold) * 100}%` }} />
                          {Number.isFinite(g.sd) && (
                            <div
                              className="absolute top-1/2 h-px -translate-y-1/2 bg-slate-700 dark:bg-slate-300"
                              style={{ left: `${(Math.max(0, g.fold - g.sd) / maxFold) * 100}%`, width: `${((Math.min(g.fold + g.sd, maxFold) - Math.max(0, g.fold - g.sd)) / maxFold) * 100}%` }}
                            />
                          )}
                          <div className="absolute inset-y-0 w-px bg-slate-400/70" style={{ left: `${(1 / maxFold) * 100}%` }} title="对照 = 1" />
                        </div>
                        <span className="text-slate-700 tabular-nums dark:text-slate-200">
                          {g.fold.toFixed(2)}
                          {Number.isFinite(g.sd) && <span className="text-slate-500"> ± {g.sd.toFixed(2)}</span>}
                          <span className="text-slate-500"> (n={g.n})</span>
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>
          <details className="mt-4">
            <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-700">每个样品的计算明细</summary>
            <table className="mt-2 w-full text-xs tabular-nums">
              <thead className="text-left text-slate-500">
                <tr>
                  {['样品', '组别', '基因', 'Ct 均值', '内参 Ct', 'ΔCt', 'ΔΔCt', '2^−ΔΔCt'].map((h) => (
                    <th key={h} className="py-1 pr-3 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.results.map((r) => (
                  <tr key={r.sample + r.target} className="text-slate-600 dark:text-slate-300">
                    <td className="py-0.5 pr-3">{r.sample}</td>
                    <td className="pr-3">{r.group}</td>
                    <td className="pr-3">{r.target}</td>
                    <td className="pr-3">{r.meanCt.toFixed(2)}</td>
                    <td className="pr-3">{r.refCt.toFixed(2)}</td>
                    <td className="pr-3">{r.dCt.toFixed(2)}</td>
                    <td className="pr-3">{r.ddCt.toFixed(2)}</td>
                    <td className="pr-3 font-medium">{r.fold.toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </Panel>
      )}
    </div>
  )
}
