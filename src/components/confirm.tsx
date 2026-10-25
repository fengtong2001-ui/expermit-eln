import { useSyncExternalStore, type ReactNode } from 'react'
import { Button, Dialog } from './ui'

// 只给「不可撤销」的操作用；可撤销的操作直接执行，用 toast 给撤销。
interface Req {
  title: string
  body?: ReactNode
  confirmText?: string
  danger?: boolean
  resolve: (ok: boolean) => void
}

let current: Req | null = null
const subs = new Set<() => void>()
const emit = () => subs.forEach((f) => f())

export function confirmDialog(opts: Omit<Req, 'resolve'>): Promise<boolean> {
  return new Promise((resolve) => {
    current = { ...opts, resolve }
    emit()
  })
}

function close(ok: boolean) {
  current?.resolve(ok)
  current = null
  emit()
}

export function ConfirmHost() {
  const req = useSyncExternalStore(
    (f) => {
      subs.add(f)
      return () => subs.delete(f)
    },
    () => current,
  )
  return (
    <Dialog
      open={!!req}
      onOpenChange={(v) => !v && close(false)}
      title={req?.title ?? ''}
      width="max-w-md"
      footer={
        <>
          <Button onClick={() => close(false)}>取消</Button>
          <Button variant={req?.danger ? 'danger' : 'primary'} onClick={() => close(true)} autoFocus>
            {req?.confirmText ?? '确定'}
          </Button>
        </>
      }
    >
      {req?.body && <div className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">{req.body}</div>}
    </Dialog>
  )
}
