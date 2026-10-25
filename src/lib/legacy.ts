// 从旧版 ExPermit（FastAPI + SQLite）导入。旧版通过 /api 提供 JSON，这里接受用户粘贴或上传的导出 JSON：
// { experiments: [...], reagents: [...], schedules: [...], usage: [...], data_records: [...] }
// 字段名与旧版 SQLite 表一致（见旧项目 backend/database.py）。
import { db } from './db'
import { createExperiment, saveReagent } from './repo'
import { newReagentLine } from '@/blocks/defs'
import { uid } from './util'
import type { Well } from '@/blocks/defs'

interface LegacyExperiment {
  id: number
  title: string
  objective?: string
  protocol?: string
  status?: string
  tags?: string
  created_at?: string
  equipment?: string
  wells?: string
}
interface LegacyReagent {
  id: number
  name: string
  category?: string
  spec?: string
  lot_no?: string
  expiry?: string
  storage?: string
  stock_qty?: number
  stock_unit?: string
  note?: string
}
interface LegacySchedule {
  id: number
  title: string
  detail?: string
  date: string
  start_time?: string
  status?: string
  experiment_id?: number | null
}
interface LegacyUsage {
  reagent_id: number
  experiment_id?: number | null
  amount: number
  unit: string
  note?: string
}
interface LegacyRecord {
  experiment_id?: number | null
  name: string
  record_type?: string
  content?: string
}

export interface LegacyDump {
  experiments?: LegacyExperiment[]
  reagents?: LegacyReagent[]
  schedules?: LegacySchedule[]
  usage?: LegacyUsage[]
  data_records?: LegacyRecord[]
}

const PLATE_MAP: Record<string, string> = { '6孔板': 'p6', '12孔板': 'p12', '24孔板': 'p24', '48孔板': 'p48', '96孔板': 'p96' }
const STATUS_MAP: Record<string, 'planned' | 'running' | 'done'> = { 计划中: 'planned', 进行中: 'running', 已完成: 'done' }
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const para = (s: string) => s.split(/\n+/).map((l) => `<p>${esc(l)}</p>`).join('')

export async function importLegacy(dump: LegacyDump) {
  const reagentMap = new Map<number, string>()
  for (const r of dump.reagents ?? []) {
    // 旧库存允许空单位；按原值导入，不做推断。导入不再重复扣减——旧库存数已是扣减后的结果
    const id = await saveReagent({
      name: r.name,
      category: r.category ?? '',
      spec: r.spec ?? '',
      lot: r.lot_no ?? '',
      expiry: r.expiry || null,
      storage: r.storage ?? '',
      stockQty: typeof r.stock_qty === 'number' ? r.stock_qty : null,
      stockUnit: r.stock_unit ?? '',
      note: r.note ?? '',
    })
    reagentMap.set(r.id, id)
  }

  const expMap = new Map<number, string>()
  let project = await db.projects.where('name').equals('从旧版导入').first()
  if (!project && (dump.experiments ?? []).length) {
    project = { id: uid(), name: '从旧版导入', color: 'slate', createdAt: Date.now() }
    await db.projects.add(project)
  }
  for (const e of dump.experiments ?? []) {
    const blocks: { type: string; data: unknown }[] = []
    const html = [e.objective && `<h2>目的</h2>${para(e.objective)}`, e.protocol && `<h2>方案</h2>${para(e.protocol)}`].filter(Boolean).join('')
    if (html) blocks.push({ type: 'text', data: { html } })
    const plateId = e.equipment ? PLATE_MAP[e.equipment] : undefined
    if (plateId) {
      let wellsRaw: Record<string, Partial<{ name: string; reagents: string; conditions: string }>> = {}
      try {
        wellsRaw = e.wells ? JSON.parse(e.wells) : {}
      } catch {
        wellsRaw = {}
      }
      const wells: Record<string, Well> = {}
      for (const [k, v] of Object.entries(wellsRaw)) wells[k] = { sample: v.name ?? '', treatment: v.reagents ?? '', note: v.conditions ?? '', group: null }
      blocks.push({ type: 'plate', data: { plateId, title: e.equipment, wells, groups: [] } })
    }
    const recs = (dump.data_records ?? []).filter((r) => r.experiment_id === e.id && r.record_type !== '文件')
    if (recs.length) blocks.push({ type: 'table', data: { title: '数据记录', columns: ['名称', '类型', '内容'], rows: recs.map((r) => [r.name, r.record_type ?? '', r.content ?? '']) } })
    const uses = (dump.usage ?? []).filter((u) => u.experiment_id === e.id && reagentMap.has(u.reagent_id))
    if (uses.length) {
      // 标记为未勾选：旧系统已扣过库存，避免重复扣减；用户核对后可自行勾选
      blocks.push({
        type: 'reagents',
        data: { items: uses.map((u) => ({ ...newReagentLine(), reagentId: reagentMap.get(u.reagent_id)!, name: (dump.reagents ?? []).find((r) => r.id === u.reagent_id)?.name ?? '', amount: u.amount, unit: u.unit, note: u.note ?? '', used: false })) },
      })
    }
    const ne = await createExperiment({
      title: e.title,
      kind: plateId ? 'assay' : 'general',
      projectId: project?.id ?? null,
      tags: (e.tags ?? '').split(/[,，\s]+/).filter(Boolean),
      blocks,
    })
    await db.experiments.update(ne.id, { status: STATUS_MAP[e.status ?? ''] ?? 'running' })
    expMap.set(e.id, ne.id)
  }

  for (const s of dump.schedules ?? []) {
    await db.schedules.add({
      id: uid(),
      date: s.date,
      time: s.start_time ?? '',
      title: s.title,
      note: s.detail ?? '',
      done: s.status === '已完成',
      experimentId: s.experiment_id ? (expMap.get(s.experiment_id) ?? null) : null,
      createdAt: Date.now(),
    })
  }
  return { experiments: expMap.size, reagents: reagentMap.size, schedules: (dump.schedules ?? []).length }
}
