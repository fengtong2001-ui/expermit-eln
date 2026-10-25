import { useLiveQuery } from 'dexie-react-hooks'
import { LayoutTemplate, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { db } from '@/lib/db'
import { KIND_STYLES, kindOf } from '@/lib/kinds'
import { ui } from '@/lib/ui-store'
import { defOf } from '@/blocks/defs'
import { deleteTemplate } from '@/lib/repo'
import { ICONS } from '@/blocks/registry'
import { cn, formatDate } from '@/lib/util'
import { PageHeader } from '@/components/Shell'
import { Badge, Button, EmptyState } from '@/components/ui'
import { promptDialog } from '@/components/prompt'
import type { BlockType } from '@/blocks/defs'

export function TemplatesPage() {
  const templates = useLiveQuery(async () => (await db.templates.toArray()).filter((t) => !t.deletedAt), [], [])
  const builtin = templates.filter((t) => t.builtin)
  const mine = templates.filter((t) => !t.builtin).sort((a, b) => b.createdAt - a.createdAt)

  const Card = ({ t }: { t: (typeof templates)[0] }) => {
    const k = kindOf(t.kind)
    return (
      <div className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start gap-3">
          <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-xl', KIND_STYLES[k.color].badge)}>
            <LayoutTemplate className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-[14px] font-semibold text-slate-900 dark:text-white">{t.name}</h3>
            <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{t.description || `${k.label}`}</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-1">
          {t.blocks.map((b, i) => {
            const Icon = ICONS[b.type as BlockType]
            return (
              <Badge key={i} className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {Icon && <Icon className="size-3" />}
                {defOf(b.type)?.label ?? b.type}
              </Badge>
            )
          })}
        </div>
        <div className="mt-auto flex items-center gap-1 pt-4">
          <Badge className={KIND_STYLES[k.color].badge}>{k.label}</Badge>
          {!t.builtin && <span className="ml-1 text-xs text-slate-500">{formatDate(t.createdAt)}</span>}
          <div className="ml-auto flex gap-1">
            {!t.builtin && (
              <>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label="重命名"
                  onClick={async () => {
                    const r = await promptDialog({ title: '编辑模板', label: '名称', initial: t.name, multiline: { label: '说明', initial: t.description }, confirmText: '保存' })
                    if (r) await db.templates.update(t.id, { name: r.value, description: r.extra })
                  }}
                >
                  <Pencil />
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label="删除模板"
                  onClick={async () => {
                    await deleteTemplate(t.id)
                    toast('已删除模板', { action: { label: '撤销', onClick: () => void db.templates.update(t.id, { deletedAt: null, updatedAt: Date.now() }) } })
                  }}
                >
                  <Trash2 />
                </Button>
              </>
            )}
            <Button
              size="sm"
              onClick={() => {
                localStorage.setItem('eln-last-template', t.id)
                ui.openNewExperiment()
              }}
            >
              <Plus /> 用它新建
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <PageHeader title="模板" />
      <div className="mx-auto max-w-6xl space-y-8 px-4 py-6 md:px-8">
        <section>
          <h2 className="mb-3 text-sm font-semibold">我的模板</h2>
          {mine.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
              <EmptyState icon={<LayoutTemplate />} title="还没有自己的模板" hint="在任意实验右上角「⋯ → 存为模板」，就能把这套结构复用到以后的实验里。步骤勾选、试剂扣减、图片不会带入模板。" />
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {mine.map((t) => (
                <Card key={t.id} t={t} />
              ))}
            </div>
          )}
        </section>
        <section>
          <h2 className="mb-1 text-sm font-semibold">内置模板</h2>
          <p className="mb-3 text-xs text-slate-500">预设的流程参数只是常见起点，请按本实验室 SOP 与试剂说明书核对。</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {builtin.map((t) => (
              <Card key={t.id} t={t} />
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
