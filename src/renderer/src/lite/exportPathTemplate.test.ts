import { describe, expect, it } from 'vitest'
import { previewExportFolderTemplate, renderExportFolderTemplate, validateExportFolderTemplate } from './exportPathTemplate'
import type { LiteMediaRecord } from './types'

function photo(time: number): LiteMediaRecord {
  return {
    id: 'library:IMG.JPG',
    libraryId: 'library',
    relativePath: 'IMG.JPG',
    name: 'IMG.JPG',
    kind: 'image',
    sizeBytes: 10,
    lastModified: 100,
    mimeType: 'image/jpeg',
    effectiveCaptureTime: time
  }
}

describe('dynamic export folder templates', () => {
  const captured = new Date(2016, 3, 25, 12, 0, 0).getTime()

  it('renders repeated placeholders and literal custom text', () => {
    expect(renderExportFolderTemplate(photo(captured), '{YYYY}/{YYYY}.{MM}.{DD} - {EVENT}', 'MC kørsel til Bakken'))
      .toEqual(['2016', '2016.04.25 - MC kørsel til Bakken'])
  })

  it('cleans separators when an optional event name is absent', () => {
    expect(renderExportFolderTemplate(photo(captured), '{YYYY}/{YYYY}.{MM}.{DD} - {EVENT}'))
      .toEqual(['2016', '2016.04.25'])
    expect(renderExportFolderTemplate(photo(captured), '{YYYY}/{MM} - {EVENT}'))
      .toEqual(['2016', '04'])
  })

  it('supports a flat export with an empty template', () => {
    expect(renderExportFolderTemplate(photo(captured), '')).toEqual([])
    expect(previewExportFolderTemplate(photo(captured), '')).toBe('(export root)')
  })

  it('sanitizes event text without changing the template structure', () => {
    expect(renderExportFolderTemplate(photo(captured), '{YYYY}/{MM} - {EVENT}', 'Spain: France?'))
      .toEqual(['2016', '04 - Spain_ France_'])
  })

  it('rejects unknown or malformed placeholders', () => {
    expect(validateExportFolderTemplate('{YYYY}/{FOO}')).toContain('{FOO}')
    expect(validateExportFolderTemplate('{YYYY/{MM}')).toContain('unmatched brace')
  })
})
