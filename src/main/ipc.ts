import { join } from 'node:path'
import { app, dialog, ipcMain } from 'electron'
import type { SidecarMatch, Verdict } from '../shared/types'
import { runCurateScan } from './services/curateScan'
import { exportKeepers } from './services/exportKeepers'
import { LibraryStore } from './services/libraryStore'
import { repairMetadata } from './services/metadataRepair'
import { getPreview } from './services/previews'
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

  ipcMain.handle('curate:scan', async (event, rootPath: string) => {
    const { faceData, ...result } = await runCurateScan(rootPath, {
      thumbnailCacheRoot: join(app.getPath('userData'), 'thumbnails'),
      onProgress: (progress) => {
        if (!event.sender.isDestroyed()) event.sender.send('curate:scanProgress', progress)
      }
    })
    // Embeddings are persisted here and never cross the IPC boundary.
    libraryStore.upsertCurateScan(rootPath, result, faceData)
    // Persisted overrides survive re-scans, mirroring the keeper merge above.
    const verdicts = libraryStore.listUserVerdicts(result.photos.map((photo) => photo.media.path))
    for (const photo of result.photos) {
      photo.userVerdict = verdicts.get(photo.media.path) ?? null
    }
    return result
  })

  ipcMain.handle('verdict:set', async (_event, mediaPath: string, verdict: Verdict | null) => {
    libraryStore.setUserVerdict(mediaPath, verdict)
  })

  ipcMain.handle('preview:get', async (_event, mediaPath: string) => {
    return getPreview(mediaPath, join(app.getPath('userData'), 'previews'))
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
