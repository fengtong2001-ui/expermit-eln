// 同步后端的统一接口：两个实现（GitHub 私有仓库 / WebDAV）都把数据放在一个目录下：
//   data.json        —— 除文件外的全部表 + 文件清单
//   files/<id>       —— 原始文件字节（图片等）
export interface SyncObject {
  bytes: Uint8Array
  etag?: string // GitHub 用 blob sha，WebDAV 用 ETag
}

export interface SyncBackend {
  /** 读取对象；不存在返回 null */
  get(key: string): Promise<SyncObject | null>
  /** 写入对象。knownEtag 传入上次读到的版本号用于乐观并发；冲突抛 SyncConflict */
  put(key: string, bytes: Uint8Array, knownEtag?: string): Promise<{ etag?: string }>
  delete(key: string, etag?: string): Promise<void>
  /** 检查凭证与连通性；失败抛带用户可读信息的 Error */
  test(): Promise<void>
}

export class SyncConflict extends Error {
  constructor() {
    super('远端在此期间被其他设备更新了')
  }
}

export type SyncConfig =
  | { provider: 'github'; token: string; repo: string; path: string; auto: boolean }
  | { provider: 'webdav'; url: string; user: string; password: string; path: string; auto: boolean }

const CFG_KEY = 'eln-sync-config'
const STATE_KEY = 'eln-sync-state'

export function loadSyncConfig(): SyncConfig | null {
  try {
    const raw = localStorage.getItem(CFG_KEY)
    return raw ? (JSON.parse(raw) as SyncConfig) : null
  } catch {
    return null
  }
}
export function saveSyncConfig(cfg: SyncConfig) {
  localStorage.setItem(CFG_KEY, JSON.stringify(cfg))
}
export function clearSyncConfig() {
  localStorage.removeItem(CFG_KEY)
  localStorage.removeItem(STATE_KEY)
}

export interface SyncState {
  lastSync: number | null
  lastError: string | null
  remoteHash: string | null
}
export function loadSyncState(): SyncState {
  try {
    return { lastSync: null, lastError: null, remoteHash: null, ...JSON.parse(localStorage.getItem(STATE_KEY) ?? '{}') }
  } catch {
    return { lastSync: null, lastError: null, remoteHash: null }
  }
}
export function saveSyncState(s: SyncState) {
  localStorage.setItem(STATE_KEY, JSON.stringify(s))
}
