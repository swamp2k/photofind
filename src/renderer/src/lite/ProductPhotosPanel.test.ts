import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { LiteMediaRecord } from './types'

vi.mock('./PhotoResults', () => ({ PhotoResults: () => null }))
vi.mock('./productPhotoAnalysis', () => ({
  analyzeProductPhotos: vi.fn(), PRODUCT_MODEL_ID: 'test-model',
  PRODUCT_POSITIVE_PROMPTS: [], PRODUCT_NEGATIVE_PROMPTS: []
}))
import { ProductPhotosPanel } from './ProductPhotosPanel'

function render(overrides: Partial<LiteMediaRecord>): string {
  const item = { id: 'one', libraryId: 'test', kind: 'image', relativePath: 'fixture.jpg', name: 'fixture.jpg', sizeBytes: 1, lastModified: 1, mimeType: 'image/jpeg', diagnostics: [], ...overrides } as LiteMediaRecord
  return renderToStaticMarkup(createElement(ProductPhotosPanel, { items: [item], sessionFiles: new Map(), onReview: () => {} }))
}

describe('product analysis reporting', () => {
  it('shows the filename and underlying analysis failure rather than a no-match message', () => {
    const html = render({ productAnalysisStatus: 'failed', productAnalysisError: 'Reconnect the source folder and retry.' })
    expect(html).toContain('Some photos could not be analyzed.')
    expect(html).toContain('fixture.jpg: Reconnect the source folder and retry.')
    expect(html).not.toContain('No likely product photos at this sensitivity.')
  })

  it('distinguishes completed non-matches from photos that have never been analyzed', () => {
    expect(render({ productAnalysisStatus: 'ready', productSemanticScore: 0.1 })).toContain('No likely product photos at this sensitivity.')
    expect(render({})).toContain('Run semantic product analysis to get reliable matches.')
  })
})
