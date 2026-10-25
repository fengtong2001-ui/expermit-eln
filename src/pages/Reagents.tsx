import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { Minus, PackagePlus, Plus, Search, TestTubes, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { db } from '@/lib/db'
import { reagentAlerts, useReagents } from '@/lib/hooks'
import { emptyReagent, restoreReagent, saveReagent, trashReagent } from '@/lib/repo'
import { COMMON_UNITS, formatQty } from '@/lib/units'
import { cn, formatDate } from '@/lib/util'
import { pushUndo, undoById } from '@/lib/undo'
import type { Reagent } from '@/lib/types'
import { PageHeader } from '@/components/Shell'
import { Badge, Button, Dialog, EmptyState, Field } from '@/components/ui'

const CATEGORIES = ['抗体', '细胞培养', '分子生物学', '化学试剂', '缓冲液', '试剂盒', '耗材', '其他']

function AlertBadges({ r }: { r: Reagent }) {
  return (
    <>
      {reagentAlerts(r).map((a) => (
        <Badge key={a.kind} className={a.kind === 'expired' || a.kind === 'out' ? 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300' : 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'}>
          {a.text}
        </Badge>
      ))}
    </>
  )
}

function ReagentDialog({ id, open, onClose }: { id: string | null; open: boolean; onClose: () => void }) {
  const existing = useLiveQuery(() => (id ? db.reagents.get(id) : undefined), [id])
  const [f, setF] = useState(emptyReagent())
  const usage = useLiveQuery(async () => {
    if (!id) return []
    const us = await db.usages.where('reagentId').equals(id).reverse().sortBy('createdAt')
    const exps = await db.experiments.bulkGet([...new Set(us.map((u) => u.experimentId))])
    const m = new Map(exps.filter(Boolean).map((e) => [e!.id, e!]))
    return us.map((u) => ({ u, e: m.get(u.experimentId) })).filter((x) => x.e && !x.e.deletedAt)
  }, [id], [])
  const [adjust, setAdjust] = useState('')

  useEffect(() => {
    if (!open) return
    setAdjust('')
    if (id && existing) {
      const { id: _i, createdAt: _c, updatedAt: _u, deletedAt: _d, ...rest } = existing
      setF({ ...emptyReagent(), ...rest })
    } else if (!id) setF(emptyReagent())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, id, existing?.updatedAt])

  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }))
  const submit = async () => {
    if (!f.name.trim()) return
    await saveReagent({ ...f, name: f.name.trim() }, id ?? undefined)
    toast.success(id ? '已保存' : `已添加「${f.name.trim()}」`)
    onClose()
  }
  const doAdjust = async (sign: 1 | -1) => {
    const n = Number(adjust)
    if (!id || !existing || !n) return
    const next = Math.round(((existing.stockQty ?? 0) + sign * n) * 1e6) / 1e6
    await saveReagent({ name: existing.name, stockQty: next }, id)
    setF((x) => ({ ...x, stockQty: next }))
    setAdjust('')
    toast(sign > 0 ? `已入库 ${n} ${existing.stockUnit}` : `已出库 ${n} ${existing.stockUnit}`)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title={id ? f.name || '试剂' : '添加试剂'}
      width="sm:max-w-2xl"
      footer={
        <>
          {id && (
            <Button
              variant="ghost"
              className="mr-auto text-rose-600"
              onClick={async () => {
                const uid = pushUndo('删除试剂', () => void restoreReagent(id))
                await trashReagent(id)
                onClose()
                toast('已移到回收站', { action: { label: '撤销', onClick: () => undoById(uid) } })
              }}
            >
              <Trash2 /> 删除
            </Button>
          )}
          <Button onClick={onClose}>取消</Button>
          <Button variant="primary" onClick={submit} disabled={!f.name.trim()}>
            {id ? '保存' : '添加'}
          </Button>
        </>
      }
    >
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <Field label="名称 *" className="sm:col-span-2">
          <input autoFocus className="field" value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="搜索" />
        </Field>
        <Field label="类别">
          <input className="field" list="reagent-cats" value={f.category} onChange={(e) => set('category', e.target.value)} />
        </Field>
        <Field label="规格">
          <input className="field" value={f.spec} onChange={(e) => set('spec', e.target.value)} />
        </Field>
        <Field label="厂商">
          <input className="field" value={f.vendor} onChange={(e) => set('vendor', e.target.value)} />
        </Field>
        <Field label="货号">
          <input className="field" value={f.catalogNo} onChange={(e) => set('catalogNo', e.target.value)} />
        </Field>
        <Field label="批号">
          <input className="field" value={f.lot} onChange={(e) => set('lot', e.target.value)} />
        </Field>
        <Field label="有效期">
          <input type="date" className="field" value={f.expiry ?? ''} onChange={(e) => set('expiry', e.target.value || null)} />
        </Field>
        <Field label="保存条件">
          <input className="field" list="reagent-storage" value={f.storage} onChange={(e) => set('storage', e.target.value)} />
        </Field>
        <Field label="存放位置">
          <input className="field" value={f.location} onChange={(e) => set('location', e.target.value)} />
        </Field>

        <div className="rounded-xl bg-slate-50 p-3 sm:col-span-2 dark:bg-slate-900">
          <div className="grid grid-cols-3 gap-3">
            <Field label="库存数量">
              <input type="number" step="any" className="field" value={f.stockQty ?? ''} onChange={(e) => set('stockQty', e.target.value === '' ? null : Number(e.target.value))} />
            </Field>
            <Field label="单位">
              <input className="field" list="eln-units-r" value={f.stockUnit} onChange={(e) => set('stockUnit', e.target.value)} />
            </Field>
            <Field label="低于此值提醒">
              <input type="number" step="any" className="field" value={f.lowStock ?? ''} onChange={(e) => set('lowStock', e.target.value === '' ? null : Number(e.target.value))} />
            </Field>
          </div>
          {id && existing && existing.stockQty !== null && (
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-3 dark:border-slate-800">
              <span className="text-xs text-slate-500">快速调整</span>
              <input type="number" step="any" value={adjust} onChange={(e) => setAdjust(e.target.value)} className="field h-8 w-24" aria-label="调整数量" />
              <span className="text-xs text-slate-500">{existing.stockUnit}</span>
              <Button size="sm" onClick={() => doAdjust(1)} disabled={!Number(adjust)}>
                <Plus /> 入库
              </Button>
              <Button size="sm" onClick={() => doAdjust(-1)} disabled={!Number(adjust)}>
                <Minus /> 出库
              </Button>
            </div>
          )}
          <p className="mt-2 text-[11px] text-slate-500">在实验里用「试剂消耗」或「抗体」块勾选已使用，会按用量自动扣减（同量纲单位自动换算，如 µL ↔ mL）。</p>
        </div>

        <Field label="备注" className="sm:col-span-2">
          <textarea className="field" rows={2} value={f.note} onChange={(e) => set('note', e.target.value)} />
        </Field>

        {id && usage.length > 0 && (
          <div className="sm:col-span-2">
            <p className="label">使用记录（{usage.length}）</p>
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
              {usage.slice(0, 20).map(({ u, e }) => (
                <li key={u.id} className="flex items-center gap-3 px-3 py-2 text-[13px]">
                  <Link to={`/experiments/${e!.id}?block=${u.blockId}`} className="min-w-0 flex-1 truncate text-brand-700 hover:underline dark:text-brand-300" onClick={onClose}>
                    {e!.title}
                  </Link>
                  <span className="text-slate-500 tabular-nums">
                    {formatQty(u.amount)} {u.unit}
                  </span>
                  <span className="w-24 text-right text-xs text-slate-500">{formatDate(u.createdAt)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </form>
      <datalist id="reagent-cats">
        {CATEGORIES.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <datalist id="reagent-storage">
        {['室温', '4 °C', '-20 °C', '-80 °C', '液氮', '避光 4 °C'].map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <datalist id="eln-units-r">
        {COMMON_UNITS.map((u) => (
          <option key={u} value={u} />
        ))}
      </datalist>
    </Dialog>
  )
}

export function ReagentsPage() {
  const [sp, setSp] = useSearchParams()
  const reagents = useReagents()
  const usageCount = useLiveQuery(async () => {
    const m = new Map<string, number>()
    for (const u of await db.usages.toArray()) m.set(u.reagentId, (m.get(u.reagentId) ?? 0) + 1)
    return m
  }, [], new Map())
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('all')
  const [onlyAlerts, setOnlyAlerts] = useState(false)
  const editing = sp.get('id')
  const creating = sp.get('new') === '1'

  const cats = useMemo(() => [...new Set((reagents ?? []).map((r) => r.category).filter(Boolean))], [reagents])
  const list = useMemo(() => {
    let l = reagents ?? []
    if (cat !== 'all') l = l.filter((r) => r.category === cat)
    if (onlyAlerts) l = l.filter((r) => reagentAlerts(r).length)
    if (q.trim()) {
      const t = q.trim().toLowerCase()
      l = l.filter((r) => `${r.name} ${r.vendor} ${r.catalogNo} ${r.lot} ${r.location} ${r.note}`.toLowerCase().includes(t))
    }
    return l
  }, [reagents, cat, onlyAlerts, q])
  const alertCount = (reagents ?? []).filter((r) => reagentAlerts(r).length).length

  const close = () => setSp({}, { replace: true })

  return (
    <div>
      <PageHeader
        title="试剂库"
        sub={reagents ? `${reagents.length} 种试剂` : ''}
        actions={
          <Button variant="primary" onClick={() => setSp({ new: '1' })}>
            <PackagePlus /> <span className="hidden sm:inline">添加试剂</span>
          </Button>
        }
      />
      <div className="mx-auto max-w-6xl px-4 py-6 md:px-8">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="relative min-w-48 flex-1 sm:max-w-72">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-slate-500" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索" className="field pl-8" />
          </div>
          <select className="field h-9 w-auto text-[13px]" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="类别">
            <option value="all">所有类别</option>
            {cats.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          {alertCount > 0 && (
            <button
              onClick={() => setOnlyAlerts((v) => !v)}
              className={cn(
                'h-9 cursor-pointer rounded-lg px-3 text-[13px] font-medium transition',
                onlyAlerts ? 'bg-amber-500 text-white' : 'bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-500/10 dark:text-amber-300',
              )}
            >
              需要关注 {alertCount}
            </button>
          )}
        </div>

        {reagents === undefined ? null : reagents.length === 0 ? (
          <EmptyState
            icon={<TestTubes />}
            title="试剂库是空的"
            hint="录入常用试剂和抗体后，实验里可以直接选用、自动扣库存，并能反查某个批号用在了哪些实验里。"
            action={
              <Button variant="primary" onClick={() => setSp({ new: '1' })}>
                <PackagePlus /> 添加第一种试剂
              </Button>
            }
          />
        ) : list.length === 0 ? (
          <EmptyState icon={<Search />} title="没有符合条件的试剂" />
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
            <table className="w-full min-w-[760px] text-left text-[13px]">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900">
                <tr>
                  <th className="px-4 py-2.5 font-medium">名称</th>
                  <th className="px-3 py-2.5 font-medium">厂商 / 货号</th>
                  <th className="px-3 py-2.5 font-medium">批号</th>
                  <th className="px-3 py-2.5 font-medium">有效期</th>
                  <th className="px-3 py-2.5 font-medium">保存</th>
                  <th className="px-3 py-2.5 text-right font-medium">库存</th>
                  <th className="px-3 py-2.5 text-right font-medium">使用</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {list.map((r) => (
                  <tr key={r.id} onClick={() => setSp({ id: r.id })} className="cursor-pointer transition hover:bg-slate-50 dark:hover:bg-slate-900">
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-medium text-slate-900 dark:text-white">{r.name}</span>
                        <AlertBadges r={r} />
                      </div>
                      {(r.category || r.spec) && <div className="text-xs text-slate-500">{[r.category, r.spec].filter(Boolean).join(' · ')}</div>}
                    </td>
                    <td className="px-3 py-2.5 text-slate-500">{[r.vendor, r.catalogNo].filter(Boolean).join(' · ') || '—'}</td>
                    <td className="px-3 py-2.5 font-mono text-xs text-slate-500">{r.lot || '—'}</td>
                    <td className="px-3 py-2.5 text-slate-500 tabular-nums">{r.expiry || '—'}</td>
                    <td className="px-3 py-2.5 text-slate-500">{[r.storage, r.location].filter(Boolean).join(' · ') || '—'}</td>
                    <td className={cn('px-3 py-2.5 text-right font-medium tabular-nums', r.stockQty !== null && r.stockQty < 0 ? 'text-rose-600' : 'text-slate-700 dark:text-slate-200')}>
                      {r.stockQty !== null ? `${formatQty(r.stockQty)} ${r.stockUnit}` : <span className="font-normal text-slate-400">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right text-slate-500 tabular-nums">{usageCount.get(r.id) ? `${usageCount.get(r.id)} 次` : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <ReagentDialog id={editing} open={!!editing || creating} onClose={close} />
    </div>
  )
}
