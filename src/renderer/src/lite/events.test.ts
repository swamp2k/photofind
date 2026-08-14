import { describe, expect, it } from 'vitest'
import { buildEvents, isMeaningfulEvent } from './events'
import type { LiteKnownDateRecord, LiteMediaRecord, LiteSimilarityGroup } from './types'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

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

function knownDate(overrides: Partial<LiteKnownDateRecord> = {}): LiteKnownDateRecord {
  return {
    id: 'known-vacation',
    libraryId: 'library',
    title: 'Summer vacation',
    kind: 'vacation',
    source: 'manual',
    startDate: '1970-01-01',
    endDate: '1970-01-08',
    recurringYearly: false,
    createdAt: 1,
    updatedAt: 1,
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

  it('keeps adjacent days at the same non-routine location in one event', () => {
    const events = buildEvents([
      photo('day-1', 10, { relativePath: 'Takeout/Trip/day-1.jpg', latitude: 43.508, longitude: 16.44 }),
      photo('day-2', 34, { relativePath: 'Takeout/Trip/day-2.jpg', latitude: 43.51, longitude: 16.45 }),
      photo('day-3', 58, { relativePath: 'Takeout/Trip/day-3.jpg', latitude: 43.505, longitude: 16.445 })
    ])
    expect(events).toHaveLength(1)
    expect(events[0].itemIds).toHaveLength(3)
    expect(events[0].evidence).toContain('same away location across days')
    expect(events[0].significance).toBe('away')
  })

  it('bridges several quiet holiday days when location and source folder agree', () => {
    const events = buildEvents([
      photo('trip-start', 10, { relativePath: 'Takeout/Summer trip/start.jpg', latitude: 43.508, longitude: 16.44 }),
      photo('trip-middle', 4 * 24 + 10, { relativePath: 'Takeout/Summer trip/middle.jpg', latitude: 43.51, longitude: 16.45 }),
      photo('trip-end', 7 * 24 + 10, { relativePath: 'Takeout/Summer trip/end.jpg', latitude: 43.505, longitude: 16.445 })
    ])
    expect(events).toHaveLength(1)
    expect(events[0].itemIds).toHaveLength(3)
    expect(events[0].evidence).toEqual(expect.arrayContaining(['same away location across days', 'same source folder']))
  })

  it('uses a known vacation range as an explicit multi-day event boundary even without GPS', () => {
    const events = buildEvents([
      photo('vacation-start', 10),
      photo('vacation-middle', 4 * 24 + 10),
      photo('vacation-end', 7 * 24 + 10),
      photo('after-vacation', 8 * 24 + 10)
    ], [], [knownDate()])
    expect(events).toHaveLength(2)
    expect(events[0].itemIds).toHaveLength(3)
    expect(events[0].title).toBe('Summer vacation')
    expect(events[0].significance).toBe('known-date')
    expect(events[0].knownDateTitle).toBe('Summer vacation')
    expect(events[0].evidence).toContain('known date: Summer vacation')
  })

  it('does not merge separate visits to the same away location years apart', () => {
    const threeYearsInHours = Math.round((3 * 365 * DAY) / HOUR)
    const events = buildEvents([
      photo('visit-2019-a', 10, { latitude: 43.508, longitude: 16.44 }),
      photo('visit-2019-b', 34, { latitude: 43.51, longitude: 16.45 }),
      photo('visit-2022-a', threeYearsInHours, { latitude: 43.509, longitude: 16.441 }),
      photo('visit-2022-b', threeYearsInHours + 24, { latitude: 43.51, longitude: 16.45 })
    ])
    expect(events).toHaveLength(2)
    expect(events.map((event) => event.itemIds.length)).toEqual([2, 2])
  })

  it('does not turn a frequently visited home-like location into a multi-week event', () => {
    const homeItems: LiteMediaRecord[] = []
    for (let month = 0; month < 4; month += 1) {
      for (let day = 0; day < 4; day += 1) {
        const hour = month * 35 * 24 + day * 24
        homeItems.push(photo(`home-${month}-${day}`, hour, { latitude: 56.2, longitude: 10.3 }))
      }
    }
    const events = buildEvents(homeItems)
    expect(events).toHaveLength(homeItems.length)
    expect(events.every((event) => event.significance === 'everyday')).toBe(true)
    expect(events.every((event) => !isMeaningfulEvent(event))).toBe(true)
  })

  it('keeps concentrated high-volume photo sessions in the meaningful event view', () => {
    const items = Array.from({ length: 20 }, (_, index) => photo(`session-${index}`, 1 + index * 0.05))
    const event = buildEvents(items)[0]
    expect(event.significance).toBe('moment')
    expect(isMeaningfulEvent(event)).toBe(true)
  })

  it('does not promote a high-volume day spread across many hours by count alone', () => {
    const items = Array.from({ length: 20 }, (_, index) => photo(`spread-${index}`, index * 0.6))
    const event = buildEvents(items)[0]
    expect(event.significance).toBe('everyday')
    expect(isMeaningfulEvent(event)).toBe(false)
  })

  it('treats a user-named everyday event as meaningful', () => {
    const event = { ...buildEvents([photo('single', 1)])[0], customTitle: 'First day at school' }
    expect(event.significance).toBe('everyday'
    )
    expect(isMeaningfulEvent(event)).toBe(true)
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

  it('projects a rejected-photo subset without rebuilding event identity', () => {
    const items = [photo('cache-event-a', 1), photo('cache-event-b', 2)]
    const base = buildEvents(items)
    expect(base).toHaveLength(1)
    const visible = [items[0]]
    const projected = buildEvents(visible)
    expect(projected).toHaveLength(1)
    expect(projected[0].id).toBe(base[0].id)
    expect(projected[0].itemIds).toEqual([items[0].id])
  })
})
