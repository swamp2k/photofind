import { useEffect, useMemo, useState } from 'react'
import type { MouseEvent } from 'react'
import { selectedItemsInOrder, updateExplorerSelection } from './selectionModel'
import type { LiteMediaRecord, LiteReviewState } from './types'

export interface ExplorerPhotoSelection {
  selectedIds: ReadonlySet<string>
  selectedItems: LiteMediaRecord[]
  isSelected(itemId: string): boolean
  handlePhotoClick(event: MouseEvent<HTMLElement>, itemId: string, openPreview: () => void): void
  clear(): void
}

export function useExplorerPhotoSelection(items: LiteMediaRecord[]): ExplorerPhotoSelection {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [anchorId, setAnchorId] = useState<string | null>(null)
  const orderedIds = useMemo(() => items.map((item) => item.id), [items])
  const selectedItems = useMemo(() => selectedItemsInOrder(items, selectedIds), [items, selectedIds])

  useEffect(() => {
    const validIds = new Set(orderedIds)
    setSelectedIds((current) => {
      const next = new Set([...current].filter((id) => validIds.has(id)))
      return next.size === current.size ? current : next
    })
    setAnchorId((current) => current && validIds.has(current) ? current : null)
  }, [orderedIds])

  function handlePhotoClick(event: MouseEvent<HTMLElement>, itemId: string, openPreview: () => void): void {
    const toggle = event.ctrlKey || event.metaKey
    const range = event.shiftKey
    if (!toggle && !range) {
      setSelectedIds(new Set())
      setAnchorId(itemId)
      openPreview()
      return
    }

    event.preventDefault()
    const next = updateExplorerSelection(orderedIds, selectedIds, anchorId, itemId, { toggle, range })
    setSelectedIds(next.selectedIds)
    setAnchorId(next.anchorId)
  }

  return {
    selectedIds,
    selectedItems,
    isSelected: (itemId) => selectedIds.has(itemId),
    handlePhotoClick,
    clear: () => { setSelectedIds(new Set()); setAnchorId(null) }
  }
}

export function PhotoSelectionBar({
  items,
  onReview,
  onClear
}: {
  items: LiteMediaRecord[]
  onReview(items: LiteMediaRecord[], state: LiteReviewState): void
  onClear(): void
}): JSX.Element | null {
  if (items.length === 0) return null

  function apply(state: LiteReviewState): void {
    onReview(items, state)
    onClear()
  }

  return (
    <div className="photo-selection-bar" role="toolbar" aria-label="Actions for selected photos">
      <div><strong>{items.length.toLocaleString()} selected</strong><span>Ctrl-click toggles · Shift-click selects a range</span></div>
      <div className="photo-selection-actions">
        <button type="button" className="selection-keep" onClick={() => apply('keep')}>✓ Keep</button>
        <button type="button" className="selection-maybe" onClick={() => apply('maybe')}>? Maybe</button>
        <button type="button" className="selection-reject" onClick={() => apply('reject')}>× Reject</button>
        <button type="button" onClick={() => apply('unreviewed')}>Reset</button>
        <button type="button" className="quiet-button" onClick={onClear}>Clear selection</button>
      </div>
    </div>
  )
}
