import type { PhotoBatchSize, ReviewKeyBindings, ReviewKeymapPreset, ReviewSettingsState } from './ReviewSettings'

const KEYMAPS: Array<{ id: ReviewKeymapPreset; label: string; detail: string; keys: [string, string, string] }> = [
  { id: 'kmr', label: 'K / M / R', detail: 'Keep K · Maybe M · Reject R', keys: ['K', 'M', 'R'] },
  { id: 'asd', label: 'A / S / D', detail: 'Keep A · Maybe S · Reject D', keys: ['A', 'S', 'D'] },
  { id: '123', label: '1 / 2 / 3', detail: 'Keep 1 · Maybe 2 · Reject 3', keys: ['1', '2', '3'] }
]

const PHOTO_BATCH_SIZES: PhotoBatchSize[] = [250, 500, 1000, 2000]

interface SettingsPanelProps {
  settings: ReviewSettingsState
  bindings: ReviewKeyBindings
  onAutoAdvance(value: boolean): void
  onKeymap(value: ReviewKeymapPreset): void
  onPhotoBatchSize(value: PhotoBatchSize): void
  onFlowLoading(value: boolean): void
}

export function SettingsPanel({ settings, bindings, onAutoAdvance, onKeymap, onPhotoBatchSize, onFlowLoading }: SettingsPanelProps): JSX.Element {
  return (
    <section className="settings-page">
      <div className="settings-hero">
        <div className="eyebrow">Local preferences</div>
        <h1>Settings</h1>
        <p>Preferences are stored only in this browser. They do not alter source photos or travel with exports.</p>
      </div>

      <section className="settings-card">
        <div className="settings-card-head"><div><h2>Photo loading</h2><p>Choose how many thumbnails Library and Selection add at a time.</p></div></div>
        <label className="settings-select-row">
          <span><strong>Photos per batch</strong><small>Larger batches reduce clicks but use more memory and decoding work.</small></span>
          <select value={settings.photoBatchSize} onChange={(event) => onPhotoBatchSize(Number(event.target.value) as PhotoBatchSize)}>
            {PHOTO_BATCH_SIZES.map((size) => <option value={size} key={size}>{size.toLocaleString()}</option>)}
          </select>
        </label>
        <label className="settings-toggle settings-flow-toggle">
          <input type="checkbox" checked={settings.flowLoading} onChange={(event) => onFlowLoading(event.target.checked)} />
          <span><strong>Flow loading</strong><small>Automatically add the next batch as you reach the end of the current photos.</small></span>
        </label>
      </section>

      <section className="settings-card">
        <div className="settings-card-head"><div><h2>Review flow</h2><p>Choose whether a decision immediately continues to the next photo.</p></div></div>
        <label className="settings-toggle">
          <input type="checkbox" checked={settings.autoAdvance} onChange={(event) => onAutoAdvance(event.target.checked)} />
          <span><strong>Auto-advance after Keep, Maybe or Reject</strong><small>Applies in focused Review and full-size photo previews. Resetting to Unreviewed never auto-advances.</small></span>
        </label>
      </section>

      <section className="settings-card">
        <div className="settings-card-head"><div><h2>Review keyboard</h2><p>Left and Right arrows always navigate. Pick the decision keys that feel most natural.</p></div><span className="settings-current-keys">{bindings.keep.toUpperCase()} · {bindings.maybe.toUpperCase()} · {bindings.reject.toUpperCase()}</span></div>
        <div className="keymap-options">
          {KEYMAPS.map((option) => <label className={settings.keymap === option.id ? 'keymap-option active' : 'keymap-option'} key={option.id}>
            <input type="radio" name="review-keymap" checked={settings.keymap === option.id} onChange={() => onKeymap(option.id)} />
            <span><strong>{option.label}</strong><small>{option.detail}</small></span>
            <div className="keymap-keys">{option.keys.map((key) => <kbd key={key}>{key}</kbd>)}</div>
          </label>)}
        </div>
        <p className="settings-footnote"><kbd>←</kbd> <kbd>→</kbd> always navigate · <kbd>U</kbd> always resets to Unreviewed · <kbd>Esc</kbd> closes/exits.</p>
      </section>
    </section>
  )
}
