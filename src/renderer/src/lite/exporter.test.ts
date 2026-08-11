import { describe, expect, it } from 'vitest'
import { collisionCandidate, exportPathParts } from './exporter'
import type { LiteMediaRecord } from './types'

function photo(relativePath: string, effectiveCaptureTime?: number): LiteMediaRecord {
  return {
    id: `library:${relativePath}`,
    libraryId: 'library',
    relativePath,
    name: relativePath.split('/').at(-1) ?? relativePath,
    kind: 'image',
    sizeBytes: 10,
    lastModified: 100,
    mimeType: 'image/jpeg',
    ...(effectiveCaptureTime ? { effectiveCaptureTime } : {})
  }
}

describe('export path planning', () => {
  it('keeps flat exports flat', () => {
    expect(exportPathParts(photo('Trip/IMG_1.JPG'), 'flat', 'Motorcycle trip')).toEqual({ directories: [], fileName: 'IMG_1.JPG' })
  })

  it('preserves safe source folders', () => {
    expect(exportPathParts(photo('Trip/Day 1/IMG_1.JPG'), 'source-folders', 'Motorcycle trip')).toEqual({ directories: ['Trip', 'Day 1'], fileName: 'IMG_1.JPG' })
  })

  it('builds date folders and handles undated photos', () => {
    const captured = new Date(2025, 6, 9, 12, 0, 0).getTime()
    expect(exportPathParts(photo('IMG.JPG', captured), 'date-day').directories).toEqual(['2025', '07', '09'])
    expect(exportPathParts(photo('IMG.JPG'), 'date-month').directories).toEqual(['Undated'])
  })

  it('adds a named event to the month folder for date layouts', () => {
    const captured = new Date(2011, 5, 14, 12, 0, 0).getTime()
    expect(exportPathParts(photo('IMG.JPG', captured), 'date-month', 'Motorcycle trip').directories).toEqual(['2011', '06 - Motorcycle trip'])
    expect(exportPathParts(photo('IMG.JPG', captured), 'date-day', 'Motorcycle trip').directories).toEqual(['2011', '06 - Motorcycle trip', '14'])
  })

  it('sanitizes unsafe source and event path characters', () => {
    const captured = new Date(2011, 5, 14, 12, 0, 0).getTime()
    expect(exportPathParts(photo('Bad:Folder/IMG?.JPG'), 'source-folders')).toEqual({ directories: ['Bad_Folder'], fileName: 'IMG_.JPG' })
    expect(exportPathParts(photo('IMG.JPG', captured), 'date-month', 'Trip: Spain / France').directories).toEqual(['2011', '06 - Trip_ Spain _ France'])
  })
})

describe('collision naming', () => {
  it('adds a stable suffix before the extension', () => {
    expect(collisionCandidate('IMG.JPG', 1)).toBe('IMG.JPG')
    expect(collisionCandidate('IMG.JPG', 2)).toBe('IMG (2).JPG')
    expect(collisionCandidate('README', 3)).toBe('README (3)')
  })
})
