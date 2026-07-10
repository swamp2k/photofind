import { stat } from 'node:fs/promises'
import { afterAll, describe, expect, it } from 'vitest'
import { createCurateFixture } from '../test/curateFixture'
import { extractCaptureMetadata } from './captureMetadata'
import { disposeExiftool } from './exiftoolClient'
import { scanDirectory } from './scanner'

afterAll(async () => {
  await disposeExiftool()
})

describe('extractCaptureMetadata', () => {
  it('reads EXIF capture times with subsecond ordering and falls back to mtime', async () => {
    const fixture = await createCurateFixture()
    try {
      const files = await scanDirectory(fixture.root)
      const result = await extractCaptureMetadata(files)
      const byPath = new Map(result.items.map((item) => [item.mediaPath, item]))

      const burst = fixture.paths.burst.map((path) => byPath.get(path)!)
      for (const item of burst) {
        expect(item.status).toBe('ok')
        expect(item.source).toBe('exif')
        expect(item.cameraModel).toContain('PixelTest')
      }
      // Subsecond stamps must produce strictly increasing capture times.
      for (let i = 1; i < burst.length; i++) {
        expect(burst[i].captureTimeMs!).toBeGreaterThan(burst[i - 1].captureTimeMs!)
      }

      const noExif = byPath.get(fixture.paths.noExif)!
      expect(noExif.source).toBe('mtime')
      const stats = await stat(fixture.paths.noExif)
      expect(noExif.captureTimeMs).toBe(stats.mtimeMs)

      expect(result.log.some((entry) => entry.message.includes('no EXIF capture time'))).toBe(true)
    } finally {
      await fixture.cleanup()
    }
  }, 30000)

  it('reports progress for every analyzed file', async () => {
    const fixture = await createCurateFixture()
    try {
      const files = await scanDirectory(fixture.root)
      const media = files.filter((file) => file.kind === 'image' || file.kind === 'raw')
      const seen: number[] = []
      await extractCaptureMetadata(files, (processed, total) => {
        expect(total).toBe(media.length)
        seen.push(processed)
      })
      expect(seen.length).toBe(media.length)
      expect(Math.max(...seen)).toBe(media.length)
    } finally {
      await fixture.cleanup()
    }
  }, 30000)
})
