export interface KindDef {
  id: string
  label: string
  short: string
  color: string // tailwind 色系名
  description: string
}

/** 实验类型。code 前缀用 short；色系用于卡片与徽章 */
export const KINDS: KindDef[] = [
  { id: 'general', label: '通用实验', short: 'GEN', color: 'slate', description: '自由记录：文字、图片、表格' },
  { id: 'wb', label: 'Western Blot', short: 'WB', color: 'violet', description: '流程、泳道、抗体与结果图' },
  { id: 'qpcr', label: 'qPCR', short: 'QP', color: 'sky', description: 'Ct 值表与 2^-ΔΔCt 相对定量' },
  { id: 'cell', label: '细胞培养', short: 'CC', color: 'emerald', description: '培养容器、传代与孔板布局' },
  { id: 'assay', label: '孔板检测', short: 'PL', color: 'amber', description: 'CCK-8、ELISA 等孔板实验' },
]

export const kindOf = (id: string) => KINDS.find((k) => k.id === id) ?? KINDS[0]

/** tailwind 需要完整类名才能被扫描到，这里列全 */
export const KIND_STYLES: Record<string, { dot: string; badge: string; soft: string }> = {
  slate: { dot: 'bg-slate-400', badge: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300', soft: 'bg-slate-50 dark:bg-slate-900' },
  violet: { dot: 'bg-violet-500', badge: 'bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300', soft: 'bg-violet-50 dark:bg-violet-500/10' },
  sky: { dot: 'bg-sky-500', badge: 'bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300', soft: 'bg-sky-50 dark:bg-sky-500/10' },
  emerald: { dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300', soft: 'bg-emerald-50 dark:bg-emerald-500/10' },
  amber: { dot: 'bg-amber-500', badge: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300', soft: 'bg-amber-50 dark:bg-amber-500/10' },
  rose: { dot: 'bg-rose-500', badge: 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300', soft: 'bg-rose-50 dark:bg-rose-500/10' },
  teal: { dot: 'bg-teal-500', badge: 'bg-teal-50 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300', soft: 'bg-teal-50 dark:bg-teal-500/10' },
  indigo: { dot: 'bg-indigo-500', badge: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300', soft: 'bg-indigo-50 dark:bg-indigo-500/10' },
}

export const PROJECT_COLORS = ['teal', 'violet', 'sky', 'amber', 'rose', 'emerald', 'indigo', 'slate']

export const STATUS_META = {
  planned: { label: '计划中', cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300', dot: 'bg-slate-400' },
  running: { label: '进行中', cls: 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300', dot: 'bg-blue-500' },
  done: { label: '已完成', cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300', dot: 'bg-emerald-500' },
  archived: { label: '已归档', cls: 'bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400', dot: 'bg-stone-400' },
} as const
