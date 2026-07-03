import { contextBridge, ipcRenderer } from 'electron'
import type { ExportResult, KeeperStatus, LibraryItem, RepairResult, ScanResult, SidecarMatch } from '../shared/types'
import type { ExtractResult } from '../main/services/zipImport'

const api = {
  selectFolder: (): Promise<string | null> => ipcRenderer.invoke('source:selectFolder'),
  selectZips: (): Promise<string[] | null> => ipcRenderer.invoke('source:selectZips'),
  extractZips: (zipPaths: string[]): Promise<ExtractResult> => ipcRenderer.invoke('zip:extract', zipPaths),
  runScan: (rootPath: string): Promise<ScanResult> => ipcRenderer.invoke('scan:run', rootPath),
  runRepair: (matches: SidecarMatch[], dryRun: boolean): Promise<RepairResult> =>
    ipcRenderer.invoke('repair:run', matches, dryRun),
  buildLibrary: (matches: SidecarMatch[]): Promise<LibraryItem[]> => ipcRenderer.invoke('library:build', matches),
  listLibrary: (): Promise<LibraryItem[]> => ipcRenderer.invoke('library:list'),
  setLibraryStatus: (path: string, status: KeeperStatus): Promise<void> =>
    ipcRenderer.invoke('library:setStatus', path, status),
  exportKeepers: (): Promise<ExportResult | null> => ipcRenderer.invoke('library:exportKeepers')
}

export type PhotofindApi = typeof api

contextBridge.exposeInMainWorld('api', api)
