import * as RCMenu from '@radix-ui/react-context-menu'
import type { ReactNode } from 'react'
import { cn } from '@/lib/util'

/**
 * 右键二级菜单（桌面应用惯例）：
 * <ContextMenu><ContextMenuTrigger>条目…</ContextMenuTrigger><ContextMenuContent>…</ContextMenuContent></ContextMenu>
 * 观感与 ui.tsx 的 Dropdown Menu 一致。右键是次要操作的正式入口（见 DEVELOPMENT.md），
 * 主操作仍应出现在界面可见处。
 */
export const ContextMenu = RCMenu.Root
export const ContextMenuTrigger = RCMenu.Trigger

export function ContextMenuContent({ children }: { children: ReactNode }) {
  return (
    <RCMenu.Portal>
      <RCMenu.Content
        sideOffset={2}
        className="z-50 min-w-48 animate-pop rounded-xl border border-slate-200 bg-white p-1 shadow-pop dark:border-slate-700 dark:bg-slate-900"
      >
        {children}
      </RCMenu.Content>
    </RCMenu.Portal>
  )
}

export function ContextMenuItem({
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
    <RCMenu.Item
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
    </RCMenu.Item>
  )
}

export function ContextMenuSeparator() {
  return <RCMenu.Separator className="my-1 h-px bg-slate-100 dark:bg-slate-800" />
}
