import { classifyMedia } from './classify'
import { copyReusableMetadata, enrichMediaMetadata, LITE_METADATA_VERSION } from './metadata'
import { copyStarredState } from './starred'
import { matchTakeoutSidecars, type LiteTakeoutMatch } from './takeout'
import type { LiteLibraryRecord, LiteMediaRecord, LiteScanProgress, LiteScanResult, LiteSelectionScanResult } from './types'

interface DirectoryHandleWithEntries extends FileSystemDirectoryHandle {
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>
}

export interface ExistingLibraryIdentity {
  id: string
  createdAt: number
}

export async function scanDirectory(
  rootHandle: FileSystemDirectoryHandle,
  existing: ExistingLibraryIdentity | null = null,
  existingMedia: LiteMediaRecord[] = [],
  onProgress?: (progress: LiteScanProgress) => void
): Promise<LiteScanResult> {
  const libraryId = existing?.id ?? crypto.randomUUID()
  const createdAt = existing?.createdAt ?? Date.now()
  const media: LiteMediaRecord[] = []
  const filesById = new Map<string, File>()
  let scannedFiles = 0

  async function walk(directory: FileSystemDirectoryHandle, parentSegments: string[]): Promise<void> {
    const iterableDirectory = directory as DirectoryHandleWithEntries
    for await (const [name, handle] of iterableDirectory.entries()) {
      if (name === '.DS_Store') continue
      const segments = [...parentSegments, name]
      const relativePath = segments.join('/')
      if (handle.kind === 'directory') {
        await walk(handle as FileSystemDirectoryHandle, segments)
        continue
      }

      const fileHandle = handle as FileSystemFileHandle
      const file = await fileHandle.getFile()
      const record = createMediaRecord(libraryId, relativePath, file, fileHandle)
      media.push(record)
      filesById.set(record.id, file)
      scannedFiles += 1
      if (scannedFiles === 1 || scannedFiles % 25 === 0) {
        onProgress?.({ phase: 'files', scannedFiles, currentPath: relativePath })
        await Promise.resolve()
      }
    }
  }

  await walk(rootHandle, [])
  const enriched = await enrichMedia(media, filesById, existingMedia, onProgress)
  const library = createLibraryRecord(libraryId, rootHandle.name, createdAt, enriched, 'handle', rootHandle)
  onProgress?.({ phase: 'metadata', scannedFiles, currentPath: '', metadataTotal: enrichableCount(enriched) })
  return { library, media: enriched }
}

export async function scanFileSelection(
  files: File[],
  existing: ExistingLibraryIdentity | null = null,
  existingMedia: LiteMediaRecord[] = [],
  onProgress?: (progress: LiteScanProgress) => void
): Promise<LiteSelectionScanResult> {
  if (files.length === 0) throw new Error('The selected folder did not contain any files.')

  const libraryId = existing?.id ?? crypto.randomUUID()
  const createdAt = existing?.createdAt ?? Date.now()
  const rootName = inferSelectionRootName(files)
  const media: LiteMediaRecord[] = []
  const sessionFiles = new Map<string, File>()

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index]
    const relativePath = normalizeSelectionPath(file, rootName)
    if (relativePath === '.DS_Store' || relativePath.endsWith('/.DS_Store')) continue
    const record = createMediaRecord(libraryId, relativePath, file)
    media.push(record)
    sessionFiles.set(record.id, file)
    const scannedFiles = index + 1
    if (scannedFiles === 1 || scannedFiles % 25 === 0) {
      onProgress?.({ phase: 'files', scannedFiles, currentPath: relativePath })
      await Promise.resolve()
    }
  }

  const enriched = await enrichMedia(media, sessionFiles, existingMedia, onProgress)
  const library = createLibraryRecord(libraryId, rootName, createdAt, enriched, 'selection')
  onProgress?.({ phase: 'metadata', scannedFiles: files.length, currentPath: '', metadataTotal: enrichableCount(enriched) })
  return { library, media: enriched, sessionFiles }
}

async function enrichMedia(
  records: LiteMediaRecord[],
  filesById: Map<string, File>,
  existingMedia: LiteMediaRecord[],
  onProgress?: (progress: LiteScanProgress) => void
): Promise<LiteMediaRecord[]> {
  const matches = matchTakeoutSidecars(records)
  const previousByPath = new Map(existingMedia.map((record) => [record.relativePath, record]))
  const output: LiteMediaRecord[] = []
  const total = enrichableCount(records)
  let metadataParsed = 0
  let metadataReused = 0

  for (const record of records) {
    if (record.kind === 'sidecar' || record.kind === 'unknown') {
      output.push({ ...record, metadataVersion: LITE_METADATA_VERSION, metadataStatus: 'not-applicable' })
      continue
    }

    const match = matches.get(record.id)
    const sidecarFingerprint = fingerprintMatch(match)
    const previous = previousByPath.get(record.relativePath)
    const canReuse = Boolean(
      previous
      && previous.sizeBytes === record.sizeBytes
      && previous.lastModified === record.lastModified
      && previous.metadataVersion === LITE_METADATA_VERSION
      && (previous.sidecarFingerprint ?? '') === sidecarFingerprint
    )

    let next: LiteMediaRecord
    if (canReuse && previous) {
      next = { ...copyReusableMetadata(record, previous), sidecarFingerprint }
      metadataReused += 1
    } else {
      const mediaFile = filesById.get(record.id)
      if (!mediaFile) {
        next = {
          ...record,
          metadataVersion: LITE_METADATA_VERSION,
          metadataStatus: 'failed',
          sidecarFingerprint,
          diagnostics: ['Local file handle was unavailable during metadata extraction.']
        }
      } else {
        const ambiguous = Boolean(match?.alternateSidecars?.length)
        const takeoutFile = match?.sidecar && !ambiguous ? filesById.get(match.sidecar.id) : undefined
        const enriched = await enrichMediaMetadata({ media: record, mediaFile, takeoutMatch: match, takeoutFile })
        next = { ...enriched, sidecarFingerprint }
      }
      metadataParsed += 1
    }

    output.push(copyPersistentAndDerivedState(next, previous))

    if ((metadataParsed + metadataReused) === 1 || (metadataParsed + metadataReused) % 10 === 0) {
      onProgress?.({
        phase: 'metadata',
        scannedFiles: records.length,
        currentPath: record.relativePath,
        metadataParsed,
        metadataReused,
        metadataTotal: total
      })
      await Promise.resolve()
    }
  }

  return output
}

function copyPersistentAndDerivedState(fresh: LiteMediaRecord, previous: LiteMediaRecord | undefined): LiteMediaRecord {
  if (!previous) return fresh
  const reviewed = copyStarredState({
    ...fresh,
    reviewState: previous.reviewState,
    reviewUpdatedAt: previous.reviewUpdatedAt
  }, previous)
  if (previous.sizeBytes !== fresh.sizeBytes || previous.lastModified !== fresh.lastModified) return reviewed
  return {
    ...reviewed,
    similarityVersion: previous.similarityVersion,
    similarityStatus: previous.similarityStatus,
    contentHash: previous.contentHash,
    perceptualHash: previous.perceptualHash,
    similarityFingerprint: previous.similarityFingerprint,
    similarityError: previous.similarityError,
    similarityAnalyzedAt: previous.similarityAnalyzedAt,
    qualityVersion: previous.qualityVersion,
    qualityStatus: previous.qualityStatus,
    qualityFingerprint: previous.qualityFingerprint,
    qualityScore: previous.qualityScore,
    qualityTier: previous.qualityTier,
    sharpnessScore: previous.sharpnessScore,
    exposureScore: previous.exposureScore,
    resolutionScore: previous.resolutionScore,
    motionBlurRisk: previous.motionBlurRisk,
    meanLuminance: previous.meanLuminance,
    luminanceStdDev: previous.luminanceStdDev,
    shadowClipFraction: previous.shadowClipFraction,
    highlightClipFraction: previous.highlightClipFraction,
    laplacianMeanAbs: previous.laplacianMeanAbs,
    horizontalGradient: previous.horizontalGradient,
    verticalGradient: previous.verticalGradient,
    qualityReasons: previous.qualityReasons,
    qualityError: previous.qualityError,
    qualityAnalyzedAt: previous.qualityAnalyzedAt,
    faceAnalysisVersion: previous.faceAnalysisVersion,
    faceAnalysisStatus: previous.faceAnalysisStatus,
    faceFingerprint: previous.faceFingerprint,
    faces: previous.faces,
    faceAnalysisError: previous.faceAnalysisError,
    facesAnalyzedAt: previous.facesAnalyzedAt
  }
}

function createMediaRecord(
  libraryId: string,
  relativePath: string,
  file: File,
  fileHandle?: FileSystemFileHandle
): LiteMediaRecord {
  const name = relativePath.split('/').at(-1) ?? file.name
  return {
    id: `${libraryId}:${relativePath}`,
    libraryId,
    relativePath,
    name,
    kind: classifyMedia(name),
    sizeBytes: file.size,
    lastModified: file.lastModified,
    mimeType: file.type,
    ...(fileHandle ? { fileHandle } : {})
  }
}

function createLibraryRecord(
  id: string,
  name: string,
  createdAt: number,
  media: LiteMediaRecord[],
  accessMode: LiteLibraryRecord['accessMode'],
  rootHandle?: FileSystemDirectoryHandle
): LiteLibraryRecord {
  const count = (kind: LiteMediaRecord['kind']): number => media.filter((item) => item.kind === kind).length
  return {
    id,
    name,
    createdAt,
    updatedAt: Date.now(),
    fileCount: media.length,
    imageCount: count('image'),
    rawCount: count('raw'),
    videoCount: count('video'),
    sidecarCount: count('sidecar'),
    unknownCount: count('unknown'),
    locatedCount: media.filter((item) => item.kind === 'image' && typeof item.latitude === 'number' && typeof item.longitude === 'number').length,
    accessMode,
    ...(rootHandle ? { rootHandle } : {})
  }
}

function fingerprintMatch(match: LiteTakeoutMatch | undefined): string {
  if (!match?.sidecar) return ''
  const records = [match.sidecar, ...(match.alternateSidecars ?? [])]
  return records
    .map((record) => `${record.relativePath}|${record.sizeBytes}|${record.lastModified}`)
    .sort()
    .join('||')
}

function enrichableCount(records: LiteMediaRecord[]): number {
  return records.filter((record) => record.kind !== 'sidecar' && record.kind !== 'unknown').length
}

function inferSelectionRootName(files: File[]): string {
  const path = files.find((file) => file.webkitRelativePath)?.webkitRelativePath ?? ''
  const [root] = path.split('/').filter(Boolean)
  return root || 'Selected folder'
}

function normalizeSelectionPath(file: File, rootName: string): string {
  const raw = file.webkitRelativePath || file.name
  const normalized = raw.replaceAll('\\', '/').replace(/^\/+/, '')
  const prefix = `${rootName}/`
  return normalized.startsWith(prefix) ? normalized.slice(prefix.length) : normalized
}
