import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createTakeoutFixture } from '../test/takeoutFixture'
import { PhotoFindApplication } from './PhotoFindApplication'

describe('PhotoFindApplication', () => {
  it('orchestrates scans, keeper restoration, repair, export and clean shutdown', async () => {
    const stateRoot = await mkdtemp(join(tmpdir(), 'photofind-application-'))
    const fixture = await createTakeoutFixture()
    const application = new PhotoFindApplication({
      databasePath: join(stateRoot, 'photofind.db'),
      thumbnailCacheRoot: join(stateRoot, 'thumbnails')
    })

    try {
      const firstScan = await application.scan(fixture.root)
      const keeperPath = firstScan.matches[0].media.path
      application.setKeeper(keeperPath, true)

      const secondScan = await application.scan(fixture.root)
      expect(secondScan.keepers).toEqual([keeperPath])

      const repair = await application.repair(secondScan.matches, true)
      expect(repair.attempted).toBe(3)
      expect(repair.failed).toBe(0)

      const exportRoot = join(stateRoot, 'export')
      const exported = await application.exportKeepers([keeperPath], exportRoot)
      expect(exported.exported).toBe(1)
      expect(await readFile(exported.files[0].outputPath!, 'utf-8')).toBeTruthy()
    } finally {
      application.close()
      application.close()
      await fixture.cleanup()
      await rm(stateRoot, { recursive: true, force: true })
    }
  })
})
