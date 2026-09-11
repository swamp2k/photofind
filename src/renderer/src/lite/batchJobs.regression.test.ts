import { describe, expect, it, vi } from 'vitest'
import { createBatchJobs, restoreBatchJobs, runBatchJobs } from './batchJobs'

const queue = () => createBatchJobs([{ libraryId: 'one', libraryName: 'One' }], ['quality', 'products', 'duplicates'])

describe('batch queue regression coverage', () => {
  it('restores completed results and turns in-flight work into an explicitly resumable stopped job', () => {
    const saved = queue()
    saved[0].status = 'complete'
    saved[1].status = 'running'
    saved[2].status = 'failed'
    saved[2].error = 'Permission lost'
    const restored = restoreBatchJobs(JSON.stringify(saved))
    expect(restored.map(job => job.status)).toEqual(['complete', 'stopped', 'failed'])
    expect(restored[2].error).toBe('Permission lost')
  })

  it('rejects malformed, unknown and duplicate queue records', () => {
    expect(() => restoreBatchJobs('{')).toThrow()
    expect(() => restoreBatchJobs('{}')).toThrow()
    expect(() => restoreBatchJobs(JSON.stringify([{ ...queue()[0], analysis: 'upload' }]))).toThrow()
    expect(() => restoreBatchJobs(JSON.stringify([queue()[0], queue()[0]]))).toThrow()
    expect(restoreBatchJobs(null)).toEqual([])
  })
  it('resumes without rerunning completed work or mutating the saved input', async () => {
    const initial = queue()
    initial[0].status = 'complete'
    initial[1].status = 'stopped'
    const before = structuredClone(initial)
    const executed: string[] = []
    const result = await runBatchJobs(initial, async job => { executed.push(job.analysis) })
    expect(executed).toEqual(['products', 'duplicates'])
    expect(initial).toEqual(before)
    expect(result.every(job => job.status === 'complete')).toBe(true)
  })

  it('starts no work when already stopped', async () => {
    const controller = new AbortController()
    controller.abort()
    const execute = vi.fn()
    const initial = queue()
    expect(await runBatchJobs(initial, execute, { signal: controller.signal })).toEqual(initial)
    expect(execute).not.toHaveBeenCalled()
  })

  it('stops an in-flight operation before starting the next job and publishes independent snapshots', async () => {
    const controller = new AbortController()
    const snapshots: string[][] = []
    const execute = vi.fn(async () => {
      controller.abort()
      controller.signal.throwIfAborted()
    })
    const result = await runBatchJobs(queue(), execute, {
      signal: controller.signal,
      onUpdate: update => { snapshots.push(update.jobs.map(job => job.status)) }
    })
    expect(execute).toHaveBeenCalledTimes(1)
    expect(result.map(job => job.status)).toEqual(['stopped', 'queued', 'queued'])
    expect(snapshots[0]).toEqual(['queued', 'queued', 'queued'])
    expect(snapshots.at(-1)).toEqual(['stopped', 'queued', 'queued'])
  })
})
