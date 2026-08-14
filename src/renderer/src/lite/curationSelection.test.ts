import { describe, expect, it } from 'vitest'
import { buildExportSelection, splitEventsForExportFilter } from './curationSelection'
import type { LiteEventRecord, LiteMediaRecord } from './types'

function photo(id: string, reviewState: LiteMediaRecord['reviewState'] = 'unreviewed'): LiteMediaRecord {
  return {
    id,
    libraryId: 'library',
    relativePath: `${id}.jpg`,
    name: `${id}.jpg`,
    kind: 'image',
    sizeBytes: 1,
    lastModified: 1,
    mimeType: 'image/jpeg',
    reviewState
  }
}

function event(id: string, itemIds: string[], extra: Partial<LiteEventRecord> = {}): LiteEventRecord {
  return {
    id,
    libraryId: 'library',
    title: id,
    startTime: 1,
    endTime: 2,
    itemIds,
    personIds: [],
    folderPaths: [],
    evidence: [],
    ...extra
  }
}

describe('curation export selection', () => {
  it('unions Keep and known-event photos without duplicates', () => {
    const items = [photo('keep', 'keep'), photo('known'), photo('both', 'keep'), photo('other')]
    const known = event('known-event', ['known', 'both'], { significance: 'known-date' })
    const selected = buildExportSelection(items, new Set(['keep', 'known']), [known])
    expect(selected.map((item) => item.id)).toEqual(['keep', 'known', 'both'])
  })

  it('supports Maybe as an independent checked scope', () => {
    const items = [photo('keep', 'keep'), photo('maybe', 'maybe')]
    const selected = buildExportSelection(items, new Set(['maybe']), [])
    expect(selected.map((item) => item.id)).toEqual(['maybe'])
  })

  it('applies the event filter after combining scopes', () => {
    const items = [photo('a', 'keep'), photo('b', 'keep'), photo('c')]
    const known = event('known-event', ['b', 'c'], { significance: 'known-date' })
    const selected = buildExportSelection(items, new Set(['keep', 'known']), [known], known)
    expect(selected.map((item) => item.id)).toEqual(['b', 'c'])
  })

  it('orders known events before detected events for the filter menu', () => {
    const known = event('known', ['a'], { significance: 'known-date', startTime: 2 })
    const promoted = { ...event('promoted', ['b'], { startTime: 1 }), promotedToKnown: true } as LiteEventRecord
    const detected = event('detected', ['c'], { startTime: 0 })
    const split = splitEventsForExportFilter([detected, known, promoted])
    expect(split.known.map((item) => item.id)).toEqual(['promoted', 'known'])
    expect(split.detected.map((item) => item.id)).toEqual(['detected'])
  })
})
