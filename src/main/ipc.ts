import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { app, dialog, ipcMain } from 'electron'
import type { KeeperStatus, SidecarMatch } from '../shared/types'
import { buildLibrary, exportKeepers, listLibrary, setStatus } from './services/library'
import { repairMetadata } from './services/metadataRepair'
import { runScan } from './services/scanOrchestrator'
import { extractZips } from './services/zipImport'

export function registerIpcHandlers(): void {
  ipcMain.handle('source:selectFolder', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('source:selectZips', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Zip files', extensions: ['zip'] }]
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths
  })

  ipcMain.handle('zip:extract', async (_event, zipPaths: string[]) => {
    const destDir = join(app.getPath('temp'), `photofind-import-${Date.now()}`)
    await mkdir(destDir, { recursive: true })
    return extractZips(zipPaths, destDir)
  })

  ipcMain.handle('scan:run', async (_event, rootPath: string) => {
    return runScan(rootPath)
  })

  ipcMain.handle('repair:run', async (_event, matches: SidecarMatch[], dryRun: boolean) => {
    return repairMetadata(matches, { dryRun })
  })

  ipcMain.handle('library:build', async (_event, matches: SidecarMatch[]) => {
    return buildLibrary(matches)
  })

  ipcMain.handle('library:list', async () => {
    return listLibrary()
  })

  ipcMain.handle('library:setStatus', async (_event, path: string, status: KeeperStatus) => {
    setStatus(path, status)
  })

  ipcMain.handle('library:exportKeepers', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
    if (result.canceled || result.filePaths.length === 0) return null
    return exportKeepers(result.filePaths[0])
  })
}
