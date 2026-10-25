import * as RDialog from '@radix-ui/react-dialog'
import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Camera, CopyPlus, History, RotateCcw, X } from 'lucide-react'
import { toast } from 'sonner'
import { db } from '@/lib/db'
import * as repo from '@/lib/repo'
import { blockText, defOf } from '@/blocks/defs'
import { cn, formatDateTime, relativeTime } from '@/lib/util'
import type { Snapshot } from '@/lib/types'
import { Button } from './ui'
import { confirmDialog } from './confirm'

function diffSummary(s: Snapshot, current: { type: string; data: unknown }[]) {
  const a = s.payload.blocks.map((b) => `${b.type}:${blockText(b.type, b.data)}`)
  const b = current.map((x) => `${x.type}:${blockText(x.type, x.data)}`)
  const sa = new Set(a)
  const sb = new Set(b)
  return { removed: a.filter((x) => !sb.has(x)).length, added: b.filter((x) => !sa.has(x)).length }
}

export function HistoryDrawer({ experimentId, open, onOpenChange }: { experimentId: string; open: boolean; onOpenChange: (v: boolean) => void }) {
  const navigate = useNavigate()
  const snaps = useLiveQuery(async () => (await db.snapshots.where('experimentId').equals(experimentId).sortBy('createdAt')).reverse(), [experimentId], [])
  const audit = useLiveQuery(async () => (await db.audit.where('experimentId').equals(experimentId).sortBy('at')).reverse(), [experimentId], [])
  const current = useLiveQuery(() => repo.liveBlocks(experimentId), [experimentId], [])
  const [selected, setSelected] = useState<string | null>(null)
  const sel = snaps.find((s) => s.id === selected) ?? null

  const restoreInPlace = async (s: Snapshot) => {
    const ok = await confirmDialog({
      title: '用这个版本替换当前内容？',
      body: (
        <>
          当前内容会先自动保存为一个新版本，之后仍可从历史里找回。
          <br />
          试剂扣减会按恢复后的内容重新结算。
        </>
      ),
      confirmText: '替换当前内容',
    })
    if (!ok) return
    await repo.restoreSnapshotInPlace(s.id)
    toast.success('已恢复到所选版本')
    onOpenChange(false)
  }

  const restoreAsNew = async (s: Snapshot) => {
    const e = await repo.restoreSnapshotAsNew(s.id)
    if (!e) return
    onOpenChange(false)
    navigate(`/experiments/${e.id}`)
    toast.success('已从旧版本创建一个新实验，原实验不受影响')
  }

  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className="fixed inset-0 z-40 animate-in bg-slate-900/20 dark:bg-black/40" />
        <RDialog.Content className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md animate-in flex-col border-l border-slate-200 bg-white shadow-pop dark:border-slate-800 dark:bg-slate-950">
          <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
            <History className="size-4 text-slate-500" />
            <RDialog.Title className="flex-1 text-[15px] font-semibold">历史版本</RDialog.Title>
            <RDialog.Description className="sr-only">查看与恢复这个实验的历史版本</RDialog.Description>
            <Button
              size="sm"
              onClick={async () => {
                const s = await repo.takeSnapshot(experimentId, '手动保存')
                toast(s ? '已保存当前版本' : '内容和上一个版本相同，无需重复保存')
              }}
            >
              <Camera /> 保存当前版本
            </Button>
            <RDialog.Close asChild>
              <Button size="icon-sm" variant="ghost" aria-label="关闭">
                <X />
              </Button>
            </RDialog.Close>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {snaps.length === 0 ? (
              <p className="px-5 py-10 text-center text-[13px] leading-relaxed text-slate-500">
                还没有历史版本。
                <br />
                每天第一次打开、标记完成、恢复旧版本前都会自动保存一份。
              </p>
            ) : (
              <ol className="px-3 py-3">
                {snaps.map((s, i) => {
                  const d = diffSummary(s, current)
                  const active = s.id === selected
                  return (
                    <li key={s.id}>
                      <button
                        onClick={() => setSelected(active ? null : s.id)}
                        className={cn('flex w-full cursor-pointer gap-3 rounded-xl px-3 py-2.5 text-left transition', active ? 'bg-slate-100 dark:bg-slate-800' : 'hover:bg-slate-50 dark:hover:bg-slate-900')}
                      >
                        <span className="mt-1.5 flex flex-col items-center">
                          <span className={cn('size-2 rounded-full', i === 0 ? 'bg-brand-500' : 'bg-slate-300 dark:bg-slate-600')} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13px] font-medium text-slate-800 dark:text-slate-100" title={formatDateTime(s.createdAt)}>
                            {formatDateTime(s.createdAt)}
                          </span>
                          <span className="block text-xs text-slate-500">
                            {s.reason} · {s.blockCount} 个内容块 · {relativeTime(s.createdAt)}
                          </span>
                          {(d.added > 0 || d.removed > 0) && (
                            <span className="mt-0.5 block text-[11px] text-slate-500">
                              与当前相比：{d.removed > 0 && <span className="text-rose-500">{d.removed} 处不同</span>}
                              {d.removed > 0 && d.added > 0 && '，'}
                              {d.added > 0 && <span className="text-emerald-600">当前多出 {d.added} 处</span>}
                            </span>
                          )}
                        </span>
                      </button>
                      {active && sel && (
                        <div className="mx-3 mb-3 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                          <p className="mb-2 text-xs font-medium text-slate-500">「{sel.payload.experiment.title}」当时的内容</p>
                          <div className="max-h-64 space-y-2 overflow-y-auto">
                            {sel.payload.blocks.map((b) => (
                              <div key={b.id} className="rounded-lg bg-slate-50 px-2.5 py-1.5 dark:bg-slate-900">
                                <p className="text-[11px] font-medium text-slate-500">{defOf(b.type)?.label ?? '内容'}</p>
                                <p className="line-clamp-3 text-xs text-slate-600 dark:text-slate-300">{blockText(b.type, b.data) || '（空）'}</p>
                              </div>
                            ))}
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <Button size="sm" onClick={() => restoreInPlace(sel)}>
                              <RotateCcw /> 恢复到这个版本
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => restoreAsNew(sel)}>
                              <CopyPlus /> 另存为新实验
                            </Button>
                          </div>
                        </div>
                      )}
                    </li>
                  )
                })}
              </ol>
            )}

            {audit.length > 0 && (
              <div className="border-t border-slate-100 px-5 py-4 dark:border-slate-800">
                <p className="mb-2 text-xs font-medium text-slate-500">操作记录</p>
                <ul className="space-y-1.5">
                  {audit.slice(0, 30).map((a) => (
                    <li key={a.id} className="flex gap-3 text-xs">
                      <span className="w-32 shrink-0 text-slate-500 tabular-nums">{formatDateTime(a.at)}</span>
                      <span className="text-slate-600 dark:text-slate-300">
                        {a.action}
                        {a.detail && <span className="text-slate-500"> · {a.detail}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  )
}
