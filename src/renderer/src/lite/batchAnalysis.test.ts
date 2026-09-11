import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BatchJob } from './batchJobs'
import type { LiteLibraryRecord, LiteMediaRecord } from './types'

const mocks = vi.hoisted(() => ({
  loadMedia: vi.fn(), loadPeople: vi.fn(), putMediaRecords: vi.fn(), savePeopleState: vi.fn(), queryReadPermission: vi.fn(),
  analyzeQuality: vi.fn(), analyzeSimilarity: vi.fn(), analyzePeople: vi.fn(), analyzeProductPhotos: vi.fn()
}))

vi.mock('./libraryDb', () => ({ loadMedia: mocks.loadMedia, loadPeople: mocks.loadPeople, putMediaRecords: mocks.putMediaRecords, savePeopleState: mocks.savePeopleState }))
vi.mock('./fileAccess', () => ({ queryReadPermission: mocks.queryReadPermission }))
vi.mock('./qualityAnalysis', () => ({ analyzeQuality: mocks.analyzeQuality }))
vi.mock('./similarityAnalysis', () => ({ analyzeSimilarity: mocks.analyzeSimilarity }))
vi.mock('./peopleAnalysis', () => ({ analyzePeople: mocks.analyzePeople }))
vi.mock('./productPhotoAnalysis', () => ({ analyzeProductPhotos: mocks.analyzeProductPhotos }))

function photo(id: string, libraryId = 'library-a'): LiteMediaRecord {
  return { id, libraryId, kind: 'image', name: `${id}.jpg`, relativePath: `${id}.jpg`, sizeBytes: 10, lastModified: 1, mimeType: 'image/jpeg', diagnostics: [], fileHandle: { getFile: vi.fn().mockResolvedValue(new File(['x'], `${id}.jpg`)) } } as unknown as LiteMediaRecord
}
function library(id = 'library-a', accessMode: LiteLibraryRecord['accessMode'] = 'handle'): LiteLibraryRecord {
  return { id, name: id, createdAt: 1, updatedAt: 1, fileCount: 1, imageCount: 1, rawCount: 0, videoCount: 0, sidecarCount: 0, unknownCount: 0, accessMode, rootHandle: accessMode === 'handle' ? { } as FileSystemDirectoryHandle : undefined }
}
function job(analysis: BatchJob['analysis']): BatchJob { return { id: `library-a:${analysis}`, libraryId: 'library-a', libraryName: 'library-a', analysis, status: 'queued' } }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.queryReadPermission.mockResolvedValue(true)
  mocks.loadMedia.mockResolvedValue([photo('one')])
  mocks.loadPeople.mockResolvedValue([])
  mocks.analyzeQuality.mockResolvedValue([photo('one')]); mocks.analyzeSimilarity.mockResolvedValue([photo('one')]); mocks.analyzeProductPhotos.mockResolvedValue([photo('one')])
  mocks.analyzePeople.mockResolvedValue({ people: [], changed: [], items: [photo('one')] })
})

describe('batch analysis adapter', () => {
  it('dispatches each analysis and loads the media fresh for each execution', async () => {
    const { executeBatchAnalysis } = await import('./batchAnalysis')
    mocks.analyzeQuality.mockResolvedValue([photo('one')]); mocks.analyzeSimilarity.mockResolvedValue([photo('one')]); mocks.analyzeProductPhotos.mockResolvedValue([photo('one')])
    const signal = new AbortController().signal
    const files = new Map<string, File>()
    for (const analysis of ['quality', 'duplicates', 'products', 'people'] as const) await executeBatchAnalysis(job(analysis), library(), files, signal)
    expect(mocks.loadMedia).toHaveBeenCalledTimes(4)
    expect(mocks.analyzeQuality).toHaveBeenCalledOnce(); expect(mocks.analyzeSimilarity).toHaveBeenCalledOnce(); expect(mocks.analyzeProductPhotos).toHaveBeenCalledOnce(); expect(mocks.analyzePeople).toHaveBeenCalledOnce()
  })

  it('uses the fresh records and saves People state to the job library', async () => {
    const { executeBatchAnalysis } = await import('./batchAnalysis')
    mocks.analyzeQuality.mockResolvedValue([photo('new')])
    const first = [photo('old')]; const second = [photo('new')]
    mocks.loadMedia.mockResolvedValueOnce(first).mockResolvedValueOnce(second)
    mocks.analyzePeople.mockResolvedValue({ people: [{ id: 'p', libraryId: 'library-a', faceRefs: [] }], changed: [], items: [photo('old')] })
    await executeBatchAnalysis(job('people'), library(), new Map(), new AbortController().signal)
    await executeBatchAnalysis(job('quality'), library(), new Map(), new AbortController().signal)
    expect(mocks.analyzePeople.mock.calls[0][0]).toBe(first); expect(mocks.analyzeQuality.mock.calls[0][0]).toBe(second)
    expect(mocks.savePeopleState).toHaveBeenCalledWith('library-a', expect.any(Array), expect.any(Array))
  })

  it('blocks missing permission and selection files before any service runs', async () => {
    const { checkBatchLibraryAccess, executeBatchAnalysis } = await import('./batchAnalysis')
    mocks.queryReadPermission.mockResolvedValue(false)
    await expect(checkBatchLibraryAccess(library(), new Map())).rejects.toThrow(/reconnect/i)
    expect(mocks.loadMedia).not.toHaveBeenCalled()
    mocks.queryReadPermission.mockResolvedValue(true)
    await expect(executeBatchAnalysis(job('quality'), library('library-a', 'selection'), new Map(), new AbortController().signal)).rejects.toThrow(/reselect|session|file/i)
    expect(mocks.analyzeQuality).not.toHaveBeenCalled()
  })

  it('keeps per-photo failures visible after persistence', async () => {
    const { executeBatchAnalysis } = await import('./batchAnalysis')
    const failed = { ...photo('bad'), qualityStatus: 'failed', qualityError: 'decode failed' }
    mocks.analyzeQuality.mockResolvedValue([failed])
    await expect(executeBatchAnalysis(job('quality'), library(), new Map(), new AbortController().signal)).rejects.toThrow(/could not|diagnostics/i)
    expect(mocks.analyzeQuality).toHaveBeenCalled()
  })
})
