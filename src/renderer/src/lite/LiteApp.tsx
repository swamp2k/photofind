import { useEffect, useMemo, useState } from 'react'
import { ensureReadPermission, pickLocalDirectory, supportsLocalFolderAccess } from './fileAccess'
import { deleteLibrary, listLibraries, loadMedia, replaceLibrary } from './libraryDb'
import { LocalThumbnail } from './LocalThumbnail'
import { scanDirectory } from './scanner'
import type { LiteLibraryRecord, LiteMediaRecord, LiteScanProgress } from './types'

const PAGE_SIZE = 120

export function LiteApp(): JSX.Element {
  const [libraries, setLibraries] = useState<LiteLibraryRecord[]>([])
  const [activeLibrary, setActiveLibrary] = useState<LiteLibraryRecord | null>(null)
  const [media, setMedia] = useState<LiteMediaRecord[]>([])
  const [progress, setProgress] = useState<LiteScanProgress | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const supported = supportsLocalFolderAccess()

  useEffect(() => {
    void refreshLibraries()
  }, [])

  const images = useMemo(() => media.filter((item) => item.kind === 'image'), [media])
  const visibleImages = images.slice(0, visibleCount)
  const unknown = useMemo(() => media.filter((item) => item.kind === 'unknown'), [media])

  async function refreshLibraries(): Promise<void> {
    try {
      setLibraries(await listLibraries())
    } catch (cause) {
      setError(messageOf(cause))
    }
  }

  async function addFolder(): Promise<void> {
    setError(null)
    try {
      const handle = await pickLocalDirectory()
      await indexHandle(handle, null)
    } catch (cause) {
      if (isAbort(cause)) return
      setError(messageOf(cause))
    }
  }

  async function openLibrary(library: LiteLibraryRecord): Promise<void> {
    setError(null)
    try {
      if (!(await ensureReadPermission(library.rootHandle))) {
        setError('PhotoFind needs permission to read this folder again. Click the library to reconnect it.')
        return
      }
      setBusy(true)
      const rows = await loadMedia(library.id)
      setActiveLibrary(library)
      setMedia(rows)
      setVisibleCount(PAGE_SIZE)
    } catch (cause) {
      setError(messageOf(cause))
    } finally {
      setBusy(false)
    }
  }

  async function rescanActive(): Promise<void> {
    if (!activeLibrary) return
    setError(null)
    try {
      if (!(await ensureReadPermission(activeLibrary.rootHandle))) {
        setError('Folder permission was not granted.')
        return
      }
      await indexHandle(activeLibrary.rootHandle, activeLibrary)
    } catch (cause) {
      setError(messageOf(cause))
    }
  }

  async function indexHandle(handle: FileSystemDirectoryHandle, existing: LiteLibraryRecord | null): Promise<void> {
    setBusy(true)
    setProgress({ scannedFiles: 0, currentPath: '' })
    try {
      const result = await scanDirectory(
        handle,
        existing ? { id: existing.id, createdAt: existing.createdAt } : null,
        setProgress
      )
      await replaceLibrary(result.library, result.media)
      setActiveLibrary(result.library)
      setMedia(result.media)
      setVisibleCount(PAGE_SIZE)
      await refreshLibraries()
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  async function forgetLibrary(library: LiteLibraryRecord): Promise<void> {
    if (!window.confirm(`Forget the local PhotoFind index for “${library.name}”? No photo files will be deleted.`)) return
    setError(null)
    try {
      await deleteLibrary(library.id)
      if (activeLibrary?.id === library.id) {
        setActiveLibrary(null)
        setMedia([])
      }
      await refreshLibraries()
    } catch (cause) {
      setError(messageOf(cause))
    }
  }

  return (
    <div className="lite-shell">
      <header className="topbar">
        <div>
          <div className="eyebrow">PhotoFind Lite</div>
          <h1>Find the photos worth keeping.</h1>
          <p>Choose a folder on this computer. PhotoFind indexes it locally in your browser; your photos are not uploaded.</p>
        </div>
        <button className="primary" disabled={!supported || busy} onClick={() => void addFolder()}>
          {busy ? 'Working…' : 'Choose local folder'}
        </button>
      </header>

      {!supported && (
        <div className="notice warning">
          Local folder access is not available in this browser. PhotoFind Lite requires a desktop browser that exposes the File System Access API, supported by many Chromium-based browsers such as Chrome, Edge and Brave.
        </div>
      )}
      {error && <div className="notice error">{error}</div>}
      {progress && (
        <div className="notice progress">
          Indexed {progress.scannedFiles.toLocaleString()} files{progress.currentPath ? ` — ${progress.currentPath}` : ''}
        </div>
      )}

      <div className="workspace">
        <aside className="library-sidebar">
          <div className="sidebar-heading">
            <h2>Local indexes</h2>
            <span>{libraries.length}</span>
          </div>
          {libraries.length === 0 ? (
            <p className="muted">No folders indexed in this browser yet.</p>
          ) : (
            <div className="library-list">
              {libraries.map((library) => (
                <div className={activeLibrary?.id === library.id ? 'library-card active' : 'library-card'} key={library.id}>
                  <button className="library-open" onClick={() => void openLibrary(library)}>
                    <strong>{library.name}</strong>
                    <span>{library.fileCount.toLocaleString()} files · {library.imageCount.toLocaleString()} photos</span>
                  </button>
                  <button className="icon-button" title="Forget index" onClick={() => void forgetLibrary(library)}>×</button>
                </div>
              ))}
            </div>
          )}
        </aside>

        <main className="library-main">
          {!activeLibrary ? (
            <section className="empty-state">
              <h2>Start with a pile of photos</h2>
              <p>Select a local folder or an extracted Google Photos Takeout folder. The first step builds a private local index.</p>
              <div className="privacy-grid">
                <div><strong>Local files</strong><span>The hosted site receives no photo bytes.</span></div>
                <div><strong>Local index</strong><span>Folder handles and file metadata stay in IndexedDB on this device.</span></div>
                <div><strong>Refresh to update</strong><span>The application itself can be centrally updated without reinstalling anything.</span></div>
              </div>
            </section>
          ) : (
            <>
              <section className="library-summary">
                <div>
                  <div className="eyebrow">Indexed folder</div>
                  <h2>{activeLibrary.name}</h2>
                  <p className="muted">Last indexed {new Date(activeLibrary.updatedAt).toLocaleString()}</p>
                </div>
                <button disabled={busy} onClick={() => void rescanActive()}>Rescan folder</button>
              </section>

              <section className="stat-grid">
                <Stat label="Photos" value={activeLibrary.imageCount} />
                <Stat label="RAW" value={activeLibrary.rawCount} />
                <Stat label="Videos" value={activeLibrary.videoCount} />
                <Stat label="Sidecars" value={activeLibrary.sidecarCount} />
                <Stat label="Unknown" value={activeLibrary.unknownCount} warn={activeLibrary.unknownCount > 0} />
              </section>

              <section className="viewer-section">
                <div className="section-heading">
                  <div>
                    <div className="eyebrow">Viewer</div>
                    <h2>{images.length.toLocaleString()} indexed photos</h2>
                  </div>
                  <span className="muted">Showing {Math.min(visibleCount, images.length).toLocaleString()}</span>
                </div>
                {images.length === 0 ? (
                  <p className="muted">No browser-viewable image files were found.</p>
                ) : (
                  <div className="photo-grid">
                    {visibleImages.map((item) => (
                      <article className="photo-card" key={item.id}>
                        <div className="photo-preview"><LocalThumbnail item={item} /></div>
                        <div className="photo-meta">
                          <strong title={item.relativePath}>{item.name}</strong>
                          <span>{formatBytes(item.sizeBytes)}</span>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
                {visibleCount < images.length && (
                  <button className="load-more" onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}>
                    Show {Math.min(PAGE_SIZE, images.length - visibleCount)} more
                  </button>
                )}
              </section>

              <section className="diagnostics-section">
                <div className="section-heading">
                  <div>
                    <div className="eyebrow">Diagnostics</div>
                    <h2>Nothing disappears silently</h2>
                  </div>
                </div>
                {unknown.length === 0 ? (
                  <p className="muted">No unknown file types in this index.</p>
                ) : (
                  <ul className="diagnostic-list">
                    {unknown.slice(0, 12).map((item) => <li key={item.id}>[INFO] {item.relativePath}: unrecognized file type</li>)}
                    {unknown.length > 12 && <li>[INFO] …and {(unknown.length - 12).toLocaleString()} more unknown files</li>}
                  </ul>
                )}
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  )
}

function Stat({ label, value, warn = false }: { label: string; value: number; warn?: boolean }): JSX.Element {
  return <div className={warn ? 'stat-card warn' : 'stat-card'}><span>{label}</span><strong>{value.toLocaleString()}</strong></div>
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : 'Something went wrong.'
}

function isAbort(cause: unknown): boolean {
  return cause instanceof DOMException && cause.name === 'AbortError'
}
