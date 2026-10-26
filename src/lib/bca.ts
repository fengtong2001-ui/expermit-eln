// BCA / Bradford / 酶标仪蛋白定量标准曲线拟合与 WB 上样体系计算核心库
// 支持：空白孔自动扣除、复孔 Mean/SD/CV%、OLS 线性回归 (y=ax+b)、过原点线性回归 (y=ax)、
// 数值稳定化二次多项式回归 (y=ax²+bx+c)、R² 决定系数、标准品回算回收率、未知样品稀释补偿与 WB 上样配制表

export type BcaUnit = 'µg/mL' | 'mg/mL' | 'µg/µL'
export type BcaFitModel = 'linear' | 'linear_zero' | 'quadratic'
export type LoadingBufferConc = 2 | 4 | 5 | 6

export interface BcaStandardRow {
  id: string
  label: string
  conc: number | null
  ods: (number | null)[]
  enabled?: boolean
}

export interface BcaSampleRow {
  id: string
  sample: string
  group: string
  dilution: number | null
  ods: (number | null)[]
}

export interface BcaSettings {
  wavelengthNm: number
  unit: BcaUnit
  replicates: number
  subtractBlank: boolean
  fitModel: BcaFitModel
  cvThreshold: number
  wbEnabled: boolean
  wbTargetMassUg: number | null
  wbTotalVolUl: number | null
  wbBufferX: LoadingBufferConc
}

export interface BcaCurveFit {
  model: BcaFitModel
  /** 二次项系数 a（线性模型下为 0） */
  a2: number
  /** 一次项斜率 b（在 y = ax + b 表示法中即斜率 k） */
  a1: number
  /** 截距项 c（在 y = ax + b 表示法中即截距 b） */
  a0: number
  /** 决定系数 R² (0 ~ 1) */
  r2: number
  /** 残差平方和 SS_res */
  ssRes: number
  /** 参与拟合的有效标准品点数 */
  nPoints: number
  /** 标曲有效浓度下限 */
  minConc: number
  /** 标曲有效浓度上限 */
  maxConc: number
  /** 标曲有效 Net OD 下限 */
  minNetOd: number
  /** 标曲有效 Net OD 上限 */
  maxNetOd: number
  /** 正向方程文本，如 y = 0.000952x + 0.0124 */
  equationText: string
  /** 反算方程文本，如 x = (y - 0.0124) / 0.000952 */
  inverseText: string
  /** 由浓度预测净吸光度 Net OD */
  predictNetOd: (conc: number) => number
  /** 由净吸光度 Net OD 反算孔内浓度 */
  solveConc: (netOd: number) => { conc: number; saturated: boolean }
}

export interface BcaStandardEval {
  id: string
  label: string
  conc: number | null
  enabled: boolean
  validCount: number
  meanOd: number
  sdOd: number
  cvPct: number
  netOd: number
  predictedNetOd: number
  residual: number
  backCalcConc: number
  recoveryPct: number
  highCv: boolean
  usedInFit: boolean
}

export type SampleFlag = 'ok' | 'below_range' | 'above_range' | 'negative_conc' | 'saturated' | 'no_data'

export interface BcaSampleEval {
  id: string
  sample: string
  group: string
  dilution: number
  validCount: number
  meanOd: number
  sdOd: number
  cvPct: number
  netOd: number
  /** 孔内实测浓度（未乘稀释倍数，单位同 settings.unit） */
  wellConc: number
  /** 原液浓度 = wellConc × dilution（单位同 settings.unit） */
  stockConc: number
  /** 换算为 µg/µL (即 mg/mL) 的原液浓度，供 WB 上样体积精确计算 */
  stockConcUgPerUl: number
  /** 复孔 CV% 是否超过阈值 */
  highCv: boolean
  /** 量程与异常状态标记 */
  flag: SampleFlag
  /** WB 目标蛋白上样所需原液体积 (µL) */
  wbSampleVolUl: number
  /** WB 所需裂解液 / PBS 补齐体积 (µL) */
  wbDiluentVolUl: number
  /** WB 所需 Loading Buffer 体积 (µL) */
  wbBufferVolUl: number
  /** 样品浓度过低导致所需原液体积超出 (总体积 - Buffer体积) */
  wbVolumeOverflow: boolean
  /** 当前总体积与 Buffer 比例下最多可上样的蛋白质量 (µg) */
  wbMaxPossibleMassUg: number
}

export interface BcaSummary {
  blankOd: number
  hasBlankRow: boolean
  fit: BcaCurveFit | null
  standards: BcaStandardEval[]
  samples: BcaSampleEval[]
  issues: string[]
}

export function validOds(ods: (number | null | undefined)[]): number[] {
  return ods.filter((x): x is number => typeof x === 'number' && Number.isFinite(x))
}

export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN
}

export function sd(xs: number[]): number {
  if (xs.length < 2) return NaN
  const m = mean(xs)
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1))
}

export function cvPct(xs: number[]): number {
  if (xs.length < 2) return NaN
  const m = mean(xs)
  if (!Number.isFinite(m) || Math.abs(m) <= 1e-12) return NaN
  return (sd(xs) / Math.abs(m)) * 100
}

/** 将任意支持单位的浓度精确换算为 µg/µL（1 mg/mL = 1 µg/µL = 1000 µg/mL） */
export function toUgPerUl(conc: number, unit: BcaUnit): number {
  if (!Number.isFinite(conc)) return NaN
  switch (unit) {
    case 'µg/mL':
      return conc / 1000
    case 'mg/mL':
    case 'µg/µL':
      return conc
  }
}

/** 从 µg/µL 换算为目标单位 */
export function fromUgPerUl(concUgPerUl: number, unit: BcaUnit): number {
  if (!Number.isFinite(concUgPerUl)) return NaN
  switch (unit) {
    case 'µg/mL':
      return concUgPerUl * 1000
    case 'mg/mL':
    case 'µg/µL':
      return concUgPerUl
  }
}

function fmtCoef(n: number, digits = 5): string {
  if (!Number.isFinite(n)) return 'NaN'
  const abs = Math.abs(n)
  if (abs === 0) return '0'
  if (abs < 1e-4 || abs >= 1e5) return n.toExponential(3)
  return Number(n.toPrecision(digits)).toString()
}

/** 列主元高斯消元求解 3x3 线性方程组 M * x = V */
function solve3x3(M: number[][], V: number[]): [number, number, number] | null {
  const A = [
    [M[0][0], M[0][1], M[0][2], V[0]],
    [M[1][0], M[1][1], M[1][2], V[1]],
    [M[2][0], M[2][1], M[2][2], V[2]],
  ]
  for (let col = 0; col < 3; col++) {
    let pivotRow = col
    let maxVal = Math.abs(A[col][col])
    for (let row = col + 1; row < 3; row++) {
      const v = Math.abs(A[row][col])
      if (v > maxVal) {
        maxVal = v
        pivotRow = row
      }
    }
    if (maxVal <= 1e-14) return null
    if (pivotRow !== col) {
      const tmp = A[col]
      A[col] = A[pivotRow]
      A[pivotRow] = tmp
    }
    for (let row = col + 1; row < 3; row++) {
      const factor = A[row][col] / A[col][col]
      for (let k = col; k < 4; k++) {
        A[row][k] -= factor * A[col][k]
      }
    }
  }
  const x = [0, 0, 0]
  for (let i = 2; i >= 0; i--) {
    let sum = A[i][3]
    for (let j = i + 1; j < 3; j++) {
      sum -= A[i][j] * x[j]
    }
    x[i] = sum / A[i][i]
  }
  if (!x.every(Number.isFinite)) return null
  return [x[0], x[1], x[2]]
}

export function fitStandardCurve(
  points: { conc: number; netOd: number }[],
  model: BcaFitModel,
): { fit: BcaCurveFit | null; issues: string[] } {
  const issues: string[] = []
  const distinctConcs = new Set(points.map((p) => p.conc))
  const minRequired = model === 'quadratic' ? 3 : 2

  if (points.length < minRequired || distinctConcs.size < minRequired) {
    issues.push(
      model === 'quadratic'
        ? '二次多项式拟合至少需要 3 个不同浓度的有效标准品点'
        : '线性拟合至少需要 2 个不同浓度的有效标准品点',
    )
    return { fit: null, issues }
  }

  const xs = points.map((p) => p.conc)
  const ys = points.map((p) => p.netOd)
  const minConc = Math.min(...xs)
  const maxConc = Math.max(...xs)
  const minNetOd = Math.min(...ys)
  const maxNetOd = Math.max(...ys)
  const yMean = mean(ys)
  const ssTot = ys.reduce((acc, y) => acc + (y - yMean) ** 2, 0)

  if (ssTot <= 1e-15) {
    issues.push('所有标准品的吸光度数值相同，无法构建标准曲线')
    return { fit: null, issues }
  }

  if (model === 'linear') {
    const xMean = mean(xs)
    const sxx = xs.reduce((acc, x) => acc + (x - xMean) ** 2, 0)
    const sxy = points.reduce((acc, p) => acc + (p.conc - xMean) * (p.netOd - yMean), 0)
    if (sxx <= 1e-15 || Math.abs(sxy) <= 1e-15) {
      issues.push('标准品浓度梯度或吸光度响应不足，无法完成线性拟合')
      return { fit: null, issues }
    }
    const slope = sxy / sxx
    const intercept = yMean - slope * xMean
    if (slope <= 0) {
      issues.push('警告：标准曲线斜率为负值，请检查标准品浓度顺序与吸光度录入是否正确')
    }
    const predictNetOd = (conc: number) => slope * conc + intercept
    const ssRes = points.reduce((acc, p) => acc + (p.netOd - predictNetOd(p.conc)) ** 2, 0)
    const r2 = Math.max(0, 1 - ssRes / ssTot)

    const signStr = intercept >= 0 ? `+ ${fmtCoef(intercept, 4)}` : `- ${fmtCoef(Math.abs(intercept), 4)}`
    const invSignStr = intercept >= 0 ? `- ${fmtCoef(intercept, 4)}` : `+ ${fmtCoef(Math.abs(intercept), 4)}`

    return {
      fit: {
        model: 'linear',
        a2: 0,
        a1: slope,
        a0: intercept,
        r2,
        ssRes,
        nPoints: points.length,
        minConc,
        maxConc,
        minNetOd,
        maxNetOd,
        equationText: `y = ${fmtCoef(slope, 4)}x ${signStr}`,
        inverseText: `x = (y ${invSignStr}) / ${fmtCoef(slope, 4)}`,
        predictNetOd,
        solveConc: (netOd: number) => ({
          conc: (netOd - intercept) / slope,
          saturated: false,
        }),
      },
      issues,
    }
  }

  if (model === 'linear_zero') {
    const sxx0 = xs.reduce((acc, x) => acc + x * x, 0)
    const sxy0 = points.reduce((acc, p) => acc + p.conc * p.netOd, 0)
    if (sxx0 <= 1e-15 || Math.abs(sxy0) <= 1e-15) {
      issues.push('标准品数据不足以拟合过原点直线 (y = ax)')
      return { fit: null, issues }
    }
    const slope = sxy0 / sxx0
    if (slope <= 0) {
      issues.push('警告：标准曲线斜率为负值，请检查标准品浓度与吸光度')
    }
    const predictNetOd = (conc: number) => slope * conc
    const ssRes = points.reduce((acc, p) => acc + (p.netOd - predictNetOd(p.conc)) ** 2, 0)
    const r2 = Math.max(0, 1 - ssRes / ssTot)

    return {
      fit: {
        model: 'linear_zero',
        a2: 0,
        a1: slope,
        a0: 0,
        r2,
        ssRes,
        nPoints: points.length,
        minConc,
        maxConc,
        minNetOd,
        maxNetOd,
        equationText: `y = ${fmtCoef(slope, 4)}x`,
        inverseText: `x = y / ${fmtCoef(slope, 4)}`,
        predictNetOd,
        solveConc: (netOd: number) => ({
          conc: netOd / slope,
          saturated: false,
        }),
      },
      issues,
    }
  }

  // 二次多项式回归 y = a2 * x^2 + a1 * x + a0
  // 使用坐标缩放 u = x / scale 避免高浓度（如 2000 µg/mL）下 u^4 矩阵病态导致浮点精度损失
  const scale = Math.max(...xs.map((x) => Math.abs(x)), 1)
  let su1 = 0,
    su2 = 0,
    su3 = 0,
    su4 = 0
  let suy = 0,
    su2y = 0,
    sy = 0
  for (const p of points) {
    const u = p.conc / scale
    const u2 = u * u
    su1 += u
    su2 += u2
    su3 += u2 * u
    su4 += u2 * u2
    sy += p.netOd
    suy += u * p.netOd
    su2y += u2 * p.netOd
  }
  const solved = solve3x3(
    [
      [su4, su3, su2],
      [su3, su2, su1],
      [su2, su1, points.length],
    ],
    [su2y, suy, sy],
  )
  if (!solved) {
    issues.push('二次多项式矩阵奇异，请检查标准品浓度是否重复')
    return { fit: null, issues }
  }
  const a2 = solved[0] / (scale * scale)
  const a1 = solved[1] / scale
  const a0 = solved[2]

  const predictNetOd = (conc: number) => (a2 * conc + a1) * conc + a0
  const ssRes = points.reduce((acc, p) => acc + (p.netOd - predictNetOd(p.conc)) ** 2, 0)
  const r2 = Math.max(0, 1 - ssRes / ssTot)

  // 检查标曲区间内的单调性：顶点 x_vertex = -a1 / (2 * a2)
  const xMid = 0.5 * (minConc + maxConc)
  const midSlope = 2 * a2 * xMid + a1
  if (Math.abs(a2) > 1e-14) {
    const vertexX = -a1 / (2 * a2)
    if (vertexX > minConc + 1e-6 && vertexX < maxConc - 1e-6) {
      issues.push(
        `注意：二次拟合曲线在浓度 ${ vertexX.toFixed(1) } 处出现拐点（非单调），建议检查高浓度点是否饱和或改用线性拟合`,
      )
    }
  }

  const solveConc = (netOd: number): { conc: number; saturated: boolean } => {
    if (Math.abs(a2) <= 1e-14) {
      if (Math.abs(a1) <= 1e-14) return { conc: NaN, saturated: false }
      return { conc: (netOd - a0) / a1, saturated: false }
    }
    // 求解 a2 * x^2 + a1 * x + (a0 - netOd) = 0
    const cTerm = a0 - netOd
    const disc = a1 * a1 - 4 * a2 * cTerm
    if (disc < 0) {
      return { conc: NaN, saturated: true }
    }
    const sqrtD = Math.sqrt(disc)
    const dir = midSlope >= 0 ? 1 : -1
    const rootPrimary = (-a1 + dir * sqrtD) / (2 * a2)
    return { conc: rootPrimary, saturated: false }
  }

  const bStr = a1 >= 0 ? `+ ${fmtCoef(a1, 4)}x` : `- ${fmtCoef(Math.abs(a1), 4)}x`
  const cStr = a0 >= 0 ? `+ ${fmtCoef(a0, 4)}` : `- ${fmtCoef(Math.abs(a0), 4)}`

  return {
    fit: {
      model: 'quadratic',
      a2,
      a1,
      a0,
      r2,
      ssRes,
      nPoints: points.length,
      minConc,
      maxConc,
      minNetOd,
      maxNetOd,
      equationText: `y = ${fmtCoef(a2, 4)}x² ${bStr} ${cStr}`,
      inverseText: `由 ax² + bx + c = y 求单调分支正根`,
      predictNetOd,
      solveConc,
    },
    issues,
  }
}

export function computeBca(
  standards: BcaStandardRow[],
  samples: BcaSampleRow[],
  settings: BcaSettings,
): BcaSummary {
  const issues: string[] = []

  // 1. 计算 0 浓度空白孔均值
  const zeroRows = standards.filter(
    (s) => (s.enabled ?? true) && s.conc === 0 && validOds(s.ods).length > 0,
  )
  const hasBlankRow = zeroRows.length > 0
  const rawBlankMean = hasBlankRow
    ? mean(zeroRows.map((r) => mean(validOds(r.ods))))
    : 0
  const blankOd = settings.subtractBlank ? rawBlankMean : 0

  if (settings.subtractBlank && !hasBlankRow) {
    issues.push('已开启空白扣除，但未找到浓度为 0 的有效标准品孔，当前按 Blank OD = 0 计算')
  }

  // 2. 初算各标准品行的统计量
  const fitPoints: { conc: number; netOd: number }[] = []
  const prelimStds = standards.map((s) => {
    const enabled = s.enabled ?? true
    const vals = validOds(s.ods)
    const mOd = vals.length ? mean(vals) : NaN
    const sOd = vals.length >= 2 ? sd(vals) : NaN
    const cv = vals.length >= 2 ? cvPct(vals) : NaN
    const netOd = Number.isFinite(mOd) ? mOd - blankOd : NaN
    const validForFit =
      enabled &&
      s.conc !== null &&
      Number.isFinite(s.conc) &&
      s.conc >= 0 &&
      Number.isFinite(netOd)

    if (validForFit && s.conc !== null) {
      fitPoints.push({ conc: s.conc, netOd })
    }
    return {
      row: s,
      enabled,
      validCount: vals.length,
      meanOd: mOd,
      sdOd: sOd,
      cvPct: cv,
      netOd,
      highCv: Number.isFinite(cv) && cv > settings.cvThreshold,
      usedInFit: validForFit,
    }
  })

  // 3. 拟合标准曲线
  const { fit, issues: fitIssues } = fitStandardCurve(fitPoints, settings.fitModel)
  issues.push(...fitIssues)

  if (fit && Number.isFinite(fit.r2) && fit.r2 < 0.98) {
    issues.push(
      `当前标准曲线决定系数 R² = ${fit.r2.toFixed(4)} (< 0.98)，线性度偏低，建议检查高浓度点或尝试切换二次多项式拟合`,
    )
  }

  // 4. 补全标准品的拟合残差与回算回收率
  const stdEvals: BcaStandardEval[] = prelimStds.map((p) => {
    const predictedNetOd =
      fit && p.row.conc !== null && Number.isFinite(p.row.conc)
        ? fit.predictNetOd(p.row.conc)
        : NaN
    const residual =
      Number.isFinite(p.netOd) && Number.isFinite(predictedNetOd)
        ? p.netOd - predictedNetOd
        : NaN
    const solved =
      fit && Number.isFinite(p.netOd)
        ? fit.solveConc(p.netOd)
        : { conc: NaN, saturated: false }
    const backCalcConc = solved.conc
    const recoveryPct =
      p.row.conc !== null && p.row.conc > 0 && Number.isFinite(backCalcConc)
        ? (backCalcConc / p.row.conc) * 100
        : NaN

    return {
      id: p.row.id,
      label: p.row.label,
      conc: p.row.conc,
      enabled: p.enabled,
      validCount: p.validCount,
      meanOd: p.meanOd,
      sdOd: p.sdOd,
      cvPct: p.cvPct,
      netOd: p.netOd,
      predictedNetOd,
      residual,
      backCalcConc,
      recoveryPct,
      highCv: p.highCv,
      usedInFit: p.usedInFit,
    }
  })

  // 5. 计算未知样品浓度与 WB 上样体系配制表
  const targetMassUg =
    settings.wbTargetMassUg !== null && settings.wbTargetMassUg > 0
      ? settings.wbTargetMassUg
      : 20
  const totalVolUl =
    settings.wbTotalVolUl !== null && settings.wbTotalVolUl > 0
      ? settings.wbTotalVolUl
      : 40
  const bufferX = settings.wbBufferX || 5
  const wbBufferVolUl = totalVolUl / bufferX
  const maxSampleVolUl = Math.max(0, totalVolUl - wbBufferVolUl)

  const sampleEvals: BcaSampleEval[] = samples.map((r) => {
    const vals = validOds(r.ods)
    const meanOd = vals.length ? mean(vals) : NaN
    const sdOd = vals.length >= 2 ? sd(vals) : NaN
    const cv = vals.length >= 2 ? cvPct(vals) : NaN
    const netOd = Number.isFinite(meanOd) ? meanOd - blankOd : NaN
    const dilution =
      r.dilution !== null && Number.isFinite(r.dilution) && r.dilution > 0
        ? r.dilution
        : 1
    const highCv = Number.isFinite(cv) && cv > settings.cvThreshold

    if (!vals.length || !fit) {
      return {
        id: r.id,
        sample: r.sample,
        group: r.group,
        dilution,
        validCount: vals.length,
        meanOd,
        sdOd,
        cvPct: cv,
        netOd,
        wellConc: NaN,
        stockConc: NaN,
        stockConcUgPerUl: NaN,
        highCv,
        flag: 'no_data',
        wbSampleVolUl: NaN,
        wbDiluentVolUl: NaN,
        wbBufferVolUl,
        wbVolumeOverflow: false,
        wbMaxPossibleMassUg: NaN,
      }
    }

    const { conc: wellConc, saturated } = fit.solveConc(netOd)
    let flag: SampleFlag = 'ok'
    if (saturated) {
      flag = 'saturated'
    } else if (!Number.isFinite(wellConc) || wellConc <= 0) {
      flag = 'negative_conc'
    } else if (wellConc < fit.minConc - 1e-9) {
      flag = 'below_range'
    } else if (wellConc > fit.maxConc + 1e-9) {
      flag = 'above_range'
    }

    const stockConc =
      Number.isFinite(wellConc) && wellConc > 0 ? wellConc * dilution : NaN
    const stockConcUgPerUl = Number.isFinite(stockConc)
      ? toUgPerUl(stockConc, settings.unit)
      : NaN

    let wbSampleVolUl = NaN
    let wbDiluentVolUl = NaN
    let wbVolumeOverflow = false
    let wbMaxPossibleMassUg = NaN

    if (Number.isFinite(stockConcUgPerUl) && stockConcUgPerUl > 0) {
      wbSampleVolUl = targetMassUg / stockConcUgPerUl
      wbDiluentVolUl = totalVolUl - wbSampleVolUl - wbBufferVolUl
      wbVolumeOverflow = wbDiluentVolUl < -1e-9
      wbMaxPossibleMassUg = maxSampleVolUl * stockConcUgPerUl
    }

    return {
      id: r.id,
      sample: r.sample,
      group: r.group,
      dilution,
      validCount: vals.length,
      meanOd,
      sdOd,
      cvPct: cv,
      netOd,
      wellConc,
      stockConc,
      stockConcUgPerUl,
      highCv,
      flag,
      wbSampleVolUl,
      wbDiluentVolUl,
      wbBufferVolUl,
      wbVolumeOverflow,
      wbMaxPossibleMassUg,
    }
  })

  return {
    blankOd,
    hasBlankRow,
    fit,
    standards: stdEvals,
    samples: sampleEvals,
    issues,
  }
}

/** Thermo Pierce BCA 经典标准品梯度预设（0 ~ 2000 µg/mL 或对应的 mg/mL） */
export const BCA_STD_PRESETS: Record<BcaUnit, { label: string; conc: number }[]> = {
  'µg/mL': [
    { label: 'Std A', conc: 2000 },
    { label: 'Std B', conc: 1500 },
    { label: 'Std C', conc: 1000 },
    { label: 'Std D', conc: 750 },
    { label: 'Std E', conc: 500 },
    { label: 'Std F', conc: 250 },
    { label: 'Std G', conc: 125 },
    { label: 'Std H', conc: 25 },
    { label: 'Blank', conc: 0 },
  ],
  'mg/mL': [
    { label: 'Std A', conc: 2.0 },
    { label: 'Std B', conc: 1.5 },
    { label: 'Std C', conc: 1.0 },
    { label: 'Std D', conc: 0.75 },
    { label: 'Std E', conc: 0.5 },
    { label: 'Std F', conc: 0.25 },
    { label: 'Std G', conc: 0.125 },
    { label: 'Std H', conc: 0.025 },
    { label: 'Blank', conc: 0 },
  ],
  'µg/µL': [
    { label: 'Std A', conc: 2.0 },
    { label: 'Std B', conc: 1.5 },
    { label: 'Std C', conc: 1.0 },
    { label: 'Std D', conc: 0.75 },
    { label: 'Std E', conc: 0.5 },
    { label: 'Std F', conc: 0.25 },
    { label: 'Std G', conc: 0.125 },
    { label: 'Std H', conc: 0.025 },
    { label: 'Blank', conc: 0 },
  ],
}
