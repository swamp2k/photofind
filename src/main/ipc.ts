import { dialog, ipcMain } from 'electron'
import type { SidecarMatch } from '../shared/types'
import { repairMetadata } from './services/metadataRepair'
import { runScan } from './services/scanOrchestrator'

export function registerIpcHandlers(): void {
  ipcMain.handle('source:selectFolder', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('scan:run', async (_event, rootPath: string) => {
    return runScan(rootPath)
  })

  ipcMain.handle('repair:run', async (_event, matches: SidecarMatch[], dryRun: boolean) => {
    return repairMetadata(matches, { dryRun })
  })
}
