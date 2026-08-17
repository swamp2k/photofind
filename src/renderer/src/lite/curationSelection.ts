import { reviewStateOf } from './review'
import { isKnownDateEvent } from './eventOverrides'
import type { LiteEventRecord, LiteMediaRecord } from './types'

export type ExportSelectionScope = 'keep' | 'maybe' | 'known'

export interface ExportEventFolderInfo {
  name: string
  startTime: number
}

const SAME_NAMED_EVENT_FRAGMENT_GAP_MS = 14 * 24 * 60 * 60 * 1000

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

export function exportEventName(event: LiteEventRecord): string | undefined {
  const customTitle = event.customTitle?.trim()
  if (customTitle) return customTitle
  if (!isKnownDateEvent(event)) return undefined

  const knownTitle = event.knownDateTitle?.trim()
  if (knownTitle) return knownTitle

  const title = event.title.trim()
  return title || undefined
}

export function buildExportEventNameMap(events: LiteEventRecord[]): Map<string, ExportEventFolderInfo> {
  const map = new Map<string, ExportEventFolderInfo>()
  const named = events
    .map((event) => ({ event, title: exportEventName(event) }))
    .filter((entry): entry is { event: LiteEventRecord; title: string } => Boolean(entry.title))
    .sort((left, right) => left.title.localeCompare(right.title) || left.event.startTime - right.event.startTime || left.event.endTime - right.event.endTime)

  let index = 0
  while (index < named.length) {
    const first = named[index]
    const cluster = [first]
    let clusterEnd = first.event.endTime
    let nextIndex = index + 1

    while (nextIndex < named.length) {
      const next = named[nextIndex]
      if (next.title !== first.title) break
      if (next.event.startTime - clusterEnd > SAME_NAMED_EVENT_FRAGMENT_GAP_MS) break
      cluster.push(next)
      clusterEnd = Math.max(clusterEnd, next.event.endTime)
      nextIndex += 1
    }

    const startTime = Math.min(...cluster.map((entry) => entry.event.startTime))
    const info: ExportEventFolderInfo = { name: first.title, startTime }
    for (const entry of cluster) {
      for (const itemId of entry.event.itemIds) map.set(itemId, info)
    }

    index = nextIndex
  }

  return map
}

export function splitEventsForExportFilter(events: LiteEventRecord[]): { known: LiteEventRecord[]; detected: LiteEventRecord[] } {
  const sorted = [...events].sort((left, right) => left.startTime - right.startTime || left.title.localeCompare(right.title))
  return {
    known: sorted.filter(isKnownDateEvent),
    detected: sorted.filter((event) => !isKnownDateEvent(event))
  }
}
