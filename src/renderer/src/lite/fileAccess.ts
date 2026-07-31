type DirectoryPicker = (options?: { id?: string; mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>

type PermissionCapableDirectoryHandle = FileSystemDirectoryHandle & {
  queryPermission(options?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>
  requestPermission(options?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>
}

export function supportsLocalFolderAccess(): boolean {
  const candidate = window as Window & { showDirectoryPicker?: DirectoryPicker }
  return typeof candidate.showDirectoryPicker === 'function' && typeof indexedDB !== 'undefined'
}

export async function pickLocalDirectory(): Promise<FileSystemDirectoryHandle> {
  const candidate = window as Window & { showDirectoryPicker?: DirectoryPicker }
  if (!candidate.showDirectoryPicker) throw new Error('This browser does not support local folder access.')
  return candidate.showDirectoryPicker({ id: 'photofind-library', mode: 'read' })
}

export async function ensureReadPermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  const permissionHandle = handle as PermissionCapableDirectoryHandle
  if (typeof permissionHandle.queryPermission !== 'function') return true

  const current = await permissionHandle.queryPermission({ mode: 'read' })
  if (current === 'granted') return true
  if (typeof permissionHandle.requestPermission !== 'function') return false
  return (await permissionHandle.requestPermission({ mode: 'read' })) === 'granted'
}
