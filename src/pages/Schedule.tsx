import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { Check, ChevronLeft, ChevronRight, Copy, FlaskConical, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { db } from '@/lib/db'
import { deleteSchedule, updateSchedule } from '@/lib/repo'
import { schedDone, toggleScheduleDone } from '@/lib/scheduleDone'
import { pushUndo, undoById } from '@/lib/undo'
import { useExperiments } from '@/lib/hooks'
import { cn, todayStr } from '@/lib/util'
import { ui } from '@/lib/ui-store'
import { PageHeader } from '@/components/Shell'
import { Button } from '@/components/ui'
import { ScheduleDialog } from '@/components/ScheduleDialog'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '@/components/context-menu'
import type { Schedule } from '@/lib/types'

const WEEK = ['一', '二', '三', '四', '五', '六', '日']
const pad = (n: number) => String(n).padStart(2, '0')
const ds = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`

export function SchedulePage() {
  const [sp, setSp] = useSearchParams()
  const today = todayStr()
  const selected = sp.get('date') || today
  const [cursor, setCursor] = useState(() => {
    const [y, m] = selected.split('-').map(Number)
    return { y, m: m - 1 }
  })
  const exps = useExperiments()
  const expMap = useMemo(() => new Map((exps ?? []).map((e) => [e.id, e])), [exps])

  const first = new Date(cursor.y, cursor.m, 1)
  const offset = (first.getDay() + 6) % 7
  const days = new Date(cursor.y, cursor.m + 1, 0).getDate()
  const cells = Array.from({ length: Math.ceil((offset + days) / 7) * 7 }, (_, i) => {
    const d = new Date(cursor.y, cursor.m, i - offset + 1)
    return { date: ds(d.getFullYear(), d.getMonth(), d.getDate()), day: d.getDate(), inMonth: d.getMonth() === cursor.m }
  })

  const items = useLiveQuery(() => db.schedules.where('date').between(cells[0].date, cells[cells.length - 1].date, true, true).toArray(), [cells[0].date], [])
  const byDate = useMemo(() => {
    const m = new Map<string, Schedule[]>()
    for (const s of items) if (!s.deletedAt) m.set(s.date, [...(m.get(s.date) ?? []), s])
    for (const v of m.values()) v.sort((a, b) => (a.time || '99').localeCompare(b.time || '99'))
    return m
  }, [items])
  const dayItems = byDate.get(selected) ?? []

  const move = (n: number) => setCursor((c) => {
    const d = new Date(c.y, c.m + n, 1)
    return { y: d.getFullYear(), m: d.getMonth() }
  })
  const pick = (date: string) => setSp({ date }, { replace: true })

  const [addOpen, setAddOpen] = useState(false)

  const [sy, sm, sd] = selected.split('-').map(Number)

  return (
    <div>
      <PageHeader title="日程" />
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 md:px-8 lg:grid-cols-[1fr_360px]">
        <section>
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-lg font-semibold tracking-tight">
              {cursor.y} 年 {cursor.m + 1} 月
            </h2>
            <div className="ml-auto flex items-center gap-1">
              <Button size="icon-sm" variant="ghost" aria-label="上个月" onClick={() => move(-1)}>
                <ChevronLeft />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  const d = new Date()
                  setCursor({ y: d.getFullYear(), m: d.getMonth() })
                  pick(today)
                }}
              >
                今天
              </Button>
              <Button size="icon-sm" variant="ghost" aria-label="下个月" onClick={() => move(1)}>
                <ChevronRight />
              </Button>
            </div>
          </div>
          <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800">
            <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-center text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900">
              {WEEK.map((w) => (
                <div key={w} className="py-2">
                  {w}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {cells.map((c, i) => {
                const list = byDate.get(c.date) ?? []
                const isSel = c.date === selected
                return (
                  <button
                    key={c.date}
                    onClick={() => pick(c.date)}
                    onDoubleClick={() => ui.openNewExperiment({ date: c.date })}
                    className={cn(
                      'group flex min-h-16 cursor-pointer flex-col items-stretch gap-0.5 border-slate-100 p-1.5 text-left transition sm:min-h-24 dark:border-slate-800',
                      i % 7 !== 6 && 'border-r',
                      i < cells.length - 7 && 'border-b',
                      !c.inMonth && 'bg-slate-50/60 text-slate-400 dark:bg-slate-900/40 dark:text-slate-600',
                      isSel ? 'bg-brand-50/70 dark:bg-brand-500/10' : 'hover:bg-slate-50 dark:hover:bg-slate-900',
                    )}
                  >
                    <span
                      className={cn(
                        'flex size-6 items-center justify-center rounded-full text-xs font-medium tabular-nums',
                        c.date === today ? 'bg-brand-600 text-white' : isSel ? 'text-brand-700 dark:text-brand-300' : '',
                      )}
                    >
                      {c.day}
                    </span>
                    <span className="hidden space-y-0.5 sm:block">
                      {list.slice(0, 3).map((s) => (
                        <span
                          key={s.id}
                          className={cn(
                            'block truncate rounded px-1 py-px text-[11px]',
                            schedDone(s, s.experimentId ? expMap.get(s.experimentId) : undefined)
                              ? 'text-slate-500 line-through'
                              : s.experimentId
                                ? 'bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300'
                                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
                          )}
                        >
                          {s.title}
                        </span>
                      ))}
                      {list.length > 3 && <span className="block px-1 text-[10px] text-slate-500">还有 {list.length - 3} 项</span>}
                    </span>
                    {list.length > 0 && (
                      <span className="flex gap-0.5 sm:hidden">
                        {list.slice(0, 4).map((s) => (
                          <span
                            key={s.id}
                            className={cn(
                              'size-1.5 rounded-full',
                              schedDone(s, s.experimentId ? expMap.get(s.experimentId) : undefined) ? 'bg-slate-300' : 'bg-brand-500',
                            )}
                          />
                        ))}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-500">双击日期可直接新建当天的实验</p>
        </section>

        <aside className="rounded-2xl border border-slate-200 bg-white p-4 lg:self-start dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">
              {sm} 月 {sd} 日{selected === today && <span className="ml-1.5 text-xs font-normal text-brand-600">今天</span>}
            </h3>
            <Button size="sm" variant="ghost" onClick={() => ui.openNewExperiment({ date: selected })}>
              <FlaskConical /> 新建实验
            </Button>
          </div>
          {dayItems.length === 0 && <p className="py-4 text-center text-[13px] text-slate-500">这天还没有安排</p>}
          <ul className="space-y-1">
            {dayItems.map((s) => {
              const e = s.experimentId ? expMap.get(s.experimentId) : undefined
              const isDone = schedDone(s, e)
              return (
                <ContextMenu key={s.id}>
                  <ContextMenuTrigger asChild>
                    <li className="group flex items-start gap-2.5 rounded-lg px-1.5 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <button
                    onClick={() => toggleScheduleDone(s, e)}
                    aria-label={isDone ? '标为未完成' : '标为完成'}
                    className={cn('mt-0.5 flex size-4.5 shrink-0 cursor-pointer items-center justify-center rounded-full border', isDone ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300 dark:border-slate-600')}
                  >
                    {isDone && <Check className="size-3" strokeWidth={3} />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <input
                      defaultValue={s.title}
                      onBlur={(ev) => ev.target.value.trim() && ev.target.value !== s.title && updateSchedule(s.id, { title: ev.target.value.trim() })}
                      className={cn(
                        'w-full rounded-md border border-slate-200 bg-transparent px-1.5 py-0.5 text-[13px] outline-none hover:border-slate-300 focus:border-brand-500 dark:border-slate-700 dark:hover:border-slate-600',
                        isDone && 'text-slate-500 line-through',
                      )}
                      aria-label="日程内容"
                    />
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      {s.time && <span className="tabular-nums">{s.time}</span>}
                      {e && (
                        <Link to={`/experiments/${e.id}`} className="truncate text-brand-700 hover:underline dark:text-brand-300">
                          {e.title}
                        </Link>
                      )}
                    </div>
                  </div>
                  <button
                    aria-label="删除日程"
                    onClick={async () => {
                      await deleteSchedule(s.id)
                      const uid = pushUndo('删除日程', () => void updateSchedule(s.id, { deletedAt: null }))
                      toast('已删除日程', { action: { label: '撤销', onClick: () => undoById(uid) } })
                    }}
                    className="cursor-pointer rounded p-1 text-slate-400 opacity-0 group-hover:opacity-100 hover:text-rose-500 focus:opacity-100"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                    </li>
                  </ContextMenuTrigger>
                  <ContextMenuContent>
                    <ContextMenuItem icon={<Check />} onSelect={() => toggleScheduleDone(s, e)}>
                      {isDone ? '标为未完成' : '标为完成'}
                    </ContextMenuItem>
                    <ContextMenuItem
                      icon={<Copy />}
                      onSelect={() => {
                        void navigator.clipboard.writeText(s.title)
                        toast.success('已复制')
                      }}
                    >
                      复制内容
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem
                      icon={<Trash2 />}
                      danger
                      onSelect={() => {
                        void (async () => {
                          await deleteSchedule(s.id)
                          const uid = pushUndo('删除日程', () => void updateSchedule(s.id, { deletedAt: null }))
                          toast('已删除日程', { action: { label: '撤销', onClick: () => undoById(uid) } })
                        })()
                      }}
                    >
                      删除
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              )
            })}
          </ul>
          <Button className="mt-3 w-full justify-start" onClick={() => setAddOpen(true)}>
            <Plus /> 添加安排
          </Button>
          {sy && null}
        </aside>
      </div>

      <ScheduleDialog open={addOpen} onOpenChange={setAddOpen} defaultDate={selected} />
    </div>
  )
}
