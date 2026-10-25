import { Undo2 } from 'lucide-react'
import { popUndo, useUndoTop } from '@/lib/undo'
import { relativeTime } from '@/lib/util'

/** 右下角常驻撤回入口：有可撤销操作时出现，点击撤销最近一次结构性操作 */
export function UndoBar() {
  const top = useUndoTop()
  if (!top) return null
  return (
    <div className="no-print fixed right-4 bottom-20 z-40 md:bottom-4">
      <button
        onClick={popUndo}
        aria-label={`撤回：${top.label}`}
        className="flex h-9 cursor-pointer items-center gap-2 rounded-full border border-slate-200 bg-white/95 px-3.5 text-xs font-medium text-slate-600 shadow-pop backdrop-blur transition hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800/95 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:text-white"
      >
        <Undo2 className="size-3.5" />
        撤回 · {top.label}
        <span className="hidden text-[10px] font-normal text-slate-400 sm:inline">{relativeTime(top.at)}</span>
      </button>
    </div>
  )
}
