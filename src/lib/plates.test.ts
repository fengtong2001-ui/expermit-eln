import { describe, expect, it } from 'vitest'
import { allWells, plateOf, wellId, wellPos, wellsInRect } from './plates'

describe('孔板', () => {
  it('六孔板顺序编号，横放 2×3', () => {
    const p = plateOf('p6')
    expect(allWells(p)).toEqual(['1', '2', '3', '4', '5', '6'])
    expect(wellPos(p, '4')).toEqual({ r: 1, c: 0 })
  })
  it('96 孔板 8×12，A1–H12', () => {
    const p = plateOf('p96')
    const w = allWells(p)
    expect(w).toHaveLength(96)
    expect(w[0]).toBe('A1')
    expect(w[95]).toBe('H12')
    expect(wellId(p, 1, 2)).toBe('B3')
  })
  it('矩形选区与方向无关', () => {
    const p = plateOf('p24')
    expect(wellsInRect(p, 'B3', 'A2').sort()).toEqual(['A2', 'A3', 'B2', 'B3'])
  })
})
