import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import * as repo from './repo'
import { search, snippet } from './search'

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('搜索', () => {
  it('中文子串命中实验标题、块内容与试剂，已删除的不出现', async () => {
    const e = await repo.createExperiment({ title: 'mTOR 磷酸化检测', kind: 'wb', projectId: null, tags: ['HeLa'] })
    const b = await repo.insertBlock(e.id, 'text', { html: '<p>雷帕霉素处理后磷酸化水平下降</p>' }, null)
    await repo.saveReagent({ name: '雷帕霉素', catalogNo: 'R-001' })
    const hits = await search('雷帕霉素')
    expect(hits.map((h) => h.kind).sort()).toEqual(['block', 'reagent'])
    expect((await search('磷酸化')).some((h) => h.kind === 'experiment')).toBe(true)
    expect((await search('hela')).some((h) => h.id === e.id)).toBe(true)
    await repo.deleteBlock(b.id)
    expect((await search('雷帕霉素')).map((h) => h.kind)).toEqual(['reagent'])
  })
  it('片段围绕命中词', () => {
    expect(snippet('a'.repeat(50) + '命中' + 'b'.repeat(50), '命中', 5)).toBe('…aaaaa命中bbbbb…')
  })
})
