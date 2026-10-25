import { useSyncExternalStore } from 'react'

/**
 * 全客户端通用撤回栈：结构性操作（删块、删行、删实验、删日程、归档、标记完成…）入栈，
 * 文字编辑的撤销仍归输入框/编辑器原生行为。
 * 入口：Ctrl/Cmd+Z（非输入焦点时）、右下角常驻撤回浮条、toast 上的「撤销」按钮（undoById 精确撤销）。
 */
export interface UndoEntry {
  id: number
  label: string
  undo: () => void | Promise<void>
  at: number
}

const LIMIT = 30
let seq = 0
let stack: UndoEntry[] = []
const subs = new Set<() => void>()
const emit = () => subs.forEach((f) => f())

/** 记录一次可撤销操作，返回 id 供 toast 的「撤销」按钮精确撤销 */
export function pushUndo(label: string, undo: () => void | Promise<void>): number {
  const entry = { id: ++seq, label, undo, at: Date.now() }
  stack = [...stack.slice(-(LIMIT - 1)), entry]
  emit()
  return entry.id
}

/** 撤销指定操作（toast「撤销」用）：只移除并执行那一条，不动其他 */
export function undoById(id: number) {
  const e = stack.find((x) => x.id === id)
  if (!e) return
  stack = stack.filter((x) => x.id !== id)
  emit()
  void e.undo()
}

/** 撤销最近一次操作（Ctrl+Z / 浮条用） */
export function popUndo() {
  const e = stack[stack.length - 1]
  if (!e) return
  stack = stack.slice(0, -1)
  emit()
  void e.undo()
}

/** 当前栈顶（常驻浮条显示用） */
export function useUndoTop(): UndoEntry | null {
  return useSyncExternalStore(
    (f) => {
      subs.add(f)
      return () => subs.delete(f)
    },
    () => stack[stack.length - 1] ?? null,
  )
}
