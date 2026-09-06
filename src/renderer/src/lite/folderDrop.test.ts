import { describe, expect, it } from 'vitest'
import { describeFolderFailures, dragEventCarriesFiles, readDroppedFolders, summarizeFolderBatch } from './folderDrop'

interface StubEntry {
  name: string
  isDirectory: boolean
  isFile: boolean
  children?: StubEntry[]
  contents?: string
}

function directoryEntry(name: string, children: StubEntry[]): StubEntry {
  return { name, isDirectory: true, isFile: false, children }
}

function fileEntry(name: string, contents = 'x'): StubEntry {
  return { name, isDirectory: false, isFile: true, contents }
}

function asDomEntry(entry: StubEntry): unknown {
  if (!entry.isDirectory) {
    return {
      ...entry,
      file: (resolve: (file: File) => void) => resolve(new File([entry.contents ?? ''], entry.name))
    }
  }
  return {
    ...entry,
    createReader: () => {
      let served = false
      return {
        readEntries: (resolve: (batch: unknown[]) => void) => {
          if (served) { resolve([]); return }
          served = true
          resolve((entry.children ?? []).map(asDomEntry))
        }
      }
    }
  }
}

function handleItem(name: string, kind: 'directory' | 'file'): DataTransferItem {
  return {
    kind: 'file',
    type: '',
    getAsFile: () => null,
    getAsFileSystemHandle: () => Promise.resolve({ kind, name })
  } as unknown as DataTransferItem
}

function entryItem(entry: StubEntry): DataTransferItem {
  return {
    kind: 'file',
    type: '',
    getAsFile: () => null,
    webkitGetAsEntry: () => asDomEntry(entry)
  } as unknown as DataTransferItem
}

function transferOf(items: DataTransferItem[], types: string[] = ['Files']): DataTransfer {
  return { types, items } as unknown as DataTransfer
}

describe('dragEventCarriesFiles', () => {
  it('accepts a transfer that advertises files', () => {
    expect(dragEventCarriesFiles(transferOf([]))).toBe(true)
  })

  it('accepts a transfer whose items are files even without the Files type', () => {
    expect(dragEventCarriesFiles(transferOf([handleItem('Holiday', 'directory')], []))).toBe(true)
  })

  it('rejects text drags and missing transfers', () => {
    expect(dragEventCarriesFiles(transferOf([{ kind: 'string' } as unknown as DataTransferItem], ['text/plain']))).toBe(false)
    expect(dragEventCarriesFiles(null)).toBe(false)
  })
})

describe('readDroppedFolders', () => {
  it('returns every dropped directory handle and reports non-folder items', async () => {
    const result = await readDroppedFolders(transferOf([
      handleItem('Holiday 2024', 'directory'),
      handleItem('Takeout', 'directory'),
      handleItem('note.txt', 'file')
    ]))

    expect(result.sources.map((source) => source.name)).toEqual(['Holiday 2024', 'Takeout'])
    expect(result.sources.every((source) => source.kind === 'handle')).toBe(true)
    expect(result.ignored).toEqual(['note.txt'])
  })

  it('reads dropped directory entries recursively when handles are unavailable', async () => {
    const result = await readDroppedFolders(transferOf([
      entryItem(directoryEntry('Holiday', [
        fileEntry('beach.jpg'),
        directoryEntry('raw', [fileEntry('beach.dng')])
      ])),
      entryItem(fileEntry('loose.jpg'))
    ]))

    expect(result.ignored).toEqual(['loose.jpg'])
    expect(result.sources).toHaveLength(1)
    const source = result.sources[0]
    if (source.kind !== 'selection') throw new Error('expected a selection source')
    expect(source.name).toBe('Holiday')
    expect(source.files.map((entry) => entry.relativePath)).toEqual(['Holiday/beach.jpg', 'Holiday/raw/beach.dng'])
  })

  it('captures every dropped item before awaiting, because the item list only lives for the drop event', async () => {
    const asked: string[] = []
    const items = ['a', 'b', 'c'].map((name) => ({
      kind: 'file',
      type: '',
      getAsFile: () => null,
      getAsFileSystemHandle: () => {
        asked.push(name)
        return Promise.resolve({ kind: 'directory', name })
      }
    }) as unknown as DataTransferItem)

    const pending = readDroppedFolders(transferOf(items))
    expect(asked).toEqual(['a', 'b', 'c'])
    expect((await pending).sources).toHaveLength(3)
  })

  it('skips items that resolve to nothing readable', async () => {
    const result = await readDroppedFolders(transferOf([
      { kind: 'string', type: 'text/plain' } as unknown as DataTransferItem,
      { kind: 'file', type: '', getAsFile: () => null } as unknown as DataTransferItem
    ]))
    expect(result.sources).toEqual([])
    expect(result.ignored).toEqual([])
  })
})

describe('summarizeFolderBatch', () => {
  it('reports added, rescanned, skipped and failed folders', () => {
    expect(summarizeFolderBatch({
      added: ['A', 'B'],
      rescanned: ['C'],
      failed: [{ name: 'D', message: 'Permission denied' }],
      ignored: ['note.txt']
    })).toBe('2 folders indexed · 1 already-known folder rescanned · 1 dropped item skipped because it is not a folder · 1 folder failed.')
  })

  it('uses singular wording for a single folder', () => {
    expect(summarizeFolderBatch({ added: ['A'], rescanned: [], failed: [], ignored: [] })).toBe('1 folder indexed.')
  })

  it('returns nothing when there is nothing to report', () => {
    expect(summarizeFolderBatch({ added: [], rescanned: [], failed: [], ignored: [] })).toBeNull()
  })
})

describe('describeFolderFailures', () => {
  it('names each folder and its reason', () => {
    expect(describeFolderFailures([{ name: 'Holiday', message: 'Permission denied' }]))
      .toBe('These folders could not be indexed: “Holiday” (Permission denied)')
  })

  it('returns nothing when every folder succeeded', () => {
    expect(describeFolderFailures([])).toBeNull()
  })
})
