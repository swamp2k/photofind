import { describe, expect, it } from 'vitest'
import { selectedItemsInOrder, updateExplorerSelection } from './selectionModel'

const ids = ['a', 'b', 'c', 'd', 'e']

describe('Explorer-style photo selection', () => {
  it('toggles individual items with Ctrl or Command', () => {
    const first = updateExplorerSelection(ids, new Set(), null, 'b', { toggle: true, range: false })
    expect([...first.selectedIds]).toEqual(['b'])
    expect(first.anchorId).toBe('b')

    const second = updateExplorerSelection(ids, first.selectedIds, first.anchorId, 'd', { toggle: true, range: false })
    expect([...second.selectedIds]).toEqual(['b', 'd'])

    const third = updateExplorerSelection(ids, second.selectedIds, second.anchorId, 'b', { toggle: true, range: false })
    expect([...third.selectedIds]).toEqual(['d'])
  })

  it('replaces selection with the anchored Shift range', () => {
    const result = updateExplorerSelection(ids, new Set(['e']), 'b', 'd', { toggle: false, range: true })
    expect([...result.selectedIds]).toEqual(['b', 'c', 'd'])
    expect(result.anchorId).toBe('b')
  })

  it('adds an anchored range with Ctrl+Shift', () => {
    const result = updateExplorerSelection(ids, new Set(['a']), 'c', 'e', { toggle: true, range: true })
    expect([...result.selectedIds]).toEqual(['a', 'c', 'd', 'e'])
  })

  it('uses the clicked item as the anchor when no usable anchor exists', () => {
    const result = updateExplorerSelection(ids, new Set(), 'missing', 'c', { toggle: false, range: true })
    expect([...result.selectedIds]).toEqual(['c'])
    expect(result.anchorId).toBe('c')
  })

  it('returns selected records in the current visible order', () => {
    const items = ids.map((id) => ({ id }))
    expect(selectedItemsInOrder(items, new Set(['d', 'b']))).toEqual([{ id: 'b' }, { id: 'd' }])
  })
})
