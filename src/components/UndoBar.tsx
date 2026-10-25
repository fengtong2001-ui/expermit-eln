import { Undo2 } from 'lucide-react'
import { popUndo, useUndoTop } from '@/lib/undo'

/** 右下角常驻撤回：小圆钮，悬停提示可撤的操作，点击撤销最近一次结构性操作 */
export function UndoBar() {
  const top = useUndoTop()
  if (!top) return null
  return (
    <div className="no-print fixed right-4 bottom-20 z-40 md:bottom-4">
      <button
        onClick={popUndo}
        aria-label={`撤回：${top.label}`}
        title={`撤回 · ${top.label}`}
        className="flex size-9 cursor-pointer items-center justify-center rounded-full border border-slate-200 bg-white/95 text-slate-500 shadow-pop backdrop-blur transition hover:border-slate-300 hover:text-slate-900 active:scale-95 dark:border-slate-700 dark:bg-slate-800/95 dark:text-slate-400 dark:hover:border-slate-600 dark:hover:text-white"
      >
        <Undo2 className="size-4" />
      </button>
    </div>
  )
}
