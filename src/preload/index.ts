import { contextBridge, ipcRenderer } from 'electron'
import type { ExportResult, RepairResult, ScanResult, SidecarMatch } from '../shared/types'

const api = {
  selectFolder: (): Promise<string | null> => ipcRenderer.invoke('source:selectFolder'),
  selectExportFolder: (): Promise<string | null> => ipcRenderer.invoke('export:selectFolder'),
  runScan: (rootPath: string): Promise<ScanResult> => ipcRenderer.invoke('scan:run', rootPath),
  runRepair: (matches: SidecarMatch[], dryRun: boolean): Promise<RepairResult> =>
    ipcRenderer.invoke('repair:run', matches, dryRun),
  setKeeper: (mediaPath: string, kept: boolean): Promise<void> => ipcRenderer.invoke('keepers:set', mediaPath, kept),
  exportKeepers: (mediaPaths: string[], destinationRoot: string): Promise<ExportResult> =>
    ipcRenderer.invoke('export:keepers', mediaPaths, destinationRoot)
}

export type PhotofindApi = typeof api

contextBridge.exposeInMainWorld('api', api)
