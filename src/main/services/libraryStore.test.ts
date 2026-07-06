import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
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
})
