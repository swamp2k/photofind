import { reviewStateOf } from './review'
import { isKnownDateEvent } from './eventOverrides'
import type { LiteEventRecord, LiteMediaRecord } from './types'

export type ExportSelectionScope = 'keep' | 'maybe' | 'known'

export function buildExportSelection(
  items: LiteMediaRecord[],
  scopes: ReadonlySet<ExportSelectionScope>,
  knownEvents: LiteEventRecord[],
  eventFilter: LiteEventRecord | null = null
): LiteMediaRecord[] {
  const knownItemIds = new Set(knownEvents.flatMap((event) => event.itemIds))
  const eventItemIds = eventFilter ? new Set(eventFilter.itemIds) : null

  return items.filter((item) => {
    if (item.kind !== 'image') return false
    if (eventItemIds && !eventItemIds.has(item.id)) return false
    const reviewState = reviewStateOf(item)
    return (scopes.has('keep') && reviewState === 'keep')
      || (scopes.has('maybe') && reviewState === 'maybe')
      || (scopes.has('known') && knownItemIds.has(item.id))
  })
}

export function splitEventsForExportFilter(events: LiteEventRecord[]): { known: LiteEventRecord[]; detected: LiteEventRecord[] } {
  const sorted = [...events].sort((left, right) => left.startTime - right.startTime || left.title.localeCompare(right.title))
  return {
    known: sorted.filter(isKnownDateEvent),
    detected: sorted.filter((event) => !isKnownDateEvent(event))
  }
}
