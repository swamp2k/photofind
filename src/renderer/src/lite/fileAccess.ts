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

export async function pickLocalDirectory(): Promise<FileSystemDirectoryHandle> {
  const candidate = window as Window & { showDirectoryPicker?: DirectoryPicker }
  if (!candidate.showDirectoryPicker) throw new Error('This browser does not support persistent local folder handles.')
  return candidate.showDirectoryPicker({ id: 'photofind-library', mode: 'read' })
}

export function pickLocalDirectoryFiles(): Promise<File[]> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    input.setAttribute('webkitdirectory', '')
    input.setAttribute('directory', '')
    input.style.display = 'none'

    const cleanup = (): void => input.remove()
    input.addEventListener('change', () => {
      const files = Array.from(input.files ?? [])
      cleanup()
      if (files.length === 0) {
        reject(new DOMException('No folder selected', 'AbortError'))
        return
      }
      resolve(files)
    }, { once: true })

    document.body.appendChild(input)
    input.click()
  })
}

export async function ensureReadPermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  const permissionHandle = handle as PermissionCapableDirectoryHandle
  if (typeof permissionHandle.queryPermission !== 'function') return true

  const current = await permissionHandle.queryPermission({ mode: 'read' })
  if (current === 'granted') return true
  if (typeof permissionHandle.requestPermission !== 'function') return false
  return (await permissionHandle.requestPermission({ mode: 'read' })) === 'granted'
}
