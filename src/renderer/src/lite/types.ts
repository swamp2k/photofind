export type LiteMediaKind = 'image' | 'raw' | 'video' | 'sidecar' | 'unknown'
export type LiteLibraryAccessMode = 'handle' | 'selection'
export type LiteCaptureTimeSource = 'takeout' | 'exif' | 'file'
export type LiteLocationSource = 'takeout' | 'exif'
export type LiteMetadataStatus = 'parsed' | 'reused' | 'not-applicable' | 'failed'
export type LiteTakeoutMatchConfidence = 'safe' | 'uncertain' | 'missing'

export interface LiteMediaRecord {
  id: string
  libraryId: string
  relativePath: string
  name: string
  kind: LiteMediaKind
  sizeBytes: number
  lastModified: number
  mimeType: string
  fileHandle?: FileSystemFileHandle
  metadataVersion?: number
  metadataStatus?: LiteMetadataStatus
  effectiveCaptureTime?: number
  captureTimeSource?: LiteCaptureTimeSource
  latitude?: number
  longitude?: number
  locationSource?: LiteLocationSource
  width?: number
  height?: number
  cameraMake?: string
  cameraModel?: string
  takeoutSidecarPath?: string
  takeoutMatchConfidence?: LiteTakeoutMatchConfidence
  sidecarFingerprint?: string
  diagnostics?: string[]
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
  locatedCount?: number
  accessMode: LiteLibraryAccessMode
  rootHandle?: FileSystemDirectoryHandle
}

export type LiteScanPhase = 'files' | 'metadata'

export interface LiteScanProgress {
  phase?: LiteScanPhase
  scannedFiles: number
  currentPath: string
  metadataParsed?: number
  metadataReused?: number
  metadataTotal?: number
}

export interface LiteScanResult {
  library: LiteLibraryRecord
  media: LiteMediaRecord[]
}

export interface LiteSelectionScanResult extends LiteScanResult {
  sessionFiles: Map<string, File>
}

export interface LiteGeoBounds {
  west: number
  south: number
  east: number
  north: number
}

export type LiteLocationFilter = 'all' | 'located' | 'missing'
export type LiteDateMetadataFilter = 'all' | 'captured' | 'file-only'

export interface LitePhotoFilters {
  year: number | null
  fromTime: number | null
  toTime: number | null
  location: LiteLocationFilter
  dateMetadata: LiteDateMetadataFilter
  mapBounds: LiteGeoBounds | null
}
