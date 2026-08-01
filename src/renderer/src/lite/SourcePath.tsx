import { useState } from 'react'
import { sourceFolderLabel, sourceFolderOf } from './sourcePaths'
import { useSourceNavigation } from './SourceNavigation'
import type { LiteMediaRecord } from './types'

export function SourcePath({ item, compact = false }: { item: Pick<LiteMediaRecord, 'relativePath'>; compact?: boolean }): JSX.Element {
  const [copied, setCopied] = useState(false)
  const folder = sourceFolderOf(item.relativePath)

  async function copyPath(): Promise<void> {
    try {
      await navigator.clipboard.writeText(item.relativePath)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className={compact ? 'source-path compact' : 'source-path'}>
      <div className="source-folder-row">
        <span className="source-path-label">Folder</span>
        <SourceFolderButton folder={folder} />
      </div>
      {!compact && <div className="source-relative-row"><span className="source-path-label">Relative path</span><code title={item.relativePath}>{item.relativePath}</code><button type="button" className="copy-path-button" onClick={() => void copyPath()}>{copied ? 'Copied' : 'Copy path'}</button></div>}
    </div>
  )
}

export function SourceFolderButton({ folder, count }: { folder: string; count?: number }): JSX.Element {
  const navigation = useSourceNavigation()
  const label = sourceFolderLabel(folder)
  if (!navigation) return <strong>{label}{typeof count === 'number' ? ` · ${count}` : ''}</strong>
  return <button type="button" className="source-folder-link" onClick={() => navigation.showFolder(folder)} title="Show every photo from this exact folder in Library">{label}{typeof count === 'number' && <b>{count}</b>}</button>
}
