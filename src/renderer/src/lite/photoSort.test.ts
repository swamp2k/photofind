import { describe, expect, it } from 'vitest'
import { sortLibraryPhotos } from './photoSort'
import type { LiteMediaRecord } from './types'

function photo(id: string, overrides: Partial<LiteMediaRecord> = {}): LiteMediaRecord {
  return {
    id,
    libraryId: 'library',
    relativePath: `Photos/${id}.jpg`,
    name: `${id}.jpg`,
    kind: 'image',
    sizeBytes: 1,
    lastModified: 100,
    mimeType: 'image/jpeg',
    ...overrides
  }
}

describe('Library photo sorting', () => {
  it('sorts EXIF dates while keeping missing EXIF as an unsorted tail', () => {
    const items = [
      photo('missing-a', { captureTimeSource: 'file', effectiveCaptureTime: 500 }),
      photo('new', { captureTimeSource: 'exif', effectiveCaptureTime: 300 }),
      photo('missing-b', { captureTimeSource: 'takeout', effectiveCaptureTime: 400 }),
      photo('old', { captureTimeSource: 'exif', effectiveCaptureTime: 100 })
    ]
    expect(sortLibraryPhotos(items, 'exif', 'asc').map((item) => item.id)).toEqual(['old', 'new', 'missing-a', 'missing-b'])
    expect(sortLibraryPhotos(items, 'exif', 'desc').map((item) => item.id)).toEqual(['new', 'old', 'missing-a', 'missing-b'])
  })

  it('sorts filenames naturally', () => {
    const items = [photo('10', { name: 'IMG_10.JPG' }), photo('2', { name: 'IMG_2.JPG' })]
    expect(sortLibraryPhotos(items, 'filename', 'asc').map((item) => item.name)).toEqual(['IMG_2.JPG', 'IMG_10.JPG'])
  })

  it('sorts folder first and filename second', () => {
    const items = [
      photo('b', { relativePath: 'Trips/Zulu/b.jpg', name: 'b.jpg' }),
      photo('c', { relativePath: 'Trips/Alpha/c.jpg', name: 'c.jpg' }),
      photo('a', { relativePath: 'Trips/Alpha/a.jpg', name: 'a.jpg' })
    ]
    expect(sortLibraryPhotos(items, 'folder', 'asc').map((item) => item.name)).toEqual(['a.jpg', 'c.jpg', 'b.jpg'])
  })
})
