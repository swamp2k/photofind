export interface ExplorerSelectionModifiers {
  toggle: boolean
  range: boolean
}

export interface ExplorerSelectionResult {
  selectedIds: Set<string>
  anchorId: string | null
}

export function updateExplorerSelection(
  orderedIds: string[],
  currentSelection: ReadonlySet<string>,
  anchorId: string | null,
  clickedId: string,
  modifiers: ExplorerSelectionModifiers
): ExplorerSelectionResult {
  const clickedIndex = orderedIds.indexOf(clickedId)
  if (clickedIndex < 0) return { selectedIds: new Set(currentSelection), anchorId }

  if (modifiers.range) {
    const storedAnchorIndex = anchorId ? orderedIds.indexOf(anchorId) : -1
    const resolvedAnchorIndex = storedAnchorIndex >= 0 ? storedAnchorIndex : clickedIndex
    const start = Math.min(resolvedAnchorIndex, clickedIndex)
    const end = Math.max(resolvedAnchorIndex, clickedIndex)
    const selectedIds = modifiers.toggle ? new Set(currentSelection) : new Set<string>()
    for (const id of orderedIds.slice(start, end + 1)) selectedIds.add(id)
    return {
      selectedIds,
      anchorId: storedAnchorIndex >= 0 ? anchorId : clickedId
    }
  }

  const selectedIds = new Set(currentSelection)
  if (modifiers.toggle) {
    if (selectedIds.has(clickedId)) selectedIds.delete(clickedId)
    else selectedIds.add(clickedId)
  } else {
    selectedIds.clear()
    selectedIds.add(clickedId)
  }
  return { selectedIds, anchorId: clickedId }
}

export function preserveExplorerSelectionForPreview(currentSelection: ReadonlySet<string>, clickedId: string): ExplorerSelectionResult {
  return { selectedIds: new Set(currentSelection), anchorId: clickedId }
}

export function selectedItemsInOrder<T extends { id: string }>(items: T[], selectedIds: ReadonlySet<string>): T[] {
  return items.filter((item) => selectedIds.has(item.id))
}
