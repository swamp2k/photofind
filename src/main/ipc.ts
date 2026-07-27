import { dialog, ipcMain } from 'electron'
import { PhotoFindApplication } from '../application/PhotoFindApplication'
import type { SidecarMatch } from '../shared/types'
import { withElectronThumbnailUrls } from './thumbnailUrl'

export function registerIpcHandlers(application: PhotoFindApplication): void {
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
    const result = await application.scan(rootPath)
    return withElectronThumbnailUrls(result)
  })

  ipcMain.handle('repair:run', async (_event, matches: SidecarMatch[], dryRun: boolean) => {
    return application.repair(matches, dryRun)
  })

  ipcMain.handle('keepers:set', async (_event, mediaPath: string, kept: boolean) => {
    application.setKeeper(mediaPath, kept)
  })

  ipcMain.handle('export:keepers', async (_event, mediaPaths: string[], destinationRoot: string) => {
    return application.exportKeepers(mediaPaths, destinationRoot)
  })
}
