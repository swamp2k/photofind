import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LiteMediaRecord } from './types'

const mocks = vi.hoisted(() => ({
  classify: vi.fn(),
  pipeline: vi.fn(),
  decode: vi.fn(),
  close: vi.fn()
}))

vi.mock('./globalProcesses', () => ({ startGlobalProcess: () => ({ update: vi.fn(), finish: vi.fn() }) }))
vi.mock('./imageDecode', () => ({ decodeBitmapForAnalysis: mocks.decode }))
vi.mock('@huggingface/transformers', () => ({
  env: { backends: { onnx: { wasm: {} } } },
  pipeline: mocks.pipeline,
  RawImage: { fromCanvas: () => ({}) }
}))

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  mocks.pipeline.mockResolvedValue(mocks.classify)
  mocks.classify.mockResolvedValue([
    { label: 'a used item listed for sale online', score: 0.9 },
    { label: 'a marketplace product listing', score: 0.8 },
    { label: 'clothing or shoes displayed for sale', score: 0.3 },
    { label: 'electronics or a household item displayed for sale', score: 0.2 },
    { label: 'a bicycle, tool, toy, or piece of equipment displayed for sale', score: 0.1 },
    { label: 'a family snapshot with people', score: 0.1 },
    { label: 'a child playing or posing', score: 0.1 },
    { label: 'people eating, visiting, or spending time together', score: 0.1 },
    { label: 'a travel, landscape, nature, or outdoor memory', score: 0.1 },
    { label: 'casual everyday home life rather than an item for sale', score: 0.1 }
  ])
  mocks.decode.mockResolvedValue({ width: 224, height: 224, close: mocks.close })
  vi.stubGlobal('window', { location: { origin: 'http://localhost:5173', hostname: 'localhost' }, setTimeout, clearTimeout })
  vi.stubGlobal('navigator', {})
  vi.stubGlobal('document', { createElement: () => ({ getContext: () => ({ drawImage: vi.fn() }) }) })
})

afterEach(() => vi.unstubAllGlobals())

function photo(id: string): LiteMediaRecord {
  return { id, libraryId: 'test', kind: 'image', name: `${id}.jpg`, relativePath: `${id}.jpg`, sizeBytes: 123, lastModified: 1, mimeType: 'image/jpeg', diagnostics: [] } as LiteMediaRecord
}

describe('product analysis completion', () => {
  it('persists every successful result including the final partial batch and produces matches', async () => {
    const { analyzeProductPhotos } = await import('./productPhotoAnalysis')
    const { findLikelyProductPhotos, DEFAULT_SMART_CATEGORY_SETTINGS } = await import('./smartCategories')
    const batches: LiteMediaRecord[][] = []
    const result = await analyzeProductPhotos(Array.from({ length: 5 }, (_, i) => photo(String(i))), {
      resolveFile: async () => new File(['disposable mock bytes'], 'fixture.jpg'),
      persistBatch: async (items) => { batches.push([...items]) }
    })
    expect(batches.map((batch) => batch.length)).toEqual([4, 1])
    expect(result.every((item) => item.productAnalysisStatus === 'ready')).toBe(true)
    expect(findLikelyProductPhotos(result, [], DEFAULT_SMART_CATEGORY_SETTINGS.productPhotos)).toHaveLength(5)
    expect(mocks.close).toHaveBeenCalledTimes(5)
  })

  it('persists per-photo failures and reports them instead of silently returning no results', async () => {
    const { analyzeProductPhotos } = await import('./productPhotoAnalysis')
    const persistBatch = vi.fn().mockResolvedValue(undefined)
    const onProgress = vi.fn()
    const result = await analyzeProductPhotos([photo('missing')], {
      resolveFile: async () => null, persistBatch, onProgress
    })
    expect(result[0].productAnalysisStatus).toBe('failed')
    expect(result[0].productAnalysisError).toContain('Reconnect the source folder')
    expect(persistBatch).toHaveBeenCalledWith(result)
    expect(onProgress).toHaveBeenLastCalledWith(expect.objectContaining({ complete: 1, failed: 1 }))
  })

  it('stores invalid neutral model output as a visible failure', async () => {
    mocks.classify.mockResolvedValue([])
    const { analyzeProductPhotos } = await import('./productPhotoAnalysis')
    const persistBatch = vi.fn().mockResolvedValue(undefined)
    const result = await analyzeProductPhotos([photo('neutral')], {
      resolveFile: async () => new File(['fixture'], 'fixture.jpg'), persistBatch
    })
    expect(result[0].productAnalysisStatus).toBe('failed')
    expect(result[0].productAnalysisError).toContain('no usable product evidence')
    expect(result[0].productSemanticScore).toBeUndefined()
  })

  it('rejects model-load failures before any records are saved', async () => {
    mocks.pipeline.mockRejectedValue(new Error('model unavailable'))
    const { analyzeProductPhotos } = await import('./productPhotoAnalysis')
    const persistBatch = vi.fn()
    await expect(analyzeProductPhotos([photo('one')], {
      resolveFile: async () => null, persistBatch
    })).rejects.toThrow('model unavailable')
    expect(persistBatch).not.toHaveBeenCalled()
  })

  it('rejects persistence failures so completion cannot be reported as successful', async () => {
    const { analyzeProductPhotos } = await import('./productPhotoAnalysis')
    await expect(analyzeProductPhotos([photo('one')], {
      resolveFile: async () => new File(['fixture'], 'fixture.jpg'),
      persistBatch: async () => { throw new Error('disk quota exceeded') }
    })).rejects.toThrow('disk quota exceeded')
  })
})
