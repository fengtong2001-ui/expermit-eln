import { describe, expect, it } from 'vitest'
import { convert } from './units'

describe('单位换算', () => {
  it('同量纲换算', () => {
    expect(convert(500, 'µL', 'mL')).toBe(0.5)
    expect(convert(2, 'mL', 'uL')).toBe(2000)
    expect(convert(1, 'g', 'mg')).toBe(1000)
  })
  it('跨量纲或未知单位返回 null', () => {
    expect(convert(1, 'mL', 'mg')).toBeNull()
    expect(convert(1, '瓶', 'mL')).toBeNull()
    expect(convert(3, '瓶', '瓶')).toBe(3)
  })
})
