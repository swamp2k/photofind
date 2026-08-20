import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { SettingsPanel } from './SettingsPanel'

export type ReviewKeymapPreset = 'kmr' | 'asd' | '123'
export type PhotoBatchSize = 250 | 500 | 1000 | 2000

export interface ReviewSettingsState {
  autoAdvance: boolean
  keymap: ReviewKeymapPreset
  photoBatchSize: number
  flowLoading: boolean
}

export interface ReviewKeyBindings {
  keep: string
  maybe: string
  reject: string
  reset: string
}

interface ReviewSettingsContextValue {
  settings: ReviewSettingsState
  bindings: ReviewKeyBindings
  setAutoAdvance(value: boolean): void
  setKeymap(value: ReviewKeymapPreset): void
  setPhotoBatchSize(value: PhotoBatchSize): void
  setFlowLoading(value: boolean): void
}

const STORAGE_KEY = 'photofind.review-settings.v1'
const DEFAULT_SETTINGS: ReviewSettingsState = { autoAdvance: true, keymap: 'kmr', photoBatchSize: 500, flowLoading: false }

const ReviewSettingsContext = createContext<ReviewSettingsContextValue | null>(null)

export function ReviewSettingsProvider({ children }: { children: ReactNode }): JSX.Element {
  const [settings, setSettings] = useState<ReviewSettingsState>(loadReviewSettings)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsNavHost, setSettingsNavHost] = useState<HTMLElement | null>(null)
  const bindings = useMemo(() => reviewBindings(settings.keymap), [settings.keymap])

  useEffect(() => {
    const host = document.querySelector<HTMLElement>('.mode-nav')
    setSettingsNavHost(host)
    return () => setSettingsNavHost(null)
  }, [])

  function update(next: ReviewSettingsState): void {
    setSettings(next)
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch { /* local preference persistence is best-effort */ }
  }

  const value: ReviewSettingsContextValue = {
    settings,
    bindings,
    setAutoAdvance: (next) => update({ ...settings, autoAdvance: next }),
    setKeymap: (next) => update({ ...settings, keymap: next }),
    setPhotoBatchSize: (next) => update({ ...settings, photoBatchSize: next }),
    setFlowLoading: (next) => update({ ...settings, flowLoading: next })
  }

  return (
    <ReviewSettingsContext.Provider value={value}>
      {children}
      {settingsNavHost && createPortal(
        <button type="button" className="mode-button settings-mode-button" aria-label="Open PhotoFind settings" title="Settings" onClick={() => setSettingsOpen(true)}>
          <span aria-hidden="true">⚙</span><strong>Settings</strong>
        </button>,
        settingsNavHost
      )}
      {settingsOpen && <div className="settings-backdrop" role="presentation" onMouseDown={() => setSettingsOpen(false)}><div className="settings-drawer" role="dialog" aria-modal="true" aria-label="PhotoFind settings" onMouseDown={(event) => event.stopPropagation()}><button type="button" className="settings-close" aria-label="Close settings" onClick={() => setSettingsOpen(false)}>×</button><SettingsPanel settings={settings} bindings={bindings} onAutoAdvance={(next) => update({ ...settings, autoAdvance: next })} onKeymap={(next) => update({ ...settings, keymap: next })} onPhotoBatchSize={(next) => update({ ...settings, photoBatchSize: next })} onFlowLoading={(next) => update({ ...settings, flowLoading: next })} /></div></div>}
    </ReviewSettingsContext.Provider>
  )
}

export function useReviewSettings(): ReviewSettingsContextValue {
  const value = useContext(ReviewSettingsContext)
  if (!value) throw new Error('useReviewSettings must be used inside ReviewSettingsProvider.')
  return value
}

export function reviewBindings(preset: ReviewKeymapPreset): ReviewKeyBindings {
  if (preset === 'asd') return { keep: 'a', maybe: 's', reject: 'd', reset: 'u' }
  if (preset === '123') return { keep: '1', maybe: '2', reject: '3', reset: 'u' }
  return { keep: 'k', maybe: 'm', reject: 'r', reset: 'u' }
}

export function loadReviewSettings(storage?: Pick<Storage, 'getItem'>): ReviewSettingsState {
  try {
    const source = storage ?? localStorage
    const raw = source.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_SETTINGS
    const parsed = JSON.parse(raw) as Partial<ReviewSettingsState>
    return {
      autoAdvance: typeof parsed.autoAdvance === 'boolean' ? parsed.autoAdvance : DEFAULT_SETTINGS.autoAdvance,
      keymap: parsed.keymap === 'asd' || parsed.keymap === '123' || parsed.keymap === 'kmr' ? parsed.keymap : DEFAULT_SETTINGS.keymap,
      photoBatchSize: isPhotoBatchSize(parsed.photoBatchSize) ? parsed.photoBatchSize : DEFAULT_SETTINGS.photoBatchSize,
      flowLoading: typeof parsed.flowLoading === 'boolean' ? parsed.flowLoading : DEFAULT_SETTINGS.flowLoading
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

function isPhotoBatchSize(value: unknown): value is PhotoBatchSize {
  return value === 250 || value === 500 || value === 1000 || value === 2000
}
