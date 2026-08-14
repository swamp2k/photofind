import { describe, expect, it } from 'vitest'
import { applyEventOverrides, createEventOverride, createEventPhotoRemovalOverride, createEventRemovalOverride, matchingEventOverride } from './eventOverrides'
import type { LiteEventRecord } from './types'

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
})
