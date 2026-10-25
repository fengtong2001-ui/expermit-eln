import { useSyncExternalStore } from 'react'

// 全局保存状态：页头常驻显示「已保存 HH:MM / 保存中 / 保存失败」
type State = { pending: number; lastSaved: number | null; error: string | null }

let state: State = { pending: 0, lastSaved: null, error: null }
const subs = new Set<() => void>()
const emit = () => subs.forEach((f) => f())

const flushers = new Map<string, () => Promise<void>>()

export const saveState = {
  begin() {
    state = { ...state, pending: state.pending + 1 }
    emit()
  },
  end(ok: boolean, error?: string) {
    state = { pending: Math.max(0, state.pending - 1), lastSaved: ok ? Date.now() : state.lastSaved, error: ok ? null : (error ?? '保存失败') }
    emit()
  },
  /** 注册一个可立即落盘的保存函数（用于 ⌘S、页面隐藏、离开页面） */
  register(key: string, flush: () => Promise<void>) {
    flushers.set(key, flush)
    return () => {
      flushers.delete(key)
    }
  },
  async flushAll() {
    await Promise.all([...flushers.values()].map((f) => f()))
  },
  get: () => state,
  subscribe(f: () => void) {
    subs.add(f)
    return () => {
      subs.delete(f)
    }
  },
}

export async function tracked<T>(p: Promise<T>): Promise<T> {
  saveState.begin()
  try {
    const r = await p
    saveState.end(true)
    return r
  } catch (e) {
    saveState.end(false, e instanceof Error ? e.message : String(e))
    throw e
  }
}

export function useSaveState() {
  return useSyncExternalStore(saveState.subscribe, saveState.get, saveState.get)
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void saveState.flushAll()
  })
  window.addEventListener('pagehide', () => void saveState.flushAll())
}
