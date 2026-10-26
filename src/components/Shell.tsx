import { NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import {
  CalendarDays,
  CloudCheck,
  CloudAlert,
  CheckCircle2,
  CloudOff,
  FlaskConical,
  FolderClosed,
  LayoutTemplate,
  Loader2,
  Pencil,
  Plus,
  Search,
  Settings,
  Sun,
  TestTubes,
  Trash2,
  TriangleAlert,
} from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db'
import { useProjects, isTypingTarget, reagentAlerts } from '@/lib/hooks'
import { cn, formatTime, modKey, relativeTime } from '@/lib/util'
import { ui } from '@/lib/ui-store'
import { useSaveState, saveState } from '@/lib/saveState'
import { KIND_STYLES } from '@/lib/kinds'
import { CommandPalette } from './CommandPalette'
import { NewExperimentDialog } from './NewExperimentDialog'
import { UndoBar } from './UndoBar'
import { Button, Kbd, Tip } from './ui'
import { createProject, deleteProject, updateProject } from '@/lib/repo'
import { syncNow, useSyncStatus } from '@/lib/sync/engine'
import { popUndo, pushUndo } from '@/lib/undo'
import { promptDialog } from './prompt'
import { toast } from 'sonner'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from './context-menu'

/** 手动同步：侧栏按钮与原生菜单「立即同步」共用 */
function runManualSync() {
  void syncNow('manual')
    .then((r) => {
      const parts = [r.pulled ? `接收 ${r.pulled} 项` : '', r.uploadedFiles ? `上传 ${r.uploadedFiles} 个附件` : '', r.downloadedFiles ? `下载 ${r.downloadedFiles} 个附件` : ''].filter(Boolean)
      toast.success(parts.length ? `同步完成：${parts.join('，')}` : '同步完成，两边内容一致')
    })
    .catch(() => {})
}

function NavItem({ to, icon, children, end, badge }: { to: string; icon: ReactNode; children: ReactNode; end?: boolean; badge?: ReactNode }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'group flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-[13px] font-medium transition [&_svg]:size-4',
          isActive
            ? 'bg-white text-slate-900 shadow-xs ring-1 ring-slate-200/70 dark:bg-slate-800 dark:text-white dark:ring-slate-700'
            : 'text-slate-600 hover:bg-slate-200/50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-100',
        )
      }
    >
      <span className="text-slate-500 group-aria-[current=page]:text-brand-600 dark:group-aria-[current=page]:text-brand-400">{icon}</span>
      <span className="flex-1 truncate">{children}</span>
      {badge}
    </NavLink>
  )
}

export function SaveIndicator() {
  const s = useSaveState()
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  let content: ReactNode
  if (s.error)
    content = (
      <button className="flex cursor-pointer items-center gap-1.5 text-rose-600" onClick={() => void saveState.flushAll()}>
        <TriangleAlert className="size-3.5" /> 保存失败 · 重试
      </button>
    )
  else if (s.pending > 0)
    content = (
      <span className="flex items-center gap-1.5 text-slate-500">
        <Loader2 className="size-3.5 animate-spin" /> 保存中
      </span>
    )
  else
    content = (
      <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
        <CheckCircle2 className="size-3.5 text-emerald-500" />
        {s.lastSaved ? `已保存 ${formatTime(s.lastSaved)}` : '已保存到本机'}
      </span>
    )
  return (
    <div className="flex items-center gap-3 text-xs" aria-live="polite">
      {!online && (
        <Tip label="离线也能照常记录：数据保存在这台设备上">
          <span className="flex items-center gap-1 text-amber-600">
            <CloudOff className="size-3.5" /> 离线
          </span>
        </Tip>
      )}
      {content}
    </div>
  )
}

export function Shell() {
  const projects = useProjects()
  const syncStatus = useSyncStatus()
  const navigate = useNavigate()
  const loc = useLocation()
  const counts = useLiveQuery(async () => {
    const exps = (await db.experiments.toArray()).filter((e) => !e.deletedAt)
    const byProject: Record<string, number> = {}
    for (const e of exps) if (e.status !== 'archived' && e.projectId) byProject[e.projectId] = (byProject[e.projectId] ?? 0) + 1
    const reagents = (await db.reagents.toArray()).filter((r) => !r.deletedAt)
    const alerts = reagents.filter((r) => reagentAlerts(r).length).length
    return { byProject, alerts, running: exps.filter((e) => e.status === 'running').length }
  }, [])

  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      // 中文/日文输入法组词选词时不响应任何快捷键
      if (e.isComposing || e.keyCode === 229) return

      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        ui.openPalette()
      } else if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void saveState.flushAll().then(() => toast.success('已保存'))
      } else if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey && !isTypingTarget(e.target)) {
        // 非输入焦点时 Ctrl+Z 撤回最近的结构性操作（删块/删行/删除/归档…）；输入框内仍是原生文字撤销
        e.preventDefault()
        popUndo()
      } else if (!mod && !e.altKey && e.key === 'n' && !isTypingTarget(e.target) && !document.querySelector('[role="dialog"]')) {
        e.preventDefault()
        ui.openNewExperiment()
      }
    }
    // 原生菜单栏事件桥接（见 native/mac/main.swift）
    const onNativeNewExperiment = () => ui.openNewExperiment()
    const onNativeSync = () => runManualSync()

    window.addEventListener('keydown', fn)
    window.addEventListener('expermit:new-experiment', onNativeNewExperiment)
    window.addEventListener('expermit:sync-now', onNativeSync)
    return () => {
      window.removeEventListener('keydown', fn)
      window.removeEventListener('expermit:new-experiment', onNativeNewExperiment)
      window.removeEventListener('expermit:sync-now', onNativeSync)
    }
  }, [])

  const addProject = async () => {
    const r = await promptDialog({ title: '新建项目', label: '项目名称', confirmText: '创建' })
    if (!r) return
    const p = await createProject(r.value)
    navigate(`/experiments?project=${p.id}`)
  }

  const renameProject = async (id: string, name: string) => {
    const r = await promptDialog({ title: '重命名项目', label: '项目名称', initial: name, confirmText: '保存' })
    if (!r || r.value === name) return
    await updateProject(id, { name: r.value })
  }
  const removeProject = async (id: string) => {
    await deleteProject(id)
    pushUndo('删除项目', () => void updateProject(id, { deletedAt: null }))
    toast('项目已删除，项目里的实验已移到「未归类」')
  }

  const params = new URLSearchParams(loc.search)
  const activeProject = loc.pathname === '/experiments' ? params.get('project') : null

  return (
    <div className="flex h-dvh overflow-hidden">
      {/* —— 侧栏（≥ md） —— */}
      <aside className="no-print hidden w-60 shrink-0 flex-col border-r border-slate-200/80 bg-slate-50 md:flex dark:border-slate-800 dark:bg-slate-900/60">
        {/* 顶部拖拽区：原生壳里按住这一行可拖动窗口 */}
        <div data-mac-drag-region="true" className="flex min-h-14 items-center gap-2.5 px-4 select-none">
          <img src="favicon.svg" alt="" className="size-7" draggable={false} />
          <div className="leading-tight">
            <div className="text-sm font-semibold text-slate-900 dark:text-white">ExPermit</div>
            <div className="text-[11px] text-slate-500">实验记录本</div>
          </div>
        </div>

        <div className="space-y-2 px-3">
          <Button variant="primary" className="w-full justify-start" onClick={() => ui.openNewExperiment()}>
            <Plus /> 新建实验
            <span className="ml-auto text-xs font-normal text-white/70">N</span>
          </Button>
          <button
            onClick={() => ui.openPalette()}
            className="flex h-9 w-full cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 text-[13px] text-slate-500 transition hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900"
          >
            <Search className="size-4" />
            <span className="flex-1 text-left">搜索或跳转</span>
            <Kbd>{modKey}</Kbd>
            <Kbd>K</Kbd>
          </button>
        </div>

        <nav className="mt-4 flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
          <NavItem to="/" end icon={<Sun />}>
            今天
          </NavItem>
          <NavItem to="/schedule" icon={<CalendarDays />}>
            日程
          </NavItem>
          <NavItem
            to="/experiments"
            end
            icon={<FlaskConical />}
            badge={counts?.running ? <span className="text-xs text-slate-500">{counts.running}</span> : null}
          >
            全部实验
          </NavItem>
          <NavItem
            to="/reagents"
            icon={<TestTubes />}
            badge={counts?.alerts ? <span className="rounded-full bg-amber-100 px-1.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">{counts.alerts}</span> : null}
          >
            试剂库
          </NavItem>
          <NavItem to="/templates" icon={<LayoutTemplate />}>
            模板
          </NavItem>

          <div className="flex items-center justify-between pt-5 pb-1 pl-2.5">
            <span className="text-[11px] font-semibold tracking-wide text-slate-500">项目</span>
            <Tip label="新建项目">
              <Button variant="ghost" size="icon-sm" onClick={addProject} aria-label="新建项目">
                <Plus />
              </Button>
            </Tip>
          </div>
          {projects.length === 0 && <p className="px-2.5 py-1 text-xs text-slate-500">还没有项目</p>}
          {projects.map((p) => (
            <ContextMenu key={p.id}>
              <ContextMenuTrigger asChild>
                <NavLink
                  to={`/experiments?project=${p.id}`}
                  className={cn(
                    'flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-[13px] transition',
                    activeProject === p.id
                      ? 'bg-white font-medium text-slate-900 shadow-xs ring-1 ring-slate-200/70 dark:bg-slate-800 dark:text-white dark:ring-slate-700'
                      : 'text-slate-600 hover:bg-slate-200/50 dark:text-slate-400 dark:hover:bg-slate-800/60',
                  )}
                >
                  <span className={cn('size-2 rounded-full', KIND_STYLES[p.color]?.dot)} />
                  <span className="flex-1 truncate">{p.name}</span>
                  <span className="text-xs text-slate-500">{counts?.byProject[p.id] || ''}</span>
                </NavLink>
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuItem icon={<Pencil />} onSelect={() => void renameProject(p.id, p.name)}>
                  重命名项目
                </ContextMenuItem>
                <ContextMenuItem icon={<Trash2 />} danger onSelect={() => void removeProject(p.id)}>
                  删除项目
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          ))}
        </nav>

        <div className="space-y-0.5 border-t border-slate-200/80 p-3 dark:border-slate-800">
          {syncStatus.kind !== 'unconfigured' && (
            <button
              onClick={runManualSync}
              className="flex h-8 w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 text-left text-[13px] transition hover:bg-slate-200/50 dark:hover:bg-slate-800/60"
              title={syncStatus.kind === 'error' ? syncStatus.message : syncStatus.kind === 'idle' && syncStatus.lastSync ? `上次同步 ${new Date(syncStatus.lastSync).toLocaleString('zh-CN')}` : '点击立即同步'}
            >
              {syncStatus.kind === 'syncing' ? (
                <Loader2 className="size-4 shrink-0 animate-spin text-slate-400" />
              ) : syncStatus.kind === 'error' ? (
                <CloudAlert className="size-4 shrink-0 text-rose-500" />
              ) : (
                <CloudCheck className="size-4 shrink-0 text-emerald-500" />
              )}
              <span className={cn('flex-1 truncate', syncStatus.kind === 'error' ? 'text-rose-600' : 'text-slate-500')}>
                {syncStatus.kind === 'syncing' ? (syncStatus.note ?? '同步中…') : syncStatus.kind === 'error' ? '同步失败，点击重试' : syncStatus.kind === 'idle' && syncStatus.lastSync ? `已同步 ${relativeTime(syncStatus.lastSync)}` : '点击立即同步'}
              </span>
            </button>
          )}
          <NavItem to="/trash" icon={<Trash2 />}>
            回收站
          </NavItem>
          <NavItem to="/settings" icon={<Settings />}>
            设置与备份
          </NavItem>
        </div>
      </aside>

      {/* —— 主区 —— */}
      <main className="relative flex min-w-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto pb-24 md:pb-0" id="main-scroll">
          <Outlet />
        </div>
      </main>

      {/* —— 底部标签栏（< md） —— */}
      <nav className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg md:hidden dark:border-slate-800 dark:bg-slate-950/90">
        <div className="grid h-16 grid-cols-5">
          {[
            { to: '/', icon: <Sun />, label: '今天', end: true },
            { to: '/experiments', icon: <FolderClosed />, label: '实验' },
            { to: '', icon: null, label: '' },
            { to: '/reagents', icon: <TestTubes />, label: '试剂' },
            { to: '/schedule', icon: <CalendarDays />, label: '日程' },
          ].map((t, i) =>
            i === 2 ? (
              <div key="new" className="flex items-center justify-center">
                <button
                  onClick={() => ui.openNewExperiment()}
                  aria-label="新建实验"
                  className="flex size-12 cursor-pointer items-center justify-center rounded-2xl bg-brand-600 text-white shadow-lg shadow-brand-600/30 active:scale-95"
                >
                  <Plus className="size-6" />
                </button>
              </div>
            ) : (
              <NavLink
                key={t.to}
                to={t.to}
                end={t.end}
                className={({ isActive }) =>
                  cn('flex flex-col items-center justify-center gap-1 text-[11px] font-medium [&_svg]:size-5', isActive ? 'text-brand-600 dark:text-brand-400' : 'text-slate-500')
                }
              >
                {t.icon}
                {t.label}
              </NavLink>
            ),
          )}
        </div>
      </nav>

      <CommandPalette />
      <NewExperimentDialog />
      <UndoBar />
    </div>
  )
}

/** 页面标题栏：面包屑 + 右侧操作 + 保存状态 */
export function PageHeader({ title, sub, actions, children }: { title?: ReactNode; sub?: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  return (
    <header data-mac-drag-region="true" className="no-print sticky top-0 z-20 border-b border-slate-200/70 bg-white/85 backdrop-blur-lg dark:border-slate-800 dark:bg-slate-950/85">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 md:px-8">
        {children ?? (
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[15px] font-semibold text-slate-900 dark:text-white">{title}</h1>
            {sub && <p className="truncate text-xs text-slate-500">{sub}</p>}
          </div>
        )}
        <div className="flex shrink-0 items-center gap-2">
          <div className="hidden sm:block">
            <SaveIndicator />
          </div>
          <Button variant="ghost" size="icon" className="md:hidden" aria-label="搜索" onClick={() => ui.openPalette()}>
            <Search />
          </Button>
          {actions}
        </div>
      </div>
    </header>
  )
}
