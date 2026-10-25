import { useCallback, useEffect, useRef } from 'react'
import { saveState, tracked } from './saveState'

/**
 * 去抖保存。关键约束：保存进行中产生的新输入不能被丢弃——
 * 每次保存只写「发起那一刻」的值，结束后若又有新值，继续排下一次。
 */
export function useDebouncedSave<T>(key: string, save: (v: T) => Promise<void>, delay = 600) {
  const pending = useRef<{ v: T } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inflight = useRef<Promise<void> | null>(null)
  const saveRef = useRef(save)
  saveRef.current = save

  const run = useCallback(async (): Promise<void> => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    if (inflight.current) {
      await inflight.current
    }
    const job = pending.current
    if (!job) return
    pending.current = null
    inflight.current = tracked(saveRef.current(job.v)).finally(() => {
      inflight.current = null
    })
    await inflight.current
    if (pending.current) await run()
  }, [])

  const schedule = useCallback(
    (v: T) => {
      pending.current = { v }
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => void run(), delay)
    },
    [delay, run],
  )

  const isDirty = useCallback(() => pending.current !== null || inflight.current !== null, [])

  useEffect(() => {
    const off = saveState.register(key, run)
    return () => {
      off()
      void run()
    }
  }, [key, run])

  return { schedule, flush: run, isDirty }
}
