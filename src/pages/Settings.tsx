import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { DatabaseBackup, Download, HardDrive, Import, Keyboard, Monitor, Moon, Sun, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { db } from '@/lib/db'
import { downloadBackup, importAll } from '@/lib/exporter'
import { importLegacy } from '@/lib/legacy'
import { setTheme, useTheme } from '@/lib/theme'
import { formatBytes, formatDateTime, modKey } from '@/lib/util'
import { PageHeader } from '@/components/Shell'
import { Button, Kbd, Segmented } from '@/components/ui'
import { confirmDialog } from '@/components/confirm'

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
  const legacyInput = useRef<HTMLInputElement>(null)
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

  const importOld = async (f: File) => {
    try {
      const dump = JSON.parse(await f.text())
      const r = await importLegacy(dump)
      toast.success(`已导入 ${r.experiments} 个实验、${r.reagents} 种试剂、${r.schedules} 条日程。试剂消耗记录已导入但未勾选，避免重复扣库存。`, { duration: 10000 })
    } catch {
      toast.error('无法读取这个文件。请选择旧版 ExPermit 导出的 JSON 文件。')
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

        <Section icon={<Import />} title="从旧版 ExPermit 导入" desc="导入旧版（网页 + 本地服务器那一版）的实验、孔板、试剂库与日程。导入的实验放在「从旧版导入」项目里，不影响现有数据。">
          <Button onClick={() => legacyInput.current?.click()}>
            <Import /> 选择旧版导出的 JSON
          </Button>
          <input ref={legacyInput} type="file" accept=".json,application/json" hidden onChange={(e) => (e.target.files?.[0] && void importOld(e.target.files[0]), (e.target.value = ''))} />
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

        <p className="pt-2 text-center text-xs text-slate-500">ExPermit 实验记录本 · 本地优先 · 开源</p>
      </div>
    </div>
  )
}
