import { useMemo, useState } from 'react'
import {
  Check,
  Copy,
  FlaskConical,
  Info,
  RotateCcw,
  Sparkles,
  Trash2,
  TriangleAlert,
} from 'lucide-react'
import type { BlockEditorProps } from './types'
import {
  newBcaSampleRow,
  type BcaData,
} from './defs'
import {
  BCA_STD_PRESETS,
  computeBca,
  type BcaFitModel,
  type BcaSampleRow,
  type BcaStandardEval,
  type BcaStandardRow,
  type BcaSummary,
  type BcaUnit,
  type LoadingBufferConc,
} from '@/lib/bca'
import { AddRow, BlockTitle, NumInput, Panel, RowDelete } from './kit'
import { Badge, Button, Popover, PopoverContent, PopoverTrigger, Segmented, Select, Tooltip } from '@/components/ui'
import { pushUndo } from '@/lib/undo'
import { cn, uid } from '@/lib/util'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/context-menu'

/**
 * 智能解析标准品粘贴文本（兼容 3 种常见实验室复制格式）：
 * 1. 纯吸光度矩阵：每行 [OD1, OD2, ...] -> 直接填入现有标准品浓度行的 OD 列
 * 2. 浓度 + 吸光度：每行 [Conc, OD1, OD2, ...]
 * 3. 标识 + 浓度 + 吸光度：每行 [Label, Conc, OD1, OD2, ...]
 */
export function parseStandardsPaste(
  text: string,
  replicates: number,
  currentRows: BcaStandardRow[],
): BcaStandardRow[] | null {
  const lines = text
    .trim()
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  if (!lines.length) return null

  const rawRows = lines.map((l) => l.split(/[\t,]/).map((s) => s.trim()))
  // 过滤表头行（如果首行全是非数字文本）
  const dataRows = rawRows.filter((r) =>
    r.some((cell) => cell !== '' && !Number.isNaN(Number(cell))),
  )
  if (!dataRows.length) return null

  const firstRow = dataRows[0]
  const firstCellNum = Number(firstRow[0])
  const firstIsText = firstRow[0] !== '' && Number.isNaN(firstCellNum)

  // 情况 3：[Label, Conc, OD1, OD2, ...]
  if (firstIsText && firstRow.length >= 3) {
    return dataRows.map((r, idx) => {
      const conc = r[1] === '' || Number.isNaN(Number(r[1])) ? null : Number(r[1])
      const ods = Array.from({ length: replicates }, (_, i) => {
        const v = r[2 + i]
        return v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v)
      })
      return {
        id: currentRows[idx]?.id ?? uid(),
        label: r[0] || `Std ${idx + 1}`,
        conc,
        ods,
        enabled: true,
      }
    })
  }

  // 判断情况 1（纯 OD 矩阵）还是情况 2（[Conc, OD1, OD2...]）
  // 若列数 <= replicates 且所有数值均在合理吸光度范围 (0 ~ 5)，并且当前已有对应标准品行，则按纯 OD 矩阵回填
  const allLookLikeOd = dataRows.every(
    (r) =>
      r.length <= replicates &&
      r.every((c) => c === '' || (!Number.isNaN(Number(c)) && Number(c) >= -0.5 && Number(c) <= 6)),
  )

  if (allLookLikeOd && currentRows.length > 0) {
    const count = Math.max(currentRows.length, dataRows.length)
    return Array.from({ length: count }, (_, idx) => {
      const existing = currentRows[idx]
      const pasted = dataRows[idx]
      if (!pasted) return existing
      const ods = Array.from({ length: replicates }, (__, i) => {
        const v = pasted[i]
        return v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v)
      })
      return {
        id: existing?.id ?? uid(),
        label: existing?.label ?? `Std ${idx + 1}`,
        conc: existing?.conc ?? null,
        ods,
        enabled: existing?.enabled ?? true,
      }
    })
  }

  // 情况 2：[Conc, OD1, OD2, ...]
  return dataRows.map((r, idx) => {
    const conc = r[0] === '' || Number.isNaN(Number(r[0])) ? null : Number(r[0])
    const ods = Array.from({ length: replicates }, (_, i) => {
      const v = r[1 + i]
      return v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v)
    })
    return {
      id: currentRows[idx]?.id ?? uid(),
      label: conc === 0 ? 'Blank' : `Std ${String.fromCharCode(65 + idx)}`,
      conc,
      ods,
      enabled: true,
    }
  })
}

/**
 * 智能解析待测样品粘贴文本（兼容 3 种常见格式）：
 * 1. 纯吸光度矩阵：每行 [OD1, OD2, ...]
 * 2. 样品名 + 吸光度：每行 [Sample, OD1, OD2, ...]
 * 3. 完整格式：每行 [Sample, Group, Dilution, OD1, OD2, ...]
 */
export function parseSamplesPaste(
  text: string,
  replicates: number,
  currentRows: BcaSampleRow[],
): BcaSampleRow[] | null {
  const lines = text
    .trim()
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  if (!lines.length) return null

  const rawRows = lines.map((l) => l.split(/[\t,]/).map((s) => s.trim()))
  const dataRows = rawRows.filter((r) =>
    r.some((cell) => cell !== '' && !Number.isNaN(Number(cell))),
  )
  if (!dataRows.length) return null

  const firstRow = dataRows[0]
  const firstIsNum = firstRow[0] !== '' && !Number.isNaN(Number(firstRow[0]))

  // 情况 1：纯 OD 矩阵 [OD1, OD2, ...]
  if (firstIsNum && firstRow.length <= replicates) {
    return dataRows.map((r, idx) => {
      const existing = currentRows[idx]
      const ods = Array.from({ length: replicates }, (_, i) => {
        const v = r[i]
        return v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v)
      })
      return {
        id: existing?.id ?? uid(),
        sample: existing?.sample || `Sample ${idx + 1}`,
        group: existing?.group || '',
        dilution: existing?.dilution ?? 1,
        ods,
      }
    })
  }

  // 情况 3：[Sample, Group, Dilution, OD1, OD2, ...]（当列数 >= 4 且第 2 列为文本或第 3 列为正整数稀释倍数时）
  const secondIsNum = firstRow.length > 1 && firstRow[1] !== '' && !Number.isNaN(Number(firstRow[1]))
  if (!secondIsNum && firstRow.length >= 4) {
    return dataRows.map((r, idx) => {
      const dil = r[2] === '' || Number.isNaN(Number(r[2])) ? 1 : Number(r[2])
      const ods = Array.from({ length: replicates }, (_, i) => {
        const v = r[3 + i]
        return v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v)
      })
      return {
        id: currentRows[idx]?.id ?? uid(),
        sample: r[0] || `Sample ${idx + 1}`,
        group: r[1] || '',
        dilution: dil > 0 ? dil : 1,
        ods,
      }
    })
  }

  // 情况 2：[Sample, OD1, OD2, ...]
  return dataRows.map((r, idx) => {
    const existing = currentRows[idx]
    const ods = Array.from({ length: replicates }, (_, i) => {
      const v = r[1 + i]
      return v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v)
    })
    return {
      id: existing?.id ?? uid(),
      sample: r[0] || `Sample ${idx + 1}`,
      group: existing?.group || '',
      dilution: existing?.dilution ?? 1,
      ods,
    }
  })
}

/** 轻量级响应式 SVG 标准曲线与未知样品散点图 */
function StandardCurveChart({
  summary,
  unit,
  wavelengthNm,
}: {
  summary: BcaSummary
  unit: BcaUnit
  wavelengthNm: number
}) {
  const [hoverSampleId, setHoverSampleId] = useState<string | null>(null)
  const { fit, standards, samples } = summary

  const validStds = standards.filter(
    (s): s is BcaStandardEval & { conc: number } =>
      s.conc !== null && Number.isFinite(s.conc) && Number.isFinite(s.netOd),
  )
  const validSamples = samples.filter(
    (s) =>
      Number.isFinite(s.wellConc) &&
      Number.isFinite(s.netOd) &&
      s.wellConc >= 0 &&
      s.flag !== 'saturated',
  )

  if (!fit || validStds.length < 2) {
    return (
      <div className="flex h-52 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 text-center text-xs text-slate-400 dark:border-slate-800 dark:bg-slate-900/30 dark:text-slate-500">
        <FlaskConical className="mb-2 size-6 stroke-1 text-slate-400" />
        <span>在下方标准品表中录入至少 2 个浓度的吸光度（OD）后自动生成标准曲线</span>
      </div>
    )
  }

  const W = 520
  const H = 230
  const padL = 52
  const padR = 20
  const padT = 18
  const padB = 36
  const plotW = W - padL - padR
  const plotH = H - padT - padB

  const allX = [
    0,
    ...validStds.map((s) => s.conc),
    ...validSamples.map((s) => Math.min(s.wellConc, fit.maxConc * 1.25)),
  ]
  const allY = [
    0,
    ...validStds.map((s) => s.netOd + (Number.isFinite(s.sdOd) ? s.sdOd : 0)),
    ...validSamples.map((s) => s.netOd),
  ]

  const xMaxRaw = Math.max(...allX, 1)
  const yMaxRaw = Math.max(...allY, 0.1)
  const xMin = 0
  const xMax = xMaxRaw * 1.06
  const yMin = Math.min(0, ...validStds.map((s) => s.netOd), fit.predictNetOd(0))
  const yMax = yMaxRaw * 1.08

  const toX = (x: number) => padL + ((x - xMin) / Math.max(1e-9, xMax - xMin)) * plotW
  const toY = (y: number) => padT + plotH - ((y - yMin) / Math.max(1e-9, yMax - yMin)) * plotH

  // 采样 64 个点绘制平滑回归曲线
  const curvePts: string[] = []
  const steps = 64
  for (let i = 0; i <= steps; i++) {
    const cx = xMin + (i / steps) * (xMax - xMin)
    const cy = fit.predictNetOd(cx)
    if (Number.isFinite(cy)) {
      curvePts.push(`${toX(cx).toFixed(1)},${toY(cy).toFixed(1)}`)
    }
  }

  const xTicks = Array.from({ length: 5 }, (_, i) => (xMaxRaw / 4) * i)
  const yTicks = Array.from({ length: 5 }, (_, i) => yMin + ((yMax - yMin) / 4) * i)

  const hoveredSample = validSamples.find((s) => s.id === hoverSampleId) ?? null

  return (
    <div className="relative rounded-xl border border-slate-200/80 bg-white p-3 dark:border-slate-800 dark:bg-slate-900/60">
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-brand-600 dark:bg-brand-400" />
            标准品点 (±SD)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-3.5 bg-brand-600 dark:bg-brand-400" />
            拟合曲线
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rotate-45 bg-amber-500" />
            待测样品 (孔内浓度)
          </span>
        </div>
        {hoveredSample && (
          <span className="font-mono text-[11px] font-medium text-amber-600 dark:text-amber-400">
            {hoveredSample.sample || '未命名'}: Net OD = {hoveredSample.netOd.toFixed(3)} → 孔内{' '}
            {hoveredSample.wellConc.toFixed(2)} {unit} (原液 {hoveredSample.stockConc.toFixed(2)}{' '}
            {unit})
          </span>
        )}
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-52 w-full select-none overflow-visible"
        role="img"
        aria-label="BCA 标准曲线图"
      >
        {/* 网格线与 Y 轴刻度 */}
        {yTicks.map((yt, idx) => {
          const py = toY(yt)
          return (
            <g key={`y-${idx}`}>
              <line
                x1={padL}
                y1={py}
                x2={W - padR}
                y2={py}
                className="stroke-slate-100 dark:stroke-slate-800"
                strokeDasharray={idx === 0 ? undefined : '3 3'}
              />
              <text
                x={padL - 6}
                y={py + 3}
                textAnchor="end"
                className="fill-slate-400 font-mono text-[10px] dark:fill-slate-500"
              >
                {yt.toFixed(2)}
              </text>
            </g>
          )
        })}

        {/* X 轴刻度 */}
        {xTicks.map((xt, idx) => {
          const px = toX(xt)
          return (
            <g key={`x-${idx}`}>
              <line
                x1={px}
                y1={padT}
                x2={px}
                y2={padT + plotH}
                className="stroke-slate-100 dark:stroke-slate-800"
                strokeDasharray={idx === 0 ? undefined : '3 3'}
              />
              <text
                x={px}
                y={H - 16}
                textAnchor="middle"
                className="fill-slate-400 font-mono text-[10px] dark:fill-slate-500"
              >
                {xt >= 100 ? Math.round(xt) : Number(xt.toFixed(2))}
              </text>
            </g>
          )
        })}

        {/* 坐标轴标题 */}
        <text
          x={padL + plotW / 2}
          y={H - 2}
          textAnchor="middle"
          className="fill-slate-500 text-[10px] font-medium dark:fill-slate-400"
        >
          标准品浓度 ({unit})
        </text>
        <text
          x={12}
          y={padT + plotH / 2}
          textAnchor="middle"
          transform={`rotate(-90 12 ${padT + plotH / 2})`}
          className="fill-slate-500 text-[10px] font-medium dark:fill-slate-400"
        >
          {summary.blankOd > 0 ? `Net OD (${wavelengthNm} nm)` : `OD (${wavelengthNm} nm)`}
        </text>

        {/* 回归拟合曲线 */}
        {curvePts.length > 1 && (
          <polyline
            fill="none"
            points={curvePts.join(' ')}
            className="stroke-brand-600 dark:stroke-brand-400"
            strokeWidth={2}
          />
        )}

        {/* 悬停样品的投影虚线 */}
        {hoveredSample && (
          <g>
            <line
              x1={padL}
              y1={toY(hoveredSample.netOd)}
              x2={toX(Math.min(hoveredSample.wellConc, xMax))}
              y2={toY(hoveredSample.netOd)}
              className="stroke-amber-500/70"
              strokeWidth={1.2}
              strokeDasharray="3 3"
            />
            <line
              x1={toX(Math.min(hoveredSample.wellConc, xMax))}
              y1={toY(hoveredSample.netOd)}
              x2={toX(Math.min(hoveredSample.wellConc, xMax))}
              y2={padT + plotH}
              className="stroke-amber-500/70"
              strokeWidth={1.2}
              strokeDasharray="3 3"
            />
          </g>
        )}

        {/* 标准品散点与误差棒 */}
        {validStds.map((s) => {
          const cx = toX(s.conc)
          const cy = toY(s.netOd)
          const hasSd = Number.isFinite(s.sdOd) && s.sdOd > 0
          return (
            <g key={s.id}>
              {hasSd && (
                <>
                  <line
                    x1={cx}
                    y1={toY(s.netOd - s.sdOd)}
                    x2={cx}
                    y2={toY(s.netOd + s.sdOd)}
                    className="stroke-brand-700 dark:stroke-brand-300"
                    strokeWidth={1.2}
                  />
                  <line
                    x1={cx - 3}
                    y1={toY(s.netOd - s.sdOd)}
                    x2={cx + 3}
                    y2={toY(s.netOd - s.sdOd)}
                    className="stroke-brand-700 dark:stroke-brand-300"
                    strokeWidth={1.2}
                  />
                  <line
                    x1={cx - 3}
                    y1={toY(s.netOd + s.sdOd)}
                    x2={cx + 3}
                    y2={toY(s.netOd + s.sdOd)}
                    className="stroke-brand-700 dark:stroke-brand-300"
                    strokeWidth={1.2}
                  />
                </>
              )}
              <circle
                cx={cx}
                cy={cy}
                r={4}
                className={cn(
                  'transition-transform hover:scale-125',
                  s.enabled
                    ? 'fill-brand-600 stroke-white dark:fill-brand-400 dark:stroke-slate-900'
                    : 'fill-slate-200 stroke-slate-400 dark:fill-slate-800 dark:stroke-slate-600',
                )}
                strokeWidth={1.5}
              >
                <title>
                  {`${s.label}: 浓度 ${s.conc} ${unit}, Net OD ${s.netOd.toFixed(3)}${
                    Number.isFinite(s.recoveryPct) ? `, 回收率 ${s.recoveryPct.toFixed(1)}%` : ''
                  }`}
                </title>
              </circle>
            </g>
          )
        })}

        {/* 待测样品散点（菱形标记） */}
        {validSamples.map((s) => {
          const clampedX = Math.min(s.wellConc, xMax)
          const cx = toX(clampedX)
          const cy = toY(s.netOd)
          return (
            <g
              key={s.id}
              onMouseEnter={() => setHoverSampleId(s.id)}
              onMouseLeave={() => setHoverSampleId(null)}
              className="cursor-pointer"
            >
              <polygon
                points={`${cx},${cy - 5} ${cx + 5},${cy} ${cx},${cy + 5} ${cx - 5},${cy}`}
                className="fill-amber-500 stroke-white transition-transform hover:scale-125 dark:stroke-slate-900"
                strokeWidth={1.2}
              >
                <title>
                  {`${s.sample || '未命名'}: Net OD ${s.netOd.toFixed(3)}, 孔内浓度 ${s.wellConc.toFixed(
                    2,
                  )} ${unit}, 原液浓度 ${s.stockConc.toFixed(2)} ${unit}`}
                </title>
              </polygon>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

export function BcaBlock({ data, onChange, readOnly }: BlockEditorProps<BcaData>) {
  const [copiedTsv, setCopiedTsv] = useState(false)
  const summary = useMemo(
    () => computeBca(data.standards, data.samples, data),
    [data],
  )
  const n = data.replicates

  const setStandards = (standards: BcaStandardRow[]) =>
    onChange({ ...data, standards })
  const setSamples = (samples: BcaSampleRow[]) =>
    onChange({ ...data, samples })

  const updateStd = (id: string, patch: Partial<BcaStandardRow>) =>
    setStandards(data.standards.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  const removeStd = (id: string) =>
    setStandards(data.standards.filter((s) => s.id !== id))
  const addStd = () =>
    setStandards([
      ...data.standards,
      {
        id: uid(),
        label: `Std ${String.fromCharCode(65 + data.standards.length)}`,
        conc: null,
        ods: Array(n).fill(null),
        enabled: true,
      },
    ])

  const updateSample = (id: string, patch: Partial<BcaSampleRow>) =>
    setSamples(data.samples.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  const removeSample = (id: string) =>
    setSamples(data.samples.filter((s) => s.id !== id))
  const addSample = () =>
    setSamples([...data.samples, newBcaSampleRow(n, data.samples.length + 1)])

  const setReplicates = (next: number) => {
    const k = Math.min(6, Math.max(1, Math.round(next)))
    onChange({
      ...data,
      replicates: k,
      standards: data.standards.map((s) => ({
        ...s,
        ods: Array.from({ length: k }, (_, i) => s.ods[i] ?? null),
      })),
      samples: data.samples.map((s) => ({
        ...s,
        ods: Array.from({ length: k }, (_, i) => s.ods[i] ?? null),
      })),
    })
  }

  /** 切换浓度单位时自动按比例换算标准品浓度（1 mg/mL = 1 µg/µL = 1000 µg/mL） */
  const handleUnitChange = (nextUnit: BcaUnit) => {
    if (nextUnit === data.unit) return
    const factor =
      data.unit === 'µg/mL' && (nextUnit === 'mg/mL' || nextUnit === 'µg/µL')
        ? 0.001
        : (data.unit === 'mg/mL' || data.unit === 'µg/µL') && nextUnit === 'µg/mL'
          ? 1000
          : 1
    pushUndo('切换 BCA 浓度单位', () => onChange(structuredClone(data)))
    onChange({
      ...data,
      unit: nextUnit,
      standards: data.standards.map((s) => ({
        ...s,
        conc:
          s.conc !== null && Number.isFinite(s.conc)
            ? Number((s.conc * factor).toPrecision(6))
            : null,
      })),
    })
  }

  /** 一键重置为 Thermo Pierce BCA 标准梯度 */
  const applyPiercePreset = () => {
    pushUndo('应用 Pierce 标准品梯度', () => onChange(structuredClone(data)))
    const presets = BCA_STD_PRESETS[data.unit]
    onChange({
      ...data,
      standards: presets.map((p, idx) => ({
        id: data.standards[idx]?.id ?? uid(),
        label: p.label,
        conc: p.conc,
        ods: Array.from({ length: n }, (_, i) => data.standards[idx]?.ods[i] ?? null),
        enabled: true,
      })),
    })
  }

  /** 一键填入真实 BCA 测定演示数据，方便快速验证曲线与 WB 配制表 */
  const loadDemoData = () => {
    pushUndo('载入 BCA 示例数据', () => onChange(structuredClone(data)))
    const factor = data.unit === 'µg/mL' ? 1 : 0.001
    const demoStds: { label: string; conc: number; ods: number[] }[] = [
      { label: 'Std A', conc: 2000 * factor, ods: [1.892, 1.91, 1.898] },
      { label: 'Std B', conc: 1500 * factor, ods: [1.485, 1.472, 1.48] },
      { label: 'Std C', conc: 1000 * factor, ods: [1.032, 1.045, 1.037] },
      { label: 'Std D', conc: 750 * factor, ods: [0.798, 0.79, 0.802] },
      { label: 'Std E', conc: 500 * factor, ods: [0.545, 0.552, 0.547] },
      { label: 'Std F', conc: 250 * factor, ods: [0.292, 0.288, 0.293] },
      { label: 'Std G', conc: 125 * factor, ods: [0.165, 0.169, 0.164] },
      { label: 'Std H', conc: 25 * factor, ods: [0.068, 0.066, 0.067] },
      { label: 'Blank', conc: 0, ods: [0.042, 0.044, 0.04] },
    ]
    const demoSamples: { sample: string; group: string; dilution: number; ods: number[] }[] = [
      { sample: 'WT-1', group: 'Control', dilution: 5, ods: [0.64, 0.646, 0.643] },
      { sample: 'WT-2', group: 'Control', dilution: 5, ods: [0.588, 0.595, 0.591] },
      { sample: 'KO-1', group: 'Treat', dilution: 5, ods: [0.742, 0.751, 0.748] },
      { sample: 'KO-2', group: 'Treat', dilution: 5, ods: [0.695, 0.689, 0.692] },
    ]
    onChange({
      ...data,
      standards: demoStds.map((d) => ({
        id: uid(),
        label: d.label,
        conc: Number(d.conc.toPrecision(6)),
        ods: Array.from({ length: n }, (_, i) => d.ods[i % d.ods.length]),
        enabled: true,
      })),
      samples: demoSamples.map((s) => ({
        id: uid(),
        sample: s.sample,
        group: s.group,
        dilution: s.dilution,
        ods: Array.from({ length: n }, (_, i) => s.ods[i % s.ods.length]),
      })),
    })
  }

  /** 复制完整结果与 WB 上样配制表为 TSV */
  const copyResultsAsTsv = () => {
    const headers = [
      '样品名称',
      '组别',
      '稀释倍数',
      'Mean OD',
      'Net OD',
      'CV%',
      `孔内浓度 (${data.unit})`,
      `原液浓度 (${data.unit})`,
      '原液浓度 (µg/µL)',
      ...(data.wbEnabled
        ? [
            `蛋白原液 (${data.wbTargetMassUg ?? 20}µg) [µL]`,
            '裂解液补齐 [µL]',
            `${data.wbBufferX}× Loading Buffer [µL]`,
            `总体积 [${data.wbTotalVolUl ?? 40}µL]`,
          ]
        : []),
    ]
    const rows = summary.samples.map((s) => [
      s.sample || '-',
      s.group || '-',
      String(s.dilution),
      Number.isFinite(s.meanOd) ? s.meanOd.toFixed(4) : '-',
      Number.isFinite(s.netOd) ? s.netOd.toFixed(4) : '-',
      Number.isFinite(s.cvPct) ? `${s.cvPct.toFixed(2)}%` : '-',
      Number.isFinite(s.wellConc) ? s.wellConc.toFixed(3) : '-',
      Number.isFinite(s.stockConc) ? s.stockConc.toFixed(3) : '-',
      Number.isFinite(s.stockConcUgPerUl) ? s.stockConcUgPerUl.toFixed(3) : '-',
      ...(data.wbEnabled
        ? [
            Number.isFinite(s.wbSampleVolUl) ? s.wbSampleVolUl.toFixed(2) : '-',
            Number.isFinite(s.wbDiluentVolUl) ? s.wbDiluentVolUl.toFixed(2) : '-',
            Number.isFinite(s.wbBufferVolUl) ? s.wbBufferVolUl.toFixed(2) : '-',
            String(data.wbTotalVolUl ?? 40),
          ]
        : []),
    ])
    const tsv = [headers.join('\t'), ...rows.map((r) => r.join('\t'))].join('\n')
    try {
      navigator.clipboard?.writeText(tsv)
      setCopiedTsv(true)
      setTimeout(() => setCopiedTsv(false), 1800)
    } catch {
      // Fallback ignored
    }
  }

  const stdEvalMap = new Map(summary.standards.map((s) => [s.id, s]))
  const sampleEvalMap = new Map(summary.samples.map((s) => [s.id, s]))

  const r2Value = summary.fit?.r2 ?? NaN
  const r2BadgeClass = !Number.isFinite(r2Value)
    ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
    : r2Value >= 0.995
      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800/60'
      : r2Value >= 0.99
        ? 'bg-brand-50 text-brand-700 border border-brand-200 dark:bg-brand-950/50 dark:text-brand-300 dark:border-brand-800/60'
        : r2Value >= 0.98
          ? 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800/60'
          : 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800/60'

  const r2QualityText = !Number.isFinite(r2Value)
    ? '待拟合'
    : r2Value >= 0.995
      ? '极佳'
      : r2Value >= 0.99
        ? '良好'
        : r2Value >= 0.98
          ? '一般'
          : '偏低'

  return (
    <Panel className="space-y-4">
      {/* 标题与快捷操作栏 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-56 flex-1">
          <BlockTitle
            value={data.title}
            onChange={(title) => onChange({ ...data, title })}
            placeholder="BCA 蛋白定量与 WB 上样配制..."
            readOnly={readOnly}
          />
        </div>
        {!readOnly && (
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              size="sm"
              variant="ghost"
              onClick={applyPiercePreset}
              title="重置为 2000 ~ 0 标准梯度"
            >
              <RotateCcw className="size-3.5" /> 标准梯度预设
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={loadDemoData}
              title="填入一组典型酶标仪 A562 测定数据"
            >
              <Sparkles className="size-3.5 text-brand-600 dark:text-brand-400" /> 示例数据
            </Button>
            <Button size="sm" variant="secondary" onClick={copyResultsAsTsv}>
              {copiedTsv ? (
                <>
                  <Check className="size-3.5 text-emerald-600" /> 已复制 TSV
                </>
              ) : (
                <>
                  <Copy className="size-3.5" /> 复制定量与配制表
                </>
              )}
            </Button>
          </div>
        )}
      </div>

      {/* 全局实验参数控制栏 */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5 rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-xs dark:border-slate-800 dark:bg-slate-900/50">
        <div className="flex items-center gap-2">
          <span className="font-medium text-slate-600 dark:text-slate-300">拟合模型</span>
          <Segmented<BcaFitModel>
            size="sm"
            value={data.fitModel}
            onChange={(fitModel) => !readOnly && onChange({ ...data, fitModel })}
            options={[
              { value: 'linear', label: '线性 y=ax+b', title: '普通最小二乘线性回归' },
              {
                value: 'quadratic',
                label: '二次 y=ax²+bx+c',
                title: 'Pierce BCA 推荐：适配高浓度区微弱向下弯曲',
              },
              { value: 'linear_zero', label: '过原点 y=ax', title: '扣除空白后强制截距为 0' },
            ]}
          />
        </div>

        <label className="flex items-center gap-1.5 font-medium text-slate-600 dark:text-slate-300">
          单位
          <Select
            value={data.unit}
            disabled={readOnly}
            onChange={(e) => handleUnitChange(e.target.value as BcaUnit)}
            className="h-7 w-24 px-2 py-0 text-xs"
          >
            <option value="µg/mL">µg/mL</option>
            <option value="mg/mL">mg/mL</option>
            <option value="µg/µL">µg/µL</option>
          </Select>
        </label>

        <label className="flex items-center gap-1.5 font-medium text-slate-600 dark:text-slate-300">
          复孔数
          <NumInput
            value={n}
            onChange={(v) => v && setReplicates(v)}
            readOnly={readOnly}
            label="复孔数"
            step="1"
            className="h-7 w-14 text-center text-xs"
          />
        </label>

        <label className="flex items-center gap-1.5 font-medium text-slate-600 dark:text-slate-300">
          波长 (nm)
          <NumInput
            value={data.wavelengthNm}
            onChange={(v) => onChange({ ...data, wavelengthNm: v ?? 562 })}
            readOnly={readOnly}
            label="检测波长"
            step="1"
            className="h-7 w-16 text-center text-xs"
          />
        </label>

        <label className="inline-flex cursor-pointer items-center gap-1.5 font-medium text-slate-600 select-none dark:text-slate-300">
          <input
            type="checkbox"
            checked={data.subtractBlank}
            disabled={readOnly}
            onChange={(e) => onChange({ ...data, subtractBlank: e.target.checked })}
            className="size-3.5 rounded accent-brand-600"
          />
          <span>扣除空白孔 (0 浓度)</span>
          {data.subtractBlank && summary.hasBlankRow && (
            <span className="rounded bg-slate-200/70 px-1.5 py-0.5 font-mono text-[11px] text-slate-700 dark:bg-slate-800 dark:text-slate-300">
              -{summary.blankOd.toFixed(4)}
            </span>
          )}
        </label>

        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="ml-auto inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-slate-500 hover:bg-slate-200/60 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            >
              <Info className="size-3.5" />  算法与粘贴说明
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-88 space-y-2 p-3 text-xs leading-relaxed">
          <p className="font-semibold text-slate-900 dark:text-slate-100">
            BCA / 酶标仪定量与 WB 配制计算逻辑：
          </p>
          <ol className="list-decimal space-y-1 pl-4 text-slate-600 dark:text-slate-400">
            <li>
              <strong>空白扣除</strong>：开启后自动取所有启用且浓度为 0 的标准品复孔均值作为 Blank OD，全部孔位按{' '}
              <code>Net OD = Mean OD - Blank OD</code> 参与回归与反算。
            </li>
            <li>
              <strong>标准曲线拟合</strong>：以标准品浓度为 X 轴、Net OD 为 Y 轴。支持普通最小二乘线性回归（
              <code>y = ax + b</code>）与 Thermo Pierce 推荐的二次多项式拟合（
              <code>y = ax² + bx + c</code>，采用坐标缩放列主元消元与单调正根反算）。
            </li>
            <li>
              <strong>WB 上样体积计算</strong>：自动将原液浓度统一换算为{' '}
              <code>µg/µL</code>（<code>1 mg/mL = 1 µg/µL = 1000 µg/mL</code>），按{' '}
              <code>V_样品 = 目标蛋白质量 / 原液浓度(µg/µL)</code>、
              <code>V_Buffer = 总体积 / Buffer倍数</code>、
              <code>V_补齐 = 总体积 - V_样品 - V_Buffer</code> 精确配平。
            </li>
          </ol>
          <p className="border-t border-slate-100 pt-1.5 text-[11px] text-slate-500 dark:border-slate-800">
            支持从 Excel 或酶标仪导出表格直接复制<strong>纯 OD 数值区域</strong>（或含浓度/样品名整行），在标准品表或样品表内按{' '}
            <kbd className="kbd">Ctrl+V</kbd> / <kbd className="kbd">⌘V</kbd> 一键粘贴。
          </p>
          </PopoverContent>
        </Popover>
      </div>

      {/* 拟合方程指标卡片 + SVG 标准曲线图 */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[280px_minmax(0,1fr)]">
        <div className="flex flex-col justify-between rounded-xl border border-slate-200/80 bg-slate-50/40 p-3.5 dark:border-slate-800 dark:bg-slate-900/40">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                标准曲线拟合结果
              </span>
              <Badge className={r2BadgeClass}>
                {Number.isFinite(r2Value) ? `R² = ${r2Value.toFixed(4)} · ${r2QualityText}` : '未拟合'}
              </Badge>
            </div>

            <div className="rounded-lg border border-slate-200/70 bg-white p-2.5 dark:border-slate-800 dark:bg-slate-900">
              <div className="text-[11px] text-slate-400">回归方程 (X: 浓度, Y: Net OD)</div>
              <div className="mt-0.5 font-mono text-xs font-semibold text-slate-800 dark:text-slate-100">
                {summary.fit ? summary.fit.equationText : '等待录入有效标准品数据...'}
              </div>
              {summary.fit && (
                <div className="mt-1 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                  反算: {summary.fit.inverseText}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg border border-slate-200/60 bg-white px-2.5 py-2 dark:border-slate-800 dark:bg-slate-900">
                <div className="text-[11px] text-slate-400">标曲定量范围</div>
                <div className="mt-0.5 font-mono font-medium text-slate-700 dark:text-slate-200">
                  {summary.fit
                    ? `${summary.fit.minConc} ~ ${summary.fit.maxConc} ${data.unit}`
                    : '-'}
                </div>
              </div>
              <div className="rounded-lg border border-slate-200/60 bg-white px-2.5 py-2 dark:border-slate-800 dark:bg-slate-900">
                <div className="text-[11px] text-slate-400">扣除空白 OD</div>
                <div className="mt-0.5 font-mono font-medium text-slate-700 dark:text-slate-200">
                  {data.subtractBlank ? summary.blankOd.toFixed(4) : '0 (未扣除)'}
                </div>
              </div>
            </div>
          </div>

          {summary.issues.length > 0 && (
            <div className="mt-3 space-y-1 rounded-lg border border-amber-200/80 bg-amber-50/80 p-2 text-[11px] text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">
              {summary.issues.map((msg, i) => (
                <div key={i} className="flex items-start gap-1.5">
                  <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                  <span>{msg}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <StandardCurveChart
          summary={summary}
          unit={data.unit}
          wavelengthNm={data.wavelengthNm}
        />
      </div>

      {/* 一、标准品梯度表 */}
      <div
        onPaste={(e) => {
          if (readOnly) return
          const text = e.clipboardData.getData('text')
          const parsed = parseStandardsPaste(text, n, data.standards)
          if (!parsed) return
          e.preventDefault()
          pushUndo('粘贴 BCA 标准品数据', () => onChange(structuredClone(data)))
          setStandards(parsed)
        }}
        className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50/80 px-3 py-2 text-xs dark:border-slate-800 dark:bg-slate-900/60">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-700 dark:text-slate-200">
              1. 标准品梯度 (Standard Curve)
            </span>
            <span className="text-[11px] text-slate-400">
              可取消勾选剔除个别离群标曲点 · 支持直接粘贴 Excel 吸光度区域
            </span>
          </div>
          <span className="font-mono text-[11px] text-slate-500">
            有效拟合点: {summary.fit?.nPoints ?? 0} / {data.standards.length}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50/50 text-slate-500 dark:border-slate-800 dark:bg-slate-900/40">
              <tr>
                <th className="w-10 px-2 py-2 text-center font-medium" title="是否纳入回归拟合">
                  纳入
                </th>
                <th className="w-24 px-2 py-2 font-medium">标识</th>
                <th className="w-28 px-2 py-2 font-medium">浓度 ({data.unit})</th>
                {Array.from({ length: n }).map((_, i) => (
                  <th key={i} className="w-24 px-2 py-2 text-center font-medium">
                    OD {i + 1}
                  </th>
                ))}
                <th className="px-2 py-2 text-right font-medium">Mean OD</th>
                <th className="px-2 py-2 text-right font-medium">Net OD</th>
                <th className="px-2 py-2 text-right font-medium">CV%</th>
                <th className="px-2 py-2 text-right font-medium">回算浓度 (回收率)</th>
                {!readOnly && <th className="w-8" />}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {data.standards.map((r) => {
                const ev = stdEvalMap.get(r.id)
                const enabled = r.enabled ?? true
                return (
                  <ContextMenu key={r.id}>
                    <ContextMenuTrigger asChild>
                      <tr
                        className={cn(
                          'transition-colors hover:bg-slate-50/60 dark:hover:bg-slate-900/40',
                          !enabled && 'opacity-50',
                        )}
                      >
                        <td className="px-2 py-1 text-center">
                          <input
                            type="checkbox"
                            checked={enabled}
                            disabled={readOnly}
                            aria-label={`纳入 ${r.label}`}
                            onChange={(e) =>
                              updateStd(r.id, { enabled: e.target.checked })
                            }
                            className="size-3.5 rounded accent-brand-600"
                          />
                        </td>

                        <td className="p-1">
                          <input
                            value={r.label}
                            readOnly={readOnly}
                            onChange={(e) =>
                              updateStd(r.id, { label: e.target.value })
                            }
                            placeholder="Std"
                            className="cell text-xs font-medium"
                          />
                        </td>

                        <td className="p-1">
                          <NumInput
                            value={r.conc}
                            onChange={(conc) => updateStd(r.id, { conc })}
                            readOnly={readOnly}
                            placeholder="0"
                            label={`${r.label} 浓度`}
                            className="text-right text-xs"
                          />
                        </td>

                        {Array.from({ length: n }).map((_, i) => (
                          <td key={i} className="p-1">
                            <NumInput
                              value={r.ods[i] ?? null}
                              onChange={(val) => {
                                const nextOds = [...r.ods]
                                nextOds[i] = val
                                updateStd(r.id, { ods: nextOds })
                              }}
                              readOnly={readOnly}
                              step="0.001"
                              placeholder="-"
                              label={`${r.label} OD ${i + 1}`}
                              className="text-center text-xs"
                            />
                          </td>
                        ))}

                        <td className="px-2 py-1.5 text-right font-mono text-slate-600 dark:text-slate-400">
                          {ev && Number.isFinite(ev.meanOd)
                            ? ev.meanOd.toFixed(3)
                            : '-'}
                        </td>

                        <td className="px-2 py-1.5 text-right font-mono text-slate-700 dark:text-slate-300">
                          {ev && Number.isFinite(ev.netOd)
                            ? ev.netOd.toFixed(3)
                            : '-'}
                        </td>

                        <td className="px-2 py-1.5 text-right font-mono">
                          {ev && Number.isFinite(ev.cvPct) ? (
                            <span
                              className={cn(
                                ev.highCv
                                  ? 'font-semibold text-amber-600 dark:text-amber-400'
                                  : 'text-slate-500 dark:text-slate-400',
                              )}
                              title={
                                ev.highCv
                                  ? `复孔变异系数超过阈值 ${data.cvThreshold}%`
                                  : undefined
                              }
                            >
                              {ev.cvPct.toFixed(1)}%
                            </span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>

                        <td className="px-2 py-1.5 text-right font-mono text-slate-600 dark:text-slate-400">
                          {ev && Number.isFinite(ev.backCalcConc) ? (
                            <span>
                              {ev.backCalcConc.toFixed(1)}
                              {Number.isFinite(ev.recoveryPct) && (
                                <span
                                  className={cn(
                                    'ml-1 text-[11px]',
                                    ev.recoveryPct < 85 || ev.recoveryPct > 115
                                      ? 'text-amber-600 dark:text-amber-400'
                                      : 'text-slate-400',
                                  )}
                                >
                                  ({ev.recoveryPct.toFixed(0)}%)
                                </span>
                              )}
                            </span>
                          ) : (
                            '-'
                          )}
                        </td>

                        {!readOnly && (
                          <td className="p-1 text-center">
                            <RowDelete
                              onClick={() => {
                                pushUndo('删除标准品行', () =>
                                  onChange(structuredClone(data)),
                                )
                                removeStd(r.id)
                              }}
                            />
                          </td>
                        )}
                      </tr>
                    </ContextMenuTrigger>

                    {!readOnly && (
                      <ContextMenuContent>
                        <ContextMenuItem
                          icon={<Trash2 />}
                          danger
                          onSelect={() => {
                            pushUndo('删除标准品行', () =>
                              onChange(structuredClone(data)),
                            )
                            removeStd(r.id)
                          }}
                        >
                          删除此标准品行
                        </ContextMenuItem>
                      </ContextMenuContent>
                    )}
                  </ContextMenu>
                )
              })}
            </tbody>
          </table>
        </div>

        {!readOnly && <AddRow onClick={addStd}>添加标准品浓度行</AddRow>}
      </div>

      {/* 二、待测样品定量与 WB 上样体系配制表 */}
      <div
        onPaste={(e) => {
          if (readOnly) return
          const text = e.clipboardData.getData('text')
          const parsed = parseSamplesPaste(text, n, data.samples)
          if (!parsed) return
          e.preventDefault()
          pushUndo('粘贴待测样品数据', () => onChange(structuredClone(data)))
          setSamples(parsed)
        }}
        className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50/80 px-3 py-2 text-xs dark:border-slate-800 dark:bg-slate-900/60">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-semibold text-slate-700 dark:text-slate-200">
              2. 待测样品定量与 WB 上样配制
            </span>

            {!readOnly && (
              <div className="flex items-center gap-1 text-[11px] text-slate-500">
                <span>批量稀释倍数:</span>
                {[1, 2, 5, 10, 20].map((dil) => (
                  <button
                    key={dil}
                    type="button"
                    onClick={() => {
                      pushUndo(`批量设稀释倍数 ${dil}×`, () =>
                        onChange(structuredClone(data)),
                      )
                      setSamples(data.samples.map((s) => ({ ...s, dilution: dil })))
                    }}
                    className="cursor-pointer rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[11px] text-slate-600 hover:border-brand-400 hover:text-brand-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                  >
                    {dil}×
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* WB 上样体系参数配置内联栏 */}
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex cursor-pointer items-center gap-1.5 font-medium text-slate-600 select-none dark:text-slate-300">
              <input
                type="checkbox"
                checked={data.wbEnabled}
                disabled={readOnly}
                onChange={(e) =>
                  onChange({ ...data, wbEnabled: e.target.checked })
                }
                className="size-3.5 rounded accent-brand-600"
              />
              <span>WB 上样体积计算</span>
            </label>

            {data.wbEnabled && (
              <>
                <label className="flex items-center gap-1 text-[11px] text-slate-600 dark:text-slate-300">
                  目标上样量(µg)
                  <NumInput
                    value={data.wbTargetMassUg}
                    onChange={(wbTargetMassUg) =>
                      onChange({ ...data, wbTargetMassUg })
                    }
                    readOnly={readOnly}
                    label="目标蛋白上样量 (µg)"
                    className="h-7 w-16 text-center text-xs"
                  />
                </label>

                <label className="flex items-center gap-1 text-[11px] text-slate-600 dark:text-slate-300">
                  总体积(µL)
                  <NumInput
                    value={data.wbTotalVolUl}
                    onChange={(wbTotalVolUl) =>
                      onChange({ ...data, wbTotalVolUl })
                    }
                    readOnly={readOnly}
                    label="配制总体积 (µL)"
                    className="h-7 w-16 text-center text-xs"
                  />
                </label>

                <label className="flex items-center gap-1 text-[11px] text-slate-600 dark:text-slate-300">
                  Loading Buffer
                  <Select
                    value={String(data.wbBufferX)}
                    disabled={readOnly}
                    onChange={(e) =>
                      onChange({
                        ...data,
                        wbBufferX: Number(e.target.value) as LoadingBufferConc,
                      })
                    }
                    className="h-7 w-16 px-1.5 py-0 text-xs"
                  >
                    <option value="5">5×</option>
                    <option value="4">4×</option>
                    <option value="6">6×</option>
                    <option value="2">2×</option>
                  </Select>
                </label>
              </>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className={cn('w-full text-left text-xs', data.wbEnabled ? 'min-w-[1120px]' : 'min-w-[880px]')}>
            <thead className="border-b border-slate-200 bg-slate-50/50 text-slate-500 dark:border-slate-800 dark:bg-slate-900/40">
              <tr>
                <th className="min-w-28 px-2 py-2 font-medium">样品名称</th>
                <th className="w-24 px-2 py-2 font-medium">组别</th>
                <th className="w-20 px-2 py-2 text-center font-medium">稀释倍数</th>
                {Array.from({ length: n }).map((_, i) => (
                  <th key={i} className="w-20 px-2 py-2 text-center font-medium">
                    OD {i + 1}
                  </th>
                ))}
                <th className="px-2 py-2 text-right font-medium">Mean OD</th>
                <th className="px-2 py-2 text-right font-medium">CV%</th>
                <th className="px-2 py-2 text-right font-medium">
                  原液浓度 ({data.unit})
                </th>
                {data.wbEnabled && (
                  <>
                    <th className="bg-brand-50/60 px-2 py-2 text-right font-medium text-brand-800 dark:bg-brand-950/30 dark:text-brand-300">
                      蛋白原液 (µL)
                    </th>
                    <th className="bg-brand-50/60 px-2 py-2 text-right font-medium text-brand-800 dark:bg-brand-950/30 dark:text-brand-300">
                      裂解液补齐 (µL)
                    </th>
                    <th className="bg-brand-50/60 px-2 py-2 text-right font-medium text-brand-800 dark:bg-brand-950/30 dark:text-brand-300">
                      {data.wbBufferX}× Buffer (µL)
                    </th>
                  </>
                )}
                {!readOnly && <th className="w-8" />}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {data.samples.map((r) => {
                const ev = sampleEvalMap.get(r.id)
                return (
                  <ContextMenu key={r.id}>
                    <ContextMenuTrigger asChild>
                      <tr className="hover:bg-slate-50/60 dark:hover:bg-slate-900/40">
                        <td className="p-1">
                          <input
                            value={r.sample}
                            readOnly={readOnly}
                            onChange={(e) =>
                              updateSample(r.id, { sample: e.target.value })
                            }
                            placeholder="Sample 1"
                            className="cell text-xs font-medium"
                          />
                        </td>

                        <td className="p-1">
                          <input
                            value={r.group}
                            readOnly={readOnly}
                            onChange={(e) =>
                              updateSample(r.id, { group: e.target.value })
                            }
                            placeholder="Control"
                            className="cell text-xs"
                          />
                        </td>

                        <td className="p-1">
                          <NumInput
                            value={r.dilution}
                            onChange={(dilution) =>
                              updateSample(r.id, { dilution })
                            }
                            readOnly={readOnly}
                            step="1"
                            placeholder="1"
                            label={`${r.sample || '样品'} 稀释倍数`}
                            className="text-center text-xs"
                          />
                        </td>

                        {Array.from({ length: n }).map((_, i) => (
                          <td key={i} className="p-1">
                            <NumInput
                              value={r.ods[i] ?? null}
                              onChange={(val) => {
                                const nextOds = [...r.ods]
                                nextOds[i] = val
                                updateSample(r.id, { ods: nextOds })
                              }}
                              readOnly={readOnly}
                              step="0.001"
                              placeholder="-"
                              label={`${r.sample || '样品'} OD ${i + 1}`}
                              className="text-center text-xs"
                            />
                          </td>
                        ))}

                        <td className="px-2 py-1.5 text-right font-mono text-slate-600 dark:text-slate-400">
                          {ev && Number.isFinite(ev.meanOd)
                            ? ev.meanOd.toFixed(3)
                            : '-'}
                        </td>

                        <td className="px-2 py-1.5 text-right font-mono">
                          {ev && Number.isFinite(ev.cvPct) ? (
                            <span
                              className={cn(
                                ev.highCv
                                  ? 'font-semibold text-amber-600 dark:text-amber-400'
                                  : 'text-slate-500 dark:text-slate-400',
                              )}
                            >
                              {ev.cvPct.toFixed(1)}%
                            </span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>

                        <td className="px-2 py-1.5 text-right font-mono">
                          {ev && Number.isFinite(ev.stockConc) ? (
                            <div className="inline-flex flex-col items-end">
                              <span className="inline-flex items-center gap-1 font-semibold text-brand-700 dark:text-brand-300">
                                {ev.flag === 'above_range' && (
                                  <Tooltip content="孔内浓度超出标曲最高点，建议加大稀释倍数重测">
                                    <span className="rounded bg-amber-100 px-1 text-[10px] font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                                      超上限
                                    </span>
                                  </Tooltip>
                                )}
                                {ev.flag === 'below_range' && (
                                  <Tooltip content="孔内浓度低于标曲最低非零点">
                                    <span className="rounded bg-amber-100 px-1 text-[10px] font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                                      超下限
                                    </span>
                                  </Tooltip>
                                )}
                                {data.unit === 'µg/mL'
                                  ? ev.stockConc.toFixed(1)
                                  : ev.stockConc.toFixed(3)}
                              </span>
                              {data.unit === 'µg/mL' && (
                                <span className="text-[10px] text-slate-400">
                                  ({ev.stockConcUgPerUl.toFixed(2)} µg/µL)
                                </span>
                              )}
                            </div>
                          ) : ev?.flag === 'negative_conc' ? (
                            <span className="text-rose-500" title="扣除空白后净吸光度 <= 0">
                              ≤ Blank
                            </span>
                          ) : ev?.flag === 'saturated' ? (
                            <span className="text-rose-500" title="吸光度超出二次曲线顶点饱和区">
                              饱和超限
                            </span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>

                        {data.wbEnabled && (
                          <>
                            <td className="bg-brand-50/25 px-2 py-1.5 text-right font-mono font-medium text-slate-800 dark:bg-brand-950/15 dark:text-slate-200">
                              {ev && Number.isFinite(ev.wbSampleVolUl)
                                ? ev.wbSampleVolUl.toFixed(2)
                                : '-'}
                            </td>
                            <td className="bg-brand-50/25 px-2 py-1.5 text-right font-mono dark:bg-brand-950/15">
                              {ev && Number.isFinite(ev.wbDiluentVolUl) ? (
                                ev.wbVolumeOverflow ? (
                                  <Tooltip
                                    content={`样品浓度过低！在 ${
                                      data.wbTotalVolUl ?? 40
                                    } µL 体系下最多仅能上样 ${ev.wbMaxPossibleMassUg.toFixed(
                                      1,
                                    )} µg 蛋白`}
                                  >
                                    <span className="inline-flex items-center gap-0.5 font-semibold text-rose-600 dark:text-rose-400">
                                      <TriangleAlert className="size-3" />
                                      {ev.wbDiluentVolUl.toFixed(1)} (超体积)
                                    </span>
                                  </Tooltip>
                                ) : (
                                  <span className="text-slate-700 dark:text-slate-300">
                                    {ev.wbDiluentVolUl.toFixed(2)}
                                  </span>
                                )
                              ) : (
                                '-'
                              )}
                            </td>
                            <td className="bg-brand-50/25 px-2 py-1.5 text-right font-mono text-slate-500 dark:bg-brand-950/15 dark:text-slate-400">
                              {ev && Number.isFinite(ev.wbBufferVolUl)
                                ? ev.wbBufferVolUl.toFixed(1)
                                : '-'}
                            </td>
                          </>
                        )}

                        {!readOnly && (
                          <td className="p-1 text-center">
                            <RowDelete
                              onClick={() => {
                                pushUndo('删除待测样品行', () =>
                                  onChange(structuredClone(data)),
                                )
                                removeSample(r.id)
                              }}
                            />
                          </td>
                        )}
                      </tr>
                    </ContextMenuTrigger>

                    {!readOnly && (
                      <ContextMenuContent>
                        <ContextMenuItem
                          icon={<Trash2 />}
                          danger
                          onSelect={() => {
                            pushUndo('删除待测样品行', () =>
                              onChange(structuredClone(data)),
                            )
                            removeSample(r.id)
                          }}
                        >
                          删除此样品行
                        </ContextMenuItem>
                      </ContextMenuContent>
                    )}
                  </ContextMenu>
                )
              })}
            </tbody>
          </table>
        </div>

        {!readOnly && <AddRow onClick={addSample}>添加待测样品行</AddRow>}
      </div>
    </Panel>
  )
}
