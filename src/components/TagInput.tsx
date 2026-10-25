import { X } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/util'

export function TagInput({
  value,
  onChange,
  placeholder,
  className,
  compact,
}: {
  value: string[]
  onChange: (v: string[]) => void
  placeholder?: string
  className?: string
  compact?: boolean
}) {
  const [draft, setDraft] = useState('')
  const add = (raw: string) => {
    const parts = raw
      .split(/[,，、\s]+/)
      .map((s) => s.replace(/^#/, '').trim())
      .filter(Boolean)
    const next = [...value]
    for (const p of parts) if (!next.includes(p)) next.push(p)
    if (next.length !== value.length) onChange(next)
    setDraft('')
  }
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-1.5',
        !compact &&
          'min-h-9 rounded-lg border border-slate-200 bg-white px-2 py-1.5 focus-within:border-brand-500 focus-within:ring-3 focus-within:ring-brand-500/15 dark:border-slate-700 dark:bg-slate-900',
        className,
      )}
    >
      {value.map((t) => (
        <span key={t} className="inline-flex h-6 items-center gap-1 rounded-md bg-slate-100 pr-1 pl-2 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-300">
          #{t}
          <button
            type="button"
            aria-label={`移除标签 ${t}`}
            onClick={() => onChange(value.filter((x) => x !== t))}
            className="cursor-pointer rounded p-0.5 text-slate-500 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-700"
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => {
          const v = e.target.value
          if (/[,，、]$/.test(v)) add(v)
          else setDraft(v)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && draft.trim()) {
            e.preventDefault()
            add(draft)
          } else if (e.key === 'Backspace' && !draft && value.length) onChange(value.slice(0, -1))
        }}
        onBlur={() => draft.trim() && add(draft)}
        placeholder={value.length ? (compact ? '＋标签' : '') : placeholder}
        className={cn('min-w-16 flex-1 bg-transparent text-[13px] outline-none placeholder:text-slate-400', compact ? 'h-6' : 'h-6')}
      />
    </div>
  )
}
