import { describe, expect, it } from 'vitest'
import { computeDDCt } from './qpcr'

const row = (sample: string, group: string, target: string, cts: (number | null)[]) => ({ id: sample + target, sample, group, target, cts })

describe('2^-ΔΔCt', () => {
  it('对照组相对表达为 1，ΔΔCt=-1 时为 2 倍', () => {
    const rows = [
      row('C1', '对照', 'GAPDH', [18, 18, 18]),
      row('C1', '对照', 'IL6', [25, 25, 25]),
      row('T1', '处理', 'GAPDH', [18, 18, 18]),
      row('T1', '处理', 'IL6', [24, 24, null]),
    ]
    const r = computeDDCt(rows, { reference: 'GAPDH', control: '对照' })
    expect(r.issues).toEqual([])
    const ctrl = r.groups.find((g) => g.group === '对照')!
    const trt = r.groups.find((g) => g.group === '处理')!
    expect(ctrl.fold).toBeCloseTo(1)
    expect(trt.fold).toBeCloseTo(2)
  })

  it('缺内参时给出提示而不是算错', () => {
    const r = computeDDCt([row('T1', '处理', 'IL6', [24])], { reference: 'GAPDH', control: '对照' })
    expect(r.results).toHaveLength(0)
    expect(r.issues[0]).toContain('缺少内参')
  })
})
