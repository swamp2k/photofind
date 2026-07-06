import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import type { ScannedFile } from '../../shared/types'
import { generateThumbnails } from './thumbnails'

describe('generateThumbnails', () => {
  it('generates and reuses thumbnails for supported images', async () => {
    const root = await mkdtemp(join(tmpdir(), 'photofind-thumbs-'))
    try {
      const mediaPath = join(root, 'IMG_2001.jpg')
      const cacheRoot = join(root, 'cache')
      await sharp({
        create: {
          width: 640,
          height: 480,
          channels: 3,
          background: '#4f8cff'
        }
      })
        .jpeg()
        .toFile(mediaPath)

      const media = file(mediaPath, 'IMG_2001.jpg', 4096)
      const first = await generateThumbnails([media], { cacheRoot, size: 160 })

      expect(first.generated).toBe(1)
      expect(first.reused).toBe(0)
      expect(first.failed).toBe(0)
      expect(first.items[0].status).toBe('ready')
      expect(first.items[0].thumbnailPath).toMatch(/\.webp$/)
      expect(first.items[0].thumbnailUrl).toMatch(/^photofind-thumb:\/\//)
      expect(first.items[0].width).toBeLessThanOrEqual(160)
      expect(first.items[0].height).toBeLessThanOrEqual(160)

      const second = await generateThumbnails([media], { cacheRoot, size: 160 })

      expect(second.generated).toBe(0)
      expect(second.reused).toBe(1)
      expect(second.failed).toBe(0)
      expect(second.items[0].thumbnailPath).toBe(first.items[0].thumbnailPath)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('reports thumbnail failures without throwing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'photofind-thumbs-'))
    try {
      const mediaPath = join(root, 'broken.jpg')
      await writeFile(mediaPath, 'not really an image\n')

      const result = await generateThumbnails([file(mediaPath, 'broken.jpg', 20)], {
        cacheRoot: join(root, 'cache')
      })

      expect(result.generated).toBe(0)
      expect(result.failed).toBe(1)
      expect(result.items[0].status).toBe('failed')
      expect(result.items[0].thumbnailPath).toBeNull()
      expect(result.items[0].thumbnailUrl).toBeNull()
      expect(result.log[0].message).toContain('thumbnail failed')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

function file(path: string, name: string, sizeBytes: number): ScannedFile {
  return { path, name, sizeBytes, kind: 'image' }
}
