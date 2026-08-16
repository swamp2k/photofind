import { useEffect, useState } from 'react'

export const UNDO_HISTORY_LIMIT = 20
export const UNDO_APPLIED_EVENT = 'photofind:undo-applied'

interface UndoEntry {
  id: number
  label: string
  undo(): Promise<void> | void
}

interface UndoState {
  count: number
  label: string | null
  busy: boolean
}

let entries: UndoEntry[] = []
let nextId = 1
let busy = false
const listeners = new Set<() => void>()

export function registerUndo(label: string, undo: UndoEntry['undo']): void {
  entries = [...entries, { id: nextId++, label, undo }].slice(-UNDO_HISTORY_LIMIT)
  emit()
}

export function clearUndoHistory(): void {
  if (entries.length === 0) return
  entries = []
  emit()
}

export async function undoLast(): Promise<void> {
  if (busy || entries.length === 0) return
  const entry = entries[entries.length - 1]
  entries = entries.slice(0, -1)
  busy = true
  emit()
  try {
    await entry.undo()
    window.dispatchEvent(new CustomEvent(UNDO_APPLIED_EVENT, { detail: { label: entry.label } }))
  } catch (cause) {
    entries = [...entries, entry].slice(-UNDO_HISTORY_LIMIT)
    throw cause
  } finally {
    busy = false
    emit()
  }
}

export function UndoControl({ onError }: { onError?(message: string): void }): JSX.Element {
  const state = useUndoState()

  useEffect(() => {
    const handler = (event: KeyboardEvent): void => {
      if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey || event.key.toLowerCase() !== 'z') return
      if (isEditableTarget(event.target) || state.busy || state.count === 0) return
      event.preventDefault()
      void undoLast().catch((cause) => onError?.(`Undo failed: ${messageOf(cause)}`))
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onError, state.busy, state.count])

  const title = state.label
    ? `Undo “${state.label}” · Ctrl+Z · ${state.count} step${state.count === 1 ? '' : 's'} available`
    : 'Nothing to undo'

  return (
    <button
      type="button"
      className="quiet-button"
      disabled={state.busy || state.count === 0}
      title={title}
      aria-label={state.label ? `Undo ${state.label}` : 'Nothing to undo'}
      aria-keyshortcuts="Control+Z Meta+Z"
      onClick={() => void undoLast().catch((cause) => onError?.(`Undo failed: ${messageOf(cause)}`))}
    >
      ↶ Undo{state.count > 0 ? ` (${state.count})` : ''}
    </button>
  )
}

function useUndoState(): UndoState {
  const [state, setState] = useState<UndoState>(() => snapshot())
  useEffect(() => {
    const listener = (): void => setState(snapshot())
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  }, [])
  return state
}

function snapshot(): UndoState {
  return {
    count: entries.length,
    label: entries[entries.length - 1]?.label ?? null,
    busy
  }
}

function emit(): void {
  for (const listener of listeners) listener()
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'))
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : 'Something went wrong.'
}
