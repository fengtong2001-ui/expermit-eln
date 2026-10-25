import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect } from 'react'
import { db } from './db'
import { daysUntil } from './util'
import type { Reagent } from './types'

export const useProjects = () => useLiveQuery(async () => (await db.projects.orderBy('createdAt').toArray()).filter((x) => !x.deletedAt), [], [])

export const useExperiments = () =>
  useLiveQuery(async () => (await db.experiments.orderBy('updatedAt').reverse().toArray()).filter((e) => !e.deletedAt), [], undefined)

export const useReagents = () =>
  useLiveQuery(async () => (await db.reagents.orderBy('name').toArray()).filter((r) => !r.deletedAt), [], undefined)

export type ReagentAlert = 'expired' | 'expiring' | 'low' | 'out' | null

export function reagentAlerts(r: Reagent): { kind: Exclude<ReagentAlert, null>; text: string }[] {
  const out: { kind: Exclude<ReagentAlert, null>; text: string }[] = []
  if (r.expiry) {
    const d = daysUntil(r.expiry)
    if (d < 0) out.push({ kind: 'expired', text: `已过期 ${-d} 天` })
    else if (d <= 30) out.push({ kind: 'expiring', text: d === 0 ? '今天到期' : `${d} 天后到期` })
  }
  if (r.stockQty !== null) {
    if (r.stockQty <= 0) out.push({ kind: 'out', text: r.stockQty < 0 ? '库存为负' : '已用完' })
    else if (r.lowStock !== null && r.stockQty <= r.lowStock) out.push({ kind: 'low', text: '库存偏低' })
  }
  return out
}

export function useHotkey(combo: string, handler: (e: KeyboardEvent) => void, deps: unknown[] = []) {
  useEffect(() => {
    const parts = combo.toLowerCase().split('+')
    const key = parts.pop()!
    const mod = parts.includes('mod')
    const shift = parts.includes('shift')
    const alt = parts.includes('alt')
    const fn = (e: KeyboardEvent) => {
      if (mod !== (e.metaKey || e.ctrlKey)) return
      if (shift !== e.shiftKey) return
      if (alt !== e.altKey) return
      if (e.key.toLowerCase() !== key) return
      handler(e)
    }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}

export const isTypingTarget = (t: EventTarget | null) => {
  const el = t as HTMLElement | null
  if (!el) return false
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)
}
