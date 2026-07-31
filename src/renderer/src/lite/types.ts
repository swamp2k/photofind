export type LiteMediaKind = 'image' | 'raw' | 'video' | 'sidecar' | 'unknown'

export interface LiteMediaRecord {
  id: string
  libraryId: string
  relativePath: string
  name: string
  kind: LiteMediaKind
  sizeBytes: number
  lastModified: number
  mimeType: string
  fileHandle: FileSystemFileHandle
}

export interface LiteLibraryRecord {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  fileCount: number
  imageCount: number
  rawCount: number
  videoCount: number
  sidecarCount: number
  unknownCount: number
  rootHandle: FileSystemDirectoryHandle
}

export interface LiteScanProgress {
  scannedFiles: number
  currentPath: string
}

export interface LiteScanResult {
  library: LiteLibraryRecord
  media: LiteMediaRecord[]
}
