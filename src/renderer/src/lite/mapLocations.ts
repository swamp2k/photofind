import { hasLocation } from './filters'
import type { LiteMediaRecord } from './types'

export interface LiteMappedLocation {
  key: string
  latitude: number
  longitude: number
  items: LiteMediaRecord[]
}

const COORDINATE_PRECISION = 6

export function groupMappedLocations(items: LiteMediaRecord[]): LiteMappedLocation[] {
  const grouped = new Map<string, LiteMappedLocation>()

  for (const item of items) {
    if (!hasLocation(item)) continue
    const key = mappedLocationKey(item.latitude!, item.longitude!)
    const current = grouped.get(key)
    if (current) {
      current.items.push(item)
      continue
    }
    grouped.set(key, {
      key,
      latitude: item.latitude!,
      longitude: item.longitude!,
      items: [item]
    })
  }

  return [...grouped.values()].map((location) => ({
    ...location,
    items: [...location.items].sort((left, right) => {
      const leftTime = left.effectiveCaptureTime ?? left.lastModified
      const rightTime = right.effectiveCaptureTime ?? right.lastModified
      return leftTime - rightTime || left.relativePath.localeCompare(right.relativePath)
    })
  }))
}

export function mappedLocationKey(latitude: number, longitude: number): string {
  return `${latitude.toFixed(COORDINATE_PRECISION)},${longitude.toFixed(COORDINATE_PRECISION)}`
}
