// 只换算同一量纲的常见实验室单位；跨量纲（如 mL ↔ mg）一律不换算。
const GROUPS: Record<string, Record<string, number>> = {
  volume: { L: 1e6, mL: 1e3, µL: 1, uL: 1, nL: 1e-3 },
  mass: { kg: 1e9, g: 1e6, mg: 1e3, µg: 1, ug: 1, ng: 1e-3 },
}

export const COMMON_UNITS = ['µL', 'mL', 'L', 'mg', 'g', 'µg', 'ng', '瓶', '盒', '支', '管', '片', '个']

function find(unit: string) {
  const u = unit.trim()
  for (const [group, table] of Object.entries(GROUPS)) {
    if (u in table) return { group, factor: table[u] }
  }
  return null
}

/** 把 amount（单位 from）换算到单位 to；不可换算返回 null */
export function convert(amount: number, from: string, to: string): number | null {
  if (from.trim() === to.trim()) return amount
  const a = find(from)
  const b = find(to)
  if (!a || !b || a.group !== b.group) return null
  return (amount * a.factor) / b.factor
}

export function formatQty(n: number) {
  if (!Number.isFinite(n)) return '—'
  const r = Math.round(n * 1000) / 1000
  return String(r)
}
