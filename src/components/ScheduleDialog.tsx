import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { CalendarPlus } from 'lucide-react'
import { addSchedule } from '@/lib/repo'
import { useExperiments } from '@/lib/hooks'
import { todayStr } from '@/lib/util'
import { Button, Dialog, Field } from '@/components/ui'

/** 新建安排弹窗：日程页与今天页共用；可以是纯安排（不关联实验），如「9:00 组会」 */
export function ScheduleDialog({ open, onOpenChange, defaultDate }: { open: boolean; onOpenChange: (v: boolean) => void; defaultDate?: string }) {
  const exps = useExperiments()
  const navigate = useNavigate()
  const [date, setDate] = useState(defaultDate ?? todayStr())
  const [time, setTime] = useState('')
  const [title, setTitle] = useState('')
  const [expId, setExpId] = useState('')

  useEffect(() => {
    if (open) {
      setDate(defaultDate ?? todayStr())
      setTime('')
      setTitle('')
      setExpId('')
    }
  }, [open, defaultDate])

  const submit = async () => {
    if (!title.trim()) return
    await addSchedule({ date, time, title: title.trim(), note: '', done: false, experimentId: expId || null })
    onOpenChange(false)
    navigate(`/schedule?date=${date}`)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="新建安排"
      description="纯安排（如组会、值班）不用关联实验；关联实验后完成状态会与实验同步。"
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>取消</Button>
          <Button variant="primary" disabled={!title.trim()} onClick={() => void submit()}>
            <CalendarPlus /> 添加
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="内容">
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} className="field" aria-label="安排内容" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="日期">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="field" aria-label="日期" />
          </Field>
          <Field label="时间">
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="field" aria-label="时间" />
          </Field>
        </div>
        <Field label="关联实验">
          <select value={expId} onChange={(e) => setExpId(e.target.value)} className="field text-[13px]" aria-label="关联实验">
            <option value="">不关联实验</option>
            {(exps ?? [])
              .filter((e) => e.status !== 'archived')
              .map((e) => (
                <option key={e.id} value={e.id}>
                  {e.title}
                </option>
              ))}
          </select>
        </Field>
      </div>
    </Dialog>
  )
}
