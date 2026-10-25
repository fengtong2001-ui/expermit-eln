import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import * as repo from './repo'
import { newAntibody, newReagentLine } from '@/blocks/defs'

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

async function mkReagent(qty: number | null, unit: string) {
  return repo.saveReagent({ name: 'PBS', stockQty: qty, stockUnit: unit })
}

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

describe('库存扣减', () => {
  it('勾选后扣减，修改用量重新结算，删除块归还', async () => {
    const rid = await mkReagent(100, 'mL')
    const e = await repo.createExperiment({ title: 'x', kind: 'general', projectId: null })
    const line = { ...newReagentLine(), reagentId: rid, name: 'PBS', amount: 500, unit: 'µL', used: true }
    const b = await repo.insertBlock(e.id, 'reagents', { items: [line] }, null)
    await repo.saveBlockData(b.id, { items: [line] })
    expect((await db.reagents.get(rid))!.stockQty).toBe(99.5)
    // 重复保存同样内容：幂等
    await repo.saveBlockData(b.id, { items: [line] })
    expect((await db.reagents.get(rid))!.stockQty).toBe(99.5)
    await repo.saveBlockData(b.id, { items: [{ ...line, amount: 2, unit: 'mL' }] })
    expect((await db.reagents.get(rid))!.stockQty).toBe(98)
    await repo.deleteBlock(b.id)
    expect((await db.reagents.get(rid))!.stockQty).toBe(100)
    await repo.restoreBlock(b.id)
    expect((await db.reagents.get(rid))!.stockQty).toBe(98)
  })

  it('未勾选不扣；单位不可换算时只记录不扣', async () => {
    const rid = await mkReagent(3, '瓶')
    const e = await repo.createExperiment({ title: 'x', kind: 'general', projectId: null })
    const b = await repo.insertBlock(e.id, 'reagents', { items: [] }, null)
    const line = { ...newReagentLine(), reagentId: rid, amount: 5, unit: 'mL', used: false }
    await repo.saveBlockData(b.id, { items: [line] })
    expect((await db.reagents.get(rid))!.stockQty).toBe(3)
    await repo.saveBlockData(b.id, { items: [{ ...line, used: true }] })
    expect((await db.reagents.get(rid))!.stockQty).toBe(3)
    expect(await db.usages.where('reagentId').equals(rid).count()).toBe(1)
  })

  it('抗体按稀释比计算原液用量并扣减', async () => {
    const rid = await mkReagent(100, 'µL')
    const e = await repo.createExperiment({ title: 'x', kind: 'wb', projectId: null })
    const ab = { ...newAntibody('一抗'), reagentId: rid, dilution: 1000, volumeMl: 10, used: true }
    const b = await repo.insertBlock(e.id, 'antibodies', { items: [ab] }, null)
    await repo.saveBlockData(b.id, { items: [ab] })
    expect((await db.reagents.get(rid))!.stockQty).toBe(90)
  })

  it('复制实验不复制扣减勾选', async () => {
    const rid = await mkReagent(10, 'mL')
    const e = await repo.createExperiment({ title: 'x', kind: 'general', projectId: null })
    const line = { ...newReagentLine(), reagentId: rid, amount: 1, unit: 'mL', used: true }
    const b = await repo.insertBlock(e.id, 'reagents', { items: [line] }, null)
    await repo.saveBlockData(b.id, { items: [line] })
    const copy = await repo.duplicateExperiment(e.id)
    const [cb] = await repo.liveBlocks(copy.id)
    expect((cb.data as { items: { used: boolean }[] }).items[0].used).toBe(false)
    expect((await db.reagents.get(rid))!.stockQty).toBe(9)
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
