import { describe, expect, it } from 'vitest'
import { groupMappedLocations, mappedLocationKey } from './mapLocations'
import type { LiteMediaRecord } from './types'

function photo(id: string, latitude?: number, longitude?: number): LiteMediaRecord {
  return {
    id,
    libraryId: 'lib',
    relativePath: `${id}.jpg`,
    name: `${id}.jpg`,
    kind: 'image',
    sizeBytes: 1,
    lastModified: 1,
    mimeType: 'image/jpeg',
    ...(typeof latitude === 'number' ? { latitude } : {}),
    ...(typeof longitude === 'number' ? { longitude } : {})
  }
}

describe('mapped photo locations', () => {
  it('groups photos sharing the same manually assigned coordinates', () => {
    const locations = groupMappedLocations([
      photo('a', 43.5081234, 16.4409876),
      photo('b', 43.5081234, 16.4409876),
      photo('c', 56.2, 10.3)
    ])
    expect(locations).toHaveLength(2)
    expect(locations.find((location) => location.items.some((item) => item.id === 'a'))?.items.map((item) => item.id)).toEqual(['a', 'b'])
  })

  it('ignores photos without usable coordinates', () => {
    expect(groupMappedLocations([photo('a'), photo('b', 56.2, 10.3)])).toHaveLength(1)
  })

  it('uses sub-meter precision to avoid splitting equivalent stored coordinates', () => {
    expect(mappedLocationKey(43.50812341, 16.44098761)).toBe(mappedLocationKey(43.50812344, 16.44098764))
  })
})
