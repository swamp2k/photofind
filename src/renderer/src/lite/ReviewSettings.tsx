import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { SettingsPanel } from './SettingsPanel'

export type ReviewKeymapPreset = 'kmr' | 'asd' | '123'

export interface ReviewSettingsState {
  autoAdvance: boolean
  keymap: ReviewKeymapPreset
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
}

const STORAGE_KEY = 'photofind.review-settings.v1'
const DEFAULT_SETTINGS: ReviewSettingsState = { autoAdvance: true, keymap: 'kmr' }

const ReviewSettingsContext = createContext<ReviewSettingsContextValue | null>(null)

export function ReviewSettingsProvider({ children }: { children: ReactNode }): JSX.Element {
  const [settings, setSettings] = useState<ReviewSettingsState>(loadReviewSettings)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const bindings = useMemo(() => reviewBindings(settings.keymap), [settings.keymap])

  function update(next: ReviewSettingsState): void {
    setSettings(next)
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch { /* local preference persistence is best-effort */ }
  }

  const value: ReviewSettingsContextValue = {
    settings,
    bindings,
    setAutoAdvance: (next) => update({ ...settings, autoAdvance: next }),
    setKeymap: (next) => update({ ...settings, keymap: next })
  }

  return (
    <ReviewSettingsContext.Provider value={value}>
      {children}
      <button type="button" className="global-settings-button" aria-label="Open PhotoFind settings" title="Settings" onClick={() => setSettingsOpen(true)}>⚙</button>
      {settingsOpen && <div className="settings-backdrop" role="presentation" onMouseDown={() => setSettingsOpen(false)}><div className="settings-drawer" role="dialog" aria-modal="true" aria-label="PhotoFind settings" onMouseDown={(event) => event.stopPropagation()}><button type="button" className="settings-close" aria-label="Close settings" onClick={() => setSettingsOpen(false)}>×</button><SettingsPanel /></div></div>}
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
      keymap: parsed.keymap === 'asd' || parsed.keymap === '123' || parsed.keymap === 'kmr' ? parsed.keymap : DEFAULT_SETTINGS.keymap
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}
