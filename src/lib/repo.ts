import { db } from './db'
import type { AuditEntry, Block, Experiment, Project, Reagent, Schedule, Snapshot, StoredFile, Template } from './types'
import { hashString, now, todayStr, uid } from './util'
import { kindOf, PROJECT_COLORS } from './kinds'
import { convert } from './units'
import { saveState } from './saveState'
import { blockUsages, cloneBlockData, defOf } from '@/blocks/defs'

export const TRASH_DAYS = 30
const POS_STEP = 1024

// ───────────────────────── 项目 ─────────────────────────

export async function createProject(name: string): Promise<Project> {
  const count = await db.projects.count()
  const p: Project = { id: uid(), name: name.trim() || '未命名项目', color: PROJECT_COLORS[count % PROJECT_COLORS.length], createdAt: now() }
  await db.projects.add(p)
  return p
}

export async function updateProject(id: string, patch: Partial<Project>) {
  await db.projects.update(id, patch)
}

/** 删除项目不删实验：实验移到「未归类」 */
export async function deleteProject(id: string) {
  await db.transaction('rw', db.projects, db.experiments, async () => {
    await db.experiments.where('projectId').equals(id).modify({ projectId: null })
    await db.projects.delete(id)
  })
}

// ───────────────────────── 实验 ─────────────────────────

export async function nextCode(kind: string, date = new Date()) {
  const prefix = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}-${kindOf(kind).short}-`
  const same = await db.experiments.where('code').startsWith(prefix).toArray()
  const max = same.reduce((m, e) => Math.max(m, Number(e.code.slice(prefix.length)) || 0), 0)
  return prefix + String(max + 1).padStart(2, '0')
}

export interface NewExperimentInput {
  title: string
  kind: string
  projectId: string | null
  tags?: string[]
  plannedDate?: string | null
  blocks?: { type: string; data: unknown }[]
  sourceId?: string | null
}

export async function createExperiment(input: NewExperimentInput): Promise<Experiment> {
  const t = now()
  const e: Experiment = {
    id: uid(),
    code: await nextCode(input.kind),
    title: input.title.trim() || '未命名实验',
    kind: input.kind,
    projectId: input.projectId,
    status: 'planned',
    tags: input.tags ?? [],
    plannedDate: input.plannedDate ?? null,
    createdAt: t,
    updatedAt: t,
    closedAt: null,
    firstClosedAt: null,
    editsAfterClose: 0,
    sourceId: input.sourceId ?? null,
  }
  const blocks: Block[] = (input.blocks ?? []).map((b, i) => ({
    id: uid(),
    experimentId: e.id,
    type: b.type,
    position: (i + 1) * POS_STEP,
    data: structuredClone(b.data),
    createdAt: t,
    updatedAt: t,
  }))
  await db.transaction('rw', db.experiments, db.blocks, db.schedules, async () => {
    await db.experiments.add(e)
    if (blocks.length) await db.blocks.bulkAdd(blocks)
    if (e.plannedDate) {
      await db.schedules.add({ id: uid(), date: e.plannedDate, time: '', title: e.title, note: '', done: false, experimentId: e.id, createdAt: t })
    }
  })
  return e
}

export async function updateExperiment(id: string, patch: Partial<Experiment>) {
  await db.experiments.update(id, { ...patch, updatedAt: now() })
}

export async function audit(experimentId: string, action: string, detail = '') {
  const a: AuditEntry = { id: uid(), experimentId, action, detail, at: now() }
  await db.audit.add(a)
}

/** 计划中 → 进行中：首次写入内容时自动推进 */
export async function touchExperiment(id: string) {
  const e = await db.experiments.get(id)
  if (!e) return
  const patch: Partial<Experiment> = { updatedAt: now() }
  if (e.status === 'planned') patch.status = 'running'
  await db.experiments.update(id, patch)
}

export async function completeExperiment(id: string) {
  const e = await db.experiments.get(id)
  if (!e) return
  const t = now()
  await db.experiments.update(id, { status: 'done', closedAt: t, firstClosedAt: e.firstClosedAt ?? t, updatedAt: t })
  await audit(id, '标记完成')
  await takeSnapshot(id, '标记完成时自动保存')
}

export async function reopenExperiment(id: string) {
  await db.experiments.update(id, { status: 'running', closedAt: null, updatedAt: now() })
  await audit(id, '重新打开')
}

export async function archiveExperiment(id: string, archived: boolean) {
  const e = await db.experiments.get(id)
  if (!e) return
  await db.experiments.update(id, { status: archived ? 'archived' : e.closedAt ? 'done' : 'running', updatedAt: now() })
  await audit(id, archived ? '归档' : '取消归档')
}

/** 已完成实验被修改：每次解锁编辑记一次 */
export async function recordEditAfterClose(id: string, what: string) {
  const e = await db.experiments.get(id)
  if (!e) return
  await db.experiments.update(id, { editsAfterClose: (e.editsAfterClose ?? 0) + 1, updatedAt: now() })
  await audit(id, '完成后修改', what)
}

export async function trashExperiment(id: string) {
  await db.experiments.update(id, { deletedAt: now() })
}

export async function restoreExperiment(id: string) {
  await db.experiments.update(id, { deletedAt: null })
}

export async function purgeExperiment(id: string) {
  await db.transaction('rw', [db.experiments, db.blocks, db.snapshots, db.usages, db.audit, db.files, db.schedules], async () => {
    const blocks = await db.blocks.where('experimentId').equals(id).toArray()
    const fileIds = blocks.flatMap((b) => collectFileIds(b))
    await db.files.bulkDelete(fileIds)
    await db.blocks.where('experimentId').equals(id).delete()
    await db.snapshots.where('experimentId').equals(id).delete()
    // 试剂已实际消耗，库存不回补；只断开引用
    await db.usages.where('experimentId').equals(id).delete()
    await db.audit.where('experimentId').equals(id).delete()
    await db.schedules.where('experimentId').equals(id).modify({ experimentId: null })
    await db.experiments.delete(id)
  })
}

export function collectFileIds(b: Block): string[] {
  const d = b.data as { items?: { fileId?: string }[] } | null
  if (b.type !== 'files' || !d?.items) return []
  return d.items.map((i) => i.fileId).filter((x): x is string => !!x)
}

/** 复制实验：保留结构与配置，清除勾选、结果与附件引用 */
export async function duplicateExperiment(id: string, title?: string) {
  const e = await db.experiments.get(id)
  if (!e) throw new Error('实验不存在')
  const blocks = await liveBlocks(id)
  return createExperiment({
    title: title ?? `${e.title}（副本）`,
    kind: e.kind,
    projectId: e.projectId,
    tags: [...e.tags],
    sourceId: e.id,
    blocks: blocks.map((b) => ({ type: b.type, data: cloneBlockData(b.type, b.data) })),
  })
}

// ───────────────────────── 块 ─────────────────────────

export async function liveBlocks(experimentId: string) {
  const all = await db.blocks.where('experimentId').equals(experimentId).toArray()
  return all.filter((b) => !b.deletedAt).sort((a, b) => a.position - b.position)
}

/** 在 afterId 之后插入（afterId 为 null 则插到最前） */
export async function insertBlock(experimentId: string, type: string, data: unknown, afterId: string | null): Promise<Block> {
  const list = await liveBlocks(experimentId)
  let position: number
  if (!list.length) position = POS_STEP
  else if (afterId === null) position = list[0].position / 2
  else {
    const i = list.findIndex((b) => b.id === afterId)
    const cur = list[i] ?? list[list.length - 1]
    const next = list[i + 1]
    position = next ? (cur.position + next.position) / 2 : cur.position + POS_STEP
  }
  const t = now()
  const b: Block = { id: uid(), experimentId, type, position, data, createdAt: t, updatedAt: t }
  await db.blocks.add(b)
  await touchExperiment(experimentId)
  if (needsRebalance(list.map((x) => x.position).concat(position))) await rebalance(experimentId)
  return b
}

function needsRebalance(ps: number[]) {
  const s = [...ps].sort((a, b) => a - b)
  for (let i = 1; i < s.length; i++) if (s[i] - s[i - 1] < 1e-6) return true
  return false
}

export async function rebalance(experimentId: string) {
  const list = await liveBlocks(experimentId)
  await db.blocks.bulkUpdate(list.map((b, i) => ({ key: b.id, changes: { position: (i + 1) * POS_STEP } })))
}

/** 按给定顺序整体重排，一个事务完成 */
export async function reorderBlocks(experimentId: string, orderedIds: string[]) {
  await db.transaction('rw', db.blocks, async () => {
    await db.blocks.bulkUpdate(orderedIds.map((id, i) => ({ key: id, changes: { position: (i + 1) * POS_STEP } })))
  })
  await touchExperiment(experimentId)
}

export async function saveBlockData(id: string, data: unknown) {
  const b = await db.blocks.get(id)
  if (!b) return
  await db.blocks.update(id, { data, updatedAt: now() })
  await touchExperiment(b.experimentId)
  if (hasUsage(b.type)) await syncBlockUsage(id)
}

export async function deleteBlock(id: string) {
  const b = await db.blocks.get(id)
  if (!b) return
  await db.blocks.update(id, { deletedAt: now() })
  if (hasUsage(b.type)) await syncBlockUsage(id)
  await touchExperiment(b.experimentId)
}

export async function restoreBlock(id: string) {
  const b = await db.blocks.get(id)
  if (!b) return
  await db.blocks.update(id, { deletedAt: null })
  if (hasUsage(b.type)) await syncBlockUsage(id)
}

export async function purgeBlock(id: string) {
  const b = await db.blocks.get(id)
  if (!b) return
  await db.files.bulkDelete(collectFileIds(b))
  await db.blocks.delete(id)
}

// ───────────────────────── 试剂与库存 ─────────────────────────

export function emptyReagent(): Omit<Reagent, 'id' | 'createdAt' | 'updatedAt'> {
  return { name: '', category: '', spec: '', vendor: '', catalogNo: '', lot: '', expiry: null, storage: '', location: '', stockQty: null, stockUnit: '', lowStock: null, note: '' }
}

export async function saveReagent(r: Partial<Reagent> & { name: string }, id?: string) {
  const t = now()
  if (id) {
    await db.reagents.update(id, { ...r, updatedAt: t })
    return id
  }
  const nr: Reagent = { ...emptyReagent(), ...r, id: uid(), createdAt: t, updatedAt: t }
  await db.reagents.add(nr)
  return nr.id
}

export async function trashReagent(id: string) {
  await db.reagents.update(id, { deletedAt: now() })
}
export async function restoreReagent(id: string) {
  await db.reagents.update(id, { deletedAt: null })
}
export async function purgeReagent(id: string) {
  await db.transaction('rw', db.reagents, db.usages, async () => {
    await db.usages.where('reagentId').equals(id).delete()
    await db.reagents.delete(id)
  })
}

export const hasUsage = (type: string) => !!defOf(type)?.usages

/**
 * 让某个「试剂消耗」块的库存记账与块内容一致：先把旧扣减全部归还，再按当前内容重新扣减。
 * 幂等：同样的内容重复调用，库存不变。块被删除时等价于全部归还。
 */
export async function syncBlockUsage(blockId: string) {
  await db.transaction('rw', db.blocks, db.usages, db.reagents, async () => {
    const block = await db.blocks.get(blockId)
    const old = await db.usages.where('blockId').equals(blockId).toArray()
    for (const u of old) {
      const r = await db.reagents.get(u.reagentId)
      if (r && r.stockQty !== null && u.deducted) await db.reagents.update(r.id, { stockQty: round(r.stockQty + u.deducted) })
    }
    await db.usages.where('blockId').equals(blockId).delete()
    if (!block || block.deletedAt) return
    const items = blockUsages(block.type, block.data)
    const t = now()
    for (const it of items) {
      const r = await db.reagents.get(it.reagentId)
      if (!r) continue
      let deducted = 0
      if (r.stockQty !== null) {
        const c = convert(it.amount, it.unit || r.stockUnit, r.stockUnit)
        if (c !== null) {
          deducted = round(c)
          await db.reagents.update(r.id, { stockQty: round(r.stockQty - deducted) })
        }
      }
      await db.usages.add({ id: uid(), reagentId: r.id, experimentId: block.experimentId, blockId, itemId: it.itemId, amount: it.amount, unit: it.unit, deducted, createdAt: t })
    }
  })
}

const round = (n: number) => Math.round(n * 1e6) / 1e6

// ───────────────────────── 日程 ─────────────────────────

export async function addSchedule(s: Omit<Schedule, 'id' | 'createdAt'>) {
  const id = uid()
  await db.schedules.add({ ...s, id, createdAt: now() })
  return id
}
export async function updateSchedule(id: string, patch: Partial<Schedule>) {
  await db.schedules.update(id, patch)
}
export async function deleteSchedule(id: string) {
  await db.schedules.delete(id)
}

// ───────────────────────── 模板 ─────────────────────────

export async function saveAsTemplate(experimentId: string, name: string, description = '') {
  const e = await db.experiments.get(experimentId)
  if (!e) return
  const blocks = await liveBlocks(experimentId)
  const t: Template = {
    id: uid(),
    name: name.trim() || e.title,
    kind: e.kind,
    description,
    blocks: blocks.map((b) => ({ type: b.type, data: cloneBlockData(b.type, b.data) })),
    createdAt: now(),
  }
  await db.templates.add(t)
  return t
}

// ───────────────────────── 快照 ─────────────────────────

export async function takeSnapshot(experimentId: string, reason: string): Promise<Snapshot | null> {
  const experiment = await db.experiments.get(experimentId)
  if (!experiment) return null
  const blocks = await liveBlocks(experimentId)
  const content = JSON.stringify({ t: experiment.title, tags: experiment.tags, b: blocks.map((b) => [b.type, b.data]) })
  const hash = hashString(content)
  const last = await db.snapshots.where('experimentId').equals(experimentId).reverse().sortBy('createdAt')
  if (last[0]?.hash === hash) return null
  const s: Snapshot = { id: uid(), experimentId, createdAt: now(), reason, hash, blockCount: blocks.length, payload: structuredClone({ experiment, blocks }) }
  await db.snapshots.add(s)
  return s
}

/** 每天第一次打开有内容的实验时留一份 */
export async function dailySnapshot(experimentId: string) {
  const list = await db.snapshots.where('experimentId').equals(experimentId).toArray()
  const today = todayStr()
  if (list.some((s) => todayStr(new Date(s.createdAt)) === today)) return
  const blocks = await liveBlocks(experimentId)
  if (!blocks.length) return
  await takeSnapshot(experimentId, '每日自动保存')
}

/** 用快照覆盖当前内容；覆盖前先给当前状态留一份 */
export async function restoreSnapshotInPlace(snapshotId: string) {
  const s = await db.snapshots.get(snapshotId)
  if (!s) return
  await takeSnapshot(s.experimentId, '恢复旧版本前自动保存')
  const t = now()
  await db.transaction('rw', db.blocks, db.experiments, async () => {
    const cur = await liveBlocks(s.experimentId)
    await db.blocks.bulkUpdate(cur.map((b) => ({ key: b.id, changes: { deletedAt: t } })))
    await db.blocks.bulkPut(s.payload.blocks.map((b) => ({ ...structuredClone(b), id: uid(), createdAt: t, updatedAt: t, deletedAt: null })))
    await db.experiments.update(s.experimentId, { title: s.payload.experiment.title, tags: s.payload.experiment.tags, updatedAt: t })
  })
  await audit(s.experimentId, '恢复旧版本', new Date(s.createdAt).toLocaleString('zh-CN'))
  for (const b of await liveBlocks(s.experimentId)) if (hasUsage(b.type)) await syncBlockUsage(b.id)
  for (const b of await db.blocks.where('experimentId').equals(s.experimentId).toArray())
    if (hasUsage(b.type) && b.deletedAt) await syncBlockUsage(b.id)
}

export async function restoreSnapshotAsNew(snapshotId: string) {
  const s = await db.snapshots.get(snapshotId)
  if (!s) return null
  const e = s.payload.experiment
  return createExperiment({
    title: `${e.title}（恢复自 ${new Date(s.createdAt).toLocaleDateString('zh-CN')}）`,
    kind: e.kind,
    projectId: e.projectId,
    tags: [...e.tags],
    sourceId: e.id,
    blocks: s.payload.blocks.map((b) => ({ type: b.type, data: b.data })),
  })
}

// ───────────────────────── 文件 ─────────────────────────

export async function storeFile(file: File | Blob, name: string): Promise<StoredFile> {
  const f: StoredFile = { id: uid(), name, mime: file.type || 'application/octet-stream', size: file.size, blob: file, createdAt: now() }
  await db.files.add(f)
  return f
}

// ───────────────────────── 回收站 ─────────────────────────

export async function purgeExpiredTrash(days = TRASH_DAYS) {
  const cutoff = now() - days * 86400000
  const exps = (await db.experiments.toArray()).filter((e) => e.deletedAt && e.deletedAt < cutoff)
  for (const e of exps) await purgeExperiment(e.id)
  const blocks = (await db.blocks.toArray()).filter((b) => b.deletedAt && b.deletedAt < cutoff)
  for (const b of blocks) await purgeBlock(b.id)
  const reagents = (await db.reagents.toArray()).filter((r) => r.deletedAt && r.deletedAt < cutoff)
  for (const r of reagents) await purgeReagent(r.id)
  return exps.length + blocks.length + reagents.length
}

// ───────────────────────── 杂项 ─────────────────────────

/** 块内复制：保留内容，但扣减勾选类状态清空，避免重复扣库存 */
export function cloneForDuplicate(b: Block) {
  return hasUsage(b.type) ? cloneBlockData(b.type, b.data) : structuredClone(b.data)
}

export async function saveStateFlush() {
  await saveState.flushAll()
}
