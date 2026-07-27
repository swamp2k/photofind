import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createTakeoutFixture } from '../test/takeoutFixture'
import { repairMetadata } from './metadataRepair'
import { runScan } from './scanOrchestrator'

describe('scan and dry-run repair integration', () => {
  it('scans a Takeout-like folder and dry-runs repair for safe matches only', async () => {
    const fixture = await createTakeoutFixture()
    try {
      const scan = await runScan(fixture.root, { thumbnailCacheRoot: join(fixture.root, '.thumbs') })

      expect(scan.summary.images).toBe(5)
      expect(scan.summary.sidecars).toBe(4)
      expect(scan.summary.unknown).toBe(1)
      expect(scan.summary.safeMatches).toBe(3)
      expect(scan.summary.uncertainMatches).toBe(1)
      expect(scan.summary.missingMatches).toBe(1)
      expect(scan.thumbnails.generated).toBe(5)
      expect(scan.thumbnails.failed).toBe(0)
      expect(scan.thumbnails.skipped).toBe(5)
      expect(scan.log.map((entry) => entry.message)).toEqual(
        expect.arrayContaining([
          expect.stringContaining('possible truncated filename match'),
          expect.stringContaining('no matching JSON sidecar found'),
          expect.stringContaining('unrecognized file type')
        ])
      )

      const repair = await repairMetadata(scan.matches, { dryRun: true })

      expect(repair.attempted).toBe(3)
      expect(repair.repaired).toBe(3)
      expect(repair.failed).toBe(0)
      expect(repair.log.map((entry) => entry.message)).toEqual(
        expect.arrayContaining([
          expect.stringContaining('IMG_1001.JPG: would write DateTimeOriginal, GPSLatitude, GPSLongitude, GPSAltitude'),
          expect.stringContaining('IMG_1002(1).JPG: would write DateTimeOriginal'),
          expect.stringContaining('IMG_1003-edited.JPG: would write DateTimeOriginal')
        ])
      )
    } finally {
      await fixture.cleanup()
    }
  })
})
