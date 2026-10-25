import { Link, useNavigate } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowRight, CalendarPlus, Check, FlaskConical, Plus, TestTubes, TriangleAlert } from 'lucide-react'
import { db } from '@/lib/db'
import { reagentAlerts, useExperiments, useProjects, useReagents } from '@/lib/hooks'
import { todayStr, cn } from '@/lib/util'
import { ui } from '@/lib/ui-store'
import { addSchedule } from '@/lib/repo'
import { schedDone, toggleScheduleDone } from '@/lib/scheduleDone'
import { PageHeader } from '@/components/Shell'
import { ExperimentCard } from '@/components/ExperimentCard'
import { Button, EmptyState } from '@/components/ui'
import { useState } from 'react'

function greeting() {
  const h = new Date().getHours()
  if (h < 6) return '夜深了'
  if (h < 11) return '早上好'
  if (h < 14) return '中午好'
  if (h < 18) return '下午好'
  return '晚上好'
}

const WEEK = ['日', '一', '二', '三', '四', '五', '六']

export function TodayPage() {
  const navigate = useNavigate()
  const today = todayStr()
  const exps = useExperiments()
  const projects = useProjects()
  const reagents = useReagents()
  const schedules = useLiveQuery(async () => (await db.schedules.where('date').equals(today).toArray()).filter((x) => !x.deletedAt).sort((a, b) => (a.time || '99').localeCompare(b.time || '99')), [today], [])
  const upcoming = useLiveQuery(
    async () => (await db.schedules.where('date').between(today, '9999', false, true).toArray()).filter((s) => !s.done && !s.deletedAt).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5),
    [today],
    [],
  )
  const [quick, setQuick] = useState('')

  const active = (exps ?? []).filter((e) => e.status === 'running' || e.status === 'planned').slice(0, 6)
  const alerts = (reagents ?? []).map((r) => ({ r, a: reagentAlerts(r) })).filter((x) => x.a.length)
  const d = new Date()
  const expTitle = new Map((exps ?? []).map((e) => [e.id, e]))

  return (
    <div>
      <PageHeader title="今天" />
      <div className="mx-auto max-w-6xl px-4 py-8 md:px-8">
        <div className="mb-8">
          <p className="text-sm text-slate-500">
            {d.getMonth() + 1} 月 {d.getDate()} 日 · 星期{WEEK[d.getDay()]}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">{greeting()}</h1>
        </div>

        <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">进行中的实验</h2>
              <Link to="/experiments" className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white">
                全部实验 <ArrowRight className="size-3.5" />
              </Link>
            </div>
            {exps === undefined ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {[0, 1].map((i) => (
                  <div key={i} className="h-36 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-900" />
                ))}
              </div>
            ) : active.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
                <EmptyState
                  icon={<FlaskConical />}
                  title={exps.length ? '没有进行中的实验' : '开始你的第一个实验记录'}
                  hint="选一个模板（WB、qPCR、细胞培养、孔板检测）或从空白开始。所有内容保存在这台设备上，离线也能用。"
                  action={
                    <Button variant="primary" onClick={() => ui.openNewExperiment()}>
                      <Plus /> 新建实验
                    </Button>
                  }
                />
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {active.map((e) => (
                  <ExperimentCard key={e.id} e={e} project={projects.find((p) => p.id === e.projectId)} />
                ))}
                <button
                  onClick={() => ui.openNewExperiment()}
                  className="flex min-h-36 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-200 text-[13px] text-slate-500 transition hover:border-brand-300 hover:bg-brand-50/40 hover:text-brand-700 dark:border-slate-800 dark:hover:bg-brand-500/5"
                >
                  <Plus className="size-5" /> 新建实验
                </button>
              </div>
            )}
          </section>

          <aside className="space-y-6">
            <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">今日安排</h2>
                <Link to="/schedule" className="text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white">
                  日程
                </Link>
              </div>
              <ul className="space-y-1">
            {schedules.map((s) => {
              const e = s.experimentId ? expTitle.get(s.experimentId) : undefined
              const isDone = schedDone(s, e)
              return (
                <li key={s.id} className="flex items-start gap-2.5 rounded-lg px-1 py-1.5">
                      <button
                        onClick={() => toggleScheduleDone(s, e)}
                        aria-label={isDone ? '标为未完成' : '标为完成'}
                        className={cn(
                          'mt-0.5 flex size-4.5 shrink-0 cursor-pointer items-center justify-center rounded-full border transition',
                          isDone ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300 hover:border-brand-500 dark:border-slate-600',
                        )}
                      >
                        {isDone && <Check className="size-3" strokeWidth={3} />}
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className={cn('text-[13px]', isDone ? 'text-slate-500 line-through' : 'text-slate-700 dark:text-slate-200')}>
                          {s.time && <span className="mr-1.5 text-slate-500 tabular-nums">{s.time}</span>}
                          {s.title}
                        </p>
                        {e && (
                          <Link to={`/experiments/${e.id}`} className="text-xs text-brand-700 hover:underline dark:text-brand-300">
                            → {e.title}
                          </Link>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
              <form
                className="mt-1 flex items-center gap-2"
                onSubmit={async (e) => {
                  e.preventDefault()
                  if (!quick.trim()) return
                  const m = /^(\d{1,2}[:：]\d{2})\s*(.+)$/.exec(quick.trim())
                  await addSchedule({ date: today, time: m ? m[1].replace('：', ':').padStart(5, '0') : '', title: m ? m[2] : quick.trim(), note: '', done: false, experimentId: null })
                  setQuick('')
                }}
              >
                <CalendarPlus className="size-4 shrink-0 text-slate-400" />
                <input
                  value={quick}
                  onChange={(e) => setQuick(e.target.value)}
                  placeholder="安排"
                  className="h-8 flex-1 rounded-md border border-slate-200 px-2 text-[13px] outline-none placeholder:text-slate-400 hover:border-slate-300 focus:border-brand-500 dark:border-slate-700 dark:hover:border-slate-600"
                />
              </form>
              {upcoming.filter((u) => u.date !== today).length > 0 && (
                <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-800">
                  <p className="mb-1.5 text-[11px] font-medium text-slate-500">接下来</p>
                  {upcoming
                    .filter((u) => u.date !== today)
                    .map((u) => (
                      <button key={u.id} onClick={() => navigate(`/schedule?date=${u.date}`)} className="flex w-full cursor-pointer gap-2 py-1 text-left text-xs text-slate-600 hover:text-slate-900 dark:text-slate-400">
                        <span className="w-12 shrink-0 text-slate-500 tabular-nums">{u.date.slice(5).replace('-', '/')}</span>
                        <span className="truncate">{u.title}</span>
                      </button>
                    ))}
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">试剂提醒</h2>
                <Link to="/reagents" className="text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white">
                  试剂库
                </Link>
              </div>
              {alerts.length === 0 ? (
                <p className="flex items-center gap-2 py-1 text-[13px] text-slate-500">
                  <TestTubes className="size-4 text-emerald-500" /> 没有过期或库存不足的试剂
                </p>
              ) : (
                <ul className="space-y-1">
                  {alerts.slice(0, 6).map(({ r, a }) => (
                    <li key={r.id}>
                      <Link to={`/reagents?id=${r.id}`} className="flex items-center gap-2 rounded-lg px-1 py-1.5 text-[13px] hover:bg-slate-50 dark:hover:bg-slate-800">
                        <TriangleAlert className={cn('size-4 shrink-0', a.some((x) => x.kind === 'expired' || x.kind === 'out') ? 'text-rose-500' : 'text-amber-500')} />
                        <span className="min-w-0 flex-1 truncate text-slate-700 dark:text-slate-200">{r.name}</span>
                        <span className="shrink-0 text-xs text-slate-500">{a.map((x) => x.text).join(' · ')}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </aside>
        </div>
      </div>
    </div>
  )
}
