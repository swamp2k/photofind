import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import type { Migration } from './migrations'
import { migrations, runMigrations } from './migrations'

const EXPECTED_MEDIA_COLUMNS = [
  'path',
  'source_root',
  'name',
  'kind',
  'size_bytes',
  'sidecar_path',
  'match_confidence',
  'match_reason',
  'thumbnail_path',
  'thumbnail_url',
  'thumbnail_status',
  'updated_at'
]

describe('runMigrations', () => {
  it('creates the full baseline schema and records it for a fresh database', () => {
    const db = new Database(':memory:')
    try {
      runMigrations(db)

      expect(tableNames(db)).toEqual(
        expect.arrayContaining(['keepers', 'media_items', 'schema_migrations'])
      )
      expect(columnNames(db, 'media_items')).toEqual(EXPECTED_MEDIA_COLUMNS)
      expect(columnNames(db, 'keepers')).toEqual(['media_path', 'kept_at'])
      expect(indexNames(db, 'media_items')).toContain('idx_media_items_source_root')
      expect(indexNames(db, 'keepers')).toContain('idx_keepers_kept_at')
      expect(db.prepare('SELECT version, name FROM schema_migrations').all()).toEqual([
        { version: 1, name: 'baseline-media-and-keepers' }
      ])
    } finally {
      db.close()
    }
  })

  it('does not reapply an already recorded migration', () => {
    const db = new Database(':memory:')
    let applications = 0
    const migration: Migration = {
      version: 1,
      name: 'counted',
      up: () => {
        applications++
      }
    }

    try {
      runMigrations(db, [migration])
      runMigrations(db, [migration])

      expect(applications).toBe(1)
      expect(db.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get()).toEqual({
        count: 1
      })
    } finally {
      db.close()
    }
  })

  it('adopts a prototype database without deleting media or keeper rows', () => {
    const db = new Database(':memory:')
    try {
      createPrototypeSchema(db)
      db.prepare(`
        INSERT INTO media_items (
          path, source_root, name, kind, size_bytes, sidecar_path,
          match_confidence, match_reason, thumbnail_path, thumbnail_url,
          thumbnail_status, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'C:\\photos\\family.jpg',
        'C:\\photos',
        'family.jpg',
        'image',
        123,
        null,
        'missing',
        'no matching JSON sidecar found',
        'C:\\cache\\family.webp',
        'photofind-thumb://thumbnail/legacy',
        'ready',
        1000
      )
      db.prepare('INSERT INTO keepers (media_path, kept_at) VALUES (?, ?)').run(
        'C:\\photos\\family.jpg',
        1001
      )

      runMigrations(db)

      expect(db.prepare('SELECT path, thumbnail_url FROM media_items').all()).toEqual([
        {
          path: 'C:\\photos\\family.jpg',
          thumbnail_url: 'photofind-thumb://thumbnail/legacy'
        }
      ])
      expect(db.prepare('SELECT media_path FROM keepers').all()).toEqual([
        { media_path: 'C:\\photos\\family.jpg' }
      ])
      expect(db.prepare('SELECT version FROM schema_migrations').all()).toEqual([{ version: 1 }])
    } finally {
      db.close()
    }
  })

  it('rolls back a failed migration without advancing its ledger record', () => {
    const db = new Database(':memory:')
    const failingMigration: Migration = {
      version: 2,
      name: 'deliberate-failure',
      up: (connection) => {
        connection.exec(`
          CREATE TABLE migration_partial (value TEXT);
          INSERT INTO migration_partial (value) VALUES ('must roll back');
        `)
        throw new Error('deliberate test failure')
      }
    }

    try {
      runMigrations(db, migrations)

      expect(() => runMigrations(db, [...migrations, failingMigration])).toThrow(
        'Migration 2 (deliberate-failure) application failed'
      )
      expect(tableNames(db)).not.toContain('migration_partial')
      expect(db.prepare('SELECT version FROM schema_migrations ORDER BY version').all()).toEqual([
        { version: 1 }
      ])
    } finally {
      db.close()
    }
  })

  it('rejects an applied ledger whose schema is no longer valid', () => {
    const db = new Database(':memory:')
    try {
      db.exec(`
        CREATE TABLE schema_migrations (
          version INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          applied_at INTEGER NOT NULL
        );
        INSERT INTO schema_migrations (version, name, applied_at)
        VALUES (1, 'baseline-media-and-keepers', 1);
      `)

      expect(() => runMigrations(db)).toThrow(
        'Migration 1 (baseline-media-and-keepers) validation failed'
      )
    } finally {
      db.close()
    }
  })
})

function createPrototypeSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE media_items (
      path TEXT PRIMARY KEY,
      source_root TEXT NOT NULL,
      name TEXT NOT NULL,
      kind TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      sidecar_path TEXT,
      match_confidence TEXT NOT NULL,
      match_reason TEXT NOT NULL,
      thumbnail_path TEXT,
      thumbnail_url TEXT,
      thumbnail_status TEXT,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE keepers (
      media_path TEXT PRIMARY KEY,
      kept_at INTEGER NOT NULL
    );
  `)
}

function tableNames(db: Database.Database): string[] {
  return (
    db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all() as Array<{ name: string }>
  ).map((row) => row.name)
}

function columnNames(db: Database.Database, table: string): string[] {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map(
    (row) => row.name
  )
}

function indexNames(db: Database.Database, table: string): string[] {
  return (db.prepare(`PRAGMA index_list(${table})`).all() as Array<{ name: string }>).map(
    (row) => row.name
  )
}
