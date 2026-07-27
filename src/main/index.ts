import { join } from 'node:path'
import { app, BrowserWindow, protocol, shell } from 'electron'
import { PhotoFindApplication } from '../application/PhotoFindApplication'
import { is } from './lib/env'
import { registerIpcHandlers } from './ipc'
import { registerThumbnailProtocol } from './thumbnailProtocol'
import { THUMBNAIL_PROTOCOL } from './thumbnailUrl'

let application: PhotoFindApplication | null = null

protocol.registerSchemesAsPrivileged([
  {
    scheme: THUMBNAIL_PROTOCOL,
    privileges: {
      standard: true,
      secure: true,
      corsEnabled: true,
      bypassCSP: true,
      supportFetchAPI: true
    }
  }
])

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false
    }
  })

  window.on('ready-to-show', () => window.show())
  window.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    window.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    window.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  const userDataRoot = app.getPath('userData')
  const thumbnailCacheRoot = join(userDataRoot, 'thumbnails')
  application = new PhotoFindApplication({
    databasePath: join(userDataRoot, 'photofind.db'),
    thumbnailCacheRoot
  })
  registerThumbnailProtocol(thumbnailCacheRoot)
  registerIpcHandlers(application)
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
}).catch((error: unknown) => {
  console.error('PhotoFind failed to start:', error)
  app.quit()
})

app.on('before-quit', () => {
  application?.close()
  application = null
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
