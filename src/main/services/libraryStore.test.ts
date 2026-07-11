import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { createTakeoutFixture } from '../test/takeoutFixture'
import { LibraryStore } from './libraryStore'
import { runScan } from './scanOrchestrator'

describe('LibraryStore', () => {
  it('persists keeper marks across scan upserts', async () => {
    const dbDir = await mkdtemp(join(tmpdir(), 'photofind-library-'))
    const fixture = await createTakeoutFixture()
    const store = new LibraryStore(join(dbDir, 'photofind.db'))
    try {
      const firstScan = await runScan(fixture.root, { thumbnailCacheRoot: join(dbDir, 'thumbs') })
      store.upsertScan(fixture.root, firstScan)

      const keeperPath = firstScan.matches[0].media.path
      store.setKeeper(keeperPath, true)

      const secondScan = await runScan(fixture.root, { thumbnailCacheRoot: join(dbDir, 'thumbs') })
      store.upsertScan(fixture.root, secondScan)

      expect(store.listKeepers(secondScan.matches.map((match) => match.media.path))).toEqual([keeperPath])

      store.setKeeper(keeperPath, false)

      expect(store.listKeepers(secondScan.matches.map((match) => match.media.path))).toEqual([])
    } finally {
      store.close()
      await fixture.cleanup()
      await rm(dbDir, { recursive: true, force: true })
    }
  })

  it('migrates a pre-migration database without losing data', async () => {
    const dbDir = await mkdtemp(join(tmpdir(), 'photofind-library-'))
    const dbPath = join(dbDir, 'photofind.db')
    try {
      // Build a database exactly as the pre-migration initialize() did: no
      // user_version, no curation columns, with one media item and one keeper.
      const legacy = new Database(dbPath)
      legacy.exec(`
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
        INSERT INTO media_items VALUES (
          '/lib/IMG_1.jpg', '/lib', 'IMG_1.jpg', 'image', 1234,
          NULL, 'safe', 'exact filename match', NULL, NULL, NULL, 1
        );
        INSERT INTO keepers VALUES ('/lib/IMG_1.jpg', 1);
      `)
      legacy.close()

      const store = new LibraryStore(dbPath)
      try {
        // Existing data survives and new columns are usable.
        expect(store.listKeepers(['/lib/IMG_1.jpg'])).toEqual(['/lib/IMG_1.jpg'])
        store.setUserVerdict('/lib/IMG_1.jpg', 'keep')
        expect(store.listUserVerdicts(['/lib/IMG_1.jpg']).get('/lib/IMG_1.jpg')).toBe('keep')
        store.setUserVerdict('/lib/IMG_1.jpg', null)
        expect(store.listUserVerdicts(['/lib/IMG_1.jpg']).size).toBe(0)
      } finally {
        store.close()
      }

      // Reopening must not re-run migrations (idempotent).
      const reopened = new LibraryStore(dbPath)
      try {
        expect(reopened.listKeepers(['/lib/IMG_1.jpg'])).toEqual(['/lib/IMG_1.jpg'])
      } finally {
        reopened.close()
      }
    } finally {
      await rm(dbDir, { recursive: true, force: true })
    }
  })

  it('round-trips face embeddings and boxes through the faces table', async () => {
    const dbDir = await mkdtemp(join(tmpdir(), 'photofind-library-'))
    const store = new LibraryStore(join(dbDir, 'photofind.db'))
    try {
      const fixture = await createTakeoutFixture()
      try {
        const scan = await runScan(fixture.root, {})
        store.upsertScan(fixture.root, scan)
        const mediaPath = scan.matches[0].media.path

        const embedding = new Float32Array(128).map((_, i) => Math.sin(i) * 0.5)
        store.replaceFaces(mediaPath, [
          { box: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 }, score: 0.98, embedding }
        ])

        const faces = store.listFaces(mediaPath)
        expect(faces).toHaveLength(1)
        expect(faces[0].box).toEqual({ x: 0.1, y: 0.2, width: 0.3, height: 0.4 })
        expect(faces[0].score).toBeCloseTo(0.98, 5)
        expect(faces[0].embedding).toHaveLength(128)
        expect(Array.from(faces[0].embedding)).toEqual(Array.from(embedding))

        // Replace wipes previous rows rather than accumulating.
        store.replaceFaces(mediaPath, [])
        expect(store.listFaces(mediaPath)).toHaveLength(0)
      } finally {
        await fixture.cleanup()
      }
    } finally {
      store.close()
      await rm(dbDir, { recursive: true, force: true })
    }
  })

  it('stores and removes special dates of both kinds', async () => {
    const dbDir = await mkdtemp(join(tmpdir(), 'photofind-library-'))
    const store = new LibraryStore(join(dbDir, 'photofind.db'))
    try {
      const birthday = store.addSpecialDate({ label: 'Birthday', kind: 'recurring-yearly', month: 6, day: 1 })
      const trip = store.addSpecialDate({ label: 'Rome trip', kind: 'range', startMs: 1000, endMs: 2000 })

      const listed = store.listSpecialDates()
      expect(listed).toEqual([birthday, trip])
      expect(listed[0]).toMatchObject({ kind: 'recurring-yearly', month: 6, day: 1 })
      expect(listed[1]).toMatchObject({ kind: 'range', startMs: 1000, endMs: 2000 })

      store.removeSpecialDate(birthday.id)
      expect(store.listSpecialDates()).toEqual([trip])
    } finally {
      store.close()
      await rm(dbDir, { recursive: true, force: true })
    }
  })
})
