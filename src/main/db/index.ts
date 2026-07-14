import path from 'node:path'
import { app } from 'electron'
import Database from 'better-sqlite3'
import { runMigrations } from './migrate'
import type { DbStatus } from '../../preload'

let db: Database.Database | null = null

export function connectDatabase(): Database.Database {
  if (db) return db

  const dbPath = path.join(app.getPath('userData'), 'nucleo.db')
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  const migrationsDir = path.join(app.getAppPath(), 'migrations')
  runMigrations(db, migrationsDir)

  return db
}

export function getStatus(): DbStatus {
  if (!db) {
    return { connected: false, tableCount: 0, tables: [] }
  }

  const rows = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != 'schema_migrations' ORDER BY name"
    )
    .all() as { name: string }[]

  return {
    connected: true,
    tableCount: rows.length,
    tables: rows.map((row) => row.name)
  }
}
