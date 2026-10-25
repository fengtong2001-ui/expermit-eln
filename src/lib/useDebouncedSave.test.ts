import { describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useDebouncedSave } from './useDebouncedSave'

describe('去抖保存', () => {
  it('保存进行中产生的新输入不会丢', async () => {
    vi.useFakeTimers()
    const saved: string[] = []
    let release: () => void = () => {}
    const save = vi.fn(
      (v: string) =>
        new Promise<void>((r) => {
          release = () => {
            saved.push(v)
            r()
          }
        }),
    )
    const { result } = renderHook(() => useDebouncedSave('k', save, 100))
    act(() => result.current.schedule('a'))
    await act(async () => {
      vi.advanceTimersByTime(150)
    })
    expect(save).toHaveBeenCalledTimes(1)
    // 第一次保存还没返回，用户继续输入
    act(() => result.current.schedule('ab'))
    await act(async () => {
      release()
      await Promise.resolve()
    })
    await act(async () => {
      vi.advanceTimersByTime(150)
      await Promise.resolve()
    })
    await act(async () => {
      release()
      await Promise.resolve()
    })
    expect(saved).toEqual(['a', 'ab'])
    vi.useRealTimers()
  })

  it('flush 立即写入最后的值', async () => {
    const save = vi.fn(async () => {})
    const { result } = renderHook(() => useDebouncedSave('k2', save, 10000))
    act(() => {
      result.current.schedule('x')
      result.current.schedule('xy')
    })
    await act(() => result.current.flush())
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith('xy')
  })
})
