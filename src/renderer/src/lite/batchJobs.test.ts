import { describe, expect, it } from 'vitest'
import { createBatchJobs, runBatchJobs } from './batchJobs'

describe('batch job orchestration', () => {
  it('creates jobs in library then analysis order', () => {
    expect(createBatchJobs([{ libraryId: 'a', libraryName: 'A' }, { libraryId: 'b', libraryName: 'B' }], ['quality', 'products']).map((job) => job.id)).toEqual(['a:quality', 'a:products', 'b:quality', 'b:products'])
  })

  it('runs sequentially, continues after failures, and reports ordering', async () => {
    const jobs = createBatchJobs([{ libraryId: 'a', libraryName: 'A' }, { libraryId: 'b', libraryName: 'B' }], ['quality'])
    const order: string[] = []
    const result = await runBatchJobs(jobs, async (job) => {
      order.push(job.id)
      if (job.libraryId === 'a') throw new Error('bad index')
    })
    expect(order).toEqual(['a:quality', 'b:quality'])
    expect(result.map((job) => job.status)).toEqual(['failed', 'complete'])
    expect(result[0].error).toBe('bad index')
  })

  it('stops and resumes queued work', async () => {
    const jobs = createBatchJobs([{ libraryId: 'a', libraryName: 'A' }, { libraryId: 'b', libraryName: 'B' }], ['quality'])
    const controller = new AbortController()
    const first = await runBatchJobs(jobs, async (job) => {
      if (job.libraryId === 'a') controller.abort()
    }, { signal: controller.signal })
    expect(first.map((job) => job.status)).toEqual(['stopped', 'queued'])
    const order: string[] = []
    const second = await runBatchJobs(first, async (job) => { order.push(job.id) })
    expect(order).toEqual(['a:quality', 'b:quality'])
    expect(second.every((job) => job.status === 'complete')).toBe(true)
  })
})
