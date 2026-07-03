import { contextBridge, ipcRenderer } from 'electron'
import type { RepairResult, ScanResult, SidecarMatch } from '../shared/types'

const api = {
  selectFolder: (): Promise<string | null> => ipcRenderer.invoke('source:selectFolder'),
  runScan: (rootPath: string): Promise<ScanResult> => ipcRenderer.invoke('scan:run', rootPath),
  runRepair: (matches: SidecarMatch[], dryRun: boolean): Promise<RepairResult> =>
    ipcRenderer.invoke('repair:run', matches, dryRun)
}

export type PhotofindApi = typeof api

contextBridge.exposeInMainWorld('api', api)
