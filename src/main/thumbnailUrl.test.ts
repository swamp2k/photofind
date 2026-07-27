import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ScanResult } from '../shared/types'
import {
  pathFromThumbnailUrl,
  resolveThumbnailPath,
  withElectronThumbnailUrls
} from './thumbnailUrl'

describe('Electron thumbnail URL adapter', () => {
  it('round-trips a Windows thumbnail path and adds presentation URLs without changing canonical paths', () => {
    const thumbnailPath = join('C:\\', 'cache folder', String.fromCharCode(0x00c5), 'thumb.webp')
    const adapted = withElectronThumbnailUrls(scanResult(thumbnailPath))

    expect(adapted.thumbnails.items[0].thumbnailPath).toBe(thumbnailPath)
    expect(adapted.thumbnails.items[0].thumbnailUrl).toMatch(/^photofind-thumb:\/\/thumbnail\//)
    expect(adapted.thumbnails.items[0].thumbnailUrl).toContain('%3A')
    expect(adapted.thumbnails.items[0].thumbnailUrl).toContain('%5C')
    expect(adapted.thumbnails.items[0].thumbnailUrl).toContain('%20')
    expect(adapted.thumbnails.items[0].thumbnailUrl).toContain('%C3%85')
    expect(pathFromThumbnailUrl(adapted.thumbnails.items[0].thumbnailUrl!)).toBe(thumbnailPath)
  })

  it('rejects malformed URLs and URLs for other transports', () => {
    expect(pathFromThumbnailUrl('photofind-thumb://thumbnail/')).toBeNull()
    expect(pathFromThumbnailUrl('https://thumbnail/YQ')).toBeNull()
    expect(pathFromThumbnailUrl('not-a-url')).toBeNull()
    expect(pathFromThumbnailUrl('photofind-thumb://thumbnail/%zz')).toBeNull()
    expect(pathFromThumbnailUrl('photofind-thumb://thumbnail/QzpcY2FjaGVcdGh1bWIud2VicA?x=1')).toBeNull()
  })

  it('accepts cache children and rejects traversal or cross-root references', () => {
    const cacheRoot = join('C:\\', 'cache')

    expect(resolveThumbnailPath(cacheRoot, join(cacheRoot, 'nested', 'thumb.webp'))).toBe(
      join(cacheRoot, 'nested', 'thumb.webp')
    )
    expect(resolveThumbnailPath(cacheRoot, join(cacheRoot, '..', 'other', 'thumb.webp'))).toBeNull()
    expect(resolveThumbnailPath(cacheRoot, join('D:\\', 'other', 'thumb.webp'))).toBeNull()
  })
})

function scanResult(thumbnailPath: string): ScanResult {
  return {
    summary: {
      totalFiles: 1,
      images: 1,
      raw: 0,
      videos: 0,
      sidecars: 0,
      unknown: 0,
      safeMatches: 0,
      uncertainMatches: 0,
      missingMatches: 1
    },
    matches: [],
    thumbnails: {
      generated: 1,
      reused: 0,
      failed: 0,
      skipped: 0,
      items: [
        {
          mediaPath: join('C:\\', 'photos', 'photo.jpg'),
          thumbnailPath,
          thumbnailUrl: null,
          status: 'ready'
        }
      ],
      log: []
    },
    keepers: [],
    log: []
  }
}
