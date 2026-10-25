import { useEffect, useState, useSyncExternalStore } from 'react'
import { Button, Dialog, Field } from './ui'

interface Req {
  title: string
  label: string
  initial?: string
  placeholder?: string
  confirmText?: string
  multiline?: { label: string; initial?: string; placeholder?: string }
  resolve: (v: { value: string; extra: string } | null) => void
}

let current: Req | null = null
const subs = new Set<() => void>()
const emit = () => subs.forEach((f) => f())

/** 替代 window.prompt 的输入对话框 */
export function promptDialog(opts: Omit<Req, 'resolve'>): Promise<{ value: string; extra: string } | null> {
  return new Promise((resolve) => {
    current = { ...opts, resolve }
    emit()
  })
}

function close(v: { value: string; extra: string } | null) {
  current?.resolve(v)
  current = null
  emit()
}

export function PromptHost() {
  const req = useSyncExternalStore(
    (f) => {
      subs.add(f)
      return () => subs.delete(f)
    },
    () => current,
  )
  const [value, setValue] = useState('')
  const [extra, setExtra] = useState('')
  useEffect(() => {
    setValue(req?.initial ?? '')
    setExtra(req?.multiline?.initial ?? '')
  }, [req])

  const submit = () => value.trim() && close({ value: value.trim(), extra: extra.trim() })

  return (
    <Dialog
      open={!!req}
      onOpenChange={(v) => !v && close(null)}
      title={req?.title ?? ''}
      width="max-w-md"
      footer={
        <>
          <Button onClick={() => close(null)}>取消</Button>
          <Button variant="primary" disabled={!value.trim()} onClick={submit}>
            {req?.confirmText ?? '确定'}
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <Field label={req?.label ?? ''}>
          <input autoFocus className="field" value={value} placeholder={req?.placeholder} onChange={(e) => setValue(e.target.value)} />
        </Field>
        {req?.multiline && (
          <Field label={req.multiline.label}>
            <textarea className="field" rows={3} value={extra} placeholder={req.multiline.placeholder} onChange={(e) => setExtra(e.target.value)} />
          </Field>
        )}
      </form>
    </Dialog>
  )
}
