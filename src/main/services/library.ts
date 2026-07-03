import { copyFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { ExportResult, KeeperStatus, LibraryItem, LogEntry, SidecarMatch } from '../../shared/types'
import { getDb } from './db'
import { generateThumbnail } from './thumbnails'

interface LibraryRow {
  path: string
  name: string
  kind: LibraryItem['kind']
  size_bytes: number
  confidence: LibraryItem['confidence']
  sidecar_path: string | null
  thumbnail_path: string | null
  status: KeeperStatus
}

function rowToItem(row: LibraryRow): LibraryItem {
  return {
    path: row.path,
    name: row.name,
    kind: row.kind,
    sizeBytes: row.size_bytes,
    confidence: row.confidence,
    sidecarPath: row.sidecar_path,
    thumbnailPath: row.thumbnail_path,
    status: row.status
  }
}

/** Persists scan matches into the library and generates thumbnails for images (best-effort). */
export async function buildLibrary(matches: SidecarMatch[]): Promise<LibraryItem[]> {
  const db = getDb()
  const insert = db.prepare(`
    INSERT INTO library_items (path, name, kind, size_bytes, confidence, sidecar_path, status)
    VALUES (@path, @name, @kind, @sizeBytes, @confidence, @sidecarPath, 'unset')
    ON CONFLICT(path) DO UPDATE SET confidence = excluded.confidence, sidecar_path = excluded.sidecar_path
  `)

  for (const match of matches) {
    insert.run({
      path: match.media.path,
      name: match.media.name,
      kind: match.media.kind,
      sizeBytes: match.media.sizeBytes,
      confidence: match.confidence,
      sidecarPath: match.sidecar?.path ?? null
    })
  }

  const updateThumb = db.prepare(`UPDATE library_items SET thumbnail_path = ? WHERE path = ?`)
  for (const match of matches) {
    if (match.media.kind !== 'image') continue
    try {
      const thumbPath = await generateThumbnail(match.media.path)
      updateThumb.run(thumbPath, match.media.path)
    } catch {
      // Thumbnail generation is best-effort for the prototype; the item still
      // shows in the grid (without a preview) rather than failing the build.
    }
  }

  return listLibrary()
}

export function listLibrary(): LibraryItem[] {
  const rows = getDb().prepare(`SELECT * FROM library_items ORDER BY name`).all() as LibraryRow[]
  return rows.map(rowToItem)
}

export function setStatus(path: string, status: KeeperStatus): void {
  getDb().prepare(`UPDATE library_items SET status = ? WHERE path = ?`).run(status, path)
}

export async function exportKeepers(destDir: string): Promise<ExportResult> {
  const items = (getDb().prepare(`SELECT * FROM library_items WHERE status = 'keep'`).all() as LibraryRow[]).map(rowToItem)
  await mkdir(destDir, { recursive: true })

  const log: LogEntry[] = []
  let exported = 0
  let failed = 0

  for (const item of items) {
    try {
      await copyFile(item.path, join(destDir, item.name))
      exported++
    } catch (err) {
      failed++
      log.push({ level: 'ERROR', message: `Failed exporting ${item.name}: ${(err as Error).message}`, timestamp: Date.now() })
    }
  }
  log.push({ level: 'INFO', message: `Exported ${exported}/${items.length} keepers to ${destDir}`, timestamp: Date.now() })

  return { attempted: items.length, exported, failed, log }
}
