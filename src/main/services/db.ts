import { join } from 'node:path'
import { app } from 'electron'
import Database from 'better-sqlite3'

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (db) return db
  const dbPath = join(app.getPath('userData'), 'photofind.db')
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS library_items (
      path TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      kind TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      confidence TEXT NOT NULL,
      sidecar_path TEXT,
      thumbnail_path TEXT,
      status TEXT NOT NULL DEFAULT 'unset'
    )
  `)
  return db
}
