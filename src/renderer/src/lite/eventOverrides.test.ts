import { describe, expect, it } from 'vitest'
import { applyEventOverrides, applyKnownDateOverrides, createEventKnownDateOverride, createEventOverride, createEventPhotoRemovalOverride, createEventRemovalOverride, createManualEventOverride, isKnownDateEvent, isKnownDateOverride, isManualEvent, matchingEventOverride } from './eventOverrides'
import type { LiteEventRecord, LiteMediaRecord } from './types'

function event(id: string, itemIds: string[], title = 'Generated event'): LiteEventRecord {
  return {
    id,
    libraryId: 'library',
    title,
    startTime: 1,
    endTime: 2,
    itemIds,
    personIds: [],
    folderPaths: [],
    evidence: []
  }
}

function photo(id: string, time: number, latitude = 56, longitude = 10): LiteMediaRecord {
  return {
    id,
    libraryId: 'library',
    relativePath: `${id}.jpg`,
    name: `${id}.jpg`,
    kind: 'image',
    sizeBytes: 1,
    lastModified: time,
    mimeType: 'image/jpeg',
    effectiveCaptureTime: time,
    captureTimeSource: 'exif',
    latitude,
    longitude,
    locationSource: 'exif'
  }
}

describe('event overrides', () => {
  it('applies an exact persisted custom name', () => {
    const original = event('event-a', ['1', '2'])
    const override = createEventOverride(original, 'Motorcycle trip', 10)!
    const applied = applyEventOverrides([original], [override])[0]
    expect(applied.title).toBe('Motorcycle trip')
    expect(applied.customTitle).toBe('Motorcycle trip')
  })

  it('recovers a custom name after modest event membership changes', () => {
    const original = event('event-a', ['1', '2', '3', '4'])
    const override = createEventOverride(original, 'Dreamhack', 10)!
    const regrouped = event('event-b', ['1', '2', '3', '4', '5'])
    expect(matchingEventOverride(regrouped, [override])?.title).toBe('Dreamhack')
    expect(applyEventOverrides([regrouped], [override])[0].customTitle).toBe('Dreamhack')
  })

  it('treats a blank name as removing a name-only override', () => {
    expect(createEventOverride(event('event-a', ['1']), '   ')).toBeNull()
  })

  it('suppresses a removed event without touching its photos', () => {
    const original = event('event-a', ['1', '2', '3'])
    const override = createEventRemovalOverride(original, undefined, 10)
    expect(applyEventOverrides([original], [override])).toEqual([])
    expect(override.itemIds).toEqual(['1', '2', '3'])
  })

  it('removes selected photos from event membership while keeping the event', () => {
    const original = event('event-a', ['1', '2', '3', '4'])
    const override = createEventPhotoRemovalOverride(original, ['2', '4'], undefined, 10)
    const applied = applyEventOverrides([original], [override])[0]
    expect(applied.itemIds).toEqual(['1', '3'])
    expect(override.hidden).toBeUndefined()
  })

  it('preserves manual membership when an edited event is renamed or reset', () => {
    const original = event('event-a', ['1', '2', '3'])
    const membership = createEventPhotoRemovalOverride(original, ['2'], undefined, 10)
    const projected = applyEventOverrides([original], [membership])[0]
    const renamed = createEventOverride(projected, 'Summer trip', 20, membership)!
    expect(renamed.includedItemIds).toEqual(['1', '3'])
    expect(applyEventOverrides([original], [renamed])[0].itemIds).toEqual(['1', '3'])

    const reset = createEventOverride(projected, '', 30, renamed)!
    expect(reset.title).toBe('')
    expect(reset.includedItemIds).toEqual(['1', '3'])
    expect(applyEventOverrides([original], [reset])[0].title).toBe('Generated event')
  })

  it('suppresses an event when its last selected photos are removed', () => {
    const original = event('event-a', ['1'])
    const override = createEventPhotoRemovalOverride(original, ['1'], undefined, 10)
    expect(override.hidden).toBe(true)
    expect(applyEventOverrides([original], [override])).toEqual([])
  })

  it('promotes a detected event into the known-date category', () => {
    const original = event('event-a', ['1', '2'])
    const override = createEventKnownDateOverride(original, undefined, 10)
    const applied = applyEventOverrides([original], [override])[0]
    expect(isKnownDateOverride(override)).toBe(true)
    expect(isKnownDateEvent(applied)).toBe(true)
    expect(applied.itemIds).toEqual(['1', '2'])
  })

  it('preserves known-date promotion through rename and membership edits', () => {
    const original = event('event-a', ['1', '2', '3'])
    const promoted = createEventKnownDateOverride(original, undefined, 10)
    const applied = applyEventOverrides([original], [promoted])[0]
    const renamed = createEventOverride(applied, 'Family day', 20, promoted)!
    const trimmed = createEventPhotoRemovalOverride(applyEventOverrides([original], [renamed])[0], ['2'], renamed, 30)
    const final = applyEventOverrides([original], [trimmed])[0]
    expect(isKnownDateOverride(renamed)).toBe(true)
    expect(isKnownDateOverride(trimmed)).toBe(true)
    expect(isKnownDateEvent(final)).toBe(true)
    expect(final.itemIds).toEqual(['1', '3'])
  })

  it('can project only known-date classification onto already-derived events', () => {
    const original = event('event-a', ['1', '2'])
    const override = createEventKnownDateOverride(original, undefined, 10)
    const applied = applyKnownDateOverrides([original], [override])[0]
    expect(applied.title).toBe('Generated event')
    expect(isKnownDateEvent(applied)).toBe(true)
  })

  it('creates a standalone persistent event from an arbitrary map viewport', () => {
    const items = [photo('a', 100, 56.1, 10.1), photo('b', 200, 56.2, 10.2)]
    const manual = createManualEventOverride('library', items, 'Weekend in Aarhus', 12345)!
    const generated = event('automatic', ['a', 'b'], 'Jan 5 – Jan 7 · Library root')
    const applied = applyEventOverrides([generated], [manual], items)
    const created = applied.find((candidate) => candidate.id === manual.eventId)!

    expect(applied).toHaveLength(2)
    expect(created.title).toBe('Weekend in Aarhus')
    expect(created.customTitle).toBe('Weekend in Aarhus')
    expect(created.itemIds).toEqual(['a', 'b'])
    expect(created.startTime).toBe(100)
    expect(created.endTime).toBe(200)
    expect(isManualEvent(created)).toBe(true)
    expect(matchingEventOverride(generated, [manual])).toBeUndefined()
  })

  it('keeps a manual event independent through rename, photo removal and deletion', () => {
    const items = [photo('a', 100), photo('b', 200), photo('c', 300)]
    const stored = createManualEventOverride('library', items, 'Map event', 10)!
    const created = applyEventOverrides([], [stored], items)[0]
    const renamed = createEventOverride(created, 'Renamed map event', 20, stored)!
    const renamedEvent = applyEventOverrides([], [renamed], items)[0]
    expect(renamedEvent.title).toBe('Renamed map event')
    expect(isManualEvent(renamedEvent)).toBe(true)

    const trimmed = createEventPhotoRemovalOverride(renamedEvent, ['b'], renamed, 30)
    const trimmedEvent = applyEventOverrides([], [trimmed], items)[0]
    expect(trimmedEvent.itemIds).toEqual(['a', 'c'])
    expect(isManualEvent(trimmedEvent)).toBe(true)

    const removed = createEventRemovalOverride(trimmedEvent, trimmed, 40)
    expect(applyEventOverrides([], [removed], items)).toEqual([])
  })
})
