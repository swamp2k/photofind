import { sourceFolderOf } from './sourcePaths'
import type { LiteMediaRecord } from './types'

export type LitePhotoSort = 'exif' | 'filename' | 'folder'
export type LitePhotoSortDirection = 'asc' | 'desc'

export function sortLibraryPhotos(
  items: LiteMediaRecord[],
  sortBy: LitePhotoSort,
  direction: LitePhotoSortDirection
): LiteMediaRecord[] {
  const multiplier = direction === 'asc' ? 1 : -1
  const originalIndex = new Map(items.map((item, index) => [item.id, index]))
  return [...items].sort((left, right) => {
    if (sortBy === 'exif') {
      const leftTime = exifCaptureTime(left)
      const rightTime = exifCaptureTime(right)
      if (leftTime === undefined && rightTime === undefined) return (originalIndex.get(left.id) ?? 0) - (originalIndex.get(right.id) ?? 0)
      if (leftTime === undefined) return 1
      if (rightTime === undefined) return -1
      return multiplier * (leftTime - rightTime || comparePath(left, right))
    }
    if (sortBy === 'folder') {
      const folder = sourceFolderOf(left.relativePath).localeCompare(sourceFolderOf(right.relativePath), undefined, { numeric: true, sensitivity: 'base' })
      return multiplier * (folder || left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' }))
    }
    return multiplier * left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' })
  })
}

function exifCaptureTime(item: LiteMediaRecord): number | undefined {
  return item.captureTimeSource === 'exif' && typeof item.effectiveCaptureTime === 'number' && Number.isFinite(item.effectiveCaptureTime)
    ? item.effectiveCaptureTime
    : undefined
}

function comparePath(left: LiteMediaRecord, right: LiteMediaRecord): number {
  return left.relativePath.localeCompare(right.relativePath, undefined, { numeric: true, sensitivity: 'base' })
}
