// 2^-ΔΔCt 相对定量（Livak & Schmittgen, Methods 2001; doi:10.1006/meth.2001.1262）
// ΔCt = Ct(目的基因) − Ct(内参)；ΔΔCt = ΔCt(样品) − mean ΔCt(对照组)；相对表达 = 2^-ΔΔCt

export interface QpcrRow {
  id: string
  sample: string
  group: string
  target: string
  cts: (number | null)[]
}

export interface QpcrSettings {
  reference: string
  control: string
}

export function mean(xs: number[]) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN
}

export function sd(xs: number[]) {
  if (xs.length < 2) return NaN
  const m = mean(xs)
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1))
}

export const validCts = (cts: (number | null)[]) => cts.filter((x): x is number => typeof x === 'number' && Number.isFinite(x))

export interface QpcrResult {
  target: string
  sample: string
  group: string
  meanCt: number
  refCt: number
  dCt: number
  ddCt: number
  fold: number
}

export interface QpcrSummary {
  results: QpcrResult[]
  /** 按目的基因 + 组汇总的相对表达均值与标准差 */
  groups: { target: string; group: string; n: number; fold: number; sd: number }[]
  issues: string[]
}

export function computeDDCt(rows: QpcrRow[], s: QpcrSettings): QpcrSummary {
  const issues: string[] = []
  if (!s.reference.trim()) return { results: [], groups: [], issues: ['请先指定内参基因'] }
  if (!s.control.trim()) return { results: [], groups: [], issues: ['请先指定对照组'] }

  const refBySample = new Map<string, number>()
  for (const r of rows) {
    if (r.target.trim() !== s.reference.trim()) continue
    const v = validCts(r.cts)
    if (v.length) refBySample.set(r.sample.trim(), mean(v))
  }

  const partial: Omit<QpcrResult, 'ddCt' | 'fold'>[] = []
  for (const r of rows) {
    const target = r.target.trim()
    if (!target || target === s.reference.trim()) continue
    const v = validCts(r.cts)
    if (!v.length) continue
    const refCt = refBySample.get(r.sample.trim())
    if (refCt === undefined) {
      issues.push(`样品「${r.sample || '未命名'}」缺少内参 ${s.reference} 的 Ct 值`)
      continue
    }
    const meanCt = mean(v)
    partial.push({ target, sample: r.sample.trim(), group: r.group.trim(), meanCt, refCt, dCt: meanCt - refCt })
  }

  const ctrlDct = new Map<string, number>()
  for (const target of new Set(partial.map((p) => p.target))) {
    const c = partial.filter((p) => p.target === target && p.group === s.control.trim()).map((p) => p.dCt)
    if (c.length) ctrlDct.set(target, mean(c))
    else issues.push(`目的基因 ${target} 没有对照组「${s.control}」的样品`)
  }

  const results: QpcrResult[] = []
  for (const p of partial) {
    const base = ctrlDct.get(p.target)
    if (base === undefined) continue
    const ddCt = p.dCt - base
    results.push({ ...p, ddCt, fold: Math.pow(2, -ddCt) })
  }

  const groups: QpcrSummary['groups'] = []
  const keys = new Map<string, QpcrResult[]>()
  for (const r of results) {
    const k = `${r.target}\u0000${r.group}`
    keys.set(k, [...(keys.get(k) ?? []), r])
  }
  for (const [k, rs] of keys) {
    const [target, group] = k.split('\u0000')
    const folds = rs.map((r) => r.fold)
    groups.push({ target, group, n: rs.length, fold: mean(folds), sd: sd(folds) })
  }
  return { results, groups, issues }
}
