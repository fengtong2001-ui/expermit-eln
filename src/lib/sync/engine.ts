// 同步引擎：本地优先。流程 = 先拉远端做行级合并落到本地库，再上传本地独有文件与整份 data.json。
// data.json 用乐观并发（ETag / blob sha）：推送撞上别人刚推的版本就重来一轮，最多 3 次。
import { db } from '../db'
import { saveState } from '../saveState'
import { hashString } from '../util'
import { TRASH_DAYS } from '../repo'
import { GithubBackend } from './github'
import { WebdavBackend } from './webdav'
import { mergeDoc, pruneTombstones, type MergeStats, type SyncDoc } from './merge'
import { SyncConflict, loadSyncConfig, loadSyncState, saveSyncState, type SyncBackend, type SyncConfig } from './types'
import type { StoredFile } from '../types'

const DATA_KEY = 'data.json'
const fileKey = (id: string) => `files/${id}`

// ───────── 状态（页头指示用） ─────────

export type SyncStatus =
  | { kind: 'unconfigured' }
  | { kind: 'idle'; lastSync: number | null; dirty: boolean }
  | { kind: 'syncing'; note?: string }
  | { kind: 'error'; message: string; lastSync: number | null }

let status: SyncStatus = { kind: 'unconfigured' }
const subs = new Set<() => void>()
const emit = (s: SyncStatus) => {
  status = s
  subs.forEach((f) => f())
}

export function useSyncStatus() {
  return status
}
export function subscribeSync(f: () => void) {
  subs.add(f)
  return () => {
    subs.delete(f)
  }
}
export const getSyncStatus = () => status

export function makeBackend(cfg: SyncConfig, apiBase?: string): SyncBackend {
  const override = apiBase ?? (typeof localStorage !== 'undefined' ? localStorage.getItem('eln-sync-api-base') ?? undefined : undefined)
  return cfg.provider === 'github' ? new GithubBackend(cfg, override) : new WebdavBackend(cfg)
}

function refreshIdle(dirty = false) {
  const cfg = loadSyncConfig()
  if (!cfg) {
    emit({ kind: 'unconfigured' })
    return
  }
  const s = loadSyncState()
  emit({ kind: 'idle', lastSync: s.lastSync, dirty })
}

// ───────── 导出 / 导入 ─────────

export async function exportDoc(device: string, now = Date.now()): Promise<SyncDoc> {
  const [projects, experiments, blocks, reagents, schedules, templates, snapshots, audit, files] = await Promise.all([
    db.projects.toArray(),
    db.experiments.toArray(),
    db.blocks.toArray(),
    db.reagents.toArray(),
    db.schedules.toArray(),
    db.templates.toArray(),
    db.snapshots.toArray(),
    db.audit.toArray(),
    db.files.toArray(),
  ])
  const stats: MergeStats = { pulled: 0, pushedCandidates: 0, conflictsRemoteWon: 0, droppedTombstones: 0 }
  const doc: SyncDoc = {
    v: 1,
    exportedAt: now,
    device,
    tables: {
      projects: pruneTombstones(projects, now, TRASH_DAYS, stats),
      experiments: pruneTombstones(experiments, now, TRASH_DAYS, stats),
      blocks: pruneTombstones(blocks, now, TRASH_DAYS, stats),
      reagents: pruneTombstones(reagents, now, TRASH_DAYS, stats),
      schedules: pruneTombstones(schedules, now, TRASH_DAYS, stats),
      templates: pruneTombstones(templates, now, TRASH_DAYS, stats),
      snapshots,
      audit,
    },
    files: Object.fromEntries(files.map((f) => [f.id, { name: f.name, mime: f.mime, size: f.size, createdAt: f.createdAt }])),
  }
  return doc
}

async function applyDoc(doc: SyncDoc) {
  await db.transaction('rw', db.tables, async () => {
    await db.projects.bulkPut(doc.tables.projects)
    await db.experiments.bulkPut(doc.tables.experiments)
    await db.blocks.bulkPut(doc.tables.blocks)
    await db.reagents.bulkPut(doc.tables.reagents)
    await db.schedules.bulkPut(doc.tables.schedules)
    await db.templates.bulkPut(doc.tables.templates)
    await db.snapshots.bulkPut(doc.tables.snapshots)
    await db.audit.bulkPut(doc.tables.audit)
    for (const meta of Object.values(doc.files)) {
      const exists = await db.files.get(meta.name) // 占位防漏（真实字节随后下载）
      void exists
    }
  })
}

// ───────── 主流程 ─────────

export interface SyncResult {
  pulled: number
  pushed: number
  uploadedFiles: number
  downloadedFiles: number
  conflictsRemoteWon: number
}

let running: Promise<SyncResult> | null = null

export function syncNow(reason = 'manual', apiBase?: string): Promise<SyncResult> {
  running ??= doSync(reason, apiBase).finally(() => (running = null))
  return running
}

async function doSync(reason: string, apiBase?: string): Promise<SyncResult> {
  const cfg = loadSyncConfig()
  if (!cfg) {
    refreshIdle()
    return { pulled: 0, pushed: 0, uploadedFiles: 0, downloadedFiles: 0, conflictsRemoteWon: 0 }
  }
  emit({ kind: 'syncing', note: reason === 'startup' ? '启动同步' : undefined })
  try {
    await saveState.flushAll()
    const backend = makeBackend(cfg, apiBase)
    const device = deviceId()
    let result: SyncResult = { pulled: 0, pushed: 0, uploadedFiles: 0, downloadedFiles: 0, conflictsRemoteWon: 0 }

    for (let round = 0; round < 3; round++) {
      const remote = await backend.get(DATA_KEY)
      const remoteDoc: SyncDoc | null = remote ? (JSON.parse(new TextDecoder().decode(remote.bytes)) as SyncDoc) : null
      const local = await exportDoc(device)
      let etag: string | undefined
      let merged = local
      if (remoteDoc) {
        etag = remote?.etag
        const { doc, stats } = mergeDoc(local, remoteDoc, { now: Date.now(), trashDays: TRASH_DAYS })
        merged = doc
        result.pulled = stats.pulled
        result.conflictsRemoteWon = stats.conflictsRemoteWon
        if (stats.pulled > 0) await applyDoc(doc)
        // 下载远端有、本地没有的文件
        const localIds = new Set((await db.files.toArray()).map((f) => f.id))
        const missing = Object.keys(merged.files).filter((id) => !localIds.has(id))
        for (const id of missing) {
          emit({ kind: 'syncing', note: `下载附件 ${missing.indexOf(id) + 1}/${missing.length}` })
          const obj = await backend.get(fileKey(id))
          if (!obj) continue
          const meta = merged.files[id]
          const row: StoredFile = { id, name: meta.name, mime: meta.mime, size: meta.size, blob: new Blob([obj.bytes as BlobPart], { type: meta.mime }), createdAt: meta.createdAt }
          await db.files.put(row)
          result.downloadedFiles++
        }
      }
      // 上传本地有、远端清单没有的文件
      const remoteIds = new Set(remoteDoc ? Object.keys(remoteDoc.files) : [])
      const localFiles = await db.files.toArray()
      const toUpload = localFiles.filter((f) => !remoteIds.has(f.id))
      for (const f of toUpload) {
        emit({ kind: 'syncing', note: `上传附件 ${toUpload.indexOf(f) + 1}/${toUpload.length}` })
        const bytes = new Uint8Array(await f.blob.arrayBuffer())
        await backend.put(fileKey(f.id), bytes)
        merged.files[f.id] = { name: f.name, mime: f.mime, size: f.size, createdAt: f.createdAt }
        result.uploadedFiles++
      }
      // 清理远端已不存在的附件
      if (remoteDoc) {
        const stale = [...remoteIds].filter((id) => !merged.files[id])
        for (const id of stale) await backend.delete(fileKey(id)).catch(() => {})
      }
      // 推送 data.json
      const bytes = new TextEncoder().encode(JSON.stringify(merged))
      try {
        const put = await backend.put(DATA_KEY, bytes, etag)
        result.pushed = 1
        const state = loadSyncState()
        saveSyncState({ ...state, lastSync: Date.now(), remoteHash: put.etag ?? hashString(new TextDecoder().decode(bytes)), lastError: null })
        refreshIdle(false)
        return result
      } catch (e) {
        if (e instanceof SyncConflict && round < 2) continue // 别的设备刚推过，重整一轮
        throw e
      }
    }
    throw new Error('同步冲突重试次数用完，请稍后再试')
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    const state = loadSyncState()
    saveSyncState({ ...state, lastError: message })
    emit({ kind: 'error', message, lastSync: state.lastSync })
    throw e
  } finally {
    if (status.kind === 'syncing') refreshIdle(false)
  }
}

function deviceId(): string {
  let id = localStorage.getItem('eln-device-id')
  if (!id) {
    id = `设备-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
    localStorage.setItem('eln-device-id', id)
  }
  return id
}

// ───────── 自动同步 ─────────

let pushTimer: ReturnType<typeof setTimeout> | null = null
let started = false

export function startAutoSync() {
  if (started) return
  started = true
  const cfg = loadSyncConfig()
  refreshIdle(false)
  if (!cfg?.auto) return
  setTimeout(() => void syncNow('startup').catch(() => {}), 3500)
  // 任何一次保存完成后，20 秒没新改动就推一轮
  const origEnd = saveState.end.bind(saveState)
  saveState.end = (ok: boolean, error?: string) => {
    origEnd(ok, error)
    const c = loadSyncConfig()
    if (!c?.auto || !ok) return
    if (pushTimer) clearTimeout(pushTimer)
    pushTimer = setTimeout(() => void syncNow('auto').catch(() => {}), 20000)
  }
}

export function notifyConfigChanged() {
  refreshIdle(false)
  const cfg = loadSyncConfig()
  if (cfg?.auto) void syncNow('config').catch(() => {})
  else if (!cfg) emit({ kind: 'unconfigured' })
}
