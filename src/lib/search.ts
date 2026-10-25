import { db } from './db'
import { blockText, defOf } from '@/blocks/defs'

export interface Hit {
  kind: 'experiment' | 'block' | 'reagent'
  id: string
  experimentId?: string
  title: string
  context: string
  snippet: string
  score: number
}

const norm = (s: string) => s.toLowerCase()

/** 片段：命中词前后各取一段 */
export function snippet(text: string, q: string, span = 28) {
  const i = norm(text).indexOf(norm(q))
  if (i < 0) return text.slice(0, span * 2)
  const start = Math.max(0, i - span)
  const end = Math.min(text.length, i + q.length + span)
  return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '')
}

/**
 * 本地全文搜索。数据量在单人实验室级别（数千块）时直接扫描足够快，
 * 且对中文不需要分词：子串匹配天然命中复合词。
 */
export async function search(query: string, limit = 40): Promise<Hit[]> {
  const terms = query.trim().split(/\s+/).filter(Boolean)
  if (!terms.length) return []
  const match = (s: string) => terms.every((t) => norm(s).includes(norm(t)))
  const hits: Hit[] = []

  const exps = (await db.experiments.toArray()).filter((e) => !e.deletedAt)
  const byId = new Map(exps.map((e) => [e.id, e]))
  for (const e of exps) {
    const hay = `${e.title} ${e.code} ${e.tags.join(' ')}`
    if (match(hay)) hits.push({ kind: 'experiment', id: e.id, title: e.title, context: e.code, snippet: e.tags.map((t) => `#${t}`).join(' '), score: norm(e.title).includes(norm(terms[0])) ? 3 : 2 })
  }

  const blocks = await db.blocks.toArray()
  for (const b of blocks) {
    if (b.deletedAt) continue
    const e = byId.get(b.experimentId)
    if (!e) continue
    const text = blockText(b.type, b.data)
    if (!text || !match(text)) continue
    hits.push({ kind: 'block', id: b.id, experimentId: e.id, title: e.title, context: defOf(b.type)?.label ?? '内容', snippet: snippet(text, terms[0]), score: 1 })
  }

  const reagents = (await db.reagents.toArray()).filter((r) => !r.deletedAt)
  for (const r of reagents) {
    const hay = `${r.name} ${r.category} ${r.vendor} ${r.catalogNo} ${r.lot} ${r.location} ${r.note}`
    if (match(hay)) hits.push({ kind: 'reagent', id: r.id, title: r.name, context: '试剂', snippet: [r.vendor, r.catalogNo && `货号 ${r.catalogNo}`, r.lot && `批号 ${r.lot}`].filter(Boolean).join(' · '), score: 2 })
  }

  return hits.sort((a, b) => b.score - a.score).slice(0, limit)
}
