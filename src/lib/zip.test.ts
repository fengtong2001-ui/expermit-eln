import { beforeEach, describe, expect, it } from 'vitest'
import { crc32, unzip, zip } from './zip'
import { db } from './db'
import { exportAll, importAll } from './exporter'
import * as repo from './repo'

describe('zip', () => {
  it('CRC32 与标准值一致', () => {
    expect(crc32(new TextEncoder().encode('123456789')).toString(16)).toBe('cbf43926')
  })
  it('写入后能原样读回，中文路径不乱码', () => {
    const out = zip([
      { path: '实验记录.md', data: '# 你好' },
      { path: 'a/b.bin', data: new Uint8Array([1, 2, 3]) },
    ])
    const m = unzip(out)
    expect(new TextDecoder().decode(m.get('实验记录.md')!)).toBe('# 你好')
    expect([...m.get('a/b.bin')!]).toEqual([1, 2, 3])
  })
})

describe('全量备份', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()))
  })
  it('导出再导入（替换）后数据一致', async () => {
    const e = await repo.createExperiment({ title: '备份测试', kind: 'general', projectId: null, tags: ['x'] })
    await repo.insertBlock(e.id, 'text', { html: '<p>内容</p>' }, null)
    await repo.saveReagent({ name: 'PBS', stockQty: 5, stockUnit: 'mL' })
    const buf = await exportAll()
    await Promise.all(db.tables.map((t) => t.clear()))
    const counts = await importAll(buf, 'replace')
    expect(counts.experiments).toBe(1)
    const back = await db.experiments.get(e.id)
    expect(back?.title).toBe('备份测试')
    expect((await repo.liveBlocks(e.id))[0].data).toEqual({ html: '<p>内容</p>' })
    expect((await db.reagents.toArray())[0].stockQty).toBe(5)
  })
  it('不是备份文件时给出明确错误', async () => {
    await expect(importAll(zip([{ path: 'x.txt', data: 'x' }]), 'replace')).rejects.toThrow('不是 ExPermit 的备份文件')
  })
})
