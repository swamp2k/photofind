import { stat } from 'node:fs/promises'
import { basename } from 'node:path'
import type { MediaThumbnail } from '../../shared/types'
import { classify } from './classify'
import { generateThumbnails } from './thumbnails'

export const PREVIEW_SIZE = 1280

/**
 * Lazily builds a lightbox-sized preview for one photo, reusing the thumbnail
 * cache machinery (content-keyed webp) so repeat views are instant. Originals
 * can be 20MB+ HEICs the renderer can't decode; 1280px webp it can.
 */
export async function getPreview(mediaPath: string, cacheRoot: string): Promise<MediaThumbnail> {
  let sizeBytes = 0
  let mtimeMs = 0
  try {
    const stats = await stat(mediaPath)
    sizeBytes = stats.size
    mtimeMs = stats.mtimeMs
  } catch (err) {
    return {
      mediaPath,
      thumbnailPath: null,
      thumbnailUrl: null,
      status: 'failed',
      reason: (err as Error).message
    }
  }

  const result = await generateThumbnails(
    [{ path: mediaPath, name: basename(mediaPath), kind: classify(basename(mediaPath)), sizeBytes, mtimeMs }],
    { cacheRoot, size: PREVIEW_SIZE }
  )

  return (
    result.items[0] ?? {
      mediaPath,
      thumbnailPath: null,
      thumbnailUrl: null,
      status: 'skipped',
      reason: 'unsupported media kind'
    }
  )
}
