import { describe, expect, it } from 'vitest'
import { BLOCK_ORDER, DEFS, antibodyMicroliters, blockText, cloneBlockData } from './defs'
import { EDITORS } from './registry'

describe('内容块定义', () => {
  it('每种块都注册了编辑器（防止「插件未注册」）', () => {
    for (const t of BLOCK_ORDER) {
      expect(EDITORS[t], t).toBeTypeOf('function')
      expect(DEFS[t].create(), t).toBeTruthy()
    }
  })
  it('复制时清掉运行痕迹', () => {
    const p = DEFS.protocol.create() as { steps: { done: boolean; note: string }[] }
    p.steps[0].done = true
    p.steps[0].note = '偏差'
    const c = cloneBlockData('protocol', p) as typeof p
    expect(c.steps[0].done).toBe(false)
    expect(c.steps[0].note).toBe('')
    expect(cloneBlockData('files', { items: [{ fileId: 'x' }] })).toEqual({ items: [] })
  })
  it('文本块搜索文本去掉 HTML', () => {
    expect(blockText('text', { html: '<h2>目的</h2><p>验证 &amp; 观察</p>' })).toBe('目的 验证 & 观察')
  })
  it('抗体原液用量 = 工作液体积 / 稀释倍数', () => {
    expect(antibodyMicroliters({ dilution: 1000, volumeMl: 10 })).toBe(10)
    expect(antibodyMicroliters({ dilution: 5000, volumeMl: 15 })).toBe(3)
    expect(antibodyMicroliters({ dilution: null, volumeMl: 10 })).toBeNull()
  })
})
