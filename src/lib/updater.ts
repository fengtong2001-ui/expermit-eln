import { toast } from 'sonner'
import { desktop } from './desktop'

const REPO = 'fengtong2001-ui/expermit-eln'

export interface ReleaseInfo {
  version: string
  notes: string
  setupUrl: string | null
}

/** 查询 GitHub 最新 Release；网络失败返回 null（调用方静默） */
export async function checkLatest(): Promise<ReleaseInfo | null> {
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store' })
    if (!r.ok) return null
    const j = (await r.json()) as { tag_name?: string; body?: string; assets?: { name: string; browser_download_url: string }[] }
    const version = (j.tag_name ?? '').replace(/^v/, '')
    if (!version) return null
    const setup = (j.assets ?? []).find((a) => a.name.startsWith('ExPermit-Setup') && a.name.endsWith('.exe'))
    return { version, notes: j.body ?? '', setupUrl: setup?.browser_download_url ?? null }
  } catch {
    return null
  }
}

// —— 检查频率（仅桌面版自动检查）——
const OPT_KEY = 'eln-update-check'
const LAST_KEY = 'eln-last-update-check'
export type CheckFreq = 'always' | 'weekly'

export function getCheckFreq(): CheckFreq {
  return localStorage.getItem(OPT_KEY) === 'weekly' ? 'weekly' : 'always'
}
export function setCheckFreq(f: CheckFreq) {
  localStorage.setItem(OPT_KEY, f)
}
export function shouldAutoCheck(): boolean {
  if (!desktop) return false
  if (getCheckFreq() === 'always') return true
  return Date.now() - Number(localStorage.getItem(LAST_KEY) || 0) > 7 * 86400000
}
export function markChecked() {
  localStorage.setItem(LAST_KEY, String(Date.now()))
}

/** 有新版本时的完整升级流程：优先热更新（秒级，走稳定通道）；壳变更或热更失败回落完整安装包；再失败才打开下载页 */
export async function downloadAndInstall(setupUrl: string | null, version: string) {
  if (!desktop) {
    window.open(`https://github.com/${REPO}/releases/latest`, '_blank')
    return
  }
  const id = toast.loading('正在下载更新…', { duration: Infinity })
  const off = desktop.onUpdateProgress((pct) => toast.loading(`正在更新… ${pct}%`, { id, duration: Infinity }))
  try {
    // 首选：网页资源热更新（走 codeload 稳定通道，下载完成自动重启生效）
    try {
      const r = await desktop.hotUpdate(version)
      if (r?.ok) return
      if (r?.needInstaller) toast.loading('此版本更新了程序本体，正在下载安装包…', { id, duration: Infinity })
    } catch {
      toast.loading('正在下载完整安装包…', { id, duration: Infinity })
    }
    if (!setupUrl) throw new Error('no setup url')
    const file = await desktop.downloadUpdate(setupUrl)
    toast.loading('下载完成，正在安装…', { id, duration: 5000 })
    await desktop.installUpdate(file)
  } catch {
    toast.error('更新下载失败，已打开下载页面', { id, duration: 10000 })
    void window.open(`https://github.com/${REPO}/releases/latest`, '_blank')
  } finally {
    off()
  }
}

/** 启动时的后台检查：有新版本才提示一次 */
export async function startupUpdateCheck() {
  if (!shouldAutoCheck()) return
  markChecked()
  const info = await checkLatest()
  if (!info || !isNewer(info.version)) return
  toast(`新版本 ${info.version} 可用`, {
    duration: 30000,
    action: { label: '更新', onClick: () => void downloadAndInstall(info.setupUrl, info.version) },
  })
}

export function isNewer(remote: string, local: string = __APP_VERSION__): boolean {
  const p = (v: string) => v.split('.').map(Number)
  const [a1, b1, c1] = p(local)
  const [a2, b2, c2] = p(remote)
  if (a2 !== a1) return a2 > a1
  if (b2 !== b1) return b2 > b1
  return c2 > c1
}
