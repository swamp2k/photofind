import { classifyMedia } from './classify'
import type { LiteLibraryRecord, LiteMediaRecord, LiteScanProgress, LiteScanResult } from './types'

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
      media.push({
        id: `${libraryId}:${relativePath}`,
        libraryId,
        relativePath,
        name,
        kind: classifyMedia(name),
        sizeBytes: file.size,
        lastModified: file.lastModified,
        mimeType: file.type,
        fileHandle
      })

      scannedFiles += 1
      if (scannedFiles === 1 || scannedFiles % 25 === 0) {
        onProgress?.({ scannedFiles, currentPath: relativePath })
        await Promise.resolve()
      }
    }
  }

  await walk(rootHandle, [])

  const count = (kind: LiteMediaRecord['kind']): number => media.filter((item) => item.kind === kind).length
  const now = Date.now()
  const library: LiteLibraryRecord = {
    id: libraryId,
    name: rootHandle.name,
    createdAt,
    updatedAt: now,
    fileCount: media.length,
    imageCount: count('image'),
    rawCount: count('raw'),
    videoCount: count('video'),
    sidecarCount: count('sidecar'),
    unknownCount: count('unknown'),
    rootHandle
  }

  onProgress?.({ scannedFiles, currentPath: '' })
  return { library, media }
}
