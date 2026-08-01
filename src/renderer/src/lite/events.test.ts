import { describe, expect, it } from 'vitest'
import { buildEvents } from './events'
import type { LiteMediaRecord, LiteSimilarityGroup } from './types'

const HOUR = 60 * 60 * 1000

function photo(id: string, hour: number, overrides: Partial<LiteMediaRecord> = {}): LiteMediaRecord {
  return {
    id: `library:${id}`,
    libraryId: 'library',
    relativePath: `Trips/${id}.jpg`,
    name: `${id}.jpg`,
    kind: 'image',
    sizeBytes: 10,
    lastModified: hour * HOUR,
    effectiveCaptureTime: hour * HOUR,
    mimeType: 'image/jpeg',
    ...overrides
  }
}

describe('event grouping', () => {
  it('keeps close photos together and splits hard time gaps', () => {
    const events = buildEvents([photo('a', 1), photo('b', 2), photo('c', 30)])
    expect(events.map((event) => event.itemIds.length)).toEqual([2, 1])
  })

  it('uses source folder, location and people as supporting evidence', () => {
    const sharedFace = { id: 'face', box: [0, 0, 1, 1] as [number, number, number, number], confidence: 1, embedding: [1], personId: 'person-a' }
    const events = buildEvents([
      photo('a', 1, { relativePath: 'Holiday/a.jpg', latitude: 56.1, longitude: 10.2, faces: [sharedFace] }),
      photo('b', 7, { relativePath: 'Holiday/b.jpg', latitude: 56.11, longitude: 10.21, faces: [{ ...sharedFace, id: 'face2' }] })
    ])
    expect(events).toHaveLength(1)
    expect(events[0].evidence).toEqual(expect.arrayContaining(['nearby GPS', 'same source folder', 'shared people']))
    expect(events[0].personIds).toEqual(['person-a'])
  })

  it('uses similarity groups to support a same-day continuation', () => {
    const items = [photo('a', 1, { relativePath: 'A/a.jpg' }), photo('b', 7, { relativePath: 'B/b.jpg' })]
    const groups: LiteSimilarityGroup[] = [{ id: 'g', kind: 'similar', itemIds: items.map((item) => item.id), reason: 'similar' }]
    expect(buildEvents(items, groups)).toHaveLength(1)
  })

  it('creates stable event ids and folder context', () => {
    const items = [photo('a', 1, { relativePath: 'Holiday/a.jpg' }), photo('b', 2, { relativePath: 'Holiday/b.jpg' })]
    const first = buildEvents(items)[0]
    const second = buildEvents([...items].reverse())[0]
    expect(first.id).toBe(second.id)
    expect(first.folderPaths).toEqual(['Holiday'])
    expect(first.title).toContain('Holiday')
  })
})
