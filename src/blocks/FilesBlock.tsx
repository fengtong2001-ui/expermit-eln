import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Camera, Download, FileText, ImagePlus, Maximize2, Trash2, Upload, X } from 'lucide-react'
import * as RDialog from '@radix-ui/react-dialog'
import { toast } from 'sonner'
import type { BlockEditorProps } from './types'
import type { FileItem, FilesData } from './defs'
import { db } from '@/lib/db'
import { storeFile } from '@/lib/repo'
import { cn, downloadBlob, formatBytes, uid } from '@/lib/util'

const MAX = 100 * 1024 * 1024

/** 超大照片缩到长边 2560 存储，原始文件可选保留；非图片原样存 */
async function prepare(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif' || file.type === 'image/svg+xml' || file.size < 1.5 * 1024 * 1024) return file
  try {
    const bmp = await createImageBitmap(file)
    const scale = Math.min(1, 2560 / Math.max(bmp.width, bmp.height))
    if (scale === 1 && file.size < 4 * 1024 * 1024) return file
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bmp.width * scale)
    canvas.height = Math.round(bmp.height * scale)
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.92))
    return blob && blob.size < file.size ? blob : file
  } catch {
    return file
  }
}

function useObjectUrl(fileId: string) {
  const f = useLiveQuery(() => db.files.get(fileId), [fileId])
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!f) return
    const u = URL.createObjectURL(f.blob)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [f])
  return { url, file: f }
}

function Thumb({ item, onOpen, onRemove, onCaption, readOnly }: { item: FileItem; onOpen: () => void; onRemove: () => void; onCaption: (c: string) => void; readOnly: boolean }) {
  const { url, file } = useObjectUrl(item.fileId)
  const isImage = item.mime.startsWith('image/')
  return (
    <figure className="group/thumb relative overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <button onClick={onOpen} className="block aspect-[4/3] w-full cursor-zoom-in overflow-hidden bg-slate-100 dark:bg-slate-800" aria-label={`查看 ${item.name}`}>
        {isImage && url ? (
          <img src={url} alt={item.caption || item.name} className="size-full object-cover transition group-hover/thumb:scale-[1.02]" />
        ) : (
          <span className="flex size-full flex-col items-center justify-center gap-2 text-slate-500">
            <FileText className="size-8" />
            <span className="max-w-[90%] truncate text-xs">{item.name}</span>
          </span>
        )}
      </button>
      {!readOnly && (
        <div className="no-print absolute top-2 right-2 flex gap-1 opacity-100 transition sm:opacity-0 sm:group-hover/thumb:opacity-100">
          <button
            onClick={() => file && downloadBlob(file.blob, item.name)}
            aria-label="下载"
            className="flex size-7 cursor-pointer items-center justify-center rounded-md bg-white/90 text-slate-600 shadow-sm backdrop-blur hover:bg-white"
          >
            <Download className="size-3.5" />
          </button>
          <button onClick={onRemove} aria-label="移除" className="flex size-7 cursor-pointer items-center justify-center rounded-md bg-white/90 text-slate-600 shadow-sm backdrop-blur hover:bg-white hover:text-rose-600">
            <Trash2 className="size-3.5" />
          </button>
        </div>
      )}
      <figcaption className="px-2 py-1.5">
        <input
          value={item.caption}
          readOnly={readOnly}
          onChange={(e) => onCaption(e.target.value)}
          placeholder={readOnly ? '' : '说明'}
          aria-label="图片说明"
          className="w-full truncate bg-transparent text-xs text-slate-600 outline-none placeholder:text-slate-300 dark:text-slate-300"
        />
        <p className="truncate text-[10px] text-slate-500">
          {item.name} · {formatBytes(item.size)}
        </p>
      </figcaption>
    </figure>
  )
}

function Viewer({ item, onClose }: { item: FileItem | null; onClose: () => void }) {
  const { url, file } = useObjectUrl(item?.fileId ?? '')
  return (
    <RDialog.Root open={!!item} onOpenChange={(v) => !v && onClose()}>
      <RDialog.Portal>
        <RDialog.Overlay className="fixed inset-0 z-50 animate-in bg-black/85" />
        <RDialog.Content className="fixed inset-0 z-50 flex flex-col">
          <RDialog.Title className="sr-only">{item?.name}</RDialog.Title>
          <RDialog.Description className="sr-only">文件预览</RDialog.Description>
          <div className="flex items-center gap-3 p-3 text-white">
            <span className="flex-1 truncate text-sm">{item?.caption || item?.name}</span>
            <button onClick={() => file && item && downloadBlob(file.blob, item.name)} className="flex size-9 cursor-pointer items-center justify-center rounded-lg hover:bg-white/10" aria-label="下载">
              <Download className="size-5" />
            </button>
            <RDialog.Close className="flex size-9 cursor-pointer items-center justify-center rounded-lg hover:bg-white/10" aria-label="关闭">
              <X className="size-5" />
            </RDialog.Close>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center p-4" onClick={onClose}>
            {item && url && item.mime.startsWith('image/') ? (
              <img src={url} alt={item.caption || item.name} className="max-h-full max-w-full rounded object-contain" onClick={(e) => e.stopPropagation()} />
            ) : item && url && item.mime === 'application/pdf' ? (
              <iframe src={url} title={item.name} className="size-full rounded bg-white" onClick={(e) => e.stopPropagation()} />
            ) : (
              <p className="text-sm text-white/70">这个文件无法预览，可以点右上角下载。</p>
            )}
          </div>
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  )
}

export function FilesBlock({ data, onChange, readOnly }: BlockEditorProps<FilesData>) {
  const input = useRef<HTMLInputElement>(null)
  const camera = useRef<HTMLInputElement>(null)
  const zone = useRef<HTMLDivElement>(null)
  const [over, setOver] = useState(false)
  const [busy, setBusy] = useState(0)
  const [viewing, setViewing] = useState<FileItem | null>(null)
  const dataRef = useRef(data)
  dataRef.current = data

  const addFiles = async (files: File[]) => {
    const ok = files.filter((f) => {
      if (f.size > MAX) toast.error(`「${f.name}」超过 100 MB，未添加`)
      return f.size <= MAX
    })
    if (!ok.length) return
    setBusy((b) => b + ok.length)
    const items: FileItem[] = []
    for (const f of ok) {
      const blob = await prepare(f)
      const name = blob !== f && f.type !== 'image/jpeg' ? f.name.replace(/\.\w+$/, '') + '.jpg' : f.name || `粘贴的图片-${Date.now()}.png`
      const stored = await storeFile(blob, name)
      items.push({ id: uid(), fileId: stored.id, name, mime: stored.mime, size: stored.size, caption: '' })
      setBusy((b) => b - 1)
    }
    onChange({ items: [...dataRef.current.items, ...items] })
  }

  // 焦点在本块内时支持直接粘贴截图
  useEffect(() => {
    const el = zone.current
    if (!el || readOnly) return
    const fn = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.files ?? [])]
      if (files.length) {
        e.preventDefault()
        void addFiles(files)
      }
    }
    el.addEventListener('paste', fn)
    return () => el.removeEventListener('paste', fn)
  })

  const remove = (item: FileItem) => {
    const before = data
    onChange({ items: data.items.filter((i) => i.id !== item.id) })
    toast('已移除文件', { action: { label: '撤销', onClick: () => onChange(before) }, duration: 8000 })
  }

  return (
    <div
      ref={zone}
      tabIndex={-1}
      className="outline-none"
      onDragOver={(e) => {
        if (readOnly) return
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        if (readOnly) return
        e.preventDefault()
        setOver(false)
        void addFiles([...e.dataTransfer.files])
      }}
    >
      {data.items.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {data.items.map((it) => (
            <Thumb
              key={it.id}
              item={it}
              readOnly={readOnly}
              onOpen={() => setViewing(it)}
              onRemove={() => remove(it)}
              onCaption={(caption) => onChange({ items: data.items.map((x) => (x.id === it.id ? { ...x, caption } : x)) })}
            />
          ))}
          {busy > 0 && Array.from({ length: busy }, (_, i) => <div key={i} className="aspect-[4/3] animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />)}
        </div>
      )}

      {!readOnly && (
        <div
          className={cn(
            'no-print flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-4 text-center transition sm:flex-row',
            data.items.length ? 'mt-3 py-3' : 'py-8',
            over ? 'border-brand-400 bg-brand-50/60 dark:bg-brand-500/10' : 'border-slate-200 dark:border-slate-700',
          )}
        >
          {!data.items.length && <ImagePlus className="size-6 text-slate-400" />}
          <p className="text-[13px] text-slate-500">
            拖入文件、{data.items.length ? '' : '点这里后 '}
            <kbd className="kbd">⌘</kbd>
            <kbd className="kbd">V</kbd> 粘贴截图，或
          </p>
          <div className="flex gap-2">
            <button onClick={() => input.current?.click()} className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg bg-white px-3 text-[13px] font-medium text-slate-700 shadow-xs ring-1 ring-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700">
              <Upload className="size-4" /> 选择文件
            </button>
            <button onClick={() => camera.current?.click()} className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg bg-white px-3 text-[13px] font-medium text-slate-700 shadow-xs ring-1 ring-slate-200 hover:bg-slate-50 sm:hidden dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700">
              <Camera className="size-4" /> 拍照
            </button>
          </div>
          <input ref={input} type="file" multiple hidden onChange={(e) => (void addFiles([...(e.target.files ?? [])]), (e.target.value = ''))} />
          <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => (void addFiles([...(e.target.files ?? [])]), (e.target.value = ''))} />
        </div>
      )}
      {readOnly && !data.items.length && <p className="text-[13px] text-slate-500">没有文件</p>}
      <Viewer item={viewing} onClose={() => setViewing(null)} />
      <Maximize2 className="hidden" />
    </div>
  )
}
