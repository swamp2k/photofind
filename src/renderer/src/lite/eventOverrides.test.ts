import { describe, expect, it } from 'vitest'
import { applyEventOverrides, createEventOverride, matchingEventOverride } from './eventOverrides'
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

describe('event name overrides', () => {
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

  it('treats a blank name as removing the override', () => {
    expect(createEventOverride(event('event-a', ['1']), '   ')).toBeNull()
  })
})
