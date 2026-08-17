import { describe, expect, it } from 'vitest'
import { buildExportEventNameMap, buildExportSelection, exportEventName, splitEventsForExportFilter } from './curationSelection'
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

  it('uses only explicit or known event names for export folders and carries the event start time', () => {
    const generated = event('generated', ['a'], { title: 'Jan 5, 2019 – Jan 7, 2019 · Library root', significance: 'moment' })
    const named = event('named', ['b'], { title: 'Motorcycle trip', customTitle: 'Motorcycle trip', significance: 'moment', startTime: 20 })
    const holiday = event('holiday', ['c'], { title: 'Nytårsdag', knownDateTitle: 'Nytårsdag', significance: 'known-date', startTime: 30 })
    const promoted = { ...event('promoted', ['d'], { title: 'Family day', startTime: 40 }), promotedToKnown: true } as LiteEventRecord

    expect(exportEventName(generated)).toBeUndefined()
    expect(exportEventName(named)).toBe('Motorcycle trip')
    expect(exportEventName(holiday)).toBe('Nytårsdag')
    expect(exportEventName(promoted)).toBe('Family day')

    const names = buildExportEventNameMap([generated, named, holiday, promoted])
    expect(names.has('a')).toBe(false)
    expect(names.get('b')).toEqual({ name: 'Motorcycle trip', startTime: 20 })
    expect(names.get('c')).toEqual({ name: 'Nytårsdag', startTime: 30 })
    expect(names.get('d')).toEqual({ name: 'Family day', startTime: 40 })
  })

  it('anchors nearby same-named event fragments to the earliest fragment', () => {
    const day = 24 * 60 * 60 * 1000
    const augustStart = new Date(2020, 7, 28, 12, 0, 0).getTime()
    const main = event('summer-main', ['august-photo'], {
      title: 'Sommerferie Bøsøre med Maria og Morten',
      customTitle: 'Sommerferie Bøsøre med Maria og Morten',
      startTime: augustStart,
      endTime: augustStart + 3 * day
    })
    const stray = event('summer-stray', ['september-photo'], {
      title: 'Sommerferie Bøsøre med Maria og Morten',
      customTitle: 'Sommerferie Bøsøre med Maria og Morten',
      startTime: augustStart + 4 * day,
      endTime: augustStart + 4 * day
    })

    const names = buildExportEventNameMap([main, stray])
    expect(names.get('august-photo')).toEqual({ name: 'Sommerferie Bøsøre med Maria og Morten', startTime: augustStart })
    expect(names.get('september-photo')).toEqual({ name: 'Sommerferie Bøsøre med Maria og Morten', startTime: augustStart })
  })

  it('keeps distant recurring events with the same title separate', () => {
    const year = 365 * 24 * 60 * 60 * 1000
    const first = event('new-year-2020', ['a'], { title: 'Nytårsdag', knownDateTitle: 'Nytårsdag', significance: 'known-date', startTime: 100, endTime: 200 })
    const second = event('new-year-2021', ['b'], { title: 'Nytårsdag', knownDateTitle: 'Nytårsdag', significance: 'known-date', startTime: 100 + year, endTime: 200 + year })
    const names = buildExportEventNameMap([first, second])

    expect(names.get('a')?.startTime).toBe(100)
    expect(names.get('b')?.startTime).toBe(100 + year)
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
