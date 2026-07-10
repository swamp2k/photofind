import { contextBridge, ipcRenderer } from 'electron'
import type {
  CurateScanResult,
  ExportResult,
  MediaThumbnail,
  RepairResult,
  ScanProgressEvent,
  ScanResult,
  SidecarMatch,
  Verdict
} from '../shared/types'

const api = {
  selectFolder: (): Promise<string | null> => ipcRenderer.invoke('source:selectFolder'),
  selectExportFolder: (): Promise<string | null> => ipcRenderer.invoke('export:selectFolder'),
  runScan: (rootPath: string): Promise<ScanResult> => ipcRenderer.invoke('scan:run', rootPath),
  runRepair: (matches: SidecarMatch[], dryRun: boolean): Promise<RepairResult> =>
    ipcRenderer.invoke('repair:run', matches, dryRun),
  setKeeper: (mediaPath: string, kept: boolean): Promise<void> => ipcRenderer.invoke('keepers:set', mediaPath, kept),
  exportKeepers: (mediaPaths: string[], destinationRoot: string): Promise<ExportResult> =>
    ipcRenderer.invoke('export:keepers', mediaPaths, destinationRoot),
  runCurateScan: (rootPath: string): Promise<CurateScanResult> => ipcRenderer.invoke('curate:scan', rootPath),
  setVerdict: (mediaPath: string, verdict: Verdict | null): Promise<void> =>
    ipcRenderer.invoke('verdict:set', mediaPath, verdict),
  getPreview: (mediaPath: string): Promise<MediaThumbnail> => ipcRenderer.invoke('preview:get', mediaPath),
  onCurateScanProgress: (callback: (event: ScanProgressEvent) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: ScanProgressEvent): void => callback(progress)
    ipcRenderer.on('curate:scanProgress', listener)
    return () => ipcRenderer.removeListener('curate:scanProgress', listener)
  }
}

export type PhotofindApi = typeof api

contextBridge.exposeInMainWorld('api', api)
