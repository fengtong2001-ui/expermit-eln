// 孔板几何沿用 ExPermit 已与实物核对过的结论：全部横放（ANSI/SBS 约 127.8×85.5 mm 底板），
// 六孔板实物无字母行标，按 1–6 顺序编号（上排 1-3，下排 4-6）。
export interface PlateDef {
  id: string
  label: string
  rows: number
  cols: number
  seq?: boolean
}

export const PLATES: PlateDef[] = [
  { id: 'p6', label: '6 孔板', rows: 2, cols: 3, seq: true },
  { id: 'p12', label: '12 孔板', rows: 3, cols: 4 },
  { id: 'p24', label: '24 孔板', rows: 4, cols: 6 },
  { id: 'p48', label: '48 孔板', rows: 6, cols: 8 },
  { id: 'p96', label: '96 孔板', rows: 8, cols: 12 },
]

export const plateOf = (id: string) => PLATES.find((p) => p.id === id) ?? PLATES[4]

export function wellId(p: PlateDef, r: number, c: number) {
  return p.seq ? String(r * p.cols + c + 1) : `${String.fromCharCode(65 + r)}${c + 1}`
}

export function wellPos(p: PlateDef, id: string): { r: number; c: number } | null {
  if (p.seq) {
    const n = Number(id) - 1
    if (!Number.isInteger(n) || n < 0 || n >= p.rows * p.cols) return null
    return { r: Math.floor(n / p.cols), c: n % p.cols }
  }
  const m = /^([A-Z])(\d+)$/.exec(id)
  if (!m) return null
  const r = m[1].charCodeAt(0) - 65
  const c = Number(m[2]) - 1
  if (r < 0 || r >= p.rows || c < 0 || c >= p.cols) return null
  return { r, c }
}

export function wellLabel(p: PlateDef, id: string) {
  return p.seq ? `${id} 号孔` : `${id} 孔`
}

export function allWells(p: PlateDef) {
  const ids: string[] = []
  for (let r = 0; r < p.rows; r++) for (let c = 0; c < p.cols; c++) ids.push(wellId(p, r, c))
  return ids
}

/** 矩形选区内的孔（含两端） */
export function wellsInRect(p: PlateDef, a: string, b: string) {
  const pa = wellPos(p, a)
  const pb = wellPos(p, b)
  if (!pa || !pb) return []
  const out: string[] = []
  for (let r = Math.min(pa.r, pb.r); r <= Math.max(pa.r, pb.r); r++)
    for (let c = Math.min(pa.c, pb.c); c <= Math.max(pa.c, pb.c); c++) out.push(wellId(p, r, c))
  return out
}

/** 分组色板：用于孔板上按分组上色 */
export const GROUP_COLORS = [
  { id: 'teal', fill: '#14b8a6', soft: '#ccfbf1' },
  { id: 'violet', fill: '#8b5cf6', soft: '#ede9fe' },
  { id: 'amber', fill: '#f59e0b', soft: '#fef3c7' },
  { id: 'rose', fill: '#f43f5e', soft: '#ffe4e6' },
  { id: 'sky', fill: '#0ea5e9', soft: '#e0f2fe' },
  { id: 'lime', fill: '#84cc16', soft: '#ecfccb' },
  { id: 'orange', fill: '#f97316', soft: '#ffedd5' },
  { id: 'slate', fill: '#64748b', soft: '#e2e8f0' },
]
