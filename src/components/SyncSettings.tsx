import { useState } from 'react'
import { Cloud, Loader2, RefreshCw, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import { loadSyncConfig, saveSyncConfig, clearSyncConfig, type SyncConfig } from '@/lib/sync/types'
import { syncNow, notifyConfigChanged, makeBackend } from '@/lib/sync/engine'
import { Button, Field, Segmented } from './ui'
import { confirmDialog } from './confirm'

export function SyncSettings() {
  const saved = loadSyncConfig()
  const [provider, setProvider] = useState<'github' | 'webdav'>(saved?.provider ?? 'github')
  const [token, setToken] = useState(saved?.provider === 'github' ? saved.token : '')
  const [repo, setRepo] = useState(saved?.provider === 'github' ? saved.repo : '')
  const [ghPath, setGhPath] = useState(saved?.provider === 'github' ? saved.path || 'eln' : 'eln')
  const [url, setUrl] = useState(saved?.provider === 'webdav' ? saved.url : '')
  const [user, setUser] = useState(saved?.provider === 'webdav' ? saved.user : '')
  const [password, setPassword] = useState(saved?.provider === 'webdav' ? saved.password : '')
  const [davPath, setDavPath] = useState(saved?.provider === 'webdav' ? saved.path || 'ExPermit' : 'ExPermit')
  const [auto, setAuto] = useState(saved?.auto ?? true)
  const [busy, setBusy] = useState<'test' | 'sync' | null>(null)
  const [, force] = useState(0)

  const buildConfig = (): SyncConfig =>
    provider === 'github'
      ? { provider: 'github', token: token.trim(), repo: repo.trim(), path: ghPath.trim() || 'eln', auto }
      : { provider: 'webdav', url: url.trim(), user: user.trim(), password, path: davPath.trim() || 'ExPermit', auto }

  const test = async () => {
    setBusy('test')
    try {
      const cfg = buildConfig()
      if (cfg.provider === 'github') {
        if (!cfg.token || !cfg.repo) throw new Error('请先填入令牌和仓库（格式 owner/repo）')
        await makeBackend(cfg).test()
      } else {
        if (!cfg.url || !cfg.user) throw new Error('请先填入地址和用户名')
        await makeBackend(cfg).test()
      }
      toast.success('连接成功，配置已保存')
      saveSyncConfig(cfg)
      notifyConfigChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e), { duration: 9000 })
    } finally {
      setBusy(null)
    }
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
      // 状态指示里已有错误信息
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

  return (
    <div className="space-y-4">
      <p className="text-[13px] leading-relaxed text-slate-500">
        在多台设备（电脑、手机）上登录同一份同步配置，数据会自动合并：谁改的最新听谁的，删除会同步，附件跟着走。数据仍然先存在本机，网络存储只做中转与备份。
      </p>
      {saved && (
        <div className="rounded-xl bg-brand-50/70 px-3.5 py-3 text-[13px] text-brand-900 dark:bg-brand-500/10 dark:text-brand-200">
          已连接 <b>{saved.provider === 'github' ? `GitHub · ${saved.repo}` : `WebDAV · ${saved.url}`}</b>
          {saved.auto ? ' · 自动同步已开启' : ' · 自动同步已关闭'}
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" onClick={doSync} disabled={busy === 'sync'}>
              {busy === 'sync' ? <Loader2 className="animate-spin" /> : <RefreshCw />} 立即同步
            </Button>
            <Button size="sm" variant="ghost" onClick={disconnect}>
              断开
            </Button>
          </div>
        </div>
      )}

      <Segmented
        value={provider}
        onChange={setProvider}
        options={[
          { value: 'github', label: 'GitHub 私有仓库' },
          { value: 'webdav', label: 'WebDAV（NAS 等）' },
        ]}
      />

      {provider === 'github' ? (
        <div className="space-y-4">
          <ol className="list-decimal space-y-1 pl-5 text-xs leading-relaxed text-slate-500">
            <li>
              在 GitHub 新建一个<b>私有</b>空仓库（比如叫 lab-sync）。公开仓库会被拒绝，避免数据泄露。
            </li>
            <li>
              在 <span className="font-mono">Settings → Developer settings → Fine-grained tokens</span> 建一个令牌：只授权这个仓库、只勾 Contents 读写。
            </li>
            <li>把令牌和仓库填到下面。令牌只保存在这台设备的浏览器里，不会发给 GitHub 以外的地方。</li>
          </ol>
          <Field label="访问令牌">
            <input className="field font-mono text-xs" type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="github_pat_… 或 ghp_…" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="仓库（owner/repo）">
              <input className="field" value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="fengtong2001-ui/lab-sync" />
            </Field>
            <Field label="目录" hint="数据在仓库里的存放路径">
              <input className="field" value={ghPath} onChange={(e) => setGhPath(e.target.value)} placeholder="eln" />
            </Field>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <Field label="服务器地址">
            <input className="field" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://nas.example.com:5005 或 https://cloud.example.com/remote.php/dav/files/用户名" />
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
            <input className="field" value={davPath} onChange={(e) => setDavPath(e.target.value)} placeholder="ExPermit" />
          </Field>
          <p className="flex items-start gap-1.5 text-xs leading-relaxed text-amber-700 dark:text-amber-300">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
            浏览器直连 WebDAV 需要服务器允许跨域（CORS）：NAS 反代或 Nextcloud 可以配置；坚果云不支持浏览器直连，「测试连接」会直接说明原因。不行就改用 GitHub 私有仓库。
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
