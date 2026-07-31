import { classifyMedia } from './classify'
import type { LiteLibraryRecord, LiteMediaRecord, LiteScanProgress, LiteScanResult, LiteSelectionScanResult } from './types'

export interface ExistingLibraryIdentity {
  id: string
  createdAt: number
}

export async function scanDirectory(
  rootHandle: FileSystemDirectoryHandle,
  existing: ExistingLibraryIdentity | null = null,
  onProgress?: (progress: LiteScanProgress) => void
): Promise<LiteScanResult> {
  const libraryId = existing?.id ?? crypto.randomUUID()
  const createdAt = existing?.createdAt ?? Date.now()
  const media: LiteMediaRecord[] = []
  let scannedFiles = 0

  async function walk(directory: FileSystemDirectoryHandle, parentSegments: string[]): Promise<void> {
    for await (const [name, handle] of directory.entries()) {
      if (name === '.DS_Store') continue
      const segments = [...parentSegments, name]
      const relativePath = segments.join('/')

      if (handle.kind === 'directory') {
        await walk(handle, segments)
        continue
      }

      const fileHandle = handle as FileSystemFileHandle
      const file = await fileHandle.getFile()
      media.push(createMediaRecord(libraryId, relativePath, file, fileHandle))

      scannedFiles += 1
      if (scannedFiles === 1 || scannedFiles % 25 === 0) {
        onProgress?.({ scannedFiles, currentPath: relativePath })
        await Promise.resolve()
      }
    }
  }

  await walk(rootHandle, [])
  const library = createLibraryRecord(libraryId, rootHandle.name, createdAt, media, 'handle', rootHandle)

  onProgress?.({ scannedFiles, currentPath: '' })
  return { library, media }
}

export async function scanFileSelection(
  files: File[],
  existing: ExistingLibraryIdentity | null = null,
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
      onProgress?.({ scannedFiles, currentPath: relativePath })
      await Promise.resolve()
    }
  }

  const library = createLibraryRecord(libraryId, rootName, createdAt, media, 'selection')
  onProgress?.({ scannedFiles: files.length, currentPath: '' })
  return { library, media, sessionFiles }
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
    accessMode,
    ...(rootHandle ? { rootHandle } : {})
  }
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
