import { Plus, Trash2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/util'

/** 块内统一的卡片外观 */
export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/40', className)}>{children}</div>
}

/** 块内标题输入：无边框大字 */
export function BlockTitle({ value, onChange, placeholder, readOnly }: { value: string; onChange: (v: string) => void; placeholder: string; readOnly: boolean }) {
  if (readOnly && !value) return null
  return (
    <input
      value={value}
      readOnly={readOnly}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={placeholder}
      className="mb-3 w-full bg-transparent text-base font-semibold text-slate-900 outline-none placeholder:font-normal placeholder:text-slate-300 dark:text-white dark:placeholder:text-slate-600"
    />
  )
}

export function AddRow({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="no-print flex h-9 w-full cursor-pointer items-center gap-2 px-3 text-[13px] text-slate-500 transition hover:bg-slate-50 hover:text-slate-700 dark:hover:bg-slate-800/50 dark:hover:text-slate-200"
    >
      <Plus className="size-4" /> {children}
    </button>
  )
}

export function RowDelete({ onClick, label = '删除这一行' }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="no-print flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-slate-400 opacity-100 transition hover:bg-rose-50 hover:text-rose-600 sm:opacity-0 sm:group-hover/row:opacity-100 sm:focus:opacity-100 dark:text-slate-600 dark:hover:bg-rose-500/10"
    >
      <Trash2 className="size-4" />
    </button>
  )
}

export function NumInput({
  value,
  onChange,
  placeholder,
  readOnly,
  className,
  step = 'any',
  label,
}: {
  value: number | null
  onChange: (v: number | null) => void
  placeholder?: string
  readOnly?: boolean
  className?: string
  step?: string
  label?: string
}) {
  return (
    <input
      type="number"
      inputMode="decimal"
      step={step}
      value={value ?? ''}
      readOnly={readOnly}
      aria-label={label ?? placeholder}
      placeholder={placeholder}
      onChange={(e) => {
        const v = e.target.value
        onChange(v === '' ? null : Number(v))
      }}
      className={cn('cell tabular-nums', className)}
    />
  )
}
