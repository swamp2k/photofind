export interface LightboxMapFocus {
  itemId: string
  latitude: number
  longitude: number
  spanKm: number
}

const MAP_FOCUS_KEY = 'photofind:map-focus'

export function navigateToCapturedDate(time: number, onClose: () => void): void {
  const date = localDateInputValue(time)
  onClose()
  if (!clickMode('Library')) return
  retryFrame(() => {
    const panel = document.querySelector<HTMLElement>('.modern-filters')
    if (!panel) return false
    panel.querySelector<HTMLButtonElement>('.clear-filter-button')?.click()
    const inputs = Array.from(panel.querySelectorAll<HTMLInputElement>('input[type="date"]'))
    if (inputs.length < 2) return false
    setReactInputValue(inputs[0], date)
    setReactInputValue(inputs[1], date)
    return true
  })
}

export function navigateToMapFocus(focus: LightboxMapFocus, onClose: () => void): void {
  try { sessionStorage.setItem(MAP_FOCUS_KEY, JSON.stringify(focus)) } catch { /* best effort */ }
  onClose()
  clickMode('Map')
}

export function navigateToKnownEvent(title: string, onClose: () => void): void {
  onClose()
  if (!clickMode('Events')) return
  retryFrame(() => {
    const cards = Array.from(document.querySelectorAll<HTMLButtonElement>('.event-card'))
    const target = cards.find((card) => card.querySelector('.event-card-body > strong')?.textContent?.trim() === title)
    if (!target) return false
    target.click()
    target.scrollIntoView({ block: 'nearest' })
    return true
  }, 30)
}

export function consumePendingMapFocus(): LightboxMapFocus | null {
  try {
    const raw = sessionStorage.getItem(MAP_FOCUS_KEY)
    if (!raw) return null
    sessionStorage.removeItem(MAP_FOCUS_KEY)
    const parsed = JSON.parse(raw) as Partial<LightboxMapFocus>
    if (typeof parsed.itemId !== 'string' || typeof parsed.latitude !== 'number' || typeof parsed.longitude !== 'number') return null
    return {
      itemId: parsed.itemId,
      latitude: parsed.latitude,
      longitude: parsed.longitude,
      spanKm: typeof parsed.spanKm === 'number' && parsed.spanKm > 0 ? parsed.spanKm : 30
    }
  } catch {
    return null
  }
}

function clickMode(label: string): boolean {
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('.mode-nav button'))
  const target = buttons.find((button) => button.querySelector('strong')?.textContent?.trim() === label)
  if (!target || target.disabled) return false
  target.click()
  return true
}

function localDateInputValue(time: number): string {
  const date = new Date(time)
  const year = String(date.getFullYear())
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function setReactInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  setter?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

function retryFrame(action: () => boolean, attempts = 20): void {
  let remaining = attempts
  const run = (): void => {
    if (action() || remaining <= 0) return
    remaining -= 1
    requestAnimationFrame(run)
  }
  requestAnimationFrame(run)
}
