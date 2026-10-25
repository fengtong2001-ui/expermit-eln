import { useLiveQuery } from 'dexie-react-hooks'
import { FlaskConical, RotateCcw, TestTubes, Trash2, FileText } from 'lucide-react'
import { toast } from 'sonner'
import { db } from '@/lib/db'
import * as repo from '@/lib/repo'
import { defOf, blockText } from '@/blocks/defs'
import { formatDate, relativeTime } from '@/lib/util'
import { PageHeader } from '@/components/Shell'
import { Button, EmptyState } from '@/components/ui'
import { confirmDialog } from '@/components/confirm'

type Row = { key: string; kind: 'experiment' | 'block' | 'reagent'; id: string; title: string; sub: string; deletedAt: number }

export function TrashPage() {
  const rows = useLiveQuery(async () => {
    const out: Row[] = []
    const exps = await db.experiments.toArray()
    const live = new Map(exps.filter((e) => !e.deletedAt).map((e) => [e.id, e]))
    for (const e of exps) if (e.deletedAt) out.push({ key: `e${e.id}`, kind: 'experiment', id: e.id, title: e.title, sub: e.code, deletedAt: e.deletedAt })
    for (const b of await db.blocks.toArray()) {
      const e = live.get(b.experimentId)
      if (b.deletedAt && e) out.push({ key: `b${b.id}`, kind: 'block', id: b.id, title: `${defOf(b.type)?.label ?? '内容块'}：${blockText(b.type, b.data).slice(0, 40) || '（空）'}`, sub: `来自「${e.title}」`, deletedAt: b.deletedAt })
    }
    for (const r of await db.reagents.toArray()) if (r.deletedAt) out.push({ key: `r${r.id}`, kind: 'reagent', id: r.id, title: r.name, sub: '试剂', deletedAt: r.deletedAt })
    return out.sort((a, b) => b.deletedAt - a.deletedAt)
  }, [], undefined)

  const restore = async (r: Row) => {
    if (r.kind === 'experiment') await repo.restoreExperiment(r.id)
    else if (r.kind === 'block') await repo.restoreBlock(r.id)
    else await repo.restoreReagent(r.id)
    toast.success(`已恢复「${r.title.slice(0, 20)}」`)
  }

  const purge = async (r: Row) => {
    const ok = await confirmDialog({
      title: '永久删除？',
      body: `「${r.title}」将被永久删除，包括其中的图片和历史版本。此操作无法撤销。`,
      confirmText: '永久删除',
      danger: true,
    })
    if (!ok) return
    if (r.kind === 'experiment') await repo.purgeExperiment(r.id)
    else if (r.kind === 'block') await repo.purgeBlock(r.id)
    else await repo.purgeReagent(r.id)
  }

  const purgeAll = async () => {
    if (!rows?.length) return
    const ok = await confirmDialog({ title: `清空回收站（${rows.length} 项）？`, body: '所有项目将被永久删除，无法撤销。', confirmText: '全部永久删除', danger: true })
    if (!ok) return
    for (const r of rows) {
      if (r.kind === 'experiment') await repo.purgeExperiment(r.id)
      else if (r.kind === 'block') await repo.purgeBlock(r.id)
      else await repo.purgeReagent(r.id)
    }
  }

  const Icon = { experiment: FlaskConical, block: FileText, reagent: TestTubes }

  return (
    <div>
      <PageHeader
        title="回收站"
        sub={`删除的内容保留 ${repo.TRASH_DAYS} 天，之后自动清除`}
        actions={
          rows && rows.length > 0 ? (
            <Button variant="ghost" onClick={purgeAll} className="text-rose-600">
              <Trash2 /> 清空
            </Button>
          ) : null
        }
      />
      <div className="mx-auto max-w-3xl px-4 py-6 md:px-8">
        {rows === undefined ? null : rows.length === 0 ? (
          <EmptyState icon={<Trash2 />} title="回收站是空的" hint="删除的实验、内容块和试剂会先放在这里，30 天内都能恢复。" />
        ) : (
          <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
            {rows.map((r) => {
              const I = Icon[r.kind]
              const left = repo.TRASH_DAYS - Math.floor((Date.now() - r.deletedAt) / 86400000)
              return (
                <li key={r.key} className="flex items-center gap-3 px-4 py-3">
                  <I className="size-4 shrink-0 text-slate-500" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-slate-800 dark:text-slate-100">{r.title}</p>
                    <p className="truncate text-xs text-slate-500">
                      {r.sub} · {relativeTime(r.deletedAt)}删除 · <span title={formatDate(r.deletedAt + repo.TRASH_DAYS * 86400000)}>{left} 天后清除</span>
                    </p>
                  </div>
                  <Button size="sm" onClick={() => restore(r)}>
                    <RotateCcw /> 恢复
                  </Button>
                  <Button size="icon-sm" variant="ghost" aria-label="永久删除" onClick={() => purge(r)}>
                    <Trash2 />
                  </Button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
