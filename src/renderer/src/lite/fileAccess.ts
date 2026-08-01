type DirectoryPicker = (options?: { id?: string; mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>

type PermissionCapableDirectoryHandle = FileSystemDirectoryHandle & {
  queryPermission(options?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>
  requestPermission(options?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>
}

export type LocalFolderAccessMode = 'handle' | 'selection' | 'unsupported'

export function localFolderAccessMode(): LocalFolderAccessMode {
  const candidate = window as Window & { showDirectoryPicker?: DirectoryPicker }
  if (typeof candidate.showDirectoryPicker === 'function' && typeof indexedDB !== 'undefined') return 'handle'

  const input = document.createElement('input')
  if ('webkitdirectory' in input && typeof indexedDB !== 'undefined') return 'selection'
  return 'unsupported'
}

export function supportsLocalFolderAccess(): boolean {
  return localFolderAccessMode() !== 'unsupported'
}

export function supportsWritableExport(): boolean {
  const candidate = window as Window & { showDirectoryPicker?: DirectoryPicker }
  return typeof candidate.showDirectoryPicker === 'function'
}

export async function pickLocalDirectory(): Promise<FileSystemDirectoryHandle> {
  const candidate = window as Window & { showDirectoryPicker?: DirectoryPicker }
  if (!candidate.showDirectoryPicker) throw new Error('This browser does not support persistent local folder handles.')
  return candidate.showDirectoryPicker({ id: 'photofind-library', mode: 'read' })
}

export async function pickExportDirectory(): Promise<FileSystemDirectoryHandle> {
  const candidate = window as Window & { showDirectoryPicker?: DirectoryPicker }
  if (!candidate.showDirectoryPicker) throw new Error('This browser cannot write an export folder directly. Open PhotoFind in Chrome, Edge, Brave or another browser exposing the File System Access API.')
  return candidate.showDirectoryPicker({ id: 'photofind-export', mode: 'readwrite' })
}

export function pickLocalDirectoryFiles(): Promise<File[]> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    input.setAttribute('webkitdirectory', '')
    input.setAttribute('directory', '')
    input.style.display = 'none'

    let settled = false
    const cleanup = (): void => input.remove()
    const abort = (): void => {
      if (settled) return
      settled = true
      cleanup()
      reject(new DOMException('No folder selected', 'AbortError'))
    }

    input.addEventListener('change', () => {
      if (settled) return
      const files = Array.from(input.files ?? [])
      if (files.length === 0) {
        abort()
        return
      }
      settled = true
      cleanup()
      resolve(files)
    }, { once: true })
    input.addEventListener('cancel', abort, { once: true })

    document.body.appendChild(input)
    input.click()
  })
}

export async function ensureReadPermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  return ensurePermission(handle, 'read')
}

export async function ensureWritePermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  return ensurePermission(handle, 'readwrite')
}

async function ensurePermission(handle: FileSystemDirectoryHandle, mode: 'read' | 'readwrite'): Promise<boolean> {
  const permissionHandle = handle as PermissionCapableDirectoryHandle
  if (typeof permissionHandle.queryPermission !== 'function') return true

  const current = await permissionHandle.queryPermission({ mode })
  if (current === 'granted') return true
  if (typeof permissionHandle.requestPermission !== 'function') return false
  return (await permissionHandle.requestPermission({ mode })) === 'granted'
}
