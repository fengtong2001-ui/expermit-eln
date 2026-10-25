import { useSyncExternalStore } from 'react'

// 跨页面的轻量 UI 状态：命令面板、新建实验弹窗、移动端侧栏
interface UIState {
  palette: boolean
  newExp: false | { projectId?: string | null; date?: string | null }
}

let state: UIState = { palette: false, newExp: false }
const subs = new Set<() => void>()
const set = (patch: Partial<UIState>) => {
  state = { ...state, ...patch }
  subs.forEach((f) => f())
}

export const ui = {
  openPalette: () => set({ palette: true }),
  setPalette: (v: boolean) => set({ palette: v }),
  openNewExperiment: (opts: { projectId?: string | null; date?: string | null } = {}) => set({ newExp: opts }),
  closeNewExperiment: () => set({ newExp: false }),
}

export function useUI() {
  return useSyncExternalStore(
    (f) => {
      subs.add(f)
      return () => subs.delete(f)
    },
    () => state,
  )
}
