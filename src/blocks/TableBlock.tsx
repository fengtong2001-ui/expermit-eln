import { useMemo } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import type { BlockEditorProps } from './types'
import type { TableData } from './defs'
import { mean, sd } from '@/lib/qpcr'
import { AddRow, BlockTitle, Panel, RowDelete } from './kit'
import { pushUndo } from '@/lib/undo'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/context-menu'

/** 解析 Excel / 制表符分隔文本 */
export function parseTSV(text: string): string[][] {
  return text
    .replace(/\r/g, '')
    .split('\n')
    .filter((l, i, a) => l !== '' || i < a.length - 1)
    .map((l) => l.split('\t'))
}

export function TableBlock({ data, onChange, readOnly }: BlockEditorProps<TableData>) {
  const cols = data.columns.length
  const setCell = (r: number, c: number, v: string) => onChange({ ...data, rows: data.rows.map((row, i) => (i === r ? row.map((x, j) => (j === c ? v : x)) : row)) })
  const setCol = (c: number, v: string) => onChange({ ...data, columns: data.columns.map((x, j) => (j === c ? v : x)) })
  const addCol = () => onChange({ ...data, columns: [...data.columns, `列 ${cols + 1}`], rows: data.rows.map((r) => [...r, '']) })
  const delCol = (c: number) => onChange({ ...data, columns: data.columns.filter((_, j) => j !== c), rows: data.rows.map((r) => r.filter((_, j) => j !== c)) })

  const stats = useMemo(
    () =>
      data.columns.map((_, c) => {
        const nums = data.rows.map((r) => r[c]).filter((x) => x !== '' && x !== undefined && !Number.isNaN(Number(x))).map(Number)
        return nums.length >= 2 ? { n: nums.length, mean: mean(nums), sd: sd(nums) } : null
      }),
    [data],
  )

  const onPaste = (e: React.ClipboardEvent, r0: number, c0: number) => {
    const text = e.clipboardData.getData('text')
    if (!text.includes('\t') && !text.includes('\n')) return
    e.preventDefault()
    const grid = parseTSV(text)
    const width = Math.max(cols, c0 + Math.max(...grid.map((g) => g.length)))
    const columns = [...data.columns]
    while (columns.length < width) columns.push(`列 ${columns.length + 1}`)
    const rows = data.rows.map((r) => [...r, ...Array(width - r.length).fill('')])
    grid.forEach((g, i) => {
      const r = r0 + i
      while (rows.length <= r) rows.push(Array(width).fill(''))
      g.forEach((v, j) => (rows[r][c0 + j] = v.trim()))
    })
    onChange({ ...data, columns, rows })
  }

  return (
    <div>
      <BlockTitle value={data.title} onChange={(title) => onChange({ ...data, title })} placeholder="表格名称" readOnly={readOnly} />
      <Panel className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="bg-slate-50/80 dark:bg-slate-900">
              <tr>
                {data.columns.map((c, j) => (
                  <th key={j} className="group/col min-w-28 border-b border-slate-200 p-0.5 text-left font-medium dark:border-slate-800">
                    <div className="flex items-center">
                      <input className="cell font-semibold text-slate-600 dark:text-slate-300" value={c} readOnly={readOnly} onChange={(e) => setCol(j, e.target.value)} aria-label={`第 ${j + 1} 列标题`} />
                      {!readOnly && cols > 1 && (
                        <button aria-label="删除此列" onClick={() => delCol(j)} className="no-print mr-1 cursor-pointer rounded p-1 text-slate-400 opacity-0 group-hover/col:opacity-100 hover:text-rose-500">
                          <X className="size-3" />
                        </button>
                      )}
                    </div>
                  </th>
                ))}
                {!readOnly && (
                  <th className="no-print w-9 border-b border-slate-200 dark:border-slate-800">
                    <button aria-label="添加列" onClick={addCol} className="flex size-8 cursor-pointer items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
                      <Plus className="size-4" />
                    </button>
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.rows.map((row, i) => (
                <ContextMenu key={i}>
                  <ContextMenuTrigger asChild disabled={readOnly}>
                    <tr className="group/row">
                  {data.columns.map((_, j) => (
                    <td key={j} className="p-0.5">
                      <input
                        className="cell tabular-nums"
                        value={row[j] ?? ''}
                        readOnly={readOnly}
                        onChange={(e) => setCell(i, j, e.target.value)}
                        onPaste={(e) => !readOnly && onPaste(e, i, j)}
                        aria-label={`第 ${i + 1} 行 ${data.columns[j]}`}
                      />
                    </td>
                  ))}
                  {!readOnly && (
                    <td className="no-print">
                      <RowDelete onClick={() => { pushUndo('删除行', () => onChange(structuredClone(data))); onChange({ ...data, rows: data.rows.filter((_, k) => k !== i) }) }} />
                    </td>
                  )}
                  </tr>
                </ContextMenuTrigger>
                {!readOnly && (
                  <ContextMenuContent>
                    <ContextMenuItem
                      icon={<Trash2 />}
                      danger
                      onSelect={() => {
                        pushUndo('删除行', () => onChange(structuredClone(data)))
                        onChange({ ...data, rows: data.rows.filter((_, k) => k !== i) })
                      }}
                    >
                      删除行
                    </ContextMenuItem>
                  </ContextMenuContent>
                )}
              </ContextMenu>
              ))}
            </tbody>
            {stats.some(Boolean) && (
              <tfoot className="border-t border-slate-200 bg-slate-50/60 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900">
                <tr>
                  {stats.map((s, j) => (
                    <td key={j} className="px-2.5 py-1.5 tabular-nums">
                      {s ? (
                        <>
                          均值 {s.mean.toPrecision(4)} <span className="text-slate-500">± {s.sd.toPrecision(3)} (n={s.n})</span>
                        </>
                      ) : null}
                    </td>
                  ))}
                  {!readOnly && <td />}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        {!readOnly && <AddRow onClick={() => onChange({ ...data, rows: [...data.rows, Array(cols).fill('')] })}>添加一行（可直接从 Excel 粘贴）</AddRow>}
      </Panel>
    </div>
  )
}
