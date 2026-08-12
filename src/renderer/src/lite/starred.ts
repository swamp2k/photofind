import type { LiteMediaRecord } from './types'

export type StarredMediaRecord = LiteMediaRecord & {
  starred?: boolean
  starredUpdatedAt?: number
}

export function isStarred(item: LiteMediaRecord): boolean {
  return (item as StarredMediaRecord).starred === true
}

export function setPhotoStarred(
  items: LiteMediaRecord[],
  itemId: string,
  starred: boolean,
  now = Date.now()
): { items: LiteMediaRecord[]; changed: LiteMediaRecord | null } {
  let changed: LiteMediaRecord | null = null
  const next = items.map((item) => {
    if (item.id !== itemId || item.kind !== 'image') return item
    const current = item as StarredMediaRecord
    if ((current.starred === true) === starred) return item
    changed = {
      ...item,
      starred,
      starredUpdatedAt: now
    } as StarredMediaRecord
    return changed
  })
  return { items: next, changed }
}

export function copyStarredState(fresh: LiteMediaRecord, previous: LiteMediaRecord | undefined): LiteMediaRecord {
  if (!previous) return fresh
  const prior = previous as StarredMediaRecord
  if (prior.starred !== true && prior.starredUpdatedAt === undefined) return fresh
  return {
    ...fresh,
    starred: prior.starred === true,
    starredUpdatedAt: prior.starredUpdatedAt
  } as StarredMediaRecord
}
