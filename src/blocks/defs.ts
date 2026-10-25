// 块类型的纯逻辑定义（不含 React），供仓库层、搜索、导出、测试共用
import { uid } from '@/lib/util'
import type { QpcrRow } from '@/lib/qpcr'

export interface TextData { html: string }
export interface FileItem { id: string; fileId: string; name: string; mime: string; size: number; caption: string }
export interface FilesData { items: FileItem[] }
export interface TableData { title: string; columns: string[]; rows: string[][] }
export interface Well { sample: string; treatment: string; note: string; group: string | null }
export interface PlateGroup { id: string; name: string; color: string }
export interface PlateData { plateId: string; title: string; wells: Record<string, Well>; groups: PlateGroup[] }
export interface ReagentLine { id: string; reagentId: string | null; name: string; amount: number | null; unit: string; note: string; used: boolean }
export interface ReagentsData { items: ReagentLine[] }
export interface Step { id: string; title: string; params: string; minutes: number | null; done: boolean; note: string }
export interface ProtocolData { title: string; steps: Step[] }
export interface Lane { id: string; sample: string; load: string; treatment: string }
export interface LanesData { title: string; gel: string; lanes: Lane[] }
export interface Antibody { id: string; kind: '一抗' | '二抗'; reagentId: string | null; name: string; host: string; dilution: number | null; volumeMl: number | null; note: string; used: boolean }
export interface AntibodiesData { items: Antibody[] }
export interface QpcrData { reference: string; control: string; replicates: number; rows: QpcrRow[] }
export interface Vessel { id: string; vessel: string; cellLine: string; passage: string; seededOn: string; density: string; confluence: string; note: string }
export interface CultureData { vessels: Vessel[] }

export type BlockType = 'text' | 'files' | 'table' | 'plate' | 'reagents' | 'protocol' | 'lanes' | 'antibodies' | 'qpcr' | 'culture'

export interface UsageLine { itemId: string; reagentId: string; amount: number; unit: string }

export interface BlockDef<T = any> {
  type: BlockType
  label: string
  description: string
  keywords: string
  group: '基础' | '实验设计' | '试剂与耗材' | 'Western Blot' | '分析'
  create: () => T
  /** 复制实验 / 存模板时：保留结构配置，清掉运行痕迹与结果 */
  clone: (d: T) => T
  /** 供搜索的纯文本 */
  text: (d: T) => string
  /** 会从库存扣减的条目 */
  usages?: (d: T) => UsageLine[]
}

const stripHtml = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()
const join = (...xs: (string | number | null | undefined)[]) => xs.filter((x) => x !== null && x !== undefined && x !== '').join(' ')

export const newStep = (title = '', params = '', minutes: number | null = null): Step => ({ id: uid(), title, params, minutes, done: false, note: '' })
export const newLane = (sample = '', load = '', treatment = ''): Lane => ({ id: uid(), sample, load, treatment })
export const newReagentLine = (): ReagentLine => ({ id: uid(), reagentId: null, name: '', amount: null, unit: '', note: '', used: true })
export const newAntibody = (kind: '一抗' | '二抗' = '一抗'): Antibody => ({ id: uid(), kind, reagentId: null, name: '', host: '', dilution: null, volumeMl: null, note: '', used: true })
export const newVessel = (vessel = 'T25 培养瓶'): Vessel => ({ id: uid(), vessel, cellLine: '', passage: '', seededOn: '', density: '', confluence: '', note: '' })
export const newQpcrRow = (replicates = 3): QpcrRow => ({ id: uid(), sample: '', group: '', target: '', cts: Array(replicates).fill(null) })

export const DEFS: Record<BlockType, BlockDef> = {
  text: {
    type: 'text',
    label: '文本',
    description: '标题、列表、待办、引用',
    keywords: 'wenben text 文字 笔记 记录 段落',
    group: '基础',
    create: (): TextData => ({ html: '' }),
    clone: (d: TextData) => ({ html: d.html.replace(/data-checked="true"/g, 'data-checked="false"').replace(/ checked="checked"/g, '') }),
    text: (d: TextData) => stripHtml(d.html ?? ''),
  },
  files: {
    type: 'files',
    label: '图片与文件',
    description: '拍照、拖拽或粘贴截图',
    keywords: 'tupian image photo file 附件 照片 截图 胶图',
    group: '基础',
    create: (): FilesData => ({ items: [] }),
    clone: (): FilesData => ({ items: [] }),
    text: (d: FilesData) => d.items.map((i) => join(i.name, i.caption)).join(' '),
  },
  table: {
    type: 'table',
    label: '数据表',
    description: '可从 Excel 直接粘贴',
    keywords: 'biaoge table excel 数据 表格 数值',
    group: '基础',
    create: (): TableData => ({ title: '', columns: ['样品', '数值 1', '数值 2'], rows: [['', '', ''], ['', '', ''], ['', '', '']] }),
    clone: (d: TableData) => ({ ...d, rows: d.rows.map((r) => r.map((c, i) => (i === 0 ? c : ''))) }),
    text: (d: TableData) => join(d.title, d.columns.join(' '), d.rows.map((r) => r.join(' ')).join(' ')),
  },
  plate: {
    type: 'plate',
    label: '孔板布局',
    description: '6–96 孔板，框选与复制粘贴',
    keywords: 'kongban plate well 96 48 24 12 6 孔 布板',
    group: '实验设计',
    create: (): PlateData => ({ plateId: 'p96', title: '', wells: {}, groups: [] }),
    clone: (d: PlateData) => structuredClone(d),
    text: (d: PlateData) => join(d.title, d.groups.map((g) => g.name).join(' '), Object.values(d.wells).map((w) => join(w.sample, w.treatment, w.note)).join(' ')),
  },
  culture: {
    type: 'culture',
    label: '培养容器',
    description: 'T25 / T75 / 培养皿，传代记录',
    keywords: 'peiyang culture flask t25 t75 dish 细胞 传代 培养瓶 培养皿',
    group: '实验设计',
    create: (): CultureData => ({ vessels: [newVessel()] }),
    clone: (d: CultureData) => ({ vessels: d.vessels.map((v) => ({ ...v, id: uid(), seededOn: '', confluence: '', note: '' })) }),
    text: (d: CultureData) => d.vessels.map((v) => join(v.vessel, v.cellLine, v.passage && `P${v.passage}`, v.note)).join(' '),
  },
  reagents: {
    type: 'reagents',
    label: '试剂消耗',
    description: '从试剂库选择，勾选后自动扣库存',
    keywords: 'shiji reagent stock 试剂 库存 用量 消耗',
    group: '试剂与耗材',
    create: (): ReagentsData => ({ items: [newReagentLine()] }),
    clone: (d: ReagentsData) => ({ items: d.items.map((i) => ({ ...i, id: uid(), used: false })) }),
    text: (d: ReagentsData) => d.items.map((i) => join(i.name, i.note)).join(' '),
    usages: (d: ReagentsData) =>
      d.items
        .filter((i) => i.used && i.reagentId && i.amount && i.amount > 0)
        .map((i) => ({ itemId: i.id, reagentId: i.reagentId!, amount: i.amount!, unit: i.unit })),
  },
  protocol: {
    type: 'protocol',
    label: '实验步骤',
    description: '可勾选的步骤清单，带计时器',
    keywords: 'buzhou protocol step 流程 步骤 sop 计时',
    group: '实验设计',
    create: (): ProtocolData => ({ title: '', steps: [newStep()] }),
    clone: (d: ProtocolData) => ({ ...d, steps: d.steps.map((s) => ({ ...s, id: uid(), done: false, note: '' })) }),
    text: (d: ProtocolData) => join(d.title, d.steps.map((s) => join(s.title, s.params, s.note)).join(' ')),
  },
  lanes: {
    type: 'lanes',
    label: '泳道表',
    description: '上样顺序、上样量与处理',
    keywords: 'yongdao lane gel wb 上样 胶 泳道',
    group: 'Western Blot',
    create: (): LanesData => ({ title: '', gel: '10% SDS-PAGE · 10 孔', lanes: [newLane('Marker'), newLane(), newLane(), newLane()] }),
    clone: (d: LanesData) => ({ ...d, lanes: d.lanes.map((l) => ({ ...l, id: uid() })) }),
    text: (d: LanesData) => join(d.title, d.gel, d.lanes.map((l) => join(l.sample, l.treatment)).join(' ')),
  },
  antibodies: {
    type: 'antibodies',
    label: '抗体',
    description: '稀释比例自动算用量，可扣库存',
    keywords: 'kangti antibody 一抗 二抗 稀释 wb',
    group: 'Western Blot',
    create: (): AntibodiesData => ({ items: [newAntibody('一抗'), newAntibody('二抗')] }),
    clone: (d: AntibodiesData) => ({ items: d.items.map((i) => ({ ...i, id: uid(), used: false })) }),
    text: (d: AntibodiesData) => d.items.map((i) => join(i.kind, i.name, i.host, i.dilution && `1:${i.dilution}`, i.note)).join(' '),
    usages: (d: AntibodiesData) =>
      d.items
        .filter((i) => i.used && i.reagentId && i.dilution && i.dilution > 0 && i.volumeMl && i.volumeMl > 0)
        .map((i) => ({ itemId: i.id, reagentId: i.reagentId!, amount: antibodyMicroliters(i)!, unit: 'µL' })),
  },
  qpcr: {
    type: 'qpcr',
    label: 'qPCR 定量',
    description: 'Ct 值录入，自动算 2^-ΔΔCt',
    keywords: 'qpcr pcr ct ddct 定量 荧光 表达',
    group: '分析',
    create: (): QpcrData => ({ reference: 'GAPDH', control: '对照', replicates: 3, rows: [newQpcrRow(), newQpcrRow()] }),
    clone: (d: QpcrData) => ({ ...d, rows: d.rows.map((r) => ({ ...r, id: uid(), cts: r.cts.map(() => null) })) }),
    text: (d: QpcrData) => join(d.reference, d.control, d.rows.map((r) => join(r.sample, r.group, r.target)).join(' ')),
  },
}

/** 一抗/二抗工作液中原液体积（µL）= 工作液体积(mL) × 1000 / 稀释倍数 */
export function antibodyMicroliters(a: Pick<Antibody, 'dilution' | 'volumeMl'>) {
  if (!a.dilution || !a.volumeMl || a.dilution <= 0 || a.volumeMl <= 0) return null
  return Math.round(((a.volumeMl * 1000) / a.dilution) * 1000) / 1000
}

export const BLOCK_ORDER: BlockType[] = ['text', 'files', 'table', 'protocol', 'plate', 'culture', 'reagents', 'antibodies', 'lanes', 'qpcr']

/** 不同实验类型推荐的块，排在插入菜单最前 */
export const RECOMMENDED: Record<string, BlockType[]> = {
  general: ['text', 'files', 'table'],
  wb: ['protocol', 'lanes', 'antibodies', 'files'],
  qpcr: ['qpcr', 'plate', 'reagents'],
  cell: ['culture', 'plate', 'protocol'],
  assay: ['plate', 'table', 'reagents'],
}

export function defOf(type: string): BlockDef | null {
  return (DEFS as Record<string, BlockDef>)[type] ?? null
}

export function cloneBlockData(type: string, data: unknown) {
  const d = defOf(type)
  return d ? d.clone(structuredClone(data)) : structuredClone(data)
}

export function blockText(type: string, data: unknown) {
  try {
    return defOf(type)?.text(data) ?? ''
  } catch {
    return ''
  }
}

export function blockUsages(type: string, data: unknown): UsageLine[] {
  try {
    return defOf(type)?.usages?.(data) ?? []
  } catch {
    return []
  }
}
