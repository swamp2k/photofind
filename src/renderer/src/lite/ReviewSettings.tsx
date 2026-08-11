import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'

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
  const bindings = useMemo(() => reviewBindings(settings.keymap), [settings.keymap])

  function update(next: ReviewSettingsState): void {
    setSettings(next)
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch { /* local preference persistence is best-effort */ }
  }

  return (
    <ReviewSettingsContext.Provider value={{
      settings,
      bindings,
      setAutoAdvance: (value) => update({ ...settings, autoAdvance: value }),
      setKeymap: (value) => update({ ...settings, keymap: value })
    }}>
      {children}
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

export function loadReviewSettings(storage: Pick<Storage, 'getItem'> = localStorage): ReviewSettingsState {
  try {
    const raw = storage.getItem(STORAGE_KEY)
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
