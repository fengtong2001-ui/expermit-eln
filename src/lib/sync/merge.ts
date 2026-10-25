// 行级合并：同一行取 updatedAt 新的一方；删除是墓碑（deletedAt + updatedAt），
// 墓碑比对方的修改时间新就仍然删除。超过保留期的墓碑在导出/合并时都丢弃，
// 这样两边最终都会把彻底删除的东西清掉。
import type { AuditEntry, Block, Experiment, Project, Reagent, Schedule, Snapshot, Template } from '../types'

export interface SyncDoc {
  v: 1
  exportedAt: number
  device: string
  tables: {
    projects: Project[]
    experiments: Experiment[]
    blocks: Block[]
    reagents: Reagent[]
    schedules: Schedule[]
    templates: Template[]
    snapshots: Snapshot[]
    audit: AuditEntry[]
  }
  files: Record<string, { name: string; mime: string; size: number; createdAt: number }>
}

export interface MergeStats {
  pulled: number // 从远端接受的行
  pushedCandidates: number // 本地比远端新的行
  conflictsRemoteWon: number // 同一行两边都改过，远端更新
  droppedTombstones: number
}

const ts = (x: unknown) => (x as { updatedAt?: number } | undefined | null)?.updatedAt ?? 0

/** LWW 行合并。返回 [mergedRows, stats]；prefer='local' 用于同时间戳不一致时保持确定性 */
export function mergeById<T extends { id: string }>(local: T[], remote: T[], stats: MergeStats, idKey?: (r: T) => string): T[] {
  const key = idKey ?? ((r: T) => r.id)
  const out = new Map<string, { row: T; from: 'local' | 'remote' }>()
  for (const r of local) out.set(key(r), { row: r, from: 'local' })
  for (const r of remote) {
    const k = key(r)
    const cur = out.get(k)
    if (!cur) {
      out.set(k, { row: r, from: 'remote' })
      stats.pulled++
      continue
    }
    const lt = ts(cur.row as { updatedAt?: number })
    const rt = ts(r)
    if (rt > lt) {
      out.set(k, { row: r, from: 'remote' })
      stats.pulled++
      if (lt > 0 && differs(cur.row, r)) stats.conflictsRemoteWon++
    }
    // 本地新或相同：保留本地；本地比远端旧数据新时计入 push 候选
    else if (lt > rt) stats.pushedCandidates++
  }
  return [...out.values()].map((x) => x.row)
}

export function differs(a: unknown, b: unknown): boolean {
  const ka = JSON.stringify(sortKeys(a))
  const kb = JSON.stringify(sortKeys(b))
  return ka !== kb
}

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys)
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    const r: Record<string, unknown> = {}
    for (const k of Object.keys(o).sort()) {
      if (k === 'updatedAt') continue
      r[k] = sortKeys(o[k])
    }
    return r
  }
  return v
}

export function pruneTombstones<T extends { deletedAt?: number | null }>(rows: T[], now: number, days: number, stats: MergeStats): T[] {
  const cutoff = now - days * 86400000
  const kept = rows.filter((r) => !r.deletedAt || r.deletedAt > cutoff)
  stats.droppedTombstones += rows.length - kept.length
  return kept
}

export function mergeDoc(local: SyncDoc, remote: SyncDoc, opts: { now: number; trashDays: number }): { doc: SyncDoc; stats: MergeStats } {
  const stats: MergeStats = { pulled: 0, pushedCandidates: 0, conflictsRemoteWon: 0, droppedTombstones: 0 }
  const t = {
    projects: mergeById(local.tables.projects, remote.tables.projects, stats),
    experiments: mergeById(local.tables.experiments, remote.tables.experiments, stats),
    blocks: mergeById(local.tables.blocks, remote.tables.blocks, stats),
    reagents: mergeById(local.tables.reagents, remote.tables.reagents, stats),
    schedules: mergeById(local.tables.schedules, remote.tables.schedules, stats),
    templates: mergeById(local.tables.templates, remote.tables.templates, stats),
    // 快照与审计只增不改，并集即可
    snapshots: mergeById(local.tables.snapshots, remote.tables.snapshots, stats),
    audit: mergeById(local.tables.audit, remote.tables.audit, stats),
  }
  for (const k of ['projects', 'experiments', 'blocks', 'reagents', 'schedules', 'templates'] as const) {
    const keep = new Set((t[k] as { id: string; deletedAt?: number | null }[]).filter((r) => !r.deletedAt || r.deletedAt > opts.now - opts.trashDays * 86400000).map((r) => r.id))
    t[k] = (t[k] as { id: string; deletedAt?: number | null }[]).filter((r) => keep.has(r.id)) as never
  }
  const files = { ...remote.files, ...local.files }
  return {
    doc: { v: 1, exportedAt: opts.now, device: local.device, tables: t, files },
    stats,
  }
}
