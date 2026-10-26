import { useState } from 'react'
import { Cloud, Copy, ExternalLink, Loader2, RefreshCw, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import { loadSyncConfig, saveSyncConfig, clearSyncConfig, type SyncConfig } from '@/lib/sync/types'
import { syncNow, notifyConfigChanged, makeBackend } from '@/lib/sync/engine'
import { Button, Field, Segmented } from './ui'
import { confirmDialog } from './confirm'

function applySetupInput(raw: string): boolean {
  const t = raw.trim()
  const m = /setup=([A-Za-z0-9_-]+)/.exec(t)
  const code = m ? m[1] : /^[A-Za-z0-9_-]{20,}$/.test(t) ? t : null
  if (!code) return false
  try {
    const bin = atob(code.replace(/-/g, '+').replace(/_/g, '/'))
    const cfg = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))))
    if (cfg?.provider !== 'github' && cfg?.provider !== 'webdav') return false
    saveSyncConfig(cfg)
    return true
  } catch {
    return false
  }
}

function makeSetupLink(): string | null {
  const cfg = loadSyncConfig()
  if (!cfg) return null
  const b64 = btoa(JSON.stringify(cfg)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `${location.origin}${location.pathname}?setup=${b64}`
}

export function SyncSettings() {
  const saved = loadSyncConfig()
  const [provider, setProvider] = useState<'github' | 'webdav'>(saved?.provider ?? 'github')
  const [token, setToken] = useState('')
  const [repo, setRepo] = useState('')
  const [ghPath, setGhPath] = useState('eln')
  const [url, setUrl] = useState('')
  const [user, setUser] = useState('')
  const [password, setPassword] = useState('')
  const [davPath, setDavPath] = useState('ExPermit')
  const [auto, setAuto] = useState(saved?.auto ?? true)
  const [busy, setBusy] = useState<'test' | 'sync' | null>(null)
  const [importText, setImportText] = useState('')
  const [, force] = useState(0)

  const buildConfig = (): SyncConfig =>
    provider === 'github'
      ? { provider: 'github', token: token.trim(), repo: repo.trim() || 'expermit-sync', path: ghPath.trim() || 'eln', auto }
      : { provider: 'webdav', url: url.trim(), user: user.trim(), password, path: davPath.trim() || 'ExPermit', auto }

  const test = async () => {
    setBusy('test')
    try {
      const cfg = buildConfig()
      const backend = makeBackend(cfg)
      if (cfg.provider === 'github') {
        if (!cfg.token) throw new Error('请先粘贴第 ② 步生成的令牌')
        await backend.test()
        // 保存时把仓库名归一化为 owner/repo
        const full = await (backend as unknown as { repo(): Promise<string> }).repo()
        saveSyncConfig({ ...cfg, repo: full })
      } else {
        if (!cfg.url || !cfg.user) throw new Error('请先填入地址和用户名')
        await backend.test()
        saveSyncConfig(cfg)
      }
      toast.success('连接成功，配置已保存')
      notifyConfigChanged()
      force((x) => x + 1)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e), { duration: 9000 })
    } finally {
      setBusy(null)
    }
  }

  const doImport = () => {
    if (!importText.trim()) return
    if (!applySetupInput(importText)) {
      toast.error('没认出这是配置链接：请粘贴完整链接，或链接里 setup= 后面那一串')
      return
    }
    setImportText('')
    toast.success('配置已导入，开始同步')
    notifyConfigChanged()
    force((x) => x + 1)
  }

  const doSync = async () => {
    setBusy('sync')
    try {
      const r = await syncNow('manual')
      const parts = [
        r.pulled ? `接收 ${r.pulled} 项更新` : '',
        r.downloadedFiles ? `下载 ${r.downloadedFiles} 个附件` : '',
        r.uploadedFiles ? `上传 ${r.uploadedFiles} 个附件` : '',
        r.conflictsRemoteWon ? `${r.conflictsRemoteWon} 处以较新的设备为准` : '',
      ].filter(Boolean)
      toast.success(parts.length ? `同步完成：${parts.join('，')}` : '同步完成，两边内容一致')
      force((x) => x + 1)
    } catch {
      /* 状态指示里已有错误信息 */
    } finally {
      setBusy(null)
    }
  }

  const disconnect = async () => {
    const ok = await confirmDialog({ title: '断开同步？', body: '本机数据保留不动，只是不再自动上传下载。', confirmText: '断开' })
    if (!ok) return
    clearSyncConfig()
    notifyConfigChanged()
    force((x) => x + 1)
    toast('已断开同步')
  }

  const copy = (text: string, label: string) => {
    void navigator.clipboard.writeText(text).then(() => toast(`已复制${label}`))
  }

  const stepNum = (n: number) => (
    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white dark:bg-white dark:text-slate-900">{n}</span>
  )

  return (
    <div className="space-y-4">
      <p className="text-[13px] leading-relaxed text-slate-500">
        数据先存在本机；同步只是把数据中转到你自己的网络存储，多台设备（电脑、手机）配同一份就能互通，合并规则是“谁改的最新听谁的，删除会同步”。
      </p>

      {saved && (
        <div className="rounded-xl bg-brand-50/70 px-3.5 py-3 text-[13px] text-brand-900 dark:bg-brand-500/10 dark:text-brand-200">
          已连接 <b>{saved.provider === 'github' ? `GitHub · ${saved.repo}` : `WebDAV · ${saved.url}`}</b>
          {saved.auto ? ' · 自动同步已开启' : ' · 自动同步已关闭'}
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" onClick={doSync} disabled={busy === 'sync'}>
              {busy === 'sync' ? <Loader2 className="animate-spin" /> : <RefreshCw />} 立即同步
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                const link = makeSetupLink()
                if (link)
                  void navigator.clipboard.writeText(link).then(() =>
                    toast('配置链接已复制。发给要加入的设备，在其设置页粘贴即可（链接含令牌，勿发外人）', { duration: 8000 }),
                  )
              }}
            >
              <Copy /> 复制配置链接
            </Button>
            <Button size="sm" variant="ghost" onClick={disconnect}>
              断开
            </Button>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 p-3.5 dark:border-slate-800">
        <p className="mb-2 text-[13px] font-medium text-slate-700 dark:text-slate-200">已有配置链接？粘贴进来一步完成</p>
        <div className="flex gap-2">
          <input className="field flex-1 text-xs" value={importText} onChange={(e) => setImportText(e.target.value)} placeholder="配置链接" aria-label="配置链接" />
          <Button onClick={doImport} disabled={!importText.trim()}>
            导入
          </Button>
        </div>
      </div>

      <p className="text-xs font-medium text-slate-500">— 或新建一套同步 —</p>

      <Segmented
        value={provider}
        onChange={setProvider}
        options={[
          { value: 'github', label: 'GitHub 私有仓库' },
          { value: 'webdav', label: 'WebDAV（NAS 等）' },
        ]}
      />

      {provider === 'github' ? (
        <ol className="space-y-4">
          <li className="flex gap-3">
            {stepNum(1)}
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium text-slate-800 dark:text-slate-100">建一个私有仓库</p>
              <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
                名字推荐{' '}
                <button className="cursor-pointer rounded bg-slate-100 px-1 font-mono text-[11px] hover:bg-slate-200 dark:bg-slate-800" onClick={() => copy('expermit-sync', '仓库名')}>
                  expermit-sync
                </button>{' '}
                （点击复制），<b>必须选 Private</b>——公开仓库会被拒绝，防止数据泄露。
              </p>
              <a href="https://github.com/new" target="_blank" rel="noreferrer" className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline dark:text-brand-300">
                <ExternalLink className="size-3.5" /> 打开 GitHub 新建仓库页
              </a>
            </div>
          </li>
          <li className="flex gap-3">
            {stepNum(2)}
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium text-slate-800 dark:text-slate-100">生成一个只管这个仓库的令牌</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs leading-relaxed text-slate-500">
                <li>Repository access 选 <b>Only select repositories</b>，勾刚建的仓库</li>
                <li>Permissions → Repository permissions → <b>Contents 选 Read and write</b>，其余不动</li>
                <li>生成后立即复制（<span className="font-mono">github_pat_</span> 开头，只显示一次）</li>
              </ul>
              <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noreferrer" className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline dark:text-brand-300">
                <ExternalLink className="size-3.5" /> 打开令牌创建页
              </a>
            </div>
          </li>
          <li className="flex gap-3">
            {stepNum(3)}
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium text-slate-800 dark:text-slate-100">粘贴令牌，点「测试连接并保存」</p>
              <Field label="访问令牌" className="mt-2">
                <input className="field font-mono text-xs" type="password" value={token} onChange={(e) => setToken(e.target.value)} />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="仓库名" hint="只填名字即可，自动识别你的账号">
                  <input className="field" value={repo} onChange={(e) => setRepo(e.target.value)} />
                </Field>
                <Field label="目录" hint="数据在仓库里的存放路径">
                  <input className="field" value={ghPath} onChange={(e) => setGhPath(e.target.value)} />
                </Field>
              </div>
            </div>
          </li>
        </ol>
      ) : (
        <div className="space-y-4">
          <Field label="服务器地址">
            <input className="field" value={url} onChange={(e) => setUrl(e.target.value)} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="用户名">
              <input className="field" value={user} onChange={(e) => setUser(e.target.value)} autoComplete="off" />
            </Field>
            <Field label="密码 / 应用密码">
              <input className="field" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
            </Field>
          </div>
          <Field label="同步目录">
            <input className="field" value={davPath} onChange={(e) => setDavPath(e.target.value)} />
          </Field>
          <p className="flex items-start gap-1.5 text-xs leading-relaxed text-amber-700 dark:text-amber-300">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
            浏览器直连 WebDAV 需要服务器允许跨域（CORS）：NAS 反代或 Nextcloud 可以配置；坚果云不支持浏览器直连。不行就改用 GitHub 私有仓库。
          </p>
        </div>
      )}

      <label className="flex cursor-pointer items-center gap-2.5 text-[13px] text-slate-700 dark:text-slate-200">
        <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} className="size-4 accent-brand-600" />
        自动同步（打开应用时、以及修改后约 20 秒）
      </label>

      <div className="flex flex-wrap gap-2">
        <Button onClick={test} disabled={busy === 'test'}>
          {busy === 'test' ? <Loader2 className="animate-spin" /> : <Cloud />} 测试连接并保存
        </Button>
      </div>
    </div>
  )
}
