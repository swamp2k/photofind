import { describe, expect, it } from 'vitest'
import { collisionCandidate, exportModifiedTime, exportPathParts } from './exporter'
import type { LiteExportLayout, LiteMediaRecord } from './types'

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
  it('keeps legacy flat exports flat', () => {
    expect(exportPathParts(photo('Trip/IMG_1.JPG'), 'flat', 'Motorcycle trip')).toEqual({ directories: [], fileName: 'IMG_1.JPG' })
  })

  it('preserves safe source folders for the legacy source layout', () => {
    expect(exportPathParts(photo('Trip/Day 1/IMG_1.JPG'), 'source-folders', 'Motorcycle trip')).toEqual({ directories: ['Trip', 'Day 1'], fileName: 'IMG_1.JPG' })
  })

  it('builds legacy date folders and handles undated photos', () => {
    const captured = new Date(2025, 6, 9, 12, 0, 0).getTime()
    expect(exportPathParts(photo('IMG.JPG', captured), 'date-day').directories).toEqual(['2025', '07', '09'])
    expect(exportPathParts(photo('IMG.JPG'), 'date-month').directories).toEqual(['Undated'])
  })

  it('supports the requested dynamic year/date/event template', () => {
    const captured = new Date(2016, 3, 25, 12, 0, 0).getTime()
    const template = 'template:{YYYY}/{YYYY}.{MM}.{DD} - {EVENT}' as LiteExportLayout
    expect(exportPathParts(photo('IMG.JPG', captured), template, 'MC kørsel til Bakken').directories)
      .toEqual(['2016', '2016.04.25 - MC kørsel til Bakken'])
  })

  it('removes empty event decoration when a dynamic template has no named event', () => {
    const captured = new Date(2016, 3, 25, 12, 0, 0).getTime()
    const template = 'template:{YYYY}/{MM} - {EVENT}' as LiteExportLayout
    expect(exportPathParts(photo('IMG.JPG', captured), template).directories).toEqual(['2016', '04'])
  })

  it('allows literal text that happens to equal an old layout name', () => {
    const template = 'template:flat' as LiteExportLayout
    expect(exportPathParts(photo('IMG.JPG'), template).directories).toEqual(['flat'])
  })

  it('sanitizes unsafe source and event path characters', () => {
    const captured = new Date(2011, 5, 14, 12, 0, 0).getTime()
    expect(exportPathParts(photo('Bad:Folder/IMG?.JPG'), 'source-folders')).toEqual({ directories: ['Bad_Folder'], fileName: 'IMG_.JPG' })
    expect(exportPathParts(photo('IMG.JPG', captured), 'date-month', 'Trip: Spain / France').directories).toEqual(['2011', '06 - Trip_ Spain _ France'])
  })
})

describe('export modified-time restoration', () => {
  it('prefers the best known capture time over the current filesystem timestamp', () => {
    const captured = new Date(2011, 5, 14, 12, 34, 56).getTime()
    expect(exportModifiedTime(photo('IMG.JPG', captured))).toBe(captured)
  })

  it('falls back to the filesystem timestamp when no capture time is known', () => {
    expect(exportModifiedTime(photo('IMG.JPG'))).toBe(100)
  })
})

describe('collision naming', () => {
  it('adds a stable suffix before the extension', () => {
    expect(collisionCandidate('IMG.JPG', 1)).toBe('IMG.JPG')
    expect(collisionCandidate('IMG.JPG', 2)).toBe('IMG (2).JPG')
    expect(collisionCandidate('README', 3)).toBe('README (3)')
  })
})
