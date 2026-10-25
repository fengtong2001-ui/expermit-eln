import type { Experiment, Schedule } from './types'
import { completeExperiment, reopenExperiment, updateSchedule } from './repo'
import { pushUndo } from './undo'

/**
 * 日程条目的完成态以「手动勾选 ∨ 关联实验已完成」取或——
 * 实验标记完成后日程跟着完成，两边（日程页 / 实验列表）永远一致。
 */
export const schedDone = (s: Schedule, e?: Pick<Experiment, 'status'>) => s.done || (!!e && (e.status === 'done' || e.status === 'archived'))

/** 勾选日程：无关联只改本条；关联了实验则联动完成/重新打开实验，并记入全局撤回栈 */
export function toggleScheduleDone(s: Schedule, e?: Pick<Experiment, 'id' | 'status'>) {
  const next = !schedDone(s, e)
  const wasExpDone = !!e && (e.status === 'done' || e.status === 'archived')
  void updateSchedule(s.id, { done: next })
  if (e && next !== wasExpDone) {
    void (next ? completeExperiment(e.id) : reopenExperiment(e.id))
    pushUndo(next ? '标记完成' : '重新打开', () => {
      void updateSchedule(s.id, { done: !next })
      void (next ? reopenExperiment(e.id) : completeExperiment(e.id))
    })
  } else {
    pushUndo(next ? '完成日程' : '取消完成', () => void updateSchedule(s.id, { done: !next }))
  }
}
