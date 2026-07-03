import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { app, BrowserWindow, net, protocol, shell } from 'electron'
import { fromMediaUrl } from '../shared/mediaUrl'
import { is } from './lib/env'
import { registerIpcHandlers } from './ipc'

// Renderers can't load arbitrary local file paths directly (blocked by CSP/CORS);
// this scheme lets the grid and inspector show thumbnails and originals from
// anywhere on disk without disabling web security.
protocol.registerSchemesAsPrivileged([
  { scheme: 'media', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
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
  protocol.handle('media', (request) => net.fetch(pathToFileURL(fromMediaUrl(request.url)).toString()))
  registerIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
