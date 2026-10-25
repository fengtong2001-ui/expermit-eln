// GitHub 私有仓库后端：走 Contents API（api.github.com 对浏览器跨域开放）。
// 大对象（>CHUNK）拆成 part-0001… 分片存储，manifest 记录分片信息，
// 绕开 Contents API 对单文件体积与 GET 返回 base64 的限制。
import { SyncConflict, type SyncBackend, type SyncConfig, type SyncObject } from './types'

const CHUNK = 900 * 1024

// 测试时允许指向本地模拟服务
export function githubApiBase(override?: string) {
  return override || 'https://api.github.com'
}

interface ContentsFile {
  name: string
  path: string
  sha: string
  content?: string | null
  encoding?: string
  size: number
  message?: string
}

export class GithubBackend implements SyncBackend {
  private base: string
  private headers: Record<string, string>

  constructor(private cfg: Extract<SyncConfig, { provider: 'github' }>, apiBase?: string) {
    this.base = githubApiBase(apiBase)
    this.headers = {
      Authorization: `Bearer ${cfg.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    }
  }

  private url(key: string) {
    const p = [this.cfg.repo.replace(/^\/+|\/+$/g, ''), 'contents', this.cfg.path.replace(/^\/+|\/+$/g, ''), ...key.split('/')].filter(Boolean)
    return `${this.base}/repos/${p.join('/')}`
  }

  private async req(url: string, init?: RequestInit): Promise<Response> {
    let res: Response
    try {
      res = await fetch(url, { ...init, headers: { ...this.headers, ...(init?.headers as Record<string, string>) } })
    } catch (e) {
      throw new Error(
        e instanceof TypeError
          ? '连不上 GitHub（网络不通或被拦截）。若你在国内网络环境，可能需要代理。'
          : String((e as Error).message ?? e),
      )
    }
    if (res.status === 401 || res.status === 403) {
      const body = (await res.json().catch(() => ({}))) as { message?: string }
      throw new Error(`GitHub 认证失败：${body.message ?? res.status}。请检查令牌是否有效、是否勾选了私有仓库的读写权限。`)
    }
    if (res.status === 404) throw new Error('NOT_FOUND')
    if (res.status === 422 || res.status === 409) {
      const body = (await res.json().catch(() => ({}))) as { message?: string; errors?: { code?: string }[] }
      if (body.message?.includes('sha') || body.errors?.some((x) => x.code === 'custom' || x.code === 'invalid')) throw new SyncConflict()
      if (!res.ok) throw new Error(`GitHub 拒绝了请求：${body.message ?? res.status}`)
    }
    if (!res.ok) throw new Error(`GitHub 请求失败（${res.status}）`)
    return res
  }

  async get(key: string): Promise<SyncObject | null> {
    let res: Response
    try {
      res = await this.req(this.url(key))
    } catch (e) {
      if (e instanceof Error && e.message === 'NOT_FOUND') {
        // 尝试分片形式
        try {
          return await this.getAsChunks(key)
        } catch {
          return null
        }
      }
      throw e
    }
    const f = (await res.json()) as ContentsFile
    return { bytes: decodeB64(f.content ?? ''), etag: f.sha }
  }

  private async getAsChunks(key: string): Promise<SyncObject> {
    const m = (await this.req(this.url(`${key}/manifest`)).then((r) => r.json())) as ContentsFile
    const meta = JSON.parse(new TextDecoder().decode(decodeB64(m.content ?? ''))) as { parts: number }
    const parts: Uint8Array[] = []
    for (let i = 1; i <= meta.parts; i++) {
      const f = (await this.req(this.url(`${key}/part-${String(i).padStart(4, '0')}`)).then((r) => r.json())) as ContentsFile
      parts.push(decodeB64(f.content ?? ''))
    }
    const total = parts.reduce((s, p) => s + p.length, 0)
    const out = new Uint8Array(total)
    let off = 0
    for (const p of parts) {
      out.set(p, off)
      off += p.length
    }
    return { bytes: out, etag: m.sha }
  }

  async put(key: string, bytes: Uint8Array, knownEtag?: string): Promise<{ etag?: string }> {
    if (bytes.length > CHUNK) return this.putAsChunks(key, bytes, knownEtag)
    // 已存在则需要 sha 才能更新
    let sha: string | undefined = knownEtag
    if (!sha) {
      const cur = await this.req(this.url(key)).then(
        (r) => r.json() as Promise<ContentsFile>,
        () => null,
      )
      sha = (cur as ContentsFile | null)?.sha
    }
    const res = await this.req(this.url(key), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `ExPermit 同步：更新 ${key}`,
        content: encodeB64(bytes),
        ...(sha ? { sha } : {}),
      }),
    })
    const out = (await res.json()) as { content?: { sha?: string } }
    return { etag: out.content?.sha }
  }

  private async putAsChunks(key: string, bytes: Uint8Array, knownEtag?: string): Promise<{ etag?: string }> {
    const parts = Math.ceil(bytes.length / CHUNK)
    const version = `${Date.now()}-${bytes.length}`
    for (let i = 1; i <= parts; i++) {
      const slice = bytes.subarray((i - 1) * CHUNK, i * CHUNK)
      await this.put(`${key}/part-${String(i).padStart(4, '0')}`, slice)
    }
    // 先写新分片，再更新 manifest（旧分片多余的留在原地，下次覆盖）
    const res = await this.req(this.url(`${key}/manifest`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `ExPermit 同步：更新 ${key} 分片清单`,
        content: encodeB64(new TextEncoder().encode(JSON.stringify({ parts, size: bytes.length, version }))),
        ...(knownEtag ? { sha: knownEtag } : {}),
      }),
    })
    const out = (await res.json()) as { content?: { sha?: string } }
    return { etag: out.content?.sha }
  }

  async delete(key: string, etag?: string): Promise<void> {
    // 分片对象：清 manifest 与所有分片（最多尝试 64 片）
    try {
      const m = await this.req(this.url(`${key}/manifest`))
      const mf = (await m.json()) as ContentsFile
      const meta = JSON.parse(new TextDecoder().decode(decodeB64(mf.content ?? ''))) as { parts: number }
      for (let i = 1; i <= Math.min(meta.parts, 64); i++) await this.delete(`${key}/part-${String(i).padStart(4, '0')}`).catch(() => {})
      await this.req(this.url(`${key}/manifest`), {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'ExPermit 清理', sha: mf.sha }),
      })
      return
    } catch (e) {
      if (!(e instanceof Error && e.message === 'NOT_FOUND')) {
        // manifest 存在但操作失败 → 抛出
        if (!(e instanceof SyncConflict)) throw e
      }
    }
    let sha = etag
    if (!sha) {
      const cur = await this.req(this.url(key)).then((r) => r.json() as Promise<ContentsFile>, () => null)
      sha = (cur as ContentsFile | null)?.sha
      if (!sha) return
    }
    await this.req(this.url(key), {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'ExPermit 清理', sha }),
    })
  }

  async test(): Promise<void> {
    // 用仓库元信息验证：token 有效 + 仓库存在 + 可见
    const res = await fetch(`${this.base}/repos/${this.cfg.repo.replace(/^\/+|\/+$/g, '')}`, { headers: this.headers })
    if (res.status === 404) throw new Error(`找不到仓库「${this.cfg.repo}」。请确认名称（owner/repo）正确，且令牌有这个私有仓库的权限。`)
    if (res.status === 401 || res.status === 403) throw new Error('令牌无效或没有权限。请检查令牌是否过期、是否勾选了 Contents 读写。')
    if (!res.ok) throw new Error(`GitHub 返回 ${res.status}`)
    const repo = (await res.json()) as { private?: boolean; full_name?: string }
    if (repo.private === false)
      throw new Error(`仓库「${repo.full_name}是公开的，实验数据会泄露。请先把仓库转为私有（Settings → Danger Zone），再配置同步。`)
  }
}

export function encodeB64(bytes: Uint8Array): string {
  let bin = ''
  const CH = 0x8000
  for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode(...bytes.subarray(i, i + CH))
  return btoa(bin)
}

export function decodeB64(b64: string): Uint8Array {
  const clean = b64.replace(/\s/g, '')
  const bin = atob(clean)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
