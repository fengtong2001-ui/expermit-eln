import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import * as repo from './repo'

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('实验编号', () => {
  it('同日同类型递增', async () => {
    const a = await repo.createExperiment({ title: 'a', kind: 'wb', projectId: null })
    const b = await repo.createExperiment({ title: 'b', kind: 'wb', projectId: null })
    const c = await repo.createExperiment({ title: 'c', kind: 'qpcr', projectId: null })
    expect(a.code).toMatch(/^\d{4}-\d{4}-WB-01$/)
    expect(b.code).toMatch(/-WB-02$/)
    expect(c.code).toMatch(/-QP-01$/)
  })
})

describe('块', () => {
  it('插入位置与删除撤销', async () => {
    const e = await repo.createExperiment({ title: 'x', kind: 'general', projectId: null })
    const b1 = await repo.insertBlock(e.id, 'text', { html: '1' }, null)
    const b3 = await repo.insertBlock(e.id, 'text', { html: '3' }, b1.id)
    await repo.insertBlock(e.id, 'text', { html: '2' }, b1.id)
    await repo.insertBlock(e.id, 'text', { html: '0' }, null)
    expect((await repo.liveBlocks(e.id)).map((b) => (b.data as { html: string }).html)).toEqual(['0', '1', '2', '3'])
    await repo.deleteBlock(b3.id)
    expect(await repo.liveBlocks(e.id)).toHaveLength(3)
    await repo.restoreBlock(b3.id)
    expect(await repo.liveBlocks(e.id)).toHaveLength(4)
  })

  it('首次写入把计划中推进为进行中', async () => {
    const e = await repo.createExperiment({ title: 'x', kind: 'general', projectId: null })
    expect(e.status).toBe('planned')
    await repo.insertBlock(e.id, 'text', { html: '' }, null)
    expect((await db.experiments.get(e.id))!.status).toBe('running')
  })

  it('连续对半插入后自动重排，顺序不乱', async () => {
    const e = await repo.createExperiment({ title: 'x', kind: 'general', projectId: null })
    const first = await repo.insertBlock(e.id, 'text', { html: 'a' }, null)
    await repo.insertBlock(e.id, 'text', { html: 'z' }, first.id)
    let after = first.id
    for (let i = 0; i < 60; i++) after = (await repo.insertBlock(e.id, 'text', { html: `m${i}` }, after)).id
    const list = await repo.liveBlocks(e.id)
    expect((list[0].data as { html: string }).html).toBe('a')
    expect((list[list.length - 1].data as { html: string }).html).toBe('z')
    expect((list[60].data as { html: string }).html).toBe('m59')
  })
})

describe('完成与快照', () => {
  it('标记完成自动留快照，内容未变不重复留', async () => {
    const e = await repo.createExperiment({ title: 'x', kind: 'general', projectId: null })
    await repo.insertBlock(e.id, 'text', { html: 'hello' }, null)
    await repo.completeExperiment(e.id)
    const done = (await db.experiments.get(e.id))!
    expect(done.status).toBe('done')
    expect(done.firstClosedAt).not.toBeNull()
    expect(await db.snapshots.count()).toBe(1)
    await repo.reopenExperiment(e.id)
    await repo.completeExperiment(e.id)
    expect(await db.snapshots.count()).toBe(1)
    expect((await db.experiments.get(e.id))!.firstClosedAt).toBe(done.firstClosedAt)
  })

  it('原地恢复前先保存当前版本', async () => {
    const e = await repo.createExperiment({ title: 'v1', kind: 'general', projectId: null })
    const b = await repo.insertBlock(e.id, 'text', { html: 'old' }, null)
    const s = (await repo.takeSnapshot(e.id, '手动'))!
    await repo.saveBlockData(b.id, { html: 'new' })
    await repo.restoreSnapshotInPlace(s.id)
    const [cur] = await repo.liveBlocks(e.id)
    expect((cur.data as { html: string }).html).toBe('old')
    expect(await db.snapshots.count()).toBe(2)
  })
})

describe('回收站', () => {
  it('超期清理，未超期保留', async () => {
    const a = await repo.createExperiment({ title: 'a', kind: 'general', projectId: null })
    const b = await repo.createExperiment({ title: 'b', kind: 'general', projectId: null })
    await db.experiments.update(a.id, { deletedAt: Date.now() - 31 * 86400000 })
    await repo.trashExperiment(b.id)
    expect(await repo.purgeExpiredTrash()).toBe(1)
    expect(await db.experiments.get(a.id)).toBeUndefined()
    expect(await db.experiments.get(b.id)).toBeDefined()
  })
})
