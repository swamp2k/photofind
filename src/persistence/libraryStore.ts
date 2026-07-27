import Database from 'better-sqlite3'
import type { Database as DatabaseConnection } from 'better-sqlite3'
import type { ScanResult } from '../shared/types'
import { runMigrations } from './migrations'

export class LibraryStore {
  private readonly db: DatabaseConnection

  constructor(dbPath: string) {
    this.db = new Database(dbPath)
    try {
      this.db.pragma('journal_mode = WAL')
      this.db.pragma('foreign_keys = ON')
      runMigrations(this.db)
    } catch (error) {
      this.db.close()
      throw error
    }
  }

  close(): void {
    if (this.db.open) this.db.close()
  }

  upsertScan(sourceRoot: string, result: ScanResult): void {
    const thumbnailByPath = new Map(result.thumbnails.items.map((item) => [item.mediaPath, item]))
    const upsert = this.db.prepare(`
      INSERT INTO media_items (
        path,
        source_root,
        name,
        kind,
        size_bytes,
        sidecar_path,
        match_confidence,
        match_reason,
        thumbnail_path,
        thumbnail_url,
        thumbnail_status,
        updated_at
      )
      VALUES (
        @path,
        @sourceRoot,
        @name,
        @kind,
        @sizeBytes,
        @sidecarPath,
        @matchConfidence,
        @matchReason,
        @thumbnailPath,
        @thumbnailUrl,
        @thumbnailStatus,
        @updatedAt
      )
      ON CONFLICT(path) DO UPDATE SET
        source_root = excluded.source_root,
        name = excluded.name,
        kind = excluded.kind,
        size_bytes = excluded.size_bytes,
        sidecar_path = excluded.sidecar_path,
        match_confidence = excluded.match_confidence,
        match_reason = excluded.match_reason,
        thumbnail_path = excluded.thumbnail_path,
        thumbnail_url = excluded.thumbnail_url,
        thumbnail_status = excluded.thumbnail_status,
        updated_at = excluded.updated_at
    `)
    const updatedAt = Date.now()
    const write = this.db.transaction(() => {
      for (const match of result.matches) {
        const thumbnail = thumbnailByPath.get(match.media.path)
        upsert.run({
          path: match.media.path,
          sourceRoot,
          name: match.media.name,
          kind: match.media.kind,
          sizeBytes: match.media.sizeBytes,
          sidecarPath: match.sidecar?.path ?? null,
          matchConfidence: match.confidence,
          matchReason: match.reason,
          thumbnailPath: thumbnail?.thumbnailPath ?? null,
          thumbnailUrl: null,
          thumbnailStatus: thumbnail?.status ?? null,
          updatedAt
        })
      }
    })

    write()
  }

  listKeepers(mediaPaths: string[]): string[] {
    if (mediaPaths.length === 0) return []

    const placeholders = mediaPaths.map(() => '?').join(', ')
    const rows = this.db.prepare(`SELECT media_path FROM keepers WHERE media_path IN (${placeholders}) ORDER BY kept_at`).all(...mediaPaths)
    return rows.map((row) => (row as { media_path: string }).media_path)
  }

  setKeeper(mediaPath: string, kept: boolean): void {
    if (kept) {
      this.db
        .prepare(
          `
          INSERT INTO keepers (media_path, kept_at)
          VALUES (?, ?)
          ON CONFLICT(media_path) DO UPDATE SET kept_at = excluded.kept_at
        `
        )
        .run(mediaPath, Date.now())
      return
    }

    this.db.prepare('DELETE FROM keepers WHERE media_path = ?').run(mediaPath)
  }
}
