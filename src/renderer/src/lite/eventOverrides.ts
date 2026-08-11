import type { LiteEventOverride, LiteEventRecord } from './types'

export function eventOverrideId(libraryId: string, eventId: string): string {
  return `${libraryId}::${eventId}`
}

export function createEventOverride(event: LiteEventRecord, title: string, now = Date.now()): LiteEventOverride | null {
  const normalized = title.trim()
  if (!normalized) return null
  return {
    id: eventOverrideId(event.libraryId, event.id),
    eventId: event.id,
    libraryId: event.libraryId,
    title: normalized,
    itemIds: [...event.itemIds],
    updatedAt: now
  }
}

export function applyEventOverrides(events: LiteEventRecord[], overrides: LiteEventOverride[]): LiteEventRecord[] {
  if (overrides.length === 0) return events
  const candidates = [...overrides].sort((a, b) => b.updatedAt - a.updatedAt)
  const used = new Set<string>()

  return events.map((event) => {
    const exact = candidates.find((override) => !used.has(override.id) && override.libraryId === event.libraryId && override.eventId === event.id)
    const matched = exact ?? bestOverlap(event, candidates.filter((override) => !used.has(override.id) && override.libraryId === event.libraryId))
    if (!matched) return event
    used.add(matched.id)
    return { ...event, title: matched.title, customTitle: matched.title }
  })
}

function bestOverlap(event: LiteEventRecord, overrides: LiteEventOverride[]): LiteEventOverride | undefined {
  const eventIds = new Set(event.itemIds)
  let best: LiteEventOverride | undefined
  let bestScore = 0
  for (const override of overrides) {
    const intersection = override.itemIds.reduce((count, id) => count + (eventIds.has(id) ? 1 : 0), 0)
    if (intersection === 0) continue
    const score = intersection / Math.max(1, Math.min(event.itemIds.length, override.itemIds.length))
    if (score >= 0.6 && score > bestScore) {
      best = override
      bestScore = score
    }
  }
  return best
}
