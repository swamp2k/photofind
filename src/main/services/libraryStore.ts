import { randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'
import type { Database as DatabaseConnection } from 'better-sqlite3'
import type { CurateScanResult, FaceDetection, NewSpecialDate, ScanResult, SpecialDate, Verdict } from '../../shared/types'

export interface StoredFace extends FaceDetection {
  embedding: Float32Array
}

/**
 * Sidecar-match columns are NOT NULL from the original schema; curate scans
 * don't look for Takeout sidecars, so they write these sentinels instead.
 */
const NO_SIDECAR_CONFIDENCE = 'missing'
const NO_SIDECAR_REASON = 'not scanned for sidecars'

export class LibraryStore {
  private readonly db: DatabaseConnection

  constructor(dbPath: string) {
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')
    this.initialize()
    this.migrate()
  }

  close(): void {
    this.db.close()
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
          thumbnailUrl: thumbnail?.thumbnailUrl ?? null,
          thumbnailStatus: thumbnail?.status ?? null,
          updatedAt
        })
      }
    })

    write()
  }

  upsertCurateScan(sourceRoot: string, result: CurateScanResult): void {
    const thumbnailByPath = new Map(result.thumbnails.items.map((item) => [item.mediaPath, item]))
    const upsert = this.db.prepare(`
      INSERT INTO media_items (
        path,
        source_root,
        name,
        kind,
        size_bytes,
        match_confidence,
        match_reason,
        thumbnail_path,
        thumbnail_url,
        thumbnail_status,
        capture_time_ms,
        capture_time_source,
        camera_model,
        width,
        height,
        gps_lat,
        gps_lon,
        sharpness,
        exposure_mean,
        clipped_shadows,
        clipped_highlights,
        quality_status,
        burst_id,
        burst_is_pick,
        suggested_verdict,
        verdict_reasons,
        updated_at
      )
      VALUES (
        @path,
        @sourceRoot,
        @name,
        @kind,
        @sizeBytes,
        @matchConfidence,
        @matchReason,
        @thumbnailPath,
        @thumbnailUrl,
        @thumbnailStatus,
        @captureTimeMs,
        @captureTimeSource,
        @cameraModel,
        @width,
        @height,
        @gpsLat,
        @gpsLon,
        @sharpness,
        @exposureMean,
        @clippedShadows,
        @clippedHighlights,
        @qualityStatus,
        @burstId,
        @burstIsPick,
        @suggestedVerdict,
        @verdictReasons,
        @updatedAt
      )
      ON CONFLICT(path) DO UPDATE SET
        source_root = excluded.source_root,
        name = excluded.name,
        kind = excluded.kind,
        size_bytes = excluded.size_bytes,
        thumbnail_path = excluded.thumbnail_path,
        thumbnail_url = excluded.thumbnail_url,
        thumbnail_status = excluded.thumbnail_status,
        capture_time_ms = excluded.capture_time_ms,
        capture_time_source = excluded.capture_time_source,
        camera_model = excluded.camera_model,
        width = excluded.width,
        height = excluded.height,
        gps_lat = excluded.gps_lat,
        gps_lon = excluded.gps_lon,
        sharpness = excluded.sharpness,
        exposure_mean = excluded.exposure_mean,
        clipped_shadows = excluded.clipped_shadows,
        clipped_highlights = excluded.clipped_highlights,
        quality_status = excluded.quality_status,
        burst_id = excluded.burst_id,
        burst_is_pick = excluded.burst_is_pick,
        suggested_verdict = excluded.suggested_verdict,
        verdict_reasons = excluded.verdict_reasons,
        updated_at = excluded.updated_at
    `)
    const updatedAt = Date.now()
    const write = this.db.transaction(() => {
      for (const photo of result.photos) {
        const thumbnail = thumbnailByPath.get(photo.media.path)
        upsert.run({
          path: photo.media.path,
          sourceRoot,
          name: photo.media.name,
          kind: photo.media.kind,
          sizeBytes: photo.media.sizeBytes,
          matchConfidence: NO_SIDECAR_CONFIDENCE,
          matchReason: NO_SIDECAR_REASON,
          thumbnailPath: thumbnail?.thumbnailPath ?? null,
          thumbnailUrl: thumbnail?.thumbnailUrl ?? null,
          thumbnailStatus: thumbnail?.status ?? null,
          captureTimeMs: photo.capture.captureTimeMs,
          captureTimeSource: photo.capture.source,
          cameraModel: photo.capture.cameraModel,
          width: photo.capture.width,
          height: photo.capture.height,
          gpsLat: photo.capture.gps?.lat ?? null,
          gpsLon: photo.capture.gps?.lon ?? null,
          sharpness: photo.quality.sharpness,
          exposureMean: photo.quality.exposureMean,
          clippedShadows: photo.quality.clippedShadowsPct,
          clippedHighlights: photo.quality.clippedHighlightsPct,
          qualityStatus: photo.quality.status,
          burstId: photo.burstId,
          burstIsPick: photo.isBurstPick ? 1 : 0,
          suggestedVerdict: photo.suggestedVerdict,
          verdictReasons: JSON.stringify(photo.reasons),
          updatedAt
        })
      }
    })

    write()
  }

  /** Replaces all stored faces for a photo; embeddings stay main-process-only. */
  replaceFaces(mediaPath: string, faces: StoredFace[]): void {
    const remove = this.db.prepare('DELETE FROM faces WHERE media_path = ?')
    const insert = this.db.prepare(`
      INSERT INTO faces (media_path, box_x, box_y, box_w, box_h, score, embedding)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    const write = this.db.transaction(() => {
      remove.run(mediaPath)
      for (const face of faces) {
        insert.run(
          mediaPath,
          face.box.x,
          face.box.y,
          face.box.width,
          face.box.height,
          face.score,
          Buffer.from(face.embedding.buffer, face.embedding.byteOffset, face.embedding.byteLength)
        )
      }
    })
    write()
  }

  listFaces(mediaPath: string): StoredFace[] {
    const rows = this.db
      .prepare('SELECT box_x, box_y, box_w, box_h, score, embedding FROM faces WHERE media_path = ? ORDER BY rowid')
      .all(mediaPath) as { box_x: number; box_y: number; box_w: number; box_h: number; score: number; embedding: Buffer }[]
    return rows.map((row) => ({
      box: { x: row.box_x, y: row.box_y, width: row.box_w, height: row.box_h },
      score: row.score,
      // Copy: the Buffer's underlying ArrayBuffer may be pooled/offset.
      embedding: new Float32Array(new Uint8Array(row.embedding).buffer)
    }))
  }

  listSpecialDates(): SpecialDate[] {
    const rows = this.db
      .prepare('SELECT id, label, kind, month, day, start_ms, end_ms FROM special_dates ORDER BY created_at')
      .all() as { id: string; label: string; kind: string; month: number | null; day: number | null; start_ms: number | null; end_ms: number | null }[]
    return rows.map((row) =>
      row.kind === 'recurring-yearly'
        ? { id: row.id, label: row.label, kind: 'recurring-yearly', month: row.month!, day: row.day! }
        : { id: row.id, label: row.label, kind: 'range', startMs: row.start_ms!, endMs: row.end_ms! }
    )
  }

  addSpecialDate(date: NewSpecialDate): SpecialDate {
    const id = randomUUID()
    const full: SpecialDate = { ...date, id }
    this.db
      .prepare(
        `
        INSERT INTO special_dates (id, label, kind, month, day, start_ms, end_ms, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `
      )
      .run(
        id,
        full.label,
        full.kind,
        full.kind === 'recurring-yearly' ? full.month : null,
        full.kind === 'recurring-yearly' ? full.day : null,
        full.kind === 'range' ? full.startMs : null,
        full.kind === 'range' ? full.endMs : null,
        Date.now()
      )
    return full
  }

  removeSpecialDate(id: string): void {
    this.db.prepare('DELETE FROM special_dates WHERE id = ?').run(id)
  }

  setUserVerdict(mediaPath: string, verdict: Verdict | null): void {
    if (verdict === null) {
      this.db.prepare('UPDATE media_items SET user_verdict = NULL WHERE path = ?').run(mediaPath)
      return
    }
    this.db.prepare('UPDATE media_items SET user_verdict = ? WHERE path = ?').run(verdict, mediaPath)
  }

  listUserVerdicts(mediaPaths: string[]): Map<string, Verdict> {
    const verdicts = new Map<string, Verdict>()
    if (mediaPaths.length === 0) return verdicts

    const select = this.db.prepare(
      'SELECT path, user_verdict FROM media_items WHERE path = ? AND user_verdict IS NOT NULL'
    )
    for (const mediaPath of mediaPaths) {
      const row = select.get(mediaPath) as { path: string; user_verdict: Verdict } | undefined
      if (row) verdicts.set(row.path, row.user_verdict)
    }
    return verdicts
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

  private initialize(): void {
    this.db.exec(`
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
  }

  /**
   * Ordered migrations keyed on PRAGMA user_version. Existing databases created
   * before migrations were introduced report version 0, same as fresh ones, so
   * step 1 must be additive-only (ALTER TABLE, no data rewrite).
   */
  private migrate(): void {
    const migrations: string[] = [
      // v1: curation columns — capture metadata, quality scores, bursts, verdicts.
      `
      ALTER TABLE media_items ADD COLUMN capture_time_ms INTEGER;
      ALTER TABLE media_items ADD COLUMN capture_time_source TEXT;
      ALTER TABLE media_items ADD COLUMN camera_model TEXT;
      ALTER TABLE media_items ADD COLUMN width INTEGER;
      ALTER TABLE media_items ADD COLUMN height INTEGER;
      ALTER TABLE media_items ADD COLUMN sharpness REAL;
      ALTER TABLE media_items ADD COLUMN exposure_mean REAL;
      ALTER TABLE media_items ADD COLUMN clipped_shadows REAL;
      ALTER TABLE media_items ADD COLUMN clipped_highlights REAL;
      ALTER TABLE media_items ADD COLUMN quality_status TEXT;
      ALTER TABLE media_items ADD COLUMN burst_id TEXT;
      ALTER TABLE media_items ADD COLUMN burst_is_pick INTEGER;
      ALTER TABLE media_items ADD COLUMN suggested_verdict TEXT;
      ALTER TABLE media_items ADD COLUMN verdict_reasons TEXT;
      ALTER TABLE media_items ADD COLUMN user_verdict TEXT;
      CREATE INDEX IF NOT EXISTS idx_media_items_capture_time ON media_items(source_root, capture_time_ms);
      `,
      // v2: GPS + face summary columns, face embeddings, special dates.
      `
      ALTER TABLE media_items ADD COLUMN gps_lat REAL;
      ALTER TABLE media_items ADD COLUMN gps_lon REAL;
      ALTER TABLE media_items ADD COLUMN face_count INTEGER;
      ALTER TABLE media_items ADD COLUMN face_status TEXT;
      ALTER TABLE media_items ADD COLUMN largest_face_fraction REAL;
      CREATE TABLE IF NOT EXISTS faces (
        id INTEGER PRIMARY KEY,
        media_path TEXT NOT NULL REFERENCES media_items(path) ON DELETE CASCADE,
        box_x REAL NOT NULL,
        box_y REAL NOT NULL,
        box_w REAL NOT NULL,
        box_h REAL NOT NULL,
        score REAL NOT NULL,
        embedding BLOB NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_faces_media_path ON faces(media_path);
      CREATE TABLE IF NOT EXISTS special_dates (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        kind TEXT NOT NULL,
        month INTEGER,
        day INTEGER,
        start_ms INTEGER,
        end_ms INTEGER,
        created_at INTEGER NOT NULL
      );
      `
    ]

    const current = this.db.pragma('user_version', { simple: true }) as number
    for (let version = current; version < migrations.length; version++) {
      const apply = this.db.transaction(() => {
        this.db.exec(migrations[version])
        this.db.pragma(`user_version = ${version + 1}`)
      })
      apply()
    }
  }
}
