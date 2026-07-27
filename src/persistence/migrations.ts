import type { Database as DatabaseConnection } from 'better-sqlite3'

export interface Migration {
  version: number
  name: string
  up: (db: DatabaseConnection) => void
  validate?: (db: DatabaseConnection) => void
}

interface MigrationRecord {
  version: number
  name: string
}

interface TableColumn {
  name: string
  notnull: 0 | 1
  pk: number
}

const MEDIA_ITEM_COLUMNS = [
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
] as const

const KEEPER_COLUMNS = ['media_path', 'kept_at'] as const

export const migrations: readonly Migration[] = [
  {
    version: 1,
    name: 'baseline-media-and-keepers',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS media_items (
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

        CREATE TABLE IF NOT EXISTS keepers (
          media_path TEXT PRIMARY KEY,
          kept_at INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_media_items_source_root ON media_items(source_root);
        CREATE INDEX IF NOT EXISTS idx_keepers_kept_at ON keepers(kept_at);
      `)
    },
    validate: validateBaselineSchema
  }
]

export function runMigrations(
  db: DatabaseConnection,
  definitions: readonly Migration[] = migrations
): void {
  const ordered = validateDefinitions(definitions)

  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    )
  `)

  const applied = db
    .prepare('SELECT version, name FROM schema_migrations ORDER BY version')
    .all() as MigrationRecord[]

  for (const [index, record] of applied.entries()) {
    const definition = ordered[index]
    if (
      !definition ||
      definition.version !== record.version ||
      definition.name !== record.name
    ) {
      throw new Error(
        `Migration ledger is not a valid applied prefix at ${record.version} (${record.name})`
      )
    }

    try {
      definition.validate?.(db)
    } catch (error) {
      throw migrationError(definition, error, 'validation')
    }
  }

  const appliedVersions = new Set(applied.map((record) => record.version))
  for (const migration of ordered) {
    if (appliedVersions.has(migration.version)) continue

    const apply = db.transaction(() => {
      migration.up(db)
      migration.validate?.(db)
      db.prepare(
        'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)'
      ).run(migration.version, migration.name, Date.now())
    })

    try {
      apply()
    } catch (error) {
      throw migrationError(migration, error, 'application')
    }
  }
}

function validateDefinitions(definitions: readonly Migration[]): Migration[] {
  const ordered = [...definitions].sort((left, right) => left.version - right.version)
  const seen = new Set<number>()

  for (const migration of ordered) {
    if (!Number.isInteger(migration.version) || migration.version < 1) {
      throw new Error(`Invalid migration version: ${migration.version}`)
    }
    if (!migration.name.trim()) {
      throw new Error(`Migration ${migration.version} has an empty name`)
    }
    if (seen.has(migration.version)) {
      throw new Error(`Duplicate migration version: ${migration.version}`)
    }
    seen.add(migration.version)
  }

  return ordered
}

function validateBaselineSchema(db: DatabaseConnection): void {
  validateTable(db, 'media_items', MEDIA_ITEM_COLUMNS, 'path')
  validateTable(db, 'keepers', KEEPER_COLUMNS, 'media_path')
  validateIndex(db, 'media_items', 'idx_media_items_source_root')
  validateIndex(db, 'keepers', 'idx_keepers_kept_at')
}

function validateTable(
  db: DatabaseConnection,
  table: string,
  requiredColumns: readonly string[],
  primaryKey: string
): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as TableColumn[]
  if (columns.length === 0) {
    throw new Error(`${table} table is missing`)
  }

  const names = new Set(columns.map((column) => column.name))
  for (const required of requiredColumns) {
    if (!names.has(required)) {
      throw new Error(`${table} is missing required column: ${required}`)
    }
  }

  if (!columns.some((column) => column.name === primaryKey && column.pk === 1)) {
    throw new Error(`${table}.${primaryKey} is not the primary key`)
  }
}

function validateIndex(db: DatabaseConnection, table: string, index: string): void {
  const indexes = db.prepare(`PRAGMA index_list(${table})`).all() as Array<{ name: string }>
  if (!indexes.some((candidate) => candidate.name === index)) {
    throw new Error(`${table} is missing required index: ${index}`)
  }
}

function migrationError(
  migration: Migration,
  error: unknown,
  phase: 'application' | 'validation'
): Error {
  const message = error instanceof Error ? error.message : String(error)
  return new Error(
    `Migration ${migration.version} (${migration.name}) ${phase} failed: ${message}`,
    { cause: error }
  )
}
