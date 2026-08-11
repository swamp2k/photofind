import { reviewBindings, useReviewSettings, type ReviewKeymapPreset } from './ReviewSettings'

const KEYMAPS: Array<{ id: ReviewKeymapPreset; label: string; detail: string }> = [
  { id: 'kmr', label: 'K / M / R', detail: 'Keep K · Maybe M · Reject R' },
  { id: 'asd', label: 'A / S / D', detail: 'Keep A · Maybe S · Reject D' },
  { id: '123', label: '1 / 2 / 3', detail: 'Keep 1 · Maybe 2 · Reject 3' }
]

export function SettingsPanel(): JSX.Element {
  const { settings, bindings, setAutoAdvance, setKeymap } = useReviewSettings()
  return (
    <section className="settings-page">
      <div className="settings-hero">
        <div className="eyebrow">Local preferences</div>
        <h1>Settings</h1>
        <p>Review preferences are stored only in this browser. They do not alter source photos or travel with exports.</p>
      </div>

      <section className="settings-card">
        <div className="settings-card-head"><div><h2>Review flow</h2><p>Choose whether a decision immediately continues to the next photo.</p></div></div>
        <label className="settings-toggle">
          <input type="checkbox" checked={settings.autoAdvance} onChange={(event) => setAutoAdvance(event.target.checked)} />
          <span><strong>Auto-advance after Keep, Maybe or Reject</strong><small>Applies in focused Review and full-size photo previews. Resetting to Unreviewed never auto-advances.</small></span>
        </label>
      </section>

      <section className="settings-card">
        <div className="settings-card-head"><div><h2>Review keyboard</h2><p>Left and Right arrows always navigate. Pick the decision keys that feel most natural.</p></div><span className="settings-current-keys">{bindings.keep.toUpperCase()} · {bindings.maybe.toUpperCase()} · {bindings.reject.toUpperCase()}</span></div>
        <div className="keymap-options">
          {KEYMAPS.map((option) => {
            const optionBindings = reviewBindings(option.id)
            return <label className={settings.keymap === option.id ? 'keymap-option active' : 'keymap-option'} key={option.id}>
              <input type="radio" name="review-keymap" checked={settings.keymap === option.id} onChange={() => setKeymap(option.id)} />
              <span><strong>{option.label}</strong><small>{option.detail}</small></span>
              <div className="keymap-keys"><kbd>{optionBindings.keep.toUpperCase()}</kbd><kbd>{optionBindings.maybe.toUpperCase()}</kbd><kbd>{optionBindings.reject.toUpperCase()}</kbd></div>
            </label>
          })}
        </div>
        <p className="settings-footnote"><kbd>←</kbd> <kbd>→</kbd> always navigate · <kbd>U</kbd> always resets to Unreviewed · <kbd>Esc</kbd> closes/exits.</p>
      </section>
    </section>
  )
}
