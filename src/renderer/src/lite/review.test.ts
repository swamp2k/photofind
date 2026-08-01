import { describe, expect, it } from 'vitest'
import { countReviewStates, filterByReview, reviewStateOf, setReviewAssignments, setReviewState } from './review'
import type { LiteMediaRecord } from './types'

function photo(id: string, reviewState?: LiteMediaRecord['reviewState']): LiteMediaRecord {
  return {
    id,
    libraryId: 'library',
    relativePath: `${id}.jpg`,
    name: `${id}.jpg`,
    kind: 'image',
    sizeBytes: 10,
    lastModified: 100,
    mimeType: 'image/jpeg',
    ...(reviewState ? { reviewState } : {})
  }
}

describe('review helpers', () => {
  it('treats missing state as unreviewed', () => {
    expect(reviewStateOf(photo('a'))).toBe('unreviewed')
  })

  it('counts and filters canonical states', () => {
    const items = [photo('a'), photo('b', 'keep'), photo('c', 'maybe'), photo('d', 'reject')]
    expect(countReviewStates(items)).toEqual({ unreviewed: 1, keep: 1, maybe: 1, reject: 1 })
    expect(filterByReview(items, 'keep').map((item) => item.id)).toEqual(['b'])
  })

  it('updates only selected images and returns persistence rows', () => {
    const items = [photo('a'), photo('b', 'keep')]
    const result = setReviewState(items, new Set(['a', 'b']), 'maybe', 1234)
    expect(result.items.map((item) => item.reviewState)).toEqual(['maybe', 'maybe'])
    expect(result.changed).toHaveLength(2)
    expect(result.changed[0].reviewUpdatedAt).toBe(1234)
  })

  it('applies mixed pick-best decisions as one atomic result', () => {
    const items = [photo('winner', 'maybe'), photo('other-a'), photo('other-b', 'keep')]
    const result = setReviewAssignments(items, new Map([
      ['winner', 'keep'],
      ['other-a', 'reject'],
      ['other-b', 'reject']
    ]), 5678)

    expect(result.items.map((item) => item.reviewState)).toEqual(['keep', 'reject', 'reject'])
    expect(result.changed).toHaveLength(3)
    expect(result.changed.every((item) => item.reviewUpdatedAt === 5678)).toBe(true)
  })
})
