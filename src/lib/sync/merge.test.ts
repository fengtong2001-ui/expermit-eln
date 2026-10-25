import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db'
import * as repo from '../repo'
import { mergeById, mergeDoc, pruneTombstones } from './merge'
import { exportDoc } from './engine'
import type { Block } from '../types'

type AnyRow = { id: string; updatedAt?: number; deletedAt?: number | null; [k: string]: unknown }
const row = (id: string, updatedAt: number, extra: Record<string, unknown> = {}) => ({ id, updatedAt, ...extra }) as AnyRow

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('行级合并', () => {
  it('同 id 取新的；远端独有算拉取；本地独有保留', () => {
    const stats = { pulled: 0, pushedCandidates: 0, conflictsRemoteWon: 0, droppedTombstones: 0 }
    const merged = mergeById(
      [row('a', 100), row('b', 100)],
      [row('a', 200), row('c', 100)],
      stats,
    )
    expect(merged).toHaveLength(3)
    expect(merged.find((x) => x.id === 'a')!.updatedAt).toBe(200)
    expect(stats.pulled).toBe(2) // a 远端新 + c 远端独有
  })

  it('墓碑比对方修改新则仍然删除', () => {
    const stats = { pulled: 0, pushedCandidates: 0, conflictsRemoteWon: 0, droppedTombstones: 0 }
    const merged = mergeById(
      [row('a', 300, { deletedAt: 300 })],
      [row('a', 100, { deletedAt: null })],
      stats,
    )
    expect(merged[0].deletedAt).toBe(300)
  })

  it('超期墓碑被清掉', () => {
    const stats = { pulled: 0, pushedCandidates: 0, conflictsRemoteWon: 0, droppedTombstones: 0 }
    const now = Date.now()
    const kept = pruneTombstones([row('a', now - 40 * 86400000, { deletedAt: now - 40 * 86400000 }), row('b', now - 1000, { deletedAt: now - 1000 }), row('c', now - 1000)], now, 30, stats)
    expect(kept.map((x) => x.id)).toEqual(['b', 'c'])
    expect(stats.droppedTombstones).toBe(1)
  })
})

describe('重排不刷无关块时间戳', () => {
  it('moveBlockRange 只改区间内块', async () => {
    const e = await repo.createExperiment({ title: 'x', kind: 'general', projectId: null })
    let after: string | null = null
    for (let i = 0; i < 5; i++) after = (await repo.insertBlock(e.id, 'text', { html: String(i) }, after)).id
    const before = await repo.liveBlocks(e.id)
    const stamps = new Map(before.map((b) => [b.id, b.updatedAt]))
    await new Promise((r) => setTimeout(r, 5))
    await repo.moveBlockRange(e.id, 1, 3) // 把第 2 块往后移
    const moved = await repo.liveBlocks(e.id)
    expect(moved.map((b) => (b.data as { html: string }).html)).toEqual(['0', '2', '3', '1', '4'])
    const changed = moved.filter((b) => b.updatedAt !== stamps.get(b.id)).map((b) => (b.data as { html: string }).html)
    expect(changed.sort()).toEqual(['1', '2', '3']) // 只动了区间内
  })

  it('reorderBlocks 达成目标顺序（拖拽语义）', async () => {
    const e = await repo.createExperiment({ title: 'x', kind: 'general', projectId: null })
    let after: string | null = null
    for (let i = 0; i < 4; i++) after = (await repo.insertBlock(e.id, 'text', { html: String(i) }, after)).id
    const ids = (await repo.liveBlocks(e.id)).map((b) => b.id)
    await repo.reorderBlocks(e.id, [ids[3], ids[0], ids[1], ids[2]]) // 把最后一块拖到最前
    expect((await repo.liveBlocks(e.id)).map((b) => (b.data as { html: string }).html)).toEqual(['3', '0', '1', '2'])
  })
})

describe('同步导出', () => {
  it('导出 → 空库合并 → 数据完整（换新设备场景）', async () => {
    await repo.saveReagent({ name: 'FBS', stockQty: 2, stockUnit: '瓶' })
    const e = await repo.createExperiment({ title: '换机', kind: 'wb', projectId: null })
    await repo.insertBlock(e.id, 'text', { html: '内容' }, null)
    const doc = await exportDoc('设备A')
    // 清空本地 = 新设备
    await Promise.all(db.tables.map((t) => t.clear()))
    const empty = await exportDoc('设备B')
    const { doc: merged } = mergeDoc(empty, doc, { now: Date.now(), trashDays: 30 })
    expect(merged.tables.experiments.map((x) => x.title)).toEqual(['换机'])
    expect(merged.tables.reagents[0].name).toBe('FBS')
    const blocks = merged.tables.blocks as Block[]
    expect(blocks).toHaveLength(1)
  })
})
