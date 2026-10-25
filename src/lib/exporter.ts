import { db, TABLES } from './db'
import { collectFileIds, liveBlocks } from './repo'
import { zip, unzip, type ZipEntry } from './zip'
import { blockText, defOf } from '@/blocks/defs'
import { downloadBlob, formatDateTime, todayStr } from './util'
import { kindOf, STATUS_META } from './kinds'
import type { StoredFile } from './types'

const safe = (s: string) => s.replace(/[\\/:*?"<>|]/g, '_').slice(0, 60)

/** 单个实验：人能读的 Markdown + 机器能读的 JSON + 原始附件 */
export async function exportExperimentZip(id: string) {
  const e = await db.experiments.get(id)
  if (!e) return
  const blocks = await liveBlocks(id)
  const project = e.projectId ? await db.projects.get(e.projectId) : null
  const entries: ZipEntry[] = []
  const lines = [
    `# ${e.title}`,
    '',
    `- 编号：${e.code}`,
    `- 类型：${kindOf(e.kind).label}`,
    `- 状态：${STATUS_META[e.status].label}`,
    project ? `- 项目：${project.name}` : '',
    e.tags.length ? `- 标签：${e.tags.map((t) => `#${t}`).join(' ')}` : '',
    `- 创建：${formatDateTime(e.createdAt)}　最后修改：${formatDateTime(e.updatedAt)}`,
    e.firstClosedAt ? `- 首次完成：${formatDateTime(e.firstClosedAt)}${e.editsAfterClose ? `（完成后修改 ${e.editsAfterClose} 次）` : ''}` : '',
    '',
  ].filter((x) => x !== '')
  for (const b of blocks) {
    lines.push('', `## ${defOf(b.type)?.label ?? b.type}`, '', blockText(b.type, b.data) || '（空）')
    for (const fid of collectFileIds(b)) {
      const f = await db.files.get(fid)
      if (f) {
        const p = `附件/${fid.slice(0, 6)}-${safe(f.name)}`
        entries.push({ path: p, data: new Uint8Array(await f.blob.arrayBuffer()) })
        lines.push('', `![${f.name}](${encodeURI(p)})`)
      }
    }
  }
  entries.unshift({ path: '实验记录.md', data: lines.join('\n') }, { path: 'experiment.json', data: JSON.stringify({ experiment: e, blocks }, null, 2) })
  const out = zip(entries)
  downloadBlob(new Blob([out as BlobPart], { type: 'application/zip' }), `${e.code} ${safe(e.title)}.zip`)
}

// ───────── 全量备份与恢复 ─────────

export const BACKUP_VERSION = 1

export async function exportAll(): Promise<Uint8Array> {
  const entries: ZipEntry[] = []
  const meta: Record<string, number> = {}
  for (const t of TABLES) {
    if (t === 'files') continue
    const rows = await db.table(t).toArray()
    meta[t] = rows.length
    entries.push({ path: `data/${t}.json`, data: JSON.stringify(rows) })
  }
  const files = (await db.files.toArray()) as StoredFile[]
  meta.files = files.length
  entries.push({ path: 'data/files.json', data: JSON.stringify(files.map(({ blob: _b, ...rest }) => rest)) })
  for (const f of files) entries.push({ path: `files/${f.id}`, data: new Uint8Array(await f.blob.arrayBuffer()) })
  entries.unshift({ path: 'backup.json', data: JSON.stringify({ app: 'expermit-eln', version: BACKUP_VERSION, createdAt: Date.now(), counts: meta }, null, 2) })
  return zip(entries)
}

export async function downloadBackup() {
  const out = await exportAll()
  downloadBlob(new Blob([out as BlobPart], { type: 'application/zip' }), `ExPermit 备份 ${todayStr()}.zip`)
  localStorage.setItem('eln-last-backup', String(Date.now()))
}

export async function importAll(buf: Uint8Array, mode: 'replace' | 'merge') {
  const entries = unzip(buf)
  const dec = new TextDecoder()
  const metaRaw = entries.get('backup.json')
  if (!metaRaw) throw new Error('不是 ExPermit 的备份文件')
  const meta = JSON.parse(dec.decode(metaRaw))
  if (meta.app !== 'expermit-eln') throw new Error('不是 ExPermit 的备份文件')
  await db.transaction('rw', db.tables, async () => {
    if (mode === 'replace') await Promise.all(db.tables.map((t) => t.clear()))
    for (const t of TABLES) {
      const raw = entries.get(`data/${t}.json`)
      if (!raw) continue
      const rows = JSON.parse(dec.decode(raw)) as Record<string, unknown>[]
      if (t === 'files') {
        const full = rows.map((r) => {
          const bytes = entries.get(`files/${r.id}`)
          return { ...r, blob: new Blob([(bytes ?? new Uint8Array()) as BlobPart], { type: String(r.mime) }) }
        })
        await db.files.bulkPut(full as unknown as StoredFile[])
      } else await db.table(t).bulkPut(rows)
    }
  })
  return meta.counts as Record<string, number>
}
