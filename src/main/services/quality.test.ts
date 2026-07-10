import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterAll, describe, expect, it } from 'vitest'
import { createCurateFixture } from '../test/curateFixture'
import { disposeExiftool } from './exiftoolClient'
import { generateThumbnails } from './thumbnails'
import { scanDirectory } from './scanner'
import {
  analyzeQuality,
  BRIGHT_MEAN,
  DARK_MEAN,
  SHARPNESS_BLURRY,
  SHARPNESS_SOFT
} from './quality'

afterAll(async () => {
  await disposeExiftool()
})

describe('analyzeQuality', () => {
  it('separates sharp, blurred, dark and blown photos and reports failures', async () => {
    const fixture = await createCurateFixture()
    const cacheRoot = await mkdtemp(join(tmpdir(), 'photofind-quality-'))
    try {
      const files = await scanDirectory(fixture.root)
      const thumbnails = await generateThumbnails(files, { cacheRoot })
      const result = await analyzeQuality(thumbnails.items)
      const byPath = new Map(result.items.map((item) => [item.mediaPath, item]))

      const sharpScore = byPath.get(fixture.paths.sharpNoise)!
      const blurredScore = byPath.get(fixture.paths.blurred)!
      expect(sharpScore.status).toBe('ok')
      expect(sharpScore.sharpness!).toBeGreaterThan(SHARPNESS_SOFT)
      expect(blurredScore.sharpness!).toBeLessThan(SHARPNESS_BLURRY)
      expect(sharpScore.sharpness!).toBeGreaterThan(blurredScore.sharpness!)

      const darkScore = byPath.get(fixture.paths.dark)!
      expect(darkScore.exposureMean!).toBeLessThan(DARK_MEAN)
      expect(darkScore.clippedShadowsPct!).toBeGreaterThan(0.5)

      const blownScore = byPath.get(fixture.paths.blown)!
      expect(blownScore.exposureMean!).toBeGreaterThan(BRIGHT_MEAN)
      expect(blownScore.clippedHighlightsPct!).toBeGreaterThan(0.5)

      // Corrupt image has no thumbnail — analysis must surface, not skip silently.
      const corruptScore = byPath.get(fixture.paths.corrupt)!
      expect(corruptScore.status).toBe('failed')
      expect(result.log.some((entry) => entry.message.includes(fixture.paths.corrupt))).toBe(true)

      // Burst frames ordered by blur amount: frame 1 (no blur) sharpest.
      const burstScores = fixture.paths.burst.map((path) => byPath.get(path)!.sharpness!)
      expect(Math.max(...burstScores)).toBe(burstScores[1])
    } finally {
      await rm(cacheRoot, { recursive: true, force: true })
      await fixture.cleanup()
    }
  }, 30000)
})
