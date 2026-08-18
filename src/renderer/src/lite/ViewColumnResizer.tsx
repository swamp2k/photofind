import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

const STORAGE_KEY = 'photofind-view-sidebar-width'
const DEFAULT_WIDTH = 390
const MIN_WIDTH = 300

export function ViewColumnResizer(): JSX.Element | null {
  const [target, setTarget] = useState<HTMLElement | null>(null)

  useEffect(() => {
    const main = document.querySelector<HTMLElement>('.pf-main')
    if (!main) return
    setTarget(main)
    const stored = Number(window.localStorage.getItem(STORAGE_KEY))
    const width = Number.isFinite(stored) && stored >= MIN_WIDTH ? stored : DEFAULT_WIDTH
    main.style.setProperty('--view-sidebar-width', `${width}px`)

    let observedFilter: HTMLElement | null = null
    const resizeObserver = new ResizeObserver(() => updateFilterHeight())
    const updateFilterHeight = (): void => {
      const filter = main.querySelector<HTMLElement>(':scope > .filter-disclosure')
      if (filter !== observedFilter) {
        if (observedFilter) resizeObserver.unobserve(observedFilter)
        observedFilter = filter
        if (observedFilter) resizeObserver.observe(observedFilter)
      }
      main.style.setProperty('--shared-filter-height', `${filter ? Math.ceil(filter.getBoundingClientRect().height) : 0}px`)
    }
    const mutationObserver = new MutationObserver(updateFilterHeight)
    mutationObserver.observe(main, { childList: true, subtree: false })
    updateFilterHeight()

    return () => {
      mutationObserver.disconnect()
      resizeObserver.disconnect()
    }
  }, [])

  if (!target) return null

  function beginResize(event: React.PointerEvent<HTMLDivElement>): void {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    const onMove = (moveEvent: PointerEvent): void => {
      const rect = target.getBoundingClientRect()
      const maxWidth = Math.max(MIN_WIDTH, Math.min(720, rect.width * 0.55))
      const width = Math.round(Math.max(MIN_WIDTH, Math.min(maxWidth, rect.right - moveEvent.clientX - 18)))
      target.style.setProperty('--view-sidebar-width', `${width}px`)
      try { window.localStorage.setItem(STORAGE_KEY, String(width)) } catch { /* best effort */ }
    }
    const stop = (): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
      document.body.classList.remove('resizing-view-sidebar')
    }
    document.body.classList.add('resizing-view-sidebar')
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
  }

  return createPortal(
    <div className="view-column-resizer" role="separator" aria-orientation="vertical" aria-label="Resize filter column" title="Drag to resize filter column" onPointerDown={beginResize}><span /></div>,
    target
  )
}
