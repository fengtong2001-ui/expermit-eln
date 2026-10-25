import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { Check, FilePlus2, LayoutTemplate } from 'lucide-react'
import { db } from '@/lib/db'
import { ui, useUI } from '@/lib/ui-store'
import { useProjects } from '@/lib/hooks'
import { createExperiment, createProject } from '@/lib/repo'
import { KIND_STYLES, KINDS, kindOf } from '@/lib/kinds'
import { cn, todayStr } from '@/lib/util'
import { defOf } from '@/blocks/defs'
import { Button, Dialog, Field } from './ui'
import { TagInput } from './TagInput'

export function NewExperimentDialog() {
  const { newExp } = useUI()
  const open = newExp !== false
  const navigate = useNavigate()
  const projects = useProjects()
  const templates = useLiveQuery(() => db.templates.toArray(), [], [])
  const [templateId, setTemplateId] = useState('builtin-general')
  const [title, setTitle] = useState('')
  const [projectId, setProjectId] = useState<string>('')
  const [newProject, setNewProject] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [date, setDate] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setTitle('')
    setTags([])
    setNewProject('')
    setDate(newExp && newExp.date ? newExp.date : todayStr())
    const last = localStorage.getItem('eln-last-project')
    const pid = (newExp && newExp.projectId) || last || ''
    setProjectId(projects.some((p) => p.id === pid) ? pid : (projects[0]?.id ?? ''))
    setTemplateId(localStorage.getItem('eln-last-template') || 'builtin-general')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const sorted = useMemo(() => [...templates].sort((a, b) => Number(!!b.builtin) - Number(!!a.builtin) || a.createdAt - b.createdAt), [templates])
  const tpl = templates.find((t) => t.id === templateId) ?? templates[0]

  const submit = async () => {
    if (!tpl || busy) return
    setBusy(true)
    try {
      let pid: string | null = projectId || null
      if (projectId === '__new' && newProject.trim()) pid = (await createProject(newProject)).id
      else if (projectId === '__new') pid = null
      const e = await createExperiment({
        title: title.trim() || `${tpl.builtin && tpl.id === 'builtin-general' ? '实验' : tpl.name} ${todayStr().slice(5)}`,
        kind: tpl.kind,
        projectId: pid,
        tags,
        plannedDate: date || null,
        blocks: tpl.blocks,
      })
      if (pid) localStorage.setItem('eln-last-project', pid)
      localStorage.setItem('eln-last-template', tpl.id)
      ui.closeNewExperiment()
      navigate(`/experiments/${e.id}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => !v && ui.closeNewExperiment()}
      title="新建实验"
      width="sm:max-w-3xl"
      footer={
        <>
          <span className="mr-auto hidden text-xs text-slate-500 sm:block">
            <kbd className="kbd">⌘</kbd> <kbd className="kbd">↵</kbd> 创建
          </span>
          <Button onClick={() => ui.closeNewExperiment()}>取消</Button>
          <Button variant="primary" onClick={submit} disabled={busy}>
            创建并开始记录
          </Button>
        </>
      }
    >
      <div
        className="grid gap-6 sm:grid-cols-[1fr_280px]"
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void submit()
        }}
      >
        <div>
          <p className="label">从哪里开始</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {sorted.map((t) => {
              const k = kindOf(t.kind)
              const active = t.id === tpl?.id
              return (
                <button
                  key={t.id}
                  onClick={() => setTemplateId(t.id)}
                  onDoubleClick={submit}
                  className={cn(
                    'relative flex cursor-pointer gap-3 rounded-xl border p-3 text-left transition',
                    active
                      ? 'border-brand-500 bg-brand-50/60 ring-3 ring-brand-500/15 dark:bg-brand-500/10'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/50',
                  )}
                >
                  <span className={cn('mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg [&_svg]:size-4', KIND_STYLES[k.color].badge)}>
                    {t.builtin ? <FilePlus2 /> : <LayoutTemplate />}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-medium text-slate-900 dark:text-white">{t.name}</span>
                    <span className="mt-0.5 line-clamp-2 block text-xs text-slate-500">{t.description || `${t.blocks.length} 个内容块`}</span>
                  </span>
                  {active && <Check className="absolute top-2.5 right-2.5 size-4 text-brand-600" />}
                </button>
              )
            })}
          </div>
          {tpl && tpl.blocks.length > 0 && (
            <p className="mt-3 text-xs text-slate-500">
              包含：{tpl.blocks.map((b) => defOf(b.type)?.label ?? b.type).join(' · ')}
            </p>
          )}
        </div>

        <div className="space-y-4">
          <Field label="标题">
            <input autoFocus className="field" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={tpl ? `${tpl.name} ${todayStr().slice(5)}` : ''} />
          </Field>
          <Field label="项目">
            <select className="field" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">不归类</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
              <option value="__new">＋ 新建项目…</option>
            </select>
          </Field>
          {projectId === '__new' && <input className="field" value={newProject} onChange={(e) => setNewProject(e.target.value)} placeholder="新项目名称" />}
          <Field label="计划日期" hint="会同时出现在日程里">
            <input type="date" className="field" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="标签">
            <TagInput value={tags} onChange={setTags} placeholder="标签" />
          </Field>
          <p className="text-xs text-slate-500">类型：{tpl ? kindOf(tpl.kind).label : ''} · 编号自动生成</p>
          {KINDS.length === 0 && null}
        </div>
      </div>
    </Dialog>
  )
}
