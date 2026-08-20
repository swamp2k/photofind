import { describe, expect, it } from 'vitest'
import { contextPhotoTargets, eventPickerDetails } from './ContextMenu'

describe('context photo targets', () => {
  it('uses the full explorer selection when right-clicking a selected photo', () => {
    expect(contextPhotoTargets('b', ['a', 'b', 'c', 'b'])).toEqual(['a', 'b', 'c'])
  })

  it('uses only the clicked photo when it is outside the current selection', () => {
    expect(contextPhotoTargets('z', ['a', 'b', 'c'])).toEqual(['z'])
  })

  it('uses the clicked photo when there is no active selection', () => {
    expect(contextPhotoTargets('photo-1', [])).toEqual(['photo-1'])
  })
})

describe('event picker details', () => {
  it('splits event count, date range and partial-selection status into the two-row layout', () => {
    expect(eventPickerDetails('113/213 selected already added · Nov 21, 2020 · 35', false)).toEqual({
      dateLabel: 'Nov 21, 2020',
      photoCountLabel: '35 photos',
      statusLabel: '113/213 selected already added'
    })
  })

  it('keeps date and count visible when all selected photos are already in the event', () => {
    expect(eventPickerDetails('Dec 24, 2020 · 36', true)).toEqual({
      dateLabel: 'Dec 24, 2020',
      photoCountLabel: '36 photos',
      statusLabel: 'Already added'
    })
  })
})
