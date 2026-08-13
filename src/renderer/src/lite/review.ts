import type { LiteMediaRecord, LiteReviewCounts, LiteReviewFilter, LiteReviewState } from './types'

export function reviewStateOf(item: LiteMediaRecord): LiteReviewState {
  return item.reviewState ?? 'unreviewed'
}

export function isRejected(item: LiteMediaRecord): boolean {
  return item.kind === 'image' && reviewStateOf(item) === 'reject'
}

export function countReviewStates(items: LiteMediaRecord[]): LiteReviewCounts {
  const counts: LiteReviewCounts = { unreviewed: 0, keep: 0, maybe: 0, reject: 0 }
  for (const item of items) {
    if (item.kind !== 'image') continue
    counts[reviewStateOf(item)] += 1
  }
  return counts
}

export function filterByReview(items: LiteMediaRecord[], filter: LiteReviewFilter): LiteMediaRecord[] {
  if (filter === 'all') return items.filter((item) => !isRejected(item))
  return items.filter((item) => reviewStateOf(item) === filter)
}

export function setReviewState(
  items: LiteMediaRecord[],
  itemIds: ReadonlySet<string>,
  state: LiteReviewState,
  updatedAt = Date.now()
): { items: LiteMediaRecord[]; changed: LiteMediaRecord[] } {
  return setReviewAssignments(items, new Map([...itemIds].map((id) => [id, state])), updatedAt)
}

export function setReviewAssignments(
  items: LiteMediaRecord[],
  assignments: ReadonlyMap<string, LiteReviewState>,
  updatedAt = Date.now()
): { items: LiteMediaRecord[]; changed: LiteMediaRecord[] } {
  const changed: LiteMediaRecord[] = []
  const next = items.map((item) => {
    const state = assignments.get(item.id)
    if (!state || item.kind !== 'image' || reviewStateOf(item) === state) return item
    const updated = { ...item, reviewState: state, reviewUpdatedAt: updatedAt }
    changed.push(updated)
    return updated
  })
  return { items: next, changed }
}

export function reviewLabel(state: LiteReviewState): string {
  if (state === 'keep') return 'Keep'
  if (state === 'maybe') return 'Maybe'
  if (state === 'reject') return 'Reject'
  return 'Unreviewed'
}
