import * as RDialog from '@radix-ui/react-dialog'
import * as RMenu from '@radix-ui/react-dropdown-menu'
import * as RPopover from '@radix-ui/react-popover'
import * as RTooltip from '@radix-ui/react-tooltip'
import { X } from 'lucide-react'
import { forwardRef, type ButtonHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react'
import { cn } from '@/lib/util'

// ───────────── Button ─────────────

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle'
type Size = 'sm' | 'md' | 'icon' | 'icon-sm'

const VARIANT: Record<Variant, string> = {
  primary: 'bg-brand-700 text-white shadow-sm hover:bg-brand-800 active:bg-brand-900 disabled:bg-brand-700/50',
  secondary:
    'border border-slate-200 bg-white text-slate-700 shadow-xs hover:bg-slate-50 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800',
  ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100',
  subtle: 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700',
  danger: 'bg-rose-600 text-white shadow-sm hover:bg-rose-700 disabled:bg-rose-600/50',
}
const SIZE: Record<Size, string> = {
  sm: 'h-8 px-2.5 text-[13px] gap-1.5 rounded-lg',
  md: 'h-9 px-3.5 text-sm gap-2 rounded-lg',
  icon: 'size-9 rounded-lg',
  'icon-sm': 'size-7 rounded-md',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', className, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex shrink-0 cursor-pointer items-center justify-center font-medium whitespace-nowrap transition select-none disabled:cursor-not-allowed disabled:opacity-60 [&_svg]:size-4 [&_svg]:shrink-0',
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...rest}
    />
  )
})

// ───────────── Tooltip ─────────────

export function Tip({ label, children, side = 'top' }: { label: ReactNode; children: ReactNode; side?: 'top' | 'bottom' | 'left' | 'right' }) {
  return (
    <RTooltip.Root delayDuration={350}>
      <RTooltip.Trigger asChild>{children}</RTooltip.Trigger>
      <RTooltip.Portal>
        <RTooltip.Content
          side={side}
          sideOffset={6}
          className="z-50 animate-in rounded-md bg-slate-900 px-2 py-1 text-xs text-white shadow-pop dark:bg-slate-700"
        >
          {label}
        </RTooltip.Content>
      </RTooltip.Portal>
    </RTooltip.Root>
  )
}

export const TooltipProvider = RTooltip.Provider

/** 与 Tip 相同，但用 content 属性传提示文案，便于表格内联使用 */
export function Tooltip({ content, side = 'top', children }: { content: ReactNode; side?: 'top' | 'bottom' | 'left' | 'right'; children: ReactNode }) {
  return (
    <Tip label={content} side={side}>
      {children}
    </Tip>
  )
}

// ───────────── Select ─────────────

/** 原生 select 的统一外观，保留浏览器原生下拉与键盘操作 */
export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        'h-9 cursor-pointer rounded-lg border border-slate-200 bg-white px-2 text-[13px] text-slate-700 outline-none transition focus:border-brand-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200',
        className,
      )}
      {...rest}
    >
      {children}
    </select>
  )
}

// ───────────── Dialog ─────────────

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  width = 'max-w-lg',
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  title: ReactNode
  description?: ReactNode
  children?: ReactNode
  footer?: ReactNode
  width?: string
}) {
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className="fixed inset-0 z-40 animate-in bg-slate-900/30 backdrop-blur-[2px] dark:bg-black/50" />
        <RDialog.Content
          className={cn(
            'fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] w-full animate-pop flex-col rounded-t-2xl border border-slate-200 bg-white shadow-pop sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl dark:border-slate-800 dark:bg-slate-900',
            width,
          )}
        >
          <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-3">
            <div>
              <RDialog.Title className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</RDialog.Title>
              {description ? (
                <RDialog.Description className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</RDialog.Description>
              ) : (
                <RDialog.Description className="sr-only">{typeof title === 'string' ? title : '对话框'}</RDialog.Description>
              )}
            </div>
            <RDialog.Close asChild>
              <Button variant="ghost" size="icon-sm" aria-label="关闭" className="-mt-1 -mr-1">
                <X />
              </Button>
            </RDialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">{children}</div>
          {footer && (
            <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-3 dark:border-slate-800">{footer}</div>
          )}
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  )
}

// ───────────── Menu ─────────────

export const Menu = RMenu.Root
export const MenuTrigger = RMenu.Trigger

export function MenuContent({ children, align = 'end' }: { children: ReactNode; align?: 'start' | 'end' | 'center' }) {
  return (
    <RMenu.Portal>
      <RMenu.Content
        align={align}
        sideOffset={6}
        className="z-50 min-w-48 animate-pop rounded-xl border border-slate-200 bg-white p-1 shadow-pop dark:border-slate-700 dark:bg-slate-900"
      >
        {children}
      </RMenu.Content>
    </RMenu.Portal>
  )
}

export function MenuItem({
  icon,
  children,
  onSelect,
  danger,
  shortcut,
  disabled,
}: {
  icon?: ReactNode
  children: ReactNode
  onSelect?: () => void
  danger?: boolean
  shortcut?: string
  disabled?: boolean
}) {
  return (
    <RMenu.Item
      disabled={disabled}
      onSelect={onSelect}
      className={cn(
        'flex h-8 cursor-pointer items-center gap-2.5 rounded-lg px-2 text-[13px] outline-none select-none data-disabled:cursor-not-allowed data-disabled:opacity-40 [&_svg]:size-4',
        danger
          ? 'text-rose-600 data-highlighted:bg-rose-50 dark:text-rose-400 dark:data-highlighted:bg-rose-500/10'
          : 'text-slate-700 data-highlighted:bg-slate-100 dark:text-slate-200 dark:data-highlighted:bg-slate-800',
      )}
    >
      <span className={cn('shrink-0', danger ? '' : 'text-slate-500')}>{icon}</span>
      <span className="flex-1">{children}</span>
      {shortcut && <span className="text-xs text-slate-500">{shortcut}</span>}
    </RMenu.Item>
  )
}

export function MenuSeparator() {
  return <RMenu.Separator className="my-1 h-px bg-slate-100 dark:bg-slate-800" />
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <RMenu.Label className="px-2 pt-1.5 pb-1 text-[11px] font-medium text-slate-500">{children}</RMenu.Label>
}

// ───────────── Popover ─────────────

export const Popover = RPopover.Root
export const PopoverTrigger = RPopover.Trigger
export const PopoverAnchor = RPopover.Anchor
export function PopoverContent({
  children,
  className,
  align = 'start',
  side,
  onOpenAutoFocus,
}: {
  children: ReactNode
  className?: string
  align?: 'start' | 'center' | 'end'
  side?: 'top' | 'bottom' | 'left' | 'right'
  onOpenAutoFocus?: (e: Event) => void
}) {
  return (
    <RPopover.Portal>
      <RPopover.Content
        align={align}
        side={side}
        sideOffset={6}
        collisionPadding={12}
        onOpenAutoFocus={onOpenAutoFocus}
        className={cn(
          'z-50 animate-pop rounded-xl border border-slate-200 bg-white shadow-pop dark:border-slate-700 dark:bg-slate-900',
          className,
        )}
      >
        {children}
      </RPopover.Content>
    </RPopover.Portal>
  )
}

// ───────────── 小件 ─────────────

export function Badge({ className, children }: { className?: string; children: ReactNode }) {
  return <span className={cn('inline-flex h-5 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium whitespace-nowrap', className)}>{children}</span>
}

export function EmptyState({
  icon,
  title,
  hint,
  action,
  actionClassName,
  className,
}: {
  icon: ReactNode
  title: string
  hint?: ReactNode
  action?: ReactNode
  actionClassName?: string
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-8 text-center md:py-14', className)}>
      <div className="mb-3 flex size-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 md:mb-4 md:size-12 dark:bg-slate-800 [&_svg]:size-5 md:[&_svg]:size-6">{icon}</div>
      <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">{hint}</p>}
      {action && <div className={cn('mt-4 md:mt-5', actionClassName)}>{action}</div>}
    </div>
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = 'md',
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: ReactNode; title?: string }[]
  size?: 'sm' | 'md'
}) {
  return (
    <div role="radiogroup" className="inline-flex rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cn(
            'inline-flex cursor-pointer items-center gap-1.5 rounded-md font-medium transition [&_svg]:size-4',
            size === 'sm' ? 'h-7 px-2 text-xs' : 'h-8 px-3 text-[13px]',
            value === o.value
              ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-white'
              : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Field({ label, children, hint, className }: { label: string; children: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <label className={cn('block', className)}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  )
}
