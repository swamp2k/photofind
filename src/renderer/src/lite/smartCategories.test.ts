import { describe, expect, it } from 'vitest'
import { DEFAULT_SMART_CATEGORY_SETTINGS, findLikelyProductPhotos, normalizeSmartCategorySettings, productPhotoThreshold, productSemanticFloor, setProductPhotoOverride } from './smartCategories'
import type { LiteMediaRecord, LiteSimilarityGroup } from './types'

describe('smart categories', () => {
  it('normalizes missing product-photo settings', () => {
    expect(normalizeSmartCategorySettings(undefined)).toEqual(DEFAULT_SMART_CATEGORY_SETTINGS)
    expect(productPhotoThreshold('conservative')).toBeGreaterThan(productPhotoThreshold('balanced'))
    expect(productPhotoThreshold('balanced')).toBeGreaterThan(productPhotoThreshold('broad'))
    expect(productSemanticFloor('conservative')).toBeGreaterThan(productSemanticFloor('balanced'))
  })

  it('does not classify an ordinary photo series without semantic product evidence', () => {
    const items = [0, 1, 2, 3].map((index) => image(`family${index}`, 1_000 + index * 20_000))
    const groups: LiteSimilarityGroup[] = [{
      id: 'similar-family',
      kind: 'similar',
      itemIds: items.map((item) => item.id),
      reason: 'fixture'
    }]
    expect(findLikelyProductPhotos(items, groups, DEFAULT_SMART_CATEGORY_SETTINGS.productPhotos)).toHaveLength(0)
  })

  it('finds a semantically plausible visually related no-people product series', () => {
    const items = [0, 1, 2, 3].map((index) => image(`p${index}`, 1_000 + index * 20_000, {
      productAnalysisStatus: 'ready',
      productSemanticScore: 0.58,
      productSemanticLabel: 'a used item photographed for an online marketplace sale',
      faceAnalysisStatus: 'ready',
      faces: []
    }))
    const groups: LiteSimilarityGroup[] = [{
      id: 'similar-products',
      kind: 'similar',
      itemIds: items.map((item) => item.id),
      reason: 'fixture'
    }]
    const matches = findLikelyProductPhotos(items, groups, DEFAULT_SMART_CATEGORY_SETTINGS.productPhotos)
    expect(matches.map((match) => match.item.id)).toEqual([...items].reverse().map((item) => item.id))
    expect(matches.every((match) => match.score >= productPhotoThreshold('balanced'))).toBe(true)
  })

  it('uses people as an optional negative signal after semantic matching', () => {
    const item = image('person-with-item', 1_000, {
      productAnalysisStatus: 'ready',
      productSemanticScore: 0.7,
      faceAnalysisStatus: 'ready',
      faces: [{ id: 'face', box: [0.1, 0.1, 0.2, 0.2], confidence: 0.9, embedding: [0.1] }]
    })
    expect(findLikelyProductPhotos([item], [], DEFAULT_SMART_CATEGORY_SETTINGS.productPhotos)).toHaveLength(0)

    const withoutPeoplePenalty = findLikelyProductPhotos([item], [], {
      ...DEFAULT_SMART_CATEGORY_SETTINGS.productPhotos,
      preferNoPeople: false
    })
    expect(withoutPeoplePenalty).toHaveLength(1)
  })

  it('allows an explicit sale folder without semantic analysis', () => {
    const item = image('listed', 1_000, { relativePath: 'DBA/listed.jpg' })
    expect(findLikelyProductPhotos([item], [], DEFAULT_SMART_CATEGORY_SETTINGS.productPhotos).map((match) => match.item.id)).toEqual(['listed'])
  })

  it('honors explicit include and exclude corrections', () => {
    const included = image('included', 1_000, { productPhotoOverride: true })
    const excluded = image('excluded', 2_000, { productPhotoOverride: false, relativePath: 'Marketplace/excluded.jpg' })
    const matches = findLikelyProductPhotos([included, excluded], [], DEFAULT_SMART_CATEGORY_SETTINGS.productPhotos)
    expect(matches.map((match) => match.item.id)).toEqual(['included'])
    expect(matches[0].manuallyIncluded).toBe(true)
  })

  it('persists and clears a manual correction on only the requested image', () => {
    const items = [image('one', 1_000), image('two', 2_000)]
    const excluded = setProductPhotoOverride(items, 'two', false, 123)
    expect(excluded.changed?.productPhotoOverride).toBe(false)
    expect(excluded.changed?.productPhotoOverrideUpdatedAt).toBe(123)
    expect(excluded.items[0]).toBe(items[0])

    const automatic = setProductPhotoOverride(excluded.items, 'two', null, 456)
    expect(automatic.changed?.productPhotoOverride).toBeUndefined()
    expect(automatic.changed?.productPhotoOverrideUpdatedAt).toBe(456)
  })
})

function image(id: string, captureTime: number, overrides: Partial<LiteMediaRecord> = {}): LiteMediaRecord {
  return {
    id,
    libraryId: 'library',
    relativePath: `${id}.jpg`,
    name: `${id}.jpg`,
    kind: 'image',
    sizeBytes: 1_000_000,
    lastModified: captureTime,
    mimeType: 'image/jpeg',
    effectiveCaptureTime: captureTime,
    captureTimeSource: 'exif',
    width: 3000,
    height: 4000,
    cameraMake: 'Example',
    cameraModel: 'Phone',
    ...overrides
  }
}
