import Dexie, { type EntityTable } from 'dexie'
import type {
  AuditEntry,
  Block,
  Experiment,
  Project,
  Reagent,
  Schedule,
  Snapshot,
  StoredFile,
  Template,
} from './types'

export class ElnDB extends Dexie {
  projects!: EntityTable<Project, 'id'>
  experiments!: EntityTable<Experiment, 'id'>
  blocks!: EntityTable<Block, 'id'>
  reagents!: EntityTable<Reagent, 'id'>
  schedules!: EntityTable<Schedule, 'id'>
  templates!: EntityTable<Template, 'id'>
  snapshots!: EntityTable<Snapshot, 'id'>
  files!: EntityTable<StoredFile, 'id'>
  audit!: EntityTable<AuditEntry, 'id'>

  constructor(name = 'expermit-eln') {
    super(name)
    this.version(1).stores({
      projects: 'id, name, createdAt',
      experiments: 'id, code, projectId, status, kind, updatedAt, plannedDate, *tags',
      blocks: 'id, experimentId, [experimentId+position], type, updatedAt',
      reagents: 'id, name, category, expiry, updatedAt',
      usages: 'id, reagentId, experimentId, blockId, createdAt',
      schedules: 'id, date, experimentId',
      templates: 'id, name, kind',
      snapshots: 'id, experimentId, createdAt',
      files: 'id, createdAt',
      audit: 'id, experimentId, at',
    })
    // v2：去掉 usages 表（试剂不再自动扣库存），升级时 Dexie 自动删除旧表
    this.version(2).stores({
      projects: 'id, name, createdAt',
      experiments: 'id, code, projectId, status, kind, updatedAt, plannedDate, *tags',
      blocks: 'id, experimentId, [experimentId+position], type, updatedAt',
      reagents: 'id, name, category, expiry, updatedAt',
      schedules: 'id, date, experimentId',
      templates: 'id, name, kind',
      snapshots: 'id, experimentId, createdAt',
      files: 'id, createdAt',
      audit: 'id, experimentId, at',
    })
  }
}

export const db = new ElnDB()

export const TABLES = [
  'projects',
  'experiments',
  'blocks',
  'reagents',
  'schedules',
  'templates',
  'snapshots',
  'files',
  'audit',
] as const

export type TableName = (typeof TABLES)[number]
