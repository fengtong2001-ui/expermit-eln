import { useEffect, useState } from 'react'
import { DndContext, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Pause, Play, RotateCcw, Timer } from 'lucide-react'
import { toast } from 'sonner'
import type { BlockEditorProps } from './types'
import { newStep, type ProtocolData, type Step } from './defs'
import { cn } from '@/lib/util'
import { pushUndo } from '@/lib/undo'
import { AddRow, BlockTitle, Panel, RowDelete } from './kit'

// 计时器状态放在模块级：切换页面后不丢
const timers = new Map<string, { endsAt: number | null; remain: number; total: number }>()
const subs = new Set<() => void>()
const tick = () => subs.forEach((f) => f())
setInterval(() => {
  let any = false
  for (const [id, t] of timers) {
    if (t.endsAt && t.endsAt <= Date.now()) {
      timers.set(id, { ...t, endsAt: null, remain: 0 })
      notifyDone(id)
    }
    if (t.endsAt) any = true
  }
  if (any) tick()
}, 500)

const labels = new Map<string, string>()
function notifyDone(id: string) {
  const name = labels.get(id) || '计时'
  toast.success(`「${name}」计时结束`, { duration: 15000 })
  try {
    const ctx = new AudioContext()
    for (let i = 0; i < 3; i++) {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.frequency.value = 880
      o.connect(g)
      g.connect(ctx.destination)
      g.gain.setValueAtTime(0.15, ctx.currentTime + i * 0.35)
      o.start(ctx.currentTime + i * 0.35)
      o.stop(ctx.currentTime + i * 0.35 + 0.18)
    }
  } catch {
    /* 没有音频权限时只弹提示 */
  }
  if ('Notification' in window && Notification.permission === 'granted') new Notification('计时结束', { body: name })
}

function useTimer(id: string) {
  const [, force] = useState(0)
  useEffect(() => {
    const f = () => force((x) => x + 1)
    subs.add(f)
    return () => {
      subs.delete(f)
    }
  }, [])
  const t = timers.get(id)
  const remain = t ? (t.endsAt ? Math.max(0, t.endsAt - Date.now()) : t.remain) : null
  return {
    running: !!t?.endsAt,
    remain,
    total: t?.total ?? 0,
    start(minutes: number, label: string) {
      labels.set(id, label)
      const cur = timers.get(id)
      const ms = cur && cur.remain > 0 && !cur.endsAt ? cur.remain : minutes * 60000
      timers.set(id, { endsAt: Date.now() + ms, remain: ms, total: cur?.total || minutes * 60000 })
      if ('Notification' in window && Notification.permission === 'default') void Notification.requestPermission()
      tick()
    },
    pause() {
      const cur = timers.get(id)
      if (cur?.endsAt) timers.set(id, { ...cur, endsAt: null, remain: Math.max(0, cur.endsAt - Date.now()) })
      tick()
    },
    reset() {
      timers.delete(id)
      tick()
    },
  }
}

const fmt = (ms: number) => {
  const s = Math.ceil(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = s % 60
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${m}:${String(ss).padStart(2, '0')}`
}

function StepTimer({ step, readOnly }: { step: Step; readOnly: boolean }) {
  const t = useTimer(step.id)
  if (!step.minutes || readOnly) return step.minutes ? <span className="text-xs text-slate-500 tabular-nums">{step.minutes} 分钟</span> : null
  const pct = t.remain !== null && t.total ? 1 - t.remain / t.total : 0
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => (t.running ? t.pause() : t.start(step.minutes!, step.title))}
        className={cn(
          'relative inline-flex h-7 cursor-pointer items-center gap-1.5 overflow-hidden rounded-full px-2.5 text-xs font-medium tabular-nums transition',
          t.running ? 'bg-brand-600 text-white' : t.remain === 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300',
        )}
        aria-label={t.running ? '暂停计时' : '开始计时'}
      >
        {t.running && <span className="absolute inset-y-0 left-0 bg-white/20" style={{ width: `${pct * 100}%` }} />}
        <span className="relative flex items-center gap-1.5">
          {t.running ? <Pause className="size-3" /> : t.remain === null ? <Timer className="size-3" /> : <Play className="size-3" />}
          {t.remain === null ? `${step.minutes} 分钟` : t.remain === 0 ? '已到时' : fmt(t.remain)}
        </span>
      </button>
      {t.remain !== null && (
        <button onClick={t.reset} aria-label="重置计时" className="flex size-7 cursor-pointer items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
          <RotateCcw className="size-3" />
        </button>
      )}
    </div>
  )
}

/** 清单式无框输入：列头承担提示，聚焦用轻背景提示位置 */
const bare = 'w-full min-w-0 rounded-md bg-transparent px-1.5 py-1 outline-none transition focus:bg-slate-100/80 hover:placeholder:text-slate-400 dark:focus:bg-slate-800/70'

function StepRow({ s, i, nextIdx, readOnly, update, onDelete }: { s: Step; i: number; nextIdx: number; readOnly: boolean; update: (id: string, patch: Partial<Step>) => void; onDelete: (s: Step) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: s.id, disabled: readOnly })
  return (
    <tr
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn('group/row border-b border-slate-50 last:border-0 dark:border-slate-800/60', i === nextIdx && !readOnly && 'bg-brand-50/40 dark:bg-brand-500/5', isDragging && 'bg-white shadow-pop dark:bg-slate-900', 'hover:bg-slate-50/70 dark:hover:bg-slate-800/30')}
    >
      <td className="py-1.5 pr-1 align-top">
        <label className="mt-1 flex cursor-pointer items-center">
          <input type="checkbox" checked={s.done} disabled={readOnly} onChange={(e) => update(s.id, { done: e.target.checked })} className="peer sr-only" aria-label={`第 ${i + 1} 步完成`} />
          <span
            className={cn(
              'flex size-6 items-center justify-center rounded-full border text-[11px] font-semibold tabular-nums transition peer-focus-visible:ring-3 peer-focus-visible:ring-brand-500/30',
              s.done ? 'border-emerald-500 bg-emerald-500 text-white' : i === nextIdx ? 'border-brand-500 text-brand-700 dark:text-brand-300' : 'border-slate-300 text-slate-500 dark:border-slate-600',
            )}
          >
            {s.done ? '✓' : i + 1}
          </span>
        </label>
      </td>
      <td className="py-1.5 pr-2 align-top">
        <input
          value={s.title}
          readOnly={readOnly}
          onChange={(e) => update(s.id, { title: e.target.value })}
          aria-label="步骤名称"
          className={cn(bare, 'min-w-28 text-sm font-medium text-slate-800 dark:text-slate-100', s.done && 'text-slate-500 line-through dark:text-slate-500')}
        />
      </td>
      <td className="w-full py-1.5 pr-2 align-top">
        <input
          value={s.params}
          readOnly={readOnly}
          onChange={(e) => update(s.id, { params: e.target.value })}
          aria-label="条件参数"
          className={cn(bare, 'text-[13px] text-slate-500 dark:text-slate-400')}
        />
        {(s.note || (!readOnly && s.done)) && (
          <input
            value={s.note}
            readOnly={readOnly}
            onChange={(e) => update(s.id, { note: e.target.value })}
            placeholder="偏差"
            aria-label="实际情况"
            className={cn(bare, 'text-xs text-amber-700 dark:text-amber-300')}
          />
        )}
      </td>
      <td className="whitespace-nowrap py-1.5 pr-1 align-top">
        <div className="mt-0.5 flex items-center gap-1.5">
          {!readOnly && (
            <label className="flex items-center gap-0.5 text-[11px] text-slate-400">
              <input
                type="number"
                min={0}
                inputMode="numeric"
                value={s.minutes ?? ''}
                onChange={(e) => update(s.id, { minutes: e.target.value ? Number(e.target.value) : null })}
                aria-label="计时分钟数"
                className={cn(bare, 'w-12 px-1 text-center text-xs tabular-nums')}
              />
              分
            </label>
          )}
          <StepTimer step={s} readOnly={readOnly} />
        </div>
      </td>
      {!readOnly && (
        <td className="w-16 py-1.5 align-top">
          <div className="mt-0.5 flex items-center justify-end gap-0.5 opacity-100 transition lg:opacity-0 lg:group-hover/row:opacity-100 lg:focus-within:opacity-100">
            <button
              {...attributes}
              {...listeners}
              aria-label="拖动排序"
              className="flex size-7 cursor-grab touch-none items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 active:cursor-grabbing dark:hover:bg-slate-800"
            >
              <GripVertical className="size-3.5" />
            </button>
            <RowDelete onClick={() => onDelete(s)} label="删除这一步" />
          </div>
        </td>
      )}
    </tr>
  )
}

export function ProtocolBlock({ data, onChange, readOnly }: BlockEditorProps<ProtocolData>) {
  const set = (steps: Step[]) => onChange({ ...data, steps })
  const update = (id: string, patch: Partial<Step>) => set(data.steps.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  const done = data.steps.filter((s) => s.done).length
  const total = data.steps.length
  const nextIdx = data.steps.findIndex((s) => !s.done)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
  )
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return
    const ids = data.steps.map((s) => s.id)
    const from = ids.indexOf(String(e.active.id))
    const to = ids.indexOf(String(e.over.id))
    if (from < 0 || to < 0) return
    pushUndo('移动步骤', () => set(structuredClone(data.steps)))
    const next = arrayMove(ids, from, to)
    set(next.map((id) => data.steps.find((s) => s.id === id)!))
  }

  const deleteStep = (s: Step) => {
    pushUndo('删除步骤', () => set(structuredClone(data.steps)))
    set(data.steps.filter((x) => x.id !== s.id))
  }

  return (
    <div>
      <BlockTitle value={data.title} onChange={(title) => onChange({ ...data, title })} placeholder="流程名称" readOnly={readOnly} />
      <Panel>
        <div className="flex items-center gap-3 border-b border-slate-100 px-3 py-2 dark:border-slate-800">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: total ? `${(done / total) * 100}%` : 0 }} />
          </div>
          <span className="text-xs text-slate-500 tabular-nums">
            {done} / {total} 步
          </span>
          {!readOnly && done > 0 && (
            <button className="cursor-pointer text-xs text-slate-500 hover:text-slate-700" onClick={() => set(data.steps.map((s) => ({ ...s, done: false })))}>
              全部取消勾选
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[540px] border-collapse">
            <thead>
              <tr className="text-[11px] font-medium text-slate-400 dark:text-slate-500">
                <th className="w-8" aria-label="完成状态" />
                <th className="px-2 pb-1.5 pt-2 text-left font-medium">步骤</th>
                <th className="px-2 pb-1.5 pt-2 text-left font-medium">条件参数</th>
                <th className="px-2 pb-1.5 pt-2 text-left font-medium">计时</th>
                {!readOnly && <th className="w-16" />}
              </tr>
            </thead>
            <tbody>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                <SortableContext items={data.steps.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                  {data.steps.map((s, i) => (
                    <StepRow key={s.id} s={s} i={i} nextIdx={nextIdx} readOnly={readOnly} update={update} onDelete={deleteStep} />
                  ))}
                </SortableContext>
              </DndContext>
            </tbody>
          </table>
        </div>
        {!readOnly && <AddRow onClick={() => set([...data.steps, newStep()])}>添加步骤</AddRow>}
      </Panel>
    </div>
  )
}
