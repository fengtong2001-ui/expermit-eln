import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ClipboardPaste, Copy, Eraser, Palette, Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import type { BlockEditorProps } from './types'
import type { PlateData, PlateGroup, Well } from './defs'
import { GROUP_COLORS, PLATES, allWells, plateOf, wellId, wellLabel, wellPos, wellsInRect } from '@/lib/plates'
import { cn, modKey, uid } from '@/lib/util'
import { BlockTitle } from './kit'
import { Button, Popover, PopoverContent, PopoverTrigger, Segmented } from '@/components/ui'
import { confirmDialog } from '@/components/confirm'
import { pushUndo } from '@/lib/undo'

const EMPTY: Well = { sample: '', treatment: '', note: '', group: null }
const isEmptyWell = (w?: Well) => !w || (!w.sample && !w.treatment && !w.note && !w.group)

/** 模块级剪贴板：跨孔板块也能粘贴 */
let clipboard: { anchor: { r: number; c: number }; cells: { dr: number; dc: number; w: Well }[] } | null = null

export function PlateBlock({ data, onChange, readOnly }: BlockEditorProps<PlateData>) {
  const plate = plateOf(data.plateId)
  const [sel, setSel] = useState<string[]>([])
  const [anchor, setAnchor] = useState<string | null>(null)
  const drag = useRef<{ start: string; additive: string[] } | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const groups = data.groups ?? []
  const groupMap = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups])

  const set = (patch: Partial<PlateData>) => onChange({ ...data, ...patch })

  const writeWells = useCallback(
    (ids: string[], fn: (w: Well) => Well) => {
      const wells = { ...data.wells }
      for (const id of ids) {
        const nw = fn({ ...EMPTY, ...wells[id] })
        if (isEmptyWell(nw)) delete wells[id]
        else wells[id] = nw
      }
      onChange({ ...data, wells })
    },
    [data, onChange],
  )

  const copy = useCallback(() => {
    if (!sel.length) return
    const ps = sel.map((id) => ({ id, p: wellPos(plate, id)! })).filter((x) => x.p)
    const minR = Math.min(...ps.map((x) => x.p.r))
    const minC = Math.min(...ps.map((x) => x.p.c))
    clipboard = { anchor: { r: minR, c: minC }, cells: ps.map((x) => ({ dr: x.p.r - minR, dc: x.p.c - minC, w: { ...EMPTY, ...data.wells[x.id] } })) }
    toast(`已复制 ${sel.length} 个孔`)
  }, [sel, plate, data.wells])

  const paste = useCallback(() => {
    if (!clipboard || !sel.length || readOnly) return
    const cb = clipboard
    const targets = new Set<string>()
    const wells = { ...data.wells }
    // 只复制了一个孔：粘到所有选中孔；否则以选区左上角为起点按形状粘贴
    if (cb.cells.length === 1) {
      for (const id of sel) {
        wells[id] = { ...cb.cells[0].w }
        targets.add(id)
      }
    } else {
      const ps = sel.map((id) => wellPos(plate, id)!).filter(Boolean)
      const r0 = Math.min(...ps.map((p) => p.r))
      const c0 = Math.min(...ps.map((p) => p.c))
      for (const cell of cb.cells) {
        const r = r0 + cell.dr
        const c = c0 + cell.dc
        if (r >= plate.rows || c >= plate.cols) continue
        const id = wellId(plate, r, c)
        wells[id] = { ...cell.w }
        targets.add(id)
      }
    }
    for (const id of targets) if (isEmptyWell(wells[id])) delete wells[id]
    onChange({ ...data, wells })
    setSel([...targets])
    toast(`已粘贴到 ${targets.size} 个孔`)
  }, [sel, readOnly, data, onChange, plate])

  const clear = useCallback(() => {
    if (!sel.length || readOnly) return
    const before = data
    writeWells(sel, () => EMPTY)
    toast(`已清空 ${sel.length} 个孔`, { action: { label: '撤销', onClick: () => onChange(before) } })
  }, [sel, readOnly, data, writeWells, onChange])

  // 快捷键只在焦点位于本孔板内时生效；输入框里有选中文字时让给系统复制
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const fn = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      const inInput = t.tagName === 'INPUT' || t.tagName === 'TEXTAREA'
      const mod = e.metaKey || e.ctrlKey
      if (inInput) {
        const i = t as HTMLInputElement
        const hasSel = i.selectionStart !== i.selectionEnd
        if (mod && e.key.toLowerCase() === 'c' && !hasSel) {
          e.preventDefault()
          copy()
        } else if (mod && e.key.toLowerCase() === 'v' && clipboard && !i.value) {
          e.preventDefault()
          paste()
        }
        return
      }
      if (mod && e.key.toLowerCase() === 'c') {
        e.preventDefault()
        copy()
      } else if (mod && e.key.toLowerCase() === 'v') {
        e.preventDefault()
        paste()
      } else if (mod && e.key.toLowerCase() === 'a') {
        e.preventDefault()
        setSel(allWells(plate))
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault()
        clear()
      } else if (e.key === 'Escape') setSel([])
      else if (e.key.startsWith('Arrow') && sel.length) {
        e.preventDefault()
        const cur = wellPos(plate, sel[sel.length - 1])
        if (!cur) return
        const d = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key]!
        const r = Math.min(plate.rows - 1, Math.max(0, cur.r + d[0]))
        const c = Math.min(plate.cols - 1, Math.max(0, cur.c + d[1]))
        const id = wellId(plate, r, c)
        if (e.shiftKey && anchor) setSel(wellsInRect(plate, anchor, id))
        else {
          setSel([id])
          setAnchor(id)
        }
      }
    }
    el.addEventListener('keydown', fn)
    return () => el.removeEventListener('keydown', fn)
  }, [copy, paste, clear, plate, sel, anchor])

  const hitWell = (x: number, y: number) => {
    const el = document.elementFromPoint(x, y)?.closest('[data-well]') as HTMLElement | null
    return el?.dataset.well ?? null
  }

  const onPointerDown = (e: React.PointerEvent, id: string) => {
    if (e.button !== 0) return
    gridRef.current?.focus({ preventScroll: true })
    if (e.shiftKey && anchor) {
      setSel(wellsInRect(plate, anchor, id))
      return
    }
    if (e.metaKey || e.ctrlKey) {
      setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
      setAnchor(id)
      return
    }
    setAnchor(id)
    setSel([id])
    drag.current = { start: id, additive: [] }
    ;(e.target as HTMLElement).releasePointerCapture?.(e.pointerId)
  }

  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (!drag.current) return
      const id = hitWell(e.clientX, e.clientY)
      if (id) setSel(wellsInRect(plate, drag.current.start, id))
    }
    const up = () => (drag.current = null)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [plate])

  const changePlate = async (pid: string) => {
    if (pid === data.plateId) return
    const np = plateOf(pid)
    const lost = Object.keys(data.wells).filter((id) => !wellPos(np, id))
    if (lost.length) {
      const ok = await confirmDialog({
        title: `换成${np.label}？`,
        body: `有 ${lost.length} 个已填写的孔在${np.label}上不存在（如 ${lost.slice(0, 3).join('、')}），这些孔的内容会被删除。`,
        confirmText: '仍然更换',
        danger: true,
      })
      if (!ok) return
    }
    const wells: Record<string, Well> = {}
    for (const [k, v] of Object.entries(data.wells)) if (wellPos(np, k)) wells[k] = v
    setSel([])
    onChange({ ...data, plateId: pid, wells })
  }

  const addGroup = () => {
    const used = new Set(groups.map((g) => g.color))
    const color = GROUP_COLORS.find((c) => !used.has(c.id))?.id ?? GROUP_COLORS[groups.length % GROUP_COLORS.length].id
    const g: PlateGroup = { id: uid(), name: `组 ${groups.length + 1}`, color }
    const next = { ...data, groups: [...groups, g] }
    if (sel.length) {
      const wells = { ...data.wells }
      for (const id of sel) wells[id] = { ...EMPTY, ...wells[id], group: g.id }
      next.wells = wells
    }
    onChange(next)
  }

  const filled = Object.keys(data.wells).length
  const total = plate.rows * plate.cols
  const big = total >= 48
  const selWells = sel.map((id) => ({ ...EMPTY, ...data.wells[id] }))
  const common = (k: keyof Well) => {
    const vs = new Set(selWells.map((w) => w[k] ?? ''))
    return vs.size === 1 ? ([...vs][0] as string) : null
  }

  const colorOf = (w?: Well) => (w?.group ? GROUP_COLORS.find((c) => c.id === groupMap.get(w.group!)?.color) : undefined)

  return (
    <div ref={wrapRef}>
      <BlockTitle value={data.title} onChange={(title) => set({ title })} placeholder="孔板名称" readOnly={readOnly} />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {readOnly ? (
          <span className="text-[13px] font-medium text-slate-600">{plate.label}</span>
        ) : (
          <Segmented size="sm" value={data.plateId} onChange={changePlate} options={PLATES.map((p) => ({ value: p.id, label: p.label.replace(' 孔板', '') + ' 孔' }))} />
        )}
        <span className="text-xs text-slate-500">
          已填 {filled} / {total} 孔
        </span>
      </div>

      <div className="grid gap-4">
        {/* 孔板 */}
        <div className="-mx-1 overflow-x-auto px-1 pb-1">
          <div
            ref={gridRef}
            tabIndex={0}
            role="grid"
            aria-label={`${plate.label}，${modKey}+C/V 复制粘贴，方向键移动，Shift 扩选`}
            className="relative mx-auto rounded-2xl border-2 border-slate-300 bg-slate-50 p-3 outline-none select-none focus-visible:ring-3 focus-visible:ring-brand-500/30 dark:border-slate-600 dark:bg-slate-800/60"
            style={{ clipPath: 'polygon(16px 0, 100% 0, 100% 100%, 0 100%, 0 16px)', aspectRatio: '127.8 / 85.5', width: '100%', minWidth: big ? 520 : 300, maxWidth: total <= 12 ? 480 : 640 }}
          >
            <div
              className="grid h-full"
              style={{
                gridTemplateColumns: plate.seq ? `repeat(${plate.cols}, minmax(0, 1fr))` : `18px repeat(${plate.cols}, minmax(0, 1fr))`,
                gridTemplateRows: plate.seq ? `repeat(${plate.rows}, minmax(0, 1fr))` : `16px repeat(${plate.rows}, minmax(0, 1fr))`,
                gap: big ? 3 : 8,
              }}
            >
              {!plate.seq && (
                <>
                  <span />
                  {Array.from({ length: plate.cols }, (_, c) => (
                    <span key={c} className="text-center text-[10px] leading-4 font-medium text-slate-500">
                      {c + 1}
                    </span>
                  ))}
                </>
              )}
              {Array.from({ length: plate.rows }, (_, r) => (
                <div key={r} className="contents">
                  {!plate.seq && <span className="flex items-center text-[10px] font-medium text-slate-500">{String.fromCharCode(65 + r)}</span>}
                  {Array.from({ length: plate.cols }, (_, c) => {
                    const id = wellId(plate, r, c)
                    const w = data.wells[id]
                    const col = colorOf(w)
                    const selected = sel.includes(id)
                    const has = !isEmptyWell(w)
                    return (
                      <div key={id} className="flex items-center justify-center">
                        <button
                          type="button"
                          data-well={id}
                          tabIndex={-1}
                          onPointerDown={(e) => onPointerDown(e, id)}
                          title={has ? `${wellLabel(plate, id)}：${[w!.sample, w!.treatment].filter(Boolean).join(' / ') || '已分组'}` : wellLabel(plate, id)}
                          className={cn(
                            'relative flex aspect-square w-full cursor-pointer items-center justify-center overflow-hidden rounded-full border text-center transition-[box-shadow,transform]',
                            !col && (has ? 'border-brand-400 bg-brand-100 dark:bg-brand-500/25' : 'border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-900'),
                            selected && 'ring-3 ring-brand-500 ring-offset-1 ring-offset-slate-50 dark:ring-offset-slate-800',
                          )}
                          style={col ? { background: col.soft, borderColor: col.fill } : undefined}
                        >
                          {plate.seq ? (
                            <span className="pointer-events-none px-1 text-xs leading-tight">
                              <span className="block font-semibold text-slate-500">{id}</span>
                              {w?.sample && <span className="line-clamp-2 block text-[11px] text-slate-700 dark:text-slate-200">{w.sample}</span>}
                            </span>
                          ) : (
                            !big &&
                            w?.sample && <span className="pointer-events-none line-clamp-2 px-0.5 text-[10px] leading-tight text-slate-700 dark:text-slate-200">{w.sample}</span>
                          )}
                          {big && has && !col && <span className="pointer-events-none size-1.5 rounded-full bg-brand-600" />}
                        </button>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
          {!readOnly && (
            <p className="no-print mt-2 text-center text-[11px] text-slate-500">
              拖动框选 · {modKey}+单击多选 · Shift+单击选矩形 · {modKey}+C / {modKey}+V 复制粘贴 · Delete 清空
            </p>
          )}

          {/* 分组图例 */}
          {groups.length > 0 && (
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {groups.map((g) => {
                const c = GROUP_COLORS.find((x) => x.id === g.color)!
                const n = Object.values(data.wells).filter((w) => w.group === g.id).length
                return (
                  <span key={g.id} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white py-0.5 pr-2 pl-1 text-xs dark:border-slate-700 dark:bg-slate-900">
                    <span className="size-3.5 rounded-full border" style={{ background: c.soft, borderColor: c.fill }} />
                    {readOnly ? (
                      g.name
                    ) : (
                      <input
                        value={g.name}
                        onChange={(e) => set({ groups: groups.map((x) => (x.id === g.id ? { ...x, name: e.target.value } : x)) })}
                        className="w-16 bg-transparent outline-none"
                        aria-label="分组名称"
                      />
                    )}
                    <span className="text-slate-500">{n}</span>
                    {!readOnly && (
                      <button
                        aria-label={`删除分组 ${g.name}`}
                        className="cursor-pointer text-slate-400 hover:text-rose-500"
                        onClick={() => {
                          pushUndo('删除分组', () => onChange(structuredClone(data)))
                          const wells: Record<string, Well> = {}
                          for (const [k, w] of Object.entries(data.wells)) {
                            const nw = w.group === g.id ? { ...w, group: null } : w
                            if (!isEmptyWell(nw)) wells[k] = nw
                          }
                          onChange({ ...data, wells, groups: groups.filter((x) => x.id !== g.id) })
                        }}
                      >
                        <X className="size-3" />
                      </button>
                    )}
                  </span>
                )
              })}
            </div>
          )}
        </div>

        {/* 选中孔的编辑面板 */}
        {!readOnly && (
          <div className="no-print rounded-xl border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-900/60 [&_.wellfields]:grid [&_.wellfields]:gap-3 sm:[&_.wellfields]:grid-cols-3">
            {sel.length === 0 ? (
              <p className="py-2 text-center text-[13px] text-slate-500">点选或拖动框选孔，在这里填写样品、处理与分组</p>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-medium text-slate-700 dark:text-slate-200">
                    {sel.length === 1 ? wellLabel(plate, sel[0]) : `已选 ${sel.length} 个孔`}
                  </span>
                  <button className="cursor-pointer text-xs text-slate-500 hover:text-slate-700" onClick={() => setSel([])}>
                    取消选择
                  </button>
                </div>
                <div className="wellfields">
                {(['sample', 'treatment', 'note'] as const).map((k) => {
                  const v = common(k)
                  return (
                    <label key={k} className="block">
                      <span className="label">{{ sample: '样品', treatment: '处理 / 试剂与用量', note: '备注' }[k]}</span>
                      <input
                        className="field"
                        value={v ?? ''}
                        onChange={(e) => writeWells(sel, (w) => ({ ...w, [k]: e.target.value }))}
                      />
                    </label>
                  )
                })}
                </div>
                <div>
                  <span className="label">分组</span>
                  <div className="flex flex-wrap gap-1.5">
                    {groups.map((g) => {
                      const c = GROUP_COLORS.find((x) => x.id === g.color)!
                      const active = common('group') === g.id
                      return (
                        <button
                          key={g.id}
                          onClick={() => writeWells(sel, (w) => ({ ...w, group: active ? null : g.id }))}
                          className={cn(
                            'inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 text-xs transition',
                            active ? 'border-transparent text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
                          )}
                          style={active ? { background: c.fill } : undefined}
                        >
                          {!active && <span className="size-2.5 rounded-full" style={{ background: c.fill }} />}
                          {g.name}
                        </button>
                      )
                    })}
                    <button
                      onClick={addGroup}
                      className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-full border border-dashed border-slate-300 px-2.5 text-xs text-slate-500 hover:border-slate-400 hover:text-slate-700 dark:border-slate-600"
                    >
                      <Plus className="size-3" /> 新分组
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 border-t border-slate-200 pt-3 dark:border-slate-800">
                  <Button size="sm" onClick={copy}>
                    <Copy /> 复制
                  </Button>
                  <Button size="sm" onClick={paste} disabled={!clipboard}>
                    <ClipboardPaste /> 粘贴
                  </Button>
                  <Button size="sm" variant="ghost" onClick={clear}>
                    <Eraser /> 清空
                  </Button>
                </div>
              </div>
            )}
            {groups.length === 0 && sel.length === 0 && (
              <div className="border-t border-slate-200 pt-3 text-center dark:border-slate-800">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button size="sm" variant="ghost">
                      <Palette /> 关于分组上色
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="max-w-64 p-3 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                    选中一些孔后点「新分组」，这些孔会按组上色，方便一眼看清对照组、处理组、空白孔的位置。
                  </PopoverContent>
                </Popover>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 已填写孔的清单：打印和只读时也能看清 */}
      {filled > 0 && (
        <details className="mt-4 group/details" open={readOnly}>
          <summary className="cursor-pointer text-xs text-slate-500 select-none hover:text-slate-800">查看已填写的孔（{filled}）</summary>
          <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
            <table className="w-full text-left text-[13px]">
              <thead className="bg-slate-50 text-xs text-slate-500 dark:bg-slate-900">
                <tr>
                  <th className="px-3 py-2 font-medium">孔位</th>
                  <th className="px-3 py-2 font-medium">分组</th>
                  <th className="px-3 py-2 font-medium">样品</th>
                  <th className="px-3 py-2 font-medium">处理</th>
                  <th className="px-3 py-2 font-medium">备注</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {allWells(plate)
                  .filter((id) => data.wells[id])
                  .map((id) => {
                    const w = data.wells[id]
                    return (
                      <tr key={id}>
                        <td className="px-3 py-1.5 font-mono text-xs">{id}</td>
                        <td className="px-3 py-1.5">{w.group ? groupMap.get(w.group)?.name : ''}</td>
                        <td className="px-3 py-1.5">{w.sample}</td>
                        <td className="px-3 py-1.5">{w.treatment}</td>
                        <td className="px-3 py-1.5 text-slate-500">{w.note}</td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  )
}
