import { describe, expect, it } from 'vitest'
import { copyStarredState, isStarred, setPhotoStarred } from './starred'
import type { LiteMediaRecord } from './types'

function photo(id = 'photo'): LiteMediaRecord {
  return {
    id,
    libraryId: 'library',
    relativePath: `${id}.jpg`,
    name: `${id}.jpg`,
    kind: 'image',
    sizeBytes: 10,
    lastModified: 100,
    mimeType: 'image/jpeg'
  }
}

describe('starred photos', () => {
  it('stars and unstars without changing review state', () => {
    const source = { ...photo(), reviewState: 'reject' as const }
    const starred = setPhotoStarred([source], source.id, true, 123)
    expect(isStarred(starred.items[0])).toBe(true)
    expect(starred.items[0].reviewState).toBe('reject')
    expect((starred.items[0] as LiteMediaRecord & { starredUpdatedAt?: number }).starredUpdatedAt).toBe(123)

    const unstarred = setPhotoStarred(starred.items, source.id, false, 456)
    expect(isStarred(unstarred.items[0])).toBe(false)
    expect(unstarred.items[0].reviewState).toBe('reject')
  })

  it('carries the starred flag onto a freshly scanned record', () => {
    const prior = setPhotoStarred([photo()], 'photo', true, 123).items[0]
    const fresh = { ...photo(), sizeBytes: 999, lastModified: 999 }
    const copied = copyStarredState(fresh, prior)
    expect(isStarred(copied)).toBe(true)
    expect((copied as LiteMediaRecord & { starredUpdatedAt?: number }).starredUpdatedAt).toBe(123)
  })
})
