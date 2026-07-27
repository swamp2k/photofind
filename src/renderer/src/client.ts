import type { ExportResult, RepairResult, ScanResult, SidecarMatch } from '../../shared/types'

export interface PhotoFindClient {
  runScan(path: string, signal?: AbortSignal): Promise<ScanResult>
  runRepair(matches: SidecarMatch[], dryRun: boolean, confirm?: boolean): Promise<RepairResult>
  setKeeper(path: string, kept: boolean): Promise<void>
  exportKeepers(paths: string[], destinationRoot: string): Promise<ExportResult>
}

export interface FolderPicker {
  selectFolder(): Promise<string | null>
  selectExportFolder(): Promise<string | null>
  directoryApi?: BrowserDirectoryApi
}

export interface BrowserRootCapability { scope: 'photos' | 'inbox' | 'exports'; browse: boolean; scan: boolean; createDestination: boolean; export: boolean }
export interface BrowserCapabilities { version: string; roots: BrowserRootCapability[]; repair: boolean; uploads: boolean; jobs: boolean; multiuser: boolean }
export interface DirectoryEntry { name: string; uri: string; selectable: boolean }
export interface DirectoryListing { uri: string; breadcrumbs: DirectoryEntry[]; entries: DirectoryEntry[]; skipped: number }
export interface BrowserDirectoryApi {
  capabilities(): Promise<BrowserCapabilities>
  browse(uri: string, signal?: AbortSignal): Promise<DirectoryListing>
  createDirectory(parentUri: string, name: string): Promise<{ uri: string }>
}

export class PhotoFindHttpError extends Error {
  readonly code: string
  readonly status: number
  constructor(code: string, message: string, status: number) {
    super(message)
    this.name = 'PhotoFindHttpError'
    this.code = code
    this.status = status
  }
}

async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, {
      ...init,
      headers: {
        accept: 'application/json',
        ...(init.body ? { 'content-type': 'application/json' } : {}),
        ...init.headers
      }
    })
  } catch (error) {
    throw new PhotoFindHttpError('NETWORK_ERROR', error instanceof Error ? error.message : 'Network request failed', 0)
  }
  const payload: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const error = payload && typeof payload === 'object' && 'error' in payload
      ? (payload as { error?: { code?: unknown; message?: unknown } }).error
      : undefined
    throw new PhotoFindHttpError(
      typeof error?.code === 'string' ? error.code : 'HTTP_ERROR',
      typeof error?.message === 'string' ? error.message : `Request failed (${response.status})`,
      response.status
    )
  }
  return payload as T
}

export const httpClient: PhotoFindClient = {
  runScan: (sourceUri, signal) => requestJson<ScanResult>('/api/scan', { method: 'POST', body: JSON.stringify({ sourceUri }), signal }),
  runRepair: (matches, dryRun, confirm = false) => requestJson<RepairResult>('/api/repair', { method: 'POST', body: JSON.stringify({ matches, dryRun, confirm }) }),
  setKeeper: async (mediaUri, kept) => { await requestJson('/api/keepers', { method: 'POST', body: JSON.stringify({ mediaUri, kept }) }) },
  exportKeepers: (mediaUris, destinationUri) => requestJson<ExportResult>('/api/export', { method: 'POST', body: JSON.stringify({ mediaUris, destinationUri }) })
}

export const browserDirectoryApi: BrowserDirectoryApi = {
  capabilities: () => requestJson<BrowserCapabilities>('/api/capabilities'),
  browse: (uri, signal) => requestJson<DirectoryListing>(`/api/browse?uri=${encodeURIComponent(uri)}`, { signal }),
  createDirectory: (parentUri, name) => requestJson<{ uri: string }>('/api/directories', { method: 'POST', body: JSON.stringify({ parentUri, name }) })
}

const nativeApi = typeof window !== 'undefined' ? window.api : undefined
export const electronClient: PhotoFindClient = nativeApi as PhotoFindClient
export const electronFolderPicker: FolderPicker = nativeApi as FolderPicker

export const browserFolderPicker: FolderPicker = {
  directoryApi: browserDirectoryApi,
  selectFolder: async () => null,
  selectExportFolder: async () => null
}
