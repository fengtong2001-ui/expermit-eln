import { db } from './db'
import type { Template } from './types'
import { newAntibody, newLane, newQpcrRow, newStep, newVessel } from '@/blocks/defs'

const SOP_NOTE = '<p><em>预设参数是常用起点，不是标准答案：请按本实验室 SOP 与试剂说明书核对后再用。</em></p>'

// 内置模板只给出结构和常见起点参数，id 固定，便于升级时覆盖
export function builtinTemplates(): Template[] {
  const t = 0
  return [
    {
      id: 'builtin-general',
      name: '空白实验',
      kind: 'general',
      description: '只有一段文字，从零开始',
      builtin: true,
      createdAt: t,
      updatedAt: 0,
      blocks: [{ type: 'text', data: { html: '<h2>目的</h2><p></p><h2>方法</h2><p></p><h2>结果</h2><p></p><h2>结论</h2><p></p>' } }],
    },
    {
      id: 'builtin-wb',
      name: 'Western Blot',
      kind: 'wb',
      description: '流程清单、泳道表、抗体与结果图',
      builtin: true,
      createdAt: t,
      updatedAt: 0,
      blocks: [
        { type: 'text', data: { html: '<h2>目的</h2><p></p>' + SOP_NOTE } },
        {
          type: 'protocol',
          data: {
            title: 'WB 流程',
            steps: [
              newStep('样品制备与蛋白定量', 'BCA 定量，按最低浓度配平'),
              newStep('变性', '加上样缓冲液，95 °C', 5),
              newStep('配胶 / 上样', ''),
              newStep('电泳', '浓缩胶恒压后转分离胶'),
              newStep('转膜', 'PVDF 需甲醇活化'),
              newStep('封闭', '5% 脱脂奶 / BSA，室温', 60),
              newStep('一抗孵育', '4 °C 过夜'),
              newStep('洗膜', 'TBST × 3', 15),
              newStep('二抗孵育', '室温', 60),
              newStep('洗膜', 'TBST × 3', 15),
              newStep('显影与拍照', 'ECL'),
            ],
          },
        },
        { type: 'lanes', data: { title: '上样顺序', gel: '10% SDS-PAGE · 10 孔', lanes: [newLane('Marker', '5 µL'), newLane(), newLane(), newLane(), newLane(), newLane()] } },
        { type: 'antibodies', data: { items: [newAntibody('一抗'), newAntibody('一抗'), newAntibody('二抗')] } },
        { type: 'files', data: { items: [] } },
        { type: 'text', data: { html: '<h2>结果与结论</h2><p></p>' } },
      ],
    },
    {
      id: 'builtin-qpcr',
      name: 'qPCR 相对定量',
      kind: 'qpcr',
      description: '布板、Ct 值录入与 2^-ΔΔCt',
      builtin: true,
      createdAt: t,
      updatedAt: 0,
      blocks: [
        { type: 'text', data: { html: '<h2>目的</h2><p></p>' } },
        { type: 'plate', data: { plateId: 'p96', title: 'qPCR 布板', wells: {}, groups: [] } },
        { type: 'reagents', data: { items: [] } },
        { type: 'qpcr', data: { reference: 'GAPDH', control: '对照', replicates: 3, rows: [newQpcrRow(), newQpcrRow(), newQpcrRow(), newQpcrRow()] } },
        { type: 'text', data: { html: '<h2>结论</h2><p></p>' } },
      ],
    },
    {
      id: 'builtin-cell',
      name: '细胞培养与传代',
      kind: 'cell',
      description: '培养容器、传代代次与观察记录',
      builtin: true,
      createdAt: t,
      updatedAt: 0,
      blocks: [
        { type: 'culture', data: { vessels: [newVessel('T25 培养瓶')] } },
        { type: 'protocol', data: { title: '传代', steps: [newStep('弃旧培养基，PBS 洗'), newStep('胰酶消化', '37 °C', 2), newStep('终止消化并吹打'), newStep('离心', '', 5), newStep('重悬、计数、接种')] } },
        { type: 'files', data: { items: [] } },
        { type: 'text', data: { html: '<h2>观察</h2><p></p>' } },
      ],
    },
    {
      id: 'builtin-assay',
      name: '孔板检测（CCK-8 / ELISA）',
      kind: 'assay',
      description: '布板、读数表与结论',
      builtin: true,
      createdAt: t,
      updatedAt: 0,
      blocks: [
        { type: 'text', data: { html: '<h2>目的</h2><p></p>' } },
        { type: 'plate', data: { plateId: 'p96', title: '布板', wells: {}, groups: [] } },
        { type: 'reagents', data: { items: [] } },
        { type: 'table', data: { title: '读数（OD）', columns: ['组别', '复孔 1', '复孔 2', '复孔 3'], rows: [['', '', '', ''], ['', '', '', ''], ['', '', '', '']] } },
        { type: 'text', data: { html: '<h2>结论</h2><p></p>' } },
      ],
    },
  ]
}

let seeded: Promise<void> | null = null

export function ensureSeed() {
  seeded ??= (async () => {
    await db.templates.bulkPut(builtinTemplates())
    if ((await db.projects.count()) === 0 && (await db.experiments.count()) === 0) {
      await db.projects.add({ id: 'default', name: '我的课题', color: 'teal', createdAt: Date.now(), updatedAt: Date.now() })
    }
  })()
  return seeded
}
