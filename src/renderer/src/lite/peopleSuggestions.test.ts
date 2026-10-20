import { describe, expect, it } from 'vitest'
import { clusterPeople, confirmFaceForPerson, excludeFaceFromPerson, faceReference, suggestFacesForPerson } from './people'
import type { LiteFaceObservation, LiteMediaRecord } from './types'

const HOUR = 60 * 60 * 1000

function face(id: string, embedding: number[], extra: Partial<LiteFaceObservation> = {}): LiteFaceObservation {
  return { id, box: [0.1, 0.1, 0.3, 0.3], confidence: 0.9, embedding, ...extra }
}

function photo(id: string, time: number, faces: LiteFaceObservation[]): LiteMediaRecord {
  return { id: `lib:${id}`, libraryId: 'lib', relativePath: `${id}.jpg`, name: `${id}.jpg`, kind: 'image', sizeBytes: 1, lastModified: 1, mimeType: 'image/jpeg', effectiveCaptureTime: time, faces }
}

describe('baby face suggestions', () => {
  it('suggests only from confirmed faces, near in time, and skips weak faces', () => {
    const t = 1_000_000_000
    const items = [
      photo('a', t, [face('f', [1, 0, 0], { personId: 'p1', confirmed: true })]),
      photo('burst', t + 5_000, [face('f', [0.8, 0.6, 0])]),
      photo('later', t + HOUR, [face('f', [0.9, 0.1, 0])]),
      photo('otherClass', t + 48 * HOUR, [face('f', [1, 0, 0])]),
      photo('blurry', t + HOUR, [face('f', [1, 0, 0], { confidence: 0.3 })]),
      photo('rejected', t + HOUR, [face('f', [1, 0, 0], { excludedPersonIds: ['p1'] })])
    ]
    const result = suggestFacesForPerson(items, 'p1')
    expect(result.map((s) => s.item.name)).toEqual(['later.jpg', 'burst.jpg'])
    expect(result[1].burst).toBe(true)
    expect(result[1].percent).toBe(88)
  })

  it('returns nothing until a face is confirmed', () => {
    expect(suggestFacesForPerson([photo('a', 1, [face('f', [1, 0], { personId: 'p1' })])], 'p1')).toEqual([])
  })

  it('keeps confirmed faces in place when re-clustering, and clears confirmation on "not this person"', () => {
    const items = [photo('a', 1, [face('f', [0, 1], { personId: 'p1' })])]
    const ref = faceReference('lib:a', 'f')
    const confirmed = confirmFaceForPerson(items, [], ref, 'p1')
    expect(confirmed.items[0].faces?.[0].confirmed).toBe(true)
    const reclustered = clusterPeople(confirmed.items, [{ ...confirmed.people[0], centroid: [1, 0] }])
    expect(reclustered.items[0].faces?.[0].personId).toBe('p1')
    const excluded = excludeFaceFromPerson(confirmed.items, confirmed.people, ref, 'p1')
    expect(excluded.items[0].faces?.[0].confirmed).toBeUndefined()
  })
})
