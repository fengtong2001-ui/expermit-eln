import { describe, expect, it } from 'vitest'
import {
  computeBca,
  cvPct,
  mean,
  sd,
  toUgPerUl,
  type BcaSampleRow,
  type BcaSettings,
  type BcaStandardRow,
} from '../lib/bca'

const baseSettings: BcaSettings = {
  wavelengthNm: 562,
  unit: 'µg/mL',
  replicates: 3,
  subtractBlank: true,
  fitModel: 'linear',
  cvThreshold: 10,
  wbEnabled: true,
  wbTargetMassUg: 20,
  wbTotalVolUl: 40,
  wbBufferX: 5,
}

const pierceStandards: BcaStandardRow[] = [
  { id: 's1', label: 'Std A', conc: 2000, ods: [1.892, 1.910, 1.898], enabled: true },
  { id: 's2', label: 'Std B', conc: 1500, ods: [1.485, 1.472, 1.480], enabled: true },
  { id: 's3', label: 'Std C', conc: 1000, ods: [1.032, 1.045, 1.037], enabled: true },
  { id: 's4', label: 'Std D', conc: 750, ods: [0.798, 0.790, 0.802], enabled: true },
  { id: 's5', label: 'Std E', conc: 500, ods: [0.545, 0.552, 0.547], enabled: true },
  { id: 's6', label: 'Std F', conc: 250, ods: [0.292, 0.288, 0.293], enabled: true },
  { id: 's7', label: 'Std G', conc: 125, ods: [0.165, 0.169, 0.164], enabled: true },
  { id: 's8', label: 'Std H', conc: 25, ods: [0.068, 0.066, 0.067], enabled: true },
  { id: 's9', label: 'Blank', conc: 0, ods: [0.042, 0.044, 0.040], enabled: true },
]

describe('BCA 蛋白定量与标准曲线核心算法', () => {
  it('准确计算复孔均值、标准差与变异系数 CV%', () => {
    const xs = [0.640, 0.646, 0.643]
    expect(mean(xs)).toBeCloseTo(0.643, 10)
    expect(sd(xs)).toBeCloseTo(0.003, 10)
    expect(cvPct(xs)).toBeCloseTo((0.003 / 0.643) * 100, 10)
  })

  it('准确扣除空白孔并进行 OLS 线性回归与未知样品反算', () => {
    const samples: BcaSampleRow[] = [
      { id: 'u1', sample: 'Control-1', group: 'NC', dilution: 5, ods: [0.640, 0.646, 0.643] },
    ]
    const res = computeBca(pierceStandards, samples, baseSettings)
    expect(res.blankOd).toBeCloseTo(0.042, 8)
    expect(res.fit).not.toBeNull()
    expect(res.fit!.r2).toBeGreaterThan(0.995)

    // 验证反算公式与正向公式严格互逆
    const u1 = res.samples[0]
    const predictedNetOd = res.fit!.predictNetOd(u1.wellConc)
    expect(predictedNetOd).toBeCloseTo(u1.netOd, 10)
    expect(u1.stockConc).toBeCloseTo(u1.wellConc * 5, 10)

    // 验证 WB 上样配制体积守恒：样品体积 + 裂解液补齐体积 + Loading Buffer 体积 = 总体积
    expect(u1.wbBufferVolUl).toBeCloseTo(8.0, 10)
    expect(u1.wbSampleVolUl * u1.stockConcUgPerUl).toBeCloseTo(20.0, 10)
    expect(u1.wbSampleVolUl + u1.wbDiluentVolUl + u1.wbBufferVolUl).toBeCloseTo(40.0, 10)
  })

  it('二次多项式回归 (y = ax² + bx + c) 数值稳定且正根反算零偏差', () => {
    const samples: BcaSampleRow[] = [
      { id: 'u1', sample: 'Treat-1', group: 'KO', dilution: 5, ods: [0.640, 0.646, 0.643] },
    ]
    const res = computeBca(pierceStandards, samples, {
      ...baseSettings,
      fitModel: 'quadratic',
    })
    expect(res.fit).not.toBeNull()
    expect(res.fit!.r2).toBeGreaterThan(0.999)

    // 二次拟合反算浓度代入二次方程应精确还原样品 Net OD
    const u1 = res.samples[0]
    const reconstructedOd = res.fit!.predictNetOd(u1.wellConc)
    expect(reconstructedOd).toBeCloseTo(u1.netOd, 10)
  })

  it('准确识别超量程、高 CV% 与 WB 上样体积溢出异常', () => {
    const samples: BcaSampleRow[] = [
      // 高 CV% 样品
      { id: 'u_cv', sample: 'High-CV', group: 'Test', dilution: 1, ods: [0.35, 0.55, 0.45] },
      // 浓度过低导致 20 µg 上样所需体积超过 32 µL (40 - 8)
      { id: 'u_low', sample: 'Low-Conc', group: 'Test', dilution: 1, ods: [0.30, 0.31, 0.305] },
      // 超出最高标曲浓度 2000 µg/mL
      { id: 'u_high', sample: 'Over-Range', group: 'Test', dilution: 2, ods: [2.15, 2.18, 2.16] },
    ]
    const res = computeBca(pierceStandards, samples, baseSettings)
    expect(res.samples[0].highCv).toBe(true)
    expect(res.samples[1].wbVolumeOverflow).toBe(true)
    expect(res.samples[2].flag).toBe('above_range')
  })

  it('单位换算 (µg/mL, mg/mL, µg/µL) 精确无误', () => {
    expect(toUgPerUl(2500, 'µg/mL')).toBeCloseTo(2.5, 12)
    expect(toUgPerUl(2.5, 'mg/mL')).toBeCloseTo(2.5, 12)
    expect(toUgPerUl(2.5, 'µg/µL')).toBeCloseTo(2.5, 12)
  })
})
