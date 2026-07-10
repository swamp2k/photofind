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
})
