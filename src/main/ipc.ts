import { join } from 'node:path'
import { app, dialog, ipcMain } from 'electron'
import type { SidecarMatch } from '../shared/types'
import { exportKeepers } from './services/exportKeepers'
import { LibraryStore } from './services/libraryStore'
import { repairMetadata } from './services/metadataRepair'
import { runScan } from './services/scanOrchestrator'

export function registerIpcHandlers(): void {
  const libraryStore = new LibraryStore(join(app.getPath('userData'), 'photofind.db'))

  ipcMain.handle('source:selectFolder', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('export:selectFolder', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('scan:run', async (_event, rootPath: string) => {
    const result = await runScan(rootPath, { thumbnailCacheRoot: join(app.getPath('userData'), 'thumbnails') })
    libraryStore.upsertScan(rootPath, result)
    result.keepers = libraryStore.listKeepers(result.matches.map((match) => match.media.path))
    return result
  })

  ipcMain.handle('repair:run', async (_event, matches: SidecarMatch[], dryRun: boolean) => {
    return repairMetadata(matches, { dryRun })
  })

  ipcMain.handle('keepers:set', async (_event, mediaPath: string, kept: boolean) => {
    libraryStore.setKeeper(mediaPath, kept)
  })

  ipcMain.handle('export:keepers', async (_event, mediaPaths: string[], destinationRoot: string) => {
    return exportKeepers(mediaPaths, { destinationRoot })
  })
}
