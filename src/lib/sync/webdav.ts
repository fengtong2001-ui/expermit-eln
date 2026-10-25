// WebDAV 后端：NAS / Nextcloud 等自建存储。
// 注意：浏览器跨域（CORS）由服务端决定。坚果云不发送跨域头，浏览器里用不了；
// 自建 NAS 需要在反代上允许来自站点源的跨域（设置页的「测试连接」会明确指出问题）。
import { SyncConflict, type SyncBackend, type SyncConfig, type SyncObject } from './types'

export class WebdavBackend implements SyncBackend {
  private root: string

  constructor(private cfg: Extract<SyncConfig, { provider: 'webdav' }>) {
    this.root = `${cfg.url.replace(/\/+$/, '')}/${cfg.path.replace(/^\/+|\/+$/g, '')}`
  }

  private auth(): string {
    return `Basic ${btoa(`${this.cfg.user}:${this.cfg.password}`)}`
  }

  private async req(path: string, init: RequestInit & { method: string }): Promise<Response> {
    const url = `${this.root}/${path.replace(/^\/+/, '')}`
    let res: Response
    try {
      res = await fetch(url, {
        ...init,
        headers: { Authorization: this.auth(), ...(init.headers as Record<string, string>) },
      })
    } catch {
      throw new Error(
        '连不上 WebDAV 服务器。若是浏览器跨域被拦（常见于坚果云、未配置 CORS 的 NAS），会报 Failed to fetch：需要在服务器端允许跨域，或改用 GitHub 私有仓库同步。',
      )
    }
    if (res.status === 401) throw new Error('用户名或密码不对（坚果云要用「应用密码」，不是登录密码）。')
    if (res.status === 403) throw new Error('没有权限访问这个目录，请检查路径与账号权限。')
    if (res.status === 412) throw new SyncConflict()
    return res
  }

  private async ensureDir(path: string) {
    const res = await this.req(path, { method: 'MKCOL' })
    // 201 建好；405 已存在；301/409 父目录问题 → 忽略，后续 PUT 会失败并报错
    if (!res.ok && res.status !== 405) await res.body?.cancel()
  }

  async get(key: string): Promise<SyncObject | null> {
    const res = await this.req(key, { method: 'GET' })
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`读取失败（${res.status}）`)
    const etag = res.headers.get('ETag') ?? undefined
    const bytes = new Uint8Array(await res.arrayBuffer())
    return { bytes, etag }
  }

  async put(key: string, bytes: Uint8Array, knownEtag?: string): Promise<{ etag?: string }> {
    const headers: Record<string, string> = { 'Content-Type': 'application/octet-stream' }
    if (knownEtag) headers['If-Match'] = knownEtag
    const res = await this.req(key, { method: 'PUT', headers, body: bytes as unknown as BodyInit })
    if (!res.ok && res.status !== 201 && res.status !== 204) throw new Error(`写入失败（${res.status}）`)
    await res.body?.cancel()
    return { etag: res.headers.get('ETag') ?? undefined }
  }

  async delete(key: string, _etag?: string): Promise<void> {
    const res = await this.req(key, { method: 'DELETE' })
    await res.body?.cancel()
  }

  async test(): Promise<void> {
    // MKCOL 根目录（幂等）+ 写读删一个探针文件
    await this.ensureDir('')
    await this.ensureDir('files')
    const probe = `.expermit-probe-${Date.now()}`
    await this.put(probe, new TextEncoder().encode('ok'))
    const back = await this.get(probe)
    await this.delete(probe)
    if (!back || new TextDecoder().decode(back.bytes) !== 'ok') throw new Error('写入后读回校验失败，存储行为异常。')
  }
}
