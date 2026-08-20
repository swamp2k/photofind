import { createContext, useContext, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'

export interface PhotoFindContextMenuAction {
  id: string
  label: string
  hint?: string
  danger?: boolean
  disabled?: boolean
  separatorBefore?: boolean
  children?: PhotoFindContextMenuAction[]
  onSelect(): void | Promise<void>
}

export interface PhotoFindContextMenuSpec {
  title?: string
  actions: PhotoFindContextMenuAction[]
}

export interface PhotoContextDescriptor {
  id: string
  name: string
  starred: boolean
  screenshot: boolean
  productPhotoOverride?: boolean
}

export interface PhotoContextEventDescriptor {
  id: string
  title: string
  hint?: string
  containsPhoto: boolean
}

export interface PhotoContextActions {
  resolvePhoto(id: string): PhotoContextDescriptor | null
  setStarred(id: string, starred: boolean): void | Promise<void>
  setScreenshot(id: string, screenshot: boolean): void | Promise<void>
  setProductPhoto?(photoIds: string[], productPhoto: boolean | null): void | Promise<void>
  listKnownEvents?(photoIds: string[]): PhotoContextEventDescriptor[]
  resolveEvent?(eventId: string, photoIds: string[]): PhotoContextEventDescriptor | null
  createEvent?(photoIds: string[]): void | Promise<void>
  addToEvent?(photoIds: string[], eventId: string): void | Promise<void>
  removeFromEvent?(photoIds: string[], eventId: string): void | Promise<void>
}

interface OpenMenuState extends PhotoFindContextMenuSpec {
  x: number
  y: number
  submenuLeft: boolean
}

interface ContextMenuApi {
  openContextMenu(event: ReactMouseEvent, spec: PhotoFindContextMenuSpec): void
  closeContextMenu(): void
  registerPhotoActions(actions: PhotoContextActions | null): void
  listKnownEvents(photoIds: string[]): PhotoContextEventDescriptor[]
  addToKnownEvent(photoIds: string[], eventId: string): void | Promise<void>
}

const ContextMenuContext = createContext<ContextMenuApi | null>(null)

export function PhotoFindContextMenuProvider({ children }: { children: ReactNode }): JSX.Element {
  const [menu, setMenu] = useState<OpenMenuState | null>(null)
  const claimed = useRef(false)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const photoActionsRef = useRef<PhotoContextActions | null>(null)

  const api = useMemo<ContextMenuApi>(() => ({
    openContextMenu(event, spec) {
      event.preventDefault()
      event.stopPropagation()
      claimed.current = true
      setMenu(positionMenu(event.clientX, event.clientY, spec))
    },
    closeContextMenu() {
      setMenu(null)
    },
    registerPhotoActions(actions) {
      photoActionsRef.current = actions
    },
    listKnownEvents(photoIds) {
      return photoActionsRef.current?.listKnownEvents?.(photoIds) ?? []
    },
    addToKnownEvent(photoIds, eventId) {
      return photoActionsRef.current?.addToEvent?.(photoIds, eventId)
    }
  }), [])

  useEffect(() => {
    const onContextMenu = (event: MouseEvent): void => {
      event.preventDefault()
      claimed.current = false
      const target = event.target

      const photoId = photoIdFromTarget(target)
      const photoActions = photoActionsRef.current
      const photo = photoId && photoActions ? photoActions.resolvePhoto(photoId) : null
      if (photo && photoActions) {
        event.stopPropagation()
        claimed.current = true
        const targetPhotoIds = contextPhotoTargets(photo.id, selectedPhotoIdsForTarget(target))
        const knownEvents = photoActions.listKnownEvents?.(targetPhotoIds) ?? []
        const currentEventId = eventIdFromTarget(target)
        const currentEvent = currentEventId ? photoActions.resolveEvent?.(currentEventId, targetPhotoIds) ?? null : null
        const copyImage = imageElementFromTarget(target)
        const addChildren: PhotoFindContextMenuAction[] = []
        if (photoActions.createEvent) {
          addChildren.push({
            id: 'create-new-event',
            label: 'Create new event…',
            onSelect: () => photoActions.createEvent?.(targetPhotoIds)
          })
        }
        if (knownEvents.length > 0) {
          for (const [index, knownEvent] of knownEvents.entries()) {
            addChildren.push({
              id: `add-event-${knownEvent.id}`,
              label: knownEvent.title,
              hint: knownEvent.containsPhoto ? 'Added' : knownEvent.hint,
              disabled: knownEvent.containsPhoto || !photoActions.addToEvent,
              separatorBefore: index === 0 && Boolean(photoActions.createEvent),
              onSelect: () => photoActions.addToEvent?.(targetPhotoIds, knownEvent.id)
            })
          }
        } else {
          addChildren.push({
            id: 'no-known-events',
            label: 'No known events yet',
            disabled: true,
            separatorBefore: Boolean(photoActions.createEvent),
            onSelect: () => undefined
          })
        }
        setMenu(positionMenu(event.clientX, event.clientY, {
          title: targetPhotoIds.length > 1 ? `${targetPhotoIds.length.toLocaleString()} selected photos` : photo.name,
          actions: [
            {
              id: 'copy-image',
              label: 'Copy image',
              disabled: !copyImage || typeof navigator.clipboard?.write !== 'function' || typeof ClipboardItem === 'undefined',
              onSelect: () => copyImage ? copyRenderedImageToClipboard(copyImage) : undefined
            },
            {
              id: 'toggle-starred',
              label: photo.starred ? 'Remove star' : 'Star photo',
              hint: '★',
              onSelect: () => photoActions.setStarred(photo.id, !photo.starred)
            },
            {
              id: 'add-to-event',
              label: 'Add to event…',
              hint: '›',
              separatorBefore: true,
              disabled: !photoActions.addToEvent && !photoActions.createEvent,
              children: addChildren,
              onSelect: () => undefined
            },
            ...(currentEvent && currentEvent.containsPhoto && photoActions.removeFromEvent ? [{
              id: 'remove-from-event',
              label: targetPhotoIds.length > 1 ? `Remove ${targetPhotoIds.length.toLocaleString()} photos from “${currentEvent.title}”` : `Remove from “${currentEvent.title}”`,
              onSelect: () => photoActions.removeFromEvent?.(targetPhotoIds, currentEvent.id)
            }] : []),
            ...(photoActions.setProductPhoto ? [{
              id: 'mark-product-photo',
              label: targetPhotoIds.length > 1 ? 'Mark selected as product photos' : 'Mark as product photo',
              separatorBefore: true,
              disabled: targetPhotoIds.length === 1 && photo.productPhotoOverride === true,
              onSelect: () => photoActions.setProductPhoto?.(targetPhotoIds, true)
            }, {
              id: 'not-product-photo',
              label: targetPhotoIds.length > 1 ? 'Selected are not product photos' : 'Not a product photo',
              disabled: targetPhotoIds.length === 1 && photo.productPhotoOverride === false,
              onSelect: () => photoActions.setProductPhoto?.(targetPhotoIds, false)
            }, {
              id: 'automatic-product-photo',
              label: 'Use automatic product detection',
              disabled: targetPhotoIds.length === 1 && photo.productPhotoOverride === undefined,
              onSelect: () => photoActions.setProductPhoto?.(targetPhotoIds, null)
            }] satisfies PhotoFindContextMenuAction[] : []),
            {
              id: 'mark-screenshot',
              label: 'Mark screenshot',
              disabled: photo.screenshot,
              separatorBefore: true,
              onSelect: () => photoActions.setScreenshot(photo.id, true)
            },
            {
              id: 'remove-screenshot',
              label: 'Remove screenshot',
              disabled: !photo.screenshot,
              onSelect: () => photoActions.setScreenshot(photo.id, false)
            }
          ]
        }))
        return
      }

      if (isTextControl(target)) {
        event.stopPropagation()
        claimed.current = true
        setMenu(positionMenu(event.clientX, event.clientY, textControlMenu(target)))
        return
      }

      const selectedText = window.getSelection()?.toString().trim() ?? ''
      queueMicrotask(() => {
        if (claimed.current) return
        setMenu(positionMenu(event.clientX, event.clientY, selectedText
          ? { title: 'PhotoFind', actions: [{ id: 'copy-selection', label: 'Copy selected text', onSelect: () => navigator.clipboard?.writeText(selectedText) }] }
          : { title: 'PhotoFind', actions: [{ id: 'no-actions', label: 'No actions for this area', disabled: true, onSelect: () => undefined }] }))
      })
    }
    const close = (event: PointerEvent): void => {
      if (menuRef.current?.contains(event.target as Node)) return
      setMenu(null)
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setMenu(null)
    }
    const closeOnResize = (): void => setMenu(null)
    const closeOnScroll = (event: Event): void => {
      if (event.target instanceof Node && menuRef.current?.contains(event.target)) return
      setMenu(null)
    }

    document.addEventListener('contextmenu', onContextMenu, true)
    document.addEventListener('pointerdown', close, true)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('resize', closeOnResize)
    window.addEventListener('scroll', closeOnScroll, true)
    return () => {
      document.removeEventListener('contextmenu', onContextMenu, true)
      document.removeEventListener('pointerdown', close, true)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('resize', closeOnResize)
      window.removeEventListener('scroll', closeOnScroll, true)
    }
  }, [])

  useEffect(() => {
    if (!menu) return
    const first = menuRef.current?.querySelector<HTMLButtonElement>(':scope > .pf-context-menu-row > button:not(:disabled)')
    first?.focus({ preventScroll: true })
  }, [menu])

  return (
    <ContextMenuContext.Provider value={api}>
      {children}
      {menu && (
        <div
          ref={menuRef}
          className={menu.submenuLeft ? 'pf-context-menu submenu-left' : 'pf-context-menu'}
          style={{ left: menu.x, top: menu.y }}
          role="menu"
          aria-label={menu.title ?? 'PhotoFind actions'}
          onContextMenu={(event) => event.preventDefault()}
          onKeyDown={handleMenuKeyboard}
        >
          {menu.title && <div className="pf-context-menu-title">{menu.title}</div>}
          {menu.actions.map((action) => (
            <div key={action.id} className={`${action.separatorBefore ? 'pf-context-menu-row separated' : 'pf-context-menu-row'}${action.children?.length ? ' has-submenu' : ''}`}>
              <button
                type="button"
                role="menuitem"
                aria-haspopup={action.children?.length ? 'menu' : undefined}
                className={action.danger ? 'danger' : ''}
                disabled={action.disabled}
                onClick={() => {
                  if (action.children?.length) return
                  setMenu(null)
                  void action.onSelect()
                }}
              >
                <span>{action.label}</span>
                {action.hint && <kbd>{action.hint}</kbd>}
              </button>
              {action.children?.length ? (
                <div className="pf-context-submenu" role="menu" aria-label={action.label}>
                  {action.children.map((child) => (
                    <div key={child.id} className={child.separatorBefore ? 'pf-context-menu-row separated' : 'pf-context-menu-row'}>
                      <button
                        type="button"
                        role="menuitem"
                        className={child.danger ? 'danger' : ''}
                        disabled={child.disabled}
                        onClick={() => {
                          setMenu(null)
                          void child.onSelect()
                        }}
                      >
                        <span>{child.label}</span>
                        {child.hint && <kbd>{child.hint}</kbd>}
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </ContextMenuContext.Provider>
  )
}

export function usePhotoFindContextMenu(): ContextMenuApi {
  const value = useContext(ContextMenuContext)
  if (!value) throw new Error('usePhotoFindContextMenu must be used inside PhotoFindContextMenuProvider.')
  return value
}

export function contextPhotoTargets(clickedPhotoId: string, selectedPhotoIds: readonly string[]): string[] {
  const selected = [...new Set(selectedPhotoIds.filter((id) => Boolean(id)))]
  return selected.includes(clickedPhotoId) ? selected : [clickedPhotoId]
}

function selectedPhotoIdsForTarget(target: EventTarget | null): string[] {
  if (!(target instanceof Element)) return []
  const owner = target.closest<HTMLElement>('[data-photofind-photo-id]')
  if (!owner?.closest('.explorer-selected')) return []
  return Array.from(document.querySelectorAll<HTMLElement>('.explorer-selected'))
    .map((selected) => selected.dataset.photofindPhotoId
      ?? selected.querySelector<HTMLElement>('[data-photofind-photo-id]')?.dataset.photofindPhotoId
      ?? '')
    .filter(Boolean)
}

function photoIdFromTarget(target: EventTarget | null): string | null {
  if (!(target instanceof Element)) return null
  if (target.closest('[data-photofind-event-card]')) return null
  const owner = target.closest<HTMLElement>('[data-photofind-photo-id]')
  return owner?.dataset.photofindPhotoId ?? null
}

function imageElementFromTarget(target: EventTarget | null): HTMLImageElement | null {
  if (!(target instanceof Element)) return null
  if (target instanceof HTMLImageElement) return target
  const owner = target.closest<HTMLElement>('[data-photofind-photo-id]')
  return owner?.querySelector<HTMLImageElement>('img') ?? null
}

function eventIdFromTarget(target: EventTarget | null): string | null {
  if (!(target instanceof Element)) return null
  return target.closest<HTMLElement>('[data-photofind-event-id]')?.dataset.photofindEventId ?? null
}

function positionMenu(x: number, y: number, spec: PhotoFindContextMenuSpec): OpenMenuState {
  const estimatedHeight = 38 + spec.actions.length * 38 + spec.actions.filter((action) => action.separatorBefore).length * 7
  const width = 250
  return {
    ...spec,
    x: Math.max(8, Math.min(x, window.innerWidth - width - 8)),
    y: Math.max(8, Math.min(y, window.innerHeight - estimatedHeight - 8)),
    submenuLeft: x + width * 2 + 18 > window.innerWidth
  }
}

function handleMenuKeyboard(event: React.KeyboardEvent<HTMLDivElement>): void {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
  event.preventDefault()
  const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>(':scope > .pf-context-menu-row > button:not(:disabled)'))
  if (buttons.length === 0) return
  const current = document.activeElement instanceof HTMLButtonElement ? buttons.indexOf(document.activeElement) : -1
  const delta = event.key === 'ArrowDown' ? 1 : -1
  const next = current < 0 ? 0 : (current + delta + buttons.length) % buttons.length
  buttons[next].focus()
}

function isTextControl(target: EventTarget | null): target is HTMLInputElement | HTMLTextAreaElement {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
}

function textControlMenu(target: HTMLInputElement | HTMLTextAreaElement): PhotoFindContextMenuSpec {
  const start = target.selectionStart ?? 0
  const end = target.selectionEnd ?? start
  const selected = target.value.slice(start, end)
  const editable = !target.readOnly && !target.disabled
  const clipboardWrite = typeof navigator.clipboard?.writeText === 'function'
  const clipboardRead = typeof navigator.clipboard?.readText === 'function'

  return {
    title: 'Text',
    actions: [
      {
        id: 'cut',
        label: 'Cut',
        disabled: !editable || !selected || !clipboardWrite,
        onSelect: async () => {
          await navigator.clipboard.writeText(selected)
          replaceTextSelection(target, '')
        }
      },
      {
        id: 'copy',
        label: 'Copy',
        disabled: !selected || !clipboardWrite,
        onSelect: () => navigator.clipboard.writeText(selected)
      },
      {
        id: 'paste',
        label: 'Paste',
        disabled: !editable || !clipboardRead,
        onSelect: async () => replaceTextSelection(target, await navigator.clipboard.readText())
      },
      {
        id: 'select-all',
        label: 'Select all',
        separatorBefore: true,
        onSelect: () => {
          target.focus()
          target.select()
        }
      }
    ]
  }
}

function replaceTextSelection(target: HTMLInputElement | HTMLTextAreaElement, text: string): void {
  const start = target.selectionStart ?? target.value.length
  const end = target.selectionEnd ?? start
  target.setRangeText(text, start, end, 'end')
  target.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }))
  target.focus()
}

function copyRenderedImageToClipboard(image: HTMLImageElement): Promise<void> {
  if (typeof navigator.clipboard?.write !== 'function' || typeof ClipboardItem === 'undefined') return Promise.resolve()
  if (!image.complete || image.naturalWidth < 1 || image.naturalHeight < 1) return Promise.reject(new Error('Image is not ready to copy.'))

  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  const context = canvas.getContext('2d')
  if (!context) return Promise.reject(new Error('Image clipboard conversion is unavailable.'))
  context.drawImage(image, 0, 0)

  const png = new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Could not prepare image for clipboard.')), 'image/png')
  })
  return navigator.clipboard.write([new ClipboardItem({ 'image/png': png })])
}