import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { CalendarClock, DatabaseBackup, Download, FolderOpen, HardDrive, Keyboard, Monitor, Moon, RefreshCw, Sun, Upload } from 'lucide-react'
import { toast } from 'sonner'
import changelogRaw from '../../CHANGELOG.md?raw'
import { db } from '@/lib/db'
import { downloadBackup, importAll } from '@/lib/exporter'
import { setTheme, useTheme } from '@/lib/theme'
import { formatBytes, formatDateTime, modKey } from '@/lib/util'
import { desktop, isDesktop, appVersion } from '@/lib/desktop'
import { checkLatest, downloadAndInstall, getCheckFreq, isNewer, setCheckFreq, type CheckFreq } from '@/lib/updater'
import { PageHeader } from '@/components/Shell'
import { Button, Kbd, Segmented } from '@/components/ui'
import { confirmDialog } from '@/components/confirm'
import { SyncSettings } from '@/components/SyncSettings'
import { Cloud } from 'lucide-react'

function Section({ icon, title, children, desc }: { icon: React.ReactNode; title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800 [&_svg]:size-4">{icon}</span>
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h2>
          {desc && <p className="mt-0.5 text-[13px] leading-relaxed text-slate-500">{desc}</p>}
        </div>
      </div>
      {children}
    </section>
  )
}

export function SettingsPage() {
  const theme = useTheme()
  const backupInput = useRef<HTMLInputElement>(null)
  const [usage, setUsage] = useState<{ used: number; quota: number } | null>(null)
  const [persisted, setPersisted] = useState<boolean | null>(null)
  const counts = useLiveQuery(async () => ({
    experiments: (await db.experiments.toArray()).filter((e) => !e.deletedAt).length,
    blocks: await db.blocks.count(),
    reagents: (await db.reagents.toArray()).filter((r) => !r.deletedAt).length,
    files: await db.files.count(),
  }), [])
  const lastBackup = Number(localStorage.getItem('eln-last-backup') || 0)

  useEffect(() => {
    void navigator.storage?.estimate?.().then((e) => setUsage({ used: e.usage ?? 0, quota: e.quota ?? 0 }))
    void navigator.storage?.persisted?.().then(setPersisted)
  }, [counts])

  const restore = async (f: File) => {
    const ok = await confirmDialog({
      title: '用备份替换当前所有数据？',
      body: '当前设备上的所有实验、试剂、日程会被备份文件里的内容替换。建议先下载一份当前数据的备份。',
      confirmText: '替换为备份内容',
      danger: true,
    })
    if (!ok) return
    try {
      const c = await importAll(new Uint8Array(await f.arrayBuffer()), 'replace')
      toast.success(`已恢复：${c.experiments ?? 0} 个实验、${c.reagents ?? 0} 种试剂、${c.files ?? 0} 个文件`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '恢复失败')
    }
  }

  return (
    <div>
      <PageHeader title="设置与备份" />
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-6 md:px-8">
        <Section icon={<HardDrive />} title="数据存在哪里" desc="所有内容只保存在这台设备的浏览器里，不上传任何服务器，断网也能用。换设备或清理浏览器数据前，请先下载备份。">
          <div className="grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
            {[
              ['实验', counts?.experiments],
              ['内容块', counts?.blocks],
              ['试剂', counts?.reagents],
              ['文件', counts?.files],
            ].map(([l, n]) => (
              <div key={l as string} className="rounded-xl bg-slate-50 py-3 dark:bg-slate-800/60">
                <div className="text-lg font-semibold tabular-nums">{n ?? '—'}</div>
                <div className="text-xs text-slate-500">{l}</div>
              </div>
            ))}
          </div>
          {usage && (
            <p className="mt-3 text-xs text-slate-500">
              已占用 {formatBytes(usage.used)}
              {usage.quota > 0 && `，浏览器允许约 ${formatBytes(usage.quota)}`}。
              {persisted === false && ' 浏览器尚未授予「持久存储」，空间紧张时可能清理数据，定期备份更稳妥。'}
              {persisted && ' 已启用持久存储。'}
            </p>
          )}
          {isDesktop && <DataDirRow />}
        </Section>

        <Section icon={<Cloud />} title="多设备同步（网络存储）" desc="通过 GitHub 私有仓库或 WebDAV 在电脑和手机之间自动同步。">
          <SyncSettings />
        </Section>

        <Section icon={<DatabaseBackup />} title="备份与恢复" desc="备份文件是一个 zip，包含全部实验、试剂、日程、模板、历史版本和图片。">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" onClick={() => void downloadBackup().then(() => toast.success('备份已下载'))}>
              <Download /> 下载完整备份
            </Button>
            <Button onClick={() => backupInput.current?.click()}>
              <Upload /> 从备份恢复
            </Button>
            <span className="text-xs text-slate-500">{lastBackup ? `上次备份：${formatDateTime(lastBackup)}` : '还没有备份过'}</span>
          </div>
          <input ref={backupInput} type="file" accept=".zip,application/zip" hidden onChange={(e) => (e.target.files?.[0] && void restore(e.target.files[0]), (e.target.value = ''))} />
        </Section>

        <Section icon={theme === 'dark' ? <Moon /> : <Sun />} title="外观">
          <Segmented
            value={theme}
            onChange={setTheme}
            options={[
              { value: 'light', label: (<><Sun /> 浅色</>) },
              { value: 'dark', label: (<><Moon /> 深色</>) },
              { value: 'system', label: (<><Monitor /> 跟随系统</>) },
            ]}
          />
        </Section>

        <Section icon={<Keyboard />} title="键盘快捷键">
          <dl className="grid gap-x-8 gap-y-2 text-[13px] sm:grid-cols-2">
            {[
              [[modKey, 'K'], '搜索与跳转'],
              [['N'], '新建实验'],
              [[modKey, 'S'], '立即保存'],
              [['⌥', '↑ / ↓'], '移动当前内容块'],
              [[modKey, 'C / V'], '孔板：复制粘贴孔'],
              [['Shift', '方向键'], '孔板：扩大选区'],
              [['Delete'], '孔板：清空选中孔'],
              [['Esc'], '关闭弹窗'],
            ].map(([keys, label]) => (
              <div key={label as string} className="flex items-center justify-between gap-4">
                <dt className="text-slate-600 dark:text-slate-300">{label as string}</dt>
                <dd className="flex gap-1">
                  {(keys as string[]).map((k) => (
                    <Kbd key={k}>{k}</Kbd>
                  ))}
                </dd>
              </div>
            ))}
          </dl>
        </Section>

        <AboutSection />

        <p className="pt-2 text-center text-xs text-slate-500">ExPermit 实验记录本 · 本地优先 · 开源</p>
      </div>
    </div>
  )
}

/** 桌面版：数据存储位置（更改后自动重启并迁移） */
function DataDirRow() {
  const [dir, setDir] = useState<string | null>(null)
  useEffect(() => {
    void desktop?.getInfo().then((i) => setDir(i.dataDir))
  }, [])
  const change = async () => {
    const ok = await confirmDialog({
      title: '更改数据存储位置？',
      body: '选择新位置后应用会自动重启，并把全部数据复制过去；原位置的数据保留不动。',
      confirmText: '选择位置',
    })
    if (!ok) return
    await desktop?.chooseDataDir()
  }
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
      <span className="min-w-0 flex-1 truncate font-mono text-xs text-slate-500" title={dir ?? ''}>
        {dir ?? '…'}
      </span>
      <Button size="sm" onClick={() => void change()}>
        <FolderOpen /> 更改位置
      </Button>
    </div>
  )
}

/** 关于与更新：版本号、更新日志（点开才看）、检查频率（桌面版） */
function AboutSection() {
  const [logOpen, setLogOpen] = useState(false)
  const [freq, setFreqState] = useState<CheckFreq>(() => getCheckFreq())
  const [checking, setChecking] = useState(false)

  const checkNow = async () => {
    setChecking(true)
    const info = await checkLatest()
    setChecking(false)
    if (!info) {
      toast.error('检查更新失败，请稍后再试')
      return
    }
    if (!isNewer(info.version)) {
      toast.success(`已是最新版本（${appVersion}）`)
      return
    }
    toast(`新版本 ${info.version} 可用`, {
      duration: 30000,
      action: info.setupUrl
        ? { label: '下载并安装', onClick: () => void downloadAndInstall(info.setupUrl!) }
        : { label: '查看', onClick: () => void window.open('https://github.com/fengtong2001-ui/expermit-eln/releases/latest', '_blank') },
    })
  }

  return (
    <Section icon={<RefreshCw />} title="关于与更新">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-slate-600 dark:text-slate-300">
        <span>
          当前版本 <span className="font-semibold tabular-nums">{appVersion}</span>
        </span>
        <button onClick={() => setLogOpen((v) => !v)} className="cursor-pointer text-brand-700 hover:underline dark:text-brand-300">
          更新日志
        </button>
        {isDesktop && (
          <>
            <Button size="sm" onClick={() => void checkNow()} disabled={checking}>
              <RefreshCw className={checking ? 'animate-spin' : ''} /> {checking ? '检查中…' : '立即检查'}
            </Button>
            <div className="flex items-center gap-2">
              <CalendarClock className="size-3.5 text-slate-400" />
              <Segmented
                value={freq}
                onChange={(v) => {
                  setCheckFreq(v as CheckFreq)
                  setFreqState(v as CheckFreq)
                }}
                options={[
                  { value: 'always', label: '每次启动检查' },
                  { value: 'weekly', label: '7 天检查一次' },
                ]}
              />
            </div>
          </>
        )}
      </div>
      {logOpen && <ChangelogView raw={changelogRaw} />}
    </Section>
  )
}

/** 条目内的 **加粗** 与 `代码` 标记 */
function richText(s: string, keyBase: string) {
  const parts: React.ReactNode[] = []
  const re = /\*\*(.+?)\*\*|`(.+?)`/g
  let last = 0
  let m: RegExpExecArray | null
  let k = 0
  while ((m = re.exec(s))) {
    if (m.index > last) parts.push(s.slice(last, m.index))
    if (m[1]) parts.push(<strong key={`${keyBase}-${k++}`} className="font-semibold text-slate-800 dark:text-slate-100">{m[1]}</strong>)
    else parts.push(<code key={`${keyBase}-${k++}`} className="rounded bg-slate-200/70 px-1 font-mono text-[12px] dark:bg-slate-700/70">{m[2]}</code>)
    last = re.lastIndex
  }
  if (last < s.length) parts.push(s.slice(last))
  return parts
}

/** 极简渲染 CHANGELOG.md：## 版本 / ### 分节 / - 条目 */
function ChangelogView({ raw }: { raw: string }) {
  const versions: { title: string; sections: { name: string; items: string[] }[] }[] = []
  let v: (typeof versions)[number] | null = null
  let s: NonNullable<(typeof versions)[number]['sections'][number]> | null = null
  for (const line of raw.split('\n')) {
    if (line.startsWith('## ')) {
      v = { title: line.slice(3).trim(), sections: [] }
      versions.push(v)
      s = null
    } else if (line.startsWith('### ') && v) {
      s = { name: line.slice(4).trim(), items: [] }
      v.sections.push(s)
    } else if (line.startsWith('- ') && v && s) {
      s.items.push(line.slice(2).trim())
    }
  }
  return (
    <div className="mt-3 max-h-96 space-y-4 overflow-y-auto rounded-xl bg-slate-50 p-4 text-[13px] dark:bg-slate-800/50">
      {versions.map((ver) => (
        <div key={ver.title}>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{ver.title}</h3>
          {ver.sections.map((sec) => (
            <div key={sec.name} className="mt-2">
              <h4 className="text-xs font-medium text-slate-500">{sec.name}</h4>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-slate-600 dark:text-slate-300">
                {sec.items.map((it, i) => (
                  <li key={i}>{richText(it, `${ver.title}-${sec.name}-${i}`)}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
