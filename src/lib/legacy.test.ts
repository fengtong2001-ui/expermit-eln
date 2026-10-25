import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { importLegacy } from './legacy'
import { liveBlocks } from './repo'

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('旧版 ExPermit 导入', () => {
  it('实验、孔板、试剂、日程都能导入，试剂消耗不重复扣库存', async () => {
    const r = await importLegacy({
      experiments: [
        { id: 1, title: 'CCK-8', objective: '测毒性', protocol: '', status: '进行中', tags: 'cck8, HeLa', equipment: '6孔板', wells: JSON.stringify({ '1': { name: 'HeLa', reagents: 'DOX 1µM', conditions: '24h' } }) },
      ],
      reagents: [{ id: 7, name: 'GAPDH 兔', stock_qty: 3, stock_unit: '支', lot_no: 'L1' }],
      schedules: [{ id: 1, title: '换液', date: '2026-10-25', start_time: '09:00', status: '已完成', experiment_id: 1 }],
      usage: [{ reagent_id: 7, experiment_id: 1, amount: 1, unit: '支' }],
    })
    expect(r).toEqual({ experiments: 1, reagents: 1, schedules: 1 })
    const e = (await db.experiments.toArray())[0]
    expect(e.tags).toEqual(['cck8', 'HeLa'])
    expect(e.status).toBe('running')
    const blocks = await liveBlocks(e.id)
    const plate = blocks.find((b) => b.type === 'plate')!.data as { plateId: string; wells: Record<string, { sample: string; treatment: string }> }
    expect(plate.plateId).toBe('p6')
    expect(plate.wells['1']).toMatchObject({ sample: 'HeLa', treatment: 'DOX 1µM' })
    const reagent = (await db.reagents.toArray())[0]
    expect(reagent.stockQty).toBe(3)
    const s = (await db.schedules.toArray())[0]
    expect(s.experimentId).toBe(e.id)
    expect(s.done).toBe(true)
  })
})
