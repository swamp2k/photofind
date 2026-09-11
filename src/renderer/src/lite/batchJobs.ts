export type BatchAnalysis = 'people' | 'products' | 'quality' | 'duplicates'
export type BatchJobStatus = 'queued' | 'running' | 'complete' | 'failed' | 'stopped'

export interface BatchJob {
  id: string
  libraryId: string
  libraryName: string
  analysis: BatchAnalysis
  status: BatchJobStatus
  error?: string
}

export interface BatchJobUpdate {
  jobs: BatchJob[]
  running: boolean
}

export interface BatchRunOptions {
  signal?: AbortSignal
  onUpdate?(update: BatchJobUpdate): void
}

export type BatchExecutor = (job: BatchJob, signal: AbortSignal) => Promise<void>

export function createBatchJobs(
  libraries: ReadonlyArray<Pick<BatchJob, 'libraryId' | 'libraryName'>>,
  analyses: ReadonlyArray<BatchAnalysis>
): BatchJob[] {
  const jobs: BatchJob[] = []
  for (const library of libraries) {
    for (const analysis of analyses) {
      jobs.push({ id: `${library.libraryId}:${analysis}`, libraryId: library.libraryId, libraryName: library.libraryName, analysis, status: 'queued' })
    }
  }
  return jobs
}

/** Runs one analysis at a time. Completed jobs are skipped when resuming. */
export async function runBatchJobs(
  initialJobs: ReadonlyArray<BatchJob>,
  execute: BatchExecutor,
  options: BatchRunOptions = {}
): Promise<BatchJob[]> {
  const jobs = initialJobs.map((job) => ({ ...job }))
  const signal = options.signal ?? new AbortController().signal
  const publish = (running: boolean): void => options.onUpdate?.({ jobs: jobs.map((job) => ({ ...job })), running })
  publish(true)
  for (const job of jobs) {
    if (signal.aborted) break
    if (job.status === 'complete') continue
    job.status = 'running'
    job.error = undefined
    publish(true)
    try {
      await execute(job, signal)
      job.status = signal.aborted ? 'stopped' : 'complete'
    } catch (cause) {
      if (isAbort(cause) || signal.aborted) {
        job.status = 'stopped'
      } else {
        job.status = 'failed'
        job.error = cause instanceof Error ? cause.message : 'The analysis failed.'
      }
    }
    publish(true)
  }
  for (const job of jobs) if (job.status === 'running') job.status = 'stopped'
  publish(false)
  return jobs
}

export function batchAnalysisLabel(analysis: BatchAnalysis): string {
  if (analysis === 'people') return 'People'
  if (analysis === 'products') return 'Product photos'
  if (analysis === 'quality') return 'Quality'
  return 'Duplicates'
}

function isAbort(cause: unknown): boolean {
  return cause instanceof DOMException && cause.name === 'AbortError'
}

/** Only queue metadata is restored; an interrupted job always requires an explicit resume. */
export function restoreBatchJobs(raw: string | null): BatchJob[] {
  if (!raw) return []
  const value: unknown = JSON.parse(raw)
  if (!Array.isArray(value)) throw new Error('The saved batch queue is not valid.')
  const ids = new Set<string>()
  return value.map((job: unknown): BatchJob => {
    if (!job || typeof job !== 'object') throw new Error('The saved batch queue contains an invalid job.')
    const row = job as Record<string, unknown>
    if (typeof row.id !== 'string' || typeof row.libraryId !== 'string' || typeof row.libraryName !== 'string'
      || !['people', 'products', 'quality', 'duplicates'].includes(String(row.analysis))
      || !['queued', 'running', 'complete', 'failed', 'stopped'].includes(String(row.status)) || ids.has(row.id)) {
      throw new Error('The saved batch queue contains an invalid job.')
    }
    ids.add(row.id)
    return { id: row.id, libraryId: row.libraryId, libraryName: row.libraryName,
      analysis: row.analysis as BatchAnalysis, status: row.status === 'running' ? 'stopped' : row.status as BatchJobStatus,
      ...(typeof row.error === 'string' ? { error: row.error } : {}) }
  })
}
