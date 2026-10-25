export type ID = string

export type ExperimentStatus = 'planned' | 'running' | 'done' | 'archived'

export interface Project {
  id: ID
  name: string
  color: string
  createdAt: number
  updatedAt: number
  deletedAt?: number | null
}

export interface Experiment {
  id: ID
  code: string
  title: string
  kind: string
  projectId: ID | null
  status: ExperimentStatus
  tags: string[]
  plannedDate: string | null
  createdAt: number
  updatedAt: number
  closedAt: number | null
  firstClosedAt: number | null
  editsAfterClose: number
  sourceId?: ID | null
  deletedAt?: number | null
}

export interface Block<T = unknown> {
  id: ID
  experimentId: ID
  type: string
  position: number
  data: T
  createdAt: number
  updatedAt: number
  deletedAt?: number | null
}

export interface Reagent {
  id: ID
  name: string
  category: string
  spec: string
  vendor: string
  catalogNo: string
  lot: string
  expiry: string | null
  storage: string
  location: string
  stockQty: number | null
  stockUnit: string
  lowStock: number | null
  note: string
  createdAt: number
  updatedAt: number
  deletedAt?: number | null
}

export interface Usage {
  id: ID
  reagentId: ID
  experimentId: ID
  blockId: ID
  itemId: string
  amount: number
  unit: string
  deducted: number
  createdAt: number
}

export interface Schedule {
  id: ID
  date: string
  time: string
  title: string
  note: string
  done: boolean
  experimentId: ID | null
  createdAt: number
  updatedAt: number
  deletedAt?: number | null
}

export interface TemplateBlock {
  type: string
  data: unknown
}

export interface Template {
  id: ID
  name: string
  kind: string
  description: string
  blocks: TemplateBlock[]
  builtin?: boolean
  createdAt: number
  updatedAt?: number
  deletedAt?: number | null
}

export interface Snapshot {
  id: ID
  experimentId: ID
  createdAt: number
  reason: string
  hash: string
  blockCount: number
  payload: { experiment: Experiment; blocks: Block[] }
}

export interface StoredFile {
  id: ID
  name: string
  mime: string
  size: number
  blob: Blob
  createdAt: number
}

export interface AuditEntry {
  id: ID
  experimentId: ID
  action: string
  detail: string
  at: number
}
