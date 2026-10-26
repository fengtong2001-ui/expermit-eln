import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { FlaskConical, LayoutGrid, List, MoreHorizontal, Pencil, Plus, Search, SlidersHorizontal, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useExperiments, useProjects } from '@/lib/hooks'
import { KIND_STYLES, KINDS, STATUS_META, kindOf } from '@/lib/kinds'
import { cn, formatDate, relativeTime } from '@/lib/util'
import { ui } from '@/lib/ui-store'
import { deleteProject, updateProject } from '@/lib/repo'
import { PageHeader } from '@/components/Shell'
import { ExperimentCard, StatusBadge } from '@/components/ExperimentCard'
import { Badge, Button, Dialog, EmptyState, Field, Menu, MenuContent, MenuItem, MenuTrigger, Segmented } from '@/components/ui'
import { promptDialog } from '@/components/prompt'
import { confirmDialog } from '@/components/confirm'
import type { ExperimentStatus } from '@/lib/types'

type Sort = 'updated' | 'created' | 'title' | 'planned'

export function ExperimentsPage() {
  const [sp, setSp] = useSearchParams()
  const navigate = useNavigate()
  const projectId = sp.get('project')
  const exps = useExperiments()
  const projects = useProjects()
  const project = projects.find((p) => p.id === projectId)
  const [view, setView] = useState<'grid' | 'table'>(() => {
    const wide =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(min-width: 768px)').matches
    if (!wide) return 'grid'
    return (localStorage.getItem('eln-view') as 'grid' | 'table') || 'grid'
  })
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<ExperimentStatus | 'active' | 'all'>('active')
  const [kind, setKind] = useState('all')
  const [sort, setSort] = useState<Sort>('updated')
  const [filterOpen, setFilterOpen] = useState(false)

  const list = useMemo(() => {
    let l = exps ?? []
    if (projectId) l = l.filter((e) => e.projectId === projectId)
    if (status === 'active') l = l.filter((e) => e.status !== 'archived')
    else if (status !== 'all') l = l.filter((e) => e.status === status)
    if (kind !== 'all') l = l.filter((e) => e.kind === kind)
    if (q.trim()) {
      const t = q.trim().toLowerCase()
      l = l.filter((e) => `${e.title} ${e.code} ${e.tags.join(' ')}`.toLowerCase().includes(t))
    }
    const cmp: Record<Sort, (a: (typeof l)[0], b: (typeof l)[0]) => number> = {
      updated: (a, b) => b.updatedAt - a.updatedAt,
      created: (a, b) => b.createdAt - a.createdAt,
      title: (a, b) => a.title.localeCompare(b.title, 'zh'),
      planned: (a, b) => (b.plannedDate ?? '').localeCompare(a.plannedDate ?? ''),
    }
    return [...l].sort(cmp[sort])
  }, [exps, projectId, status, kind, q, sort])

  const setViewP = (v: 'grid' | 'table') => {
    setView(v)
    localStorage.setItem('eln-view', v)
  }

  const renameProject = async () => {
    if (!project) return
    const r = await promptDialog({ title: '重命名项目', label: '项目名称', initial: project.name, confirmText: '保存' })
    if (r) await updateProject(project.id, { name: r.value })
  }
  const removeProject = async () => {
    if (!project) return
    const n = (exps ?? []).filter((e) => e.projectId === project.id).length
    const ok = await confirmDialog({
      title: `删除项目「${project.name}」？`,
      body: n ? `项目里的 ${n} 个实验不会被删除，会移到「未归类」。` : '这个项目里没有实验。',
      confirmText: '删除项目',
      danger: true,
    })
    if (!ok) return
    await deleteProject(project.id)
    setSp({})
    toast('项目已删除')
  }

  const counts = useMemo(() => {
    const base = (exps ?? []).filter((e) => !projectId || e.projectId === projectId)
    return {
      active: base.filter((e) => e.status !== 'archived').length,
      running: base.filter((e) => e.status === 'running').length,
      planned: base.filter((e) => e.status === 'planned').length,
      done: base.filter((e) => e.status === 'done').length,
      archived: base.filter((e) => e.status === 'archived').length,
    }
  }, [exps, projectId])

  return (
    <div>
      <PageHeader
        title={project ? project.name : '全部实验'}
        sub={`${counts.active} 个实验`}
        actions={
          <>
            {project && (
              <Menu>
                <MenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="项目操作">
                    <MoreHorizontal />
                  </Button>
                </MenuTrigger>
                <MenuContent>
                  <MenuItem icon={<Pencil />} onSelect={renameProject}>
                    重命名项目
                  </MenuItem>
                  <MenuItem icon={<Trash2 />} danger onSelect={removeProject}>
                    删除项目
                  </MenuItem>
                </MenuContent>
              </Menu>
            )}
            <Button variant="primary" onClick={() => ui.openNewExperiment({ projectId })} className="max-md:hidden">
              <Plus /> 新建实验
            </Button>
          </>
        }
      />
      <div className="mx-auto max-w-6xl px-4 py-4 md:px-8 md:py-6">
        {/* 筛选条 */}
        <div className="mb-3 flex flex-wrap items-center gap-2 md:mb-5">
          <div className="relative min-w-0 flex-1 sm:max-w-64">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-slate-500" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="筛选标题、编号、标签" className="field pl-8" />
          </div>
          <Button variant="secondary" size="icon" className="size-11 md:hidden" aria-label="筛选与排序" onClick={() => setFilterOpen(true)}>
            <SlidersHorizontal />
          </Button>
          <div className="flex w-full gap-1 overflow-x-auto md:w-auto">
            {(
              [
                ['active', `全部 ${counts.active}`],
                ['running', `进行中 ${counts.running}`],
                ['planned', `计划中 ${counts.planned}`],
                ['done', `已完成 ${counts.done}`],
                ['archived', `已归档 ${counts.archived}`],
              ] as const
            ).map(([v, l]) => (
              <button
                key={v}
                onClick={() => setStatus(v)}
                className={cn(
                  'h-9 shrink-0 cursor-pointer rounded-lg px-2.5 text-[13px] font-medium whitespace-nowrap transition md:h-8',
                  status === v ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800',
                )}
              >
                {l}
              </button>
            ))}
          </div>
          <div className="ml-auto hidden items-center gap-2 md:flex">
            <select className="field h-8 w-auto text-[13px]" value={kind} onChange={(e) => setKind(e.target.value)} aria-label="实验类型">
              <option value="all">所有类型</option>
              {KINDS.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.label}
                </option>
              ))}
            </select>
            <select className="field h-8 w-auto text-[13px]" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="排序">
              <option value="updated">最近编辑</option>
              <option value="created">最近创建</option>
              <option value="planned">计划日期</option>
              <option value="title">标题</option>
            </select>
            <Segmented
              size="sm"
              value={view}
              onChange={setViewP}
              options={[
                { value: 'grid', label: <LayoutGrid />, title: '卡片' },
                { value: 'table', label: <List />, title: '列表' },
              ]}
            />
          </div>
        </div>

        {exps === undefined ? null : list.length === 0 ? (
          <EmptyState
            icon={<FlaskConical />}
            title={q || status !== 'active' || kind !== 'all' ? '没有符合条件的实验' : project ? '这个项目里还没有实验' : '还没有实验'}
            action={
              !q && (
                <Button variant="primary" onClick={() => ui.openNewExperiment({ projectId })}>
                  <Plus /> 新建实验
                </Button>
              )
            }
            actionClassName="hidden md:block"
          />
        ) : view === 'grid' ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((e) => (
              <ExperimentCard key={e.id} e={e} project={projectId ? undefined : projects.find((p) => p.id === e.projectId)} />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
            <table className="w-full min-w-[720px] text-left text-[13px]">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900">
                <tr>
                  <th className="px-4 py-2.5 font-medium">标题</th>
                  <th className="px-3 py-2.5 font-medium">类型</th>
                  <th className="px-3 py-2.5 font-medium">状态</th>
                  {!projectId && <th className="px-3 py-2.5 font-medium">项目</th>}
                  <th className="px-3 py-2.5 font-medium">计划日期</th>
                  <th className="px-3 py-2.5 font-medium">最后编辑</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {list.map((e) => {
                  const k = kindOf(e.kind)
                  const p = projects.find((x) => x.id === e.projectId)
                  return (
                    <tr key={e.id} onClick={() => navigate(`/experiments/${e.id}`)} className="cursor-pointer transition hover:bg-slate-50 dark:hover:bg-slate-900">
                      <td className="px-4 py-2.5">
                        <Link to={`/experiments/${e.id}`} className="font-medium text-slate-900 dark:text-white" onClick={(ev) => ev.stopPropagation()}>
                          {e.title}
                        </Link>
                        {e.tags.length > 0 && <span className="ml-2 text-xs text-slate-500">{e.tags.map((t) => `#${t}`).join(' ')}</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge className={KIND_STYLES[k.color].badge}>{k.label}</Badge>
                      </td>
                      <td className="px-3 py-2.5">
                        <StatusBadge status={e.status} />
                      </td>
                      {!projectId && <td className="px-3 py-2.5 text-slate-500">{p?.name ?? '—'}</td>}
                      <td className="px-3 py-2.5 text-slate-500 tabular-nums">{e.plannedDate ? formatDate(new Date(e.plannedDate + 'T00:00').getTime()) : '—'}</td>
                      <td className="px-3 py-2.5 text-slate-500">{relativeTime(e.updatedAt)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {STATUS_META && null}
      </div>

      <Dialog
        open={filterOpen}
        onOpenChange={setFilterOpen}
        title="筛选与排序"
        footer={
          <Button variant="primary" onClick={() => setFilterOpen(false)}>
            完成
          </Button>
        }
      >
        <div className="space-y-4">
          <Field label="实验类型">
            <select className="field" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="all">所有类型</option>
              {KINDS.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="排序">
            <select className="field" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
              <option value="updated">最近编辑</option>
              <option value="created">最近创建</option>
              <option value="planned">计划日期</option>
              <option value="title">标题</option>
            </select>
          </Field>
        </div>
      </Dialog>
    </div>
  )
}
