import { useEffect, useState } from 'react'
import { listLibraries, loadMedia } from './libraryDb'
import { isRejected } from './review'
import { isStarred } from './starred'
import type { LiteMediaRecord } from './types'
import { LIBRARY_STATE_CHANGED_EVENT } from './undoHistory'

interface GlobalStarredState {
  items: LiteMediaRecord[]
  loading: boolean
  error: string | null
  libraryCount: number
}

const EMPTY_STATE: GlobalStarredState = { items: [], loading: false, error: null, libraryCount: 0 }

export function useGlobalStarredPhotos(enabled: boolean): GlobalStarredState {
  const [state, setState] = useState<GlobalStarredState>(EMPTY_STATE)
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    if (!enabled) return
    const refresh = (): void => setRevision((value) => value + 1)
    window.addEventListener(LIBRARY_STATE_CHANGED_EVENT, refresh)
    return () => window.removeEventListener(LIBRARY_STATE_CHANGED_EVENT, refresh)
  }, [enabled])

  useEffect(() => {
    let cancelled = false
    if (!enabled) {
      setState(EMPTY_STATE)
      return () => { cancelled = true }
    }

    setState((current) => ({ ...current, loading: true, error: null }))
    void (async () => {
      try {
        const libraries = await listLibraries()
        const mediaSets = await Promise.all(libraries.map((library) => loadMedia(library.id)))
        if (cancelled) return
        const seen = new Set<string>()
        const items = mediaSets
          .flat()
          .filter((item) => item.kind === 'image' && !isRejected(item) && isStarred(item))
          .filter((item) => {
            const key = `${item.libraryId}:${item.id}`
            if (seen.has(key)) return false
            seen.add(key)
            return true
          })
        setState({ items, loading: false, error: null, libraryCount: libraries.length })
      } catch (cause) {
        if (cancelled) return
        setState({ items: [], loading: false, error: cause instanceof Error ? cause.message : String(cause), libraryCount: 0 })
      }
    })()

    return () => { cancelled = true }
  }, [enabled, revision])

  return state
}
