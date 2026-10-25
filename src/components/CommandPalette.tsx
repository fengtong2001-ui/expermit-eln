import { Command } from 'cmdk'
import * as RDialog from '@radix-ui/react-dialog'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { CalendarDays, FileText, FlaskConical, LayoutTemplate, Moon, Plus, Search, Settings, Sun, TestTubes, Trash2 } from 'lucide-react'
import { ui, useUI } from '@/lib/ui-store'
import { search, type Hit } from '@/lib/search'
import { useExperiments } from '@/lib/hooks'
import { setTheme } from '@/lib/theme'
import { STATUS_META } from '@/lib/kinds'

const itemCls =
  'flex min-h-10 cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-[13px] text-slate-700 data-[selected=true]:bg-slate-100 dark:text-slate-200 dark:data-[selected=true]:bg-slate-800 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-slate-400'
const groupCls = '[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-slate-400'

function Highlight({ text, q }: { text: string; q: string }) {
  const t = q.trim().split(/\s+/)[0]
  if (!t) return <>{text}</>
  const i = text.toLowerCase().indexOf(t.toLowerCase())
  if (i < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded bg-amber-100 px-0.5 text-inherit dark:bg-amber-500/30">{text.slice(i, i + t.length)}</mark>
      {text.slice(i + t.length)}
    </>
  )
}

export function CommandPalette() {
  const { palette } = useUI()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<Hit[]>([])
  const exps = useExperiments()

  useEffect(() => {
    if (!palette) setQ('')
  }, [palette])

  useEffect(() => {
    if (!q.trim()) {
      setHits([])
      return
    }
    const t = setTimeout(() => void search(q).then(setHits), 120)
    return () => clearTimeout(t)
  }, [q])

  const go = (path: string) => {
    ui.setPalette(false)
    navigate(path)
  }
  const run = (fn: () => void) => {
    ui.setPalette(false)
    fn()
  }

  const recent = (exps ?? []).filter((e) => e.status !== 'archived').slice(0, 6)
  const expHits = hits.filter((h) => h.kind === 'experiment')
  const blockHits = hits.filter((h) => h.kind === 'block')
  const reagentHits = hits.filter((h) => h.kind === 'reagent')

  return (
    <RDialog.Root open={palette} onOpenChange={ui.setPalette}>
      <RDialog.Portal>
        <RDialog.Overlay className="fixed inset-0 z-40 animate-in bg-slate-900/30 backdrop-blur-[2px] dark:bg-black/50" />
        <RDialog.Content className="fixed top-[12vh] left-1/2 z-50 w-[calc(100vw-24px)] max-w-xl -translate-x-1/2 animate-pop overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-pop dark:border-slate-700 dark:bg-slate-900">
          <RDialog.Title className="sr-only">搜索与命令</RDialog.Title>
          <RDialog.Description className="sr-only">搜索实验、内容与试剂，或执行命令</RDialog.Description>
          <Command shouldFilter={!q.trim()} loop>
            <div className="flex items-center gap-3 border-b border-slate-100 px-4 dark:border-slate-800">
              <Search className="size-4 text-slate-500" />
              <Command.Input
                value={q}
                onValueChange={setQ}
                placeholder="搜索"
                className="h-13 flex-1 bg-transparent text-[15px] text-slate-900 outline-none placeholder:text-slate-400 dark:text-white"
              />
            </div>
            <Command.List className="max-h-[60vh] overflow-y-auto p-2">
              <Command.Empty className="py-10 text-center text-sm text-slate-500">没有找到「{q}」</Command.Empty>

              {!q.trim() && (
                <>
                  <Command.Group heading="操作" className={groupCls}>
                    <Command.Item className={itemCls} onSelect={() => run(() => ui.openNewExperiment())} value="新建实验 new">
                      <Plus /> 新建实验
                    </Command.Item>
                    <Command.Item className={itemCls} onSelect={() => go('/reagents?new=1')} value="添加试剂 reagent">
                      <TestTubes /> 添加试剂
                    </Command.Item>
                    <Command.Item className={itemCls} onSelect={() => run(() => setTheme('dark'))} value="深色模式 dark">
                      <Moon /> 切换到深色模式
                    </Command.Item>
                    <Command.Item className={itemCls} onSelect={() => run(() => setTheme('light'))} value="浅色模式 light">
                      <Sun /> 切换到浅色模式
                    </Command.Item>
                  </Command.Group>
                  {recent.length > 0 && (
                    <Command.Group heading="最近的实验" className={groupCls}>
                      {recent.map((e) => (
                        <Command.Item key={e.id} className={itemCls} value={`${e.title} ${e.code} ${e.id}`} onSelect={() => go(`/experiments/${e.id}`)}>
                          <FlaskConical />
                          <span className="flex-1 truncate">{e.title}</span>
                          <span className="text-xs text-slate-500">{STATUS_META[e.status].label}</span>
                        </Command.Item>
                      ))}
                    </Command.Group>
                  )}
                  <Command.Group heading="前往" className={groupCls}>
                    {[
                      { p: '/', l: '今天', i: <Sun /> },
                      { p: '/schedule', l: '日程', i: <CalendarDays /> },
                      { p: '/experiments', l: '全部实验', i: <FlaskConical /> },
                      { p: '/reagents', l: '试剂库', i: <TestTubes /> },
                      { p: '/templates', l: '模板', i: <LayoutTemplate /> },
                      { p: '/trash', l: '回收站', i: <Trash2 /> },
                      { p: '/settings', l: '设置与备份', i: <Settings /> },
                    ].map((x) => (
                      <Command.Item key={x.p} className={itemCls} value={`前往 ${x.l}`} onSelect={() => go(x.p)}>
                        {x.i} {x.l}
                      </Command.Item>
                    ))}
                  </Command.Group>
                </>
              )}

              {expHits.length > 0 && (
                <Command.Group heading="实验" className={groupCls}>
                  {expHits.map((h) => (
                    <Command.Item key={h.id} value={`e-${h.id}`} className={itemCls} onSelect={() => go(`/experiments/${h.id}`)}>
                      <FlaskConical />
                      <div className="min-w-0 flex-1">
                        <div className="truncate">
                          <Highlight text={h.title} q={q} />
                        </div>
                        {h.snippet && <div className="truncate text-xs text-slate-500">{h.snippet}</div>}
                      </div>
                      <span className="text-xs text-slate-500">{h.context}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
              {blockHits.length > 0 && (
                <Command.Group heading="记录内容" className={groupCls}>
                  {blockHits.map((h) => (
                    <Command.Item key={h.id} value={`b-${h.id}`} className={itemCls} onSelect={() => go(`/experiments/${h.experimentId}?block=${h.id}`)}>
                      <FileText />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-slate-500 dark:text-slate-400">
                          <Highlight text={h.snippet} q={q} />
                        </div>
                        <div className="truncate text-xs text-slate-500">
                          {h.title} · {h.context}
                        </div>
                      </div>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
              {reagentHits.length > 0 && (
                <Command.Group heading="试剂" className={groupCls}>
                  {reagentHits.map((h) => (
                    <Command.Item key={h.id} value={`r-${h.id}`} className={itemCls} onSelect={() => go(`/reagents?id=${h.id}`)}>
                      <TestTubes />
                      <div className="min-w-0 flex-1">
                        <div className="truncate">
                          <Highlight text={h.title} q={q} />
                        </div>
                        {h.snippet && <div className="truncate text-xs text-slate-500">{h.snippet}</div>}
                      </div>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
            </Command.List>
            <div className="flex items-center gap-4 border-t border-slate-100 px-4 py-2 text-[11px] text-slate-500 dark:border-slate-800">
              <span>
                <kbd className="kbd">↑</kbd> <kbd className="kbd">↓</kbd> 选择
              </span>
              <span>
                <kbd className="kbd">↵</kbd> 打开
              </span>
              <span>
                <kbd className="kbd">Esc</kbd> 关闭
              </span>
            </div>
          </Command>
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  )
}
