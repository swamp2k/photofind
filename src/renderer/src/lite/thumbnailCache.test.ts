import { describe, expect, it } from 'vitest'
import { thumbnailCacheKey } from './thumbnailCache'

describe('thumbnail cache keys', () => {
  const item = { id: 'library:photo.jpg', sizeBytes: 1234, lastModified: 1000 }

  it('is stable for the same source photo and thumbnail size', () => {
    expect(thumbnailCacheKey(item, 640)).toBe(thumbnailCacheKey({ ...item }, 640))
  })

  it('invalidates when the source file changes', () => {
    expect(thumbnailCacheKey(item, 640)).not.toBe(thumbnailCacheKey({ ...item, lastModified: 2000 }, 640))
    expect(thumbnailCacheKey(item, 640)).not.toBe(thumbnailCacheKey({ ...item, sizeBytes: 5678 }, 640))
  })

  it('keeps different preview dimensions independent', () => {
    expect(thumbnailCacheKey(item, 640)).not.toBe(thumbnailCacheKey(item, 320))
  })
})
