import { describe, expect, it } from 'vitest'
import { contextPhotoTargets } from './ContextMenu'

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
