import { join } from 'node:path'
import { app, BrowserWindow, protocol, shell } from 'electron'
import { is } from './lib/env'
import { registerIpcHandlers } from './ipc'
import { disposeExiftool } from './services/exiftoolClient'
import { disposeFaceEngine } from './services/faceEngine'
import { registerThumbnailProtocol } from './services/thumbnailProtocol'
import { THUMBNAIL_PROTOCOL } from './services/thumbnailUrl'

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
  registerThumbnailProtocol()
  registerIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', (event) => {
  event.preventDefault()
  Promise.allSettled([disposeExiftool(), disposeFaceEngine()]).finally(() => app.exit())
})
