import type { BatchJob } from './batchJobs'
import { queryReadPermission } from './fileAccess'
import { loadMedia, loadPeople, putMediaRecords, savePeopleState } from './libraryDb'
import { analyzePeople } from './peopleAnalysis'
import { analyzeProductPhotos } from './productPhotoAnalysis'
import { analyzeQuality } from './qualityAnalysis'
import { analyzeSimilarity } from './similarityAnalysis'
import type { LiteLibraryRecord, LiteMediaRecord } from './types'

export interface BatchAnalysisProgress {
  complete: number
  total: number
  reused: number
  currentPath: string
}

/** Never prompts: reconnect is a separate action taken before unattended work. */
export async function checkBatchLibraryAccess(library: LiteLibraryRecord, sessionFiles: Map<string, File>): Promise<void> {
  if (library.rootHandle) {
    if (!await queryReadPermission(library.rootHandle)) throw new Error('Folder access needs reconnecting. Use Reconnect, then resume the queue.')
  } else if (library.accessMode === 'selection') {
    const images = (await loadMedia(library.id)).filter(item => item.kind === 'image')
    if (images.some(item => !sessionFiles.has(item.id))) throw new Error('Reselect this folder in Library to restore file access, then return to Batch jobs.')
  } else {
    throw new Error('The saved folder handle is unavailable. Reconnect this index before running analysis.')
  }
}

export async function executeBatchAnalysis(
  job: BatchJob,
  library: LiteLibraryRecord,
  sessionFiles: Map<string, File>,
  signal: AbortSignal,
  onProgress?: (progress: BatchAnalysisProgress) => void
): Promise<void> {
  signal.throwIfAborted()
  await checkBatchLibraryAccess(library, sessionFiles)
  const items = await loadMedia(library.id)
  signal.throwIfAborted()
  const resolveFile = async (item: LiteMediaRecord): Promise<File | null> => {
    signal.throwIfAborted()
    const sessionFile = sessionFiles.get(item.id)
    if (sessionFile) return sessionFile
    // Keep the original read error actionable instead of converting it to a success-shaped result.
    return item.fileHandle ? item.fileHandle.getFile() : null
  }
  const options = { resolveFile, persistBatch: putMediaRecords, signal, onProgress }
  let result: LiteMediaRecord[]
  if (job.analysis === 'quality') result = await analyzeQuality(items, options)
  else if (job.analysis === 'duplicates') result = await analyzeSimilarity(items, options)
  else if (job.analysis === 'products') result = await analyzeProductPhotos(items, options)
  else {
    const peopleResult = await analyzePeople(items, { ...options, existingPeople: await loadPeople(library.id) })
    await savePeopleState(library.id, peopleResult.people, peopleResult.changed)
    result = peopleResult.items
  }
  signal.throwIfAborted()
  const failures = result.filter(item => item.kind === 'image' && (
    job.analysis === 'quality' ? item.qualityStatus === 'failed' :
    job.analysis === 'duplicates' ? item.similarityStatus === 'failed' || Boolean(item.similarityError) :
    job.analysis === 'products' ? item.productAnalysisStatus === 'failed' : item.faceAnalysisStatus === 'failed'
  ))
  if (failures.length) throw new Error(`${failures.length} photo${failures.length === 1 ? '' : 's'} could not be fully analysed. Saved results are retained; open this index's Diagnostics for details, then retry unfinished jobs.`)
}
