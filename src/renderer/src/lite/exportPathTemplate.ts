import type { LiteMediaRecord } from './types'

export const DEFAULT_EXPORT_FOLDER_TEMPLATE = '{YYYY}/{YYYY}.{MM} - {EVENT}'

export const EXPORT_FOLDER_TEMPLATE_PRESETS: Array<{ label: string; value: string }> = [
  { label: 'Year / YYYY.MM + event', value: '{YYYY}/{YYYY}.{MM} - {EVENT}' },
  { label: 'Year / dated event', value: '{YYYY}/{YYYY}.{MM}.{DD} - {EVENT}' },
  { label: 'Year / month / day', value: '{YYYY}/{MM}/{DD}' },
  { label: 'Event / year / month', value: '{EVENT}/{YYYY}/{MM}' },
  { label: 'Flat export root', value: '' }
]

export const EXPORT_FOLDER_TEMPLATE_TOKENS = ['{YYYY}', '{MM}', '{DD}', '{EVENT}'] as const

interface ExportTemplateValues {
  YYYY: string
  MM: string
  DD: string
  EVENT: string
}

export function exportTemplateValues(item: LiteMediaRecord, eventName?: string): ExportTemplateValues {
  const date = typeof item.effectiveCaptureTime === 'number' ? new Date(item.effectiveCaptureTime) : null
  const validDate = date !== null && !Number.isNaN(date.getTime())
  return {
    YYYY: validDate ? String(date.getFullYear()).padStart(4, '0') : 'Undated',
    MM: validDate ? String(date.getMonth() + 1).padStart(2, '0') : '',
    DD: validDate ? String(date.getDate()).padStart(2, '0') : '',
    EVENT: eventName?.trim() ?? ''
  }
}

export function validateExportFolderTemplate(template: string): string | null {
  const unknown = Array.from(template.matchAll(/\{([^{}]+)\}/g))
    .map((match) => match[1])
    .filter((token) => !['YYYY', 'MM', 'DD', 'EVENT'].includes(token))
  if (unknown.length > 0) return `Unknown placeholder: {${unknown[0]}}`
  if (template.includes('{') || template.includes('}')) {
    const stripped = template.replace(/\{(?:YYYY|MM|DD|EVENT)\}/g, '')
    if (stripped.includes('{') || stripped.includes('}')) return 'Folder template contains an unmatched brace.'
  }
  return null
}

export function renderExportFolderTemplate(item: LiteMediaRecord, template: string, eventName?: string): string[] {
  const validation = validateExportFolderTemplate(template)
  if (validation) throw new Error(validation)
  return renderTemplate(template, exportTemplateValues(item, eventName))
}

export function previewExportFolderTemplate(item: LiteMediaRecord | undefined, template: string, eventName?: string): string {
  if (!item) return template.trim() ? '(select a photo to preview)' : '(export root)'
  const validation = validateExportFolderTemplate(template)
  if (validation) return validation
  const directories = renderTemplate(template, exportTemplateValues(item, eventName))
  return directories.length > 0 ? `${directories.join('/')}/` : '(export root)'
}

function renderTemplate(template: string, values: ExportTemplateValues): string[] {
  const normalized = template.replaceAll('\\', '/').trim()
  if (!normalized) return []

  return normalized
    .split('/')
    .map((segment) => renderSegment(segment, values))
    .filter((segment): segment is string => Boolean(segment))
}

function renderSegment(segment: string, values: ExportTemplateValues): string | null {
  let rendered = segment.replace(/\{(YYYY|MM|DD|EVENT)\}/g, (_, token: keyof ExportTemplateValues) => values[token])
  rendered = rendered
    .replace(/\(\s*\)|\[\s*\]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()

  // Missing optional values such as EVENT should not leave cosmetic separators behind.
  rendered = rendered.replace(/^[\s._-]+|[\s._-]+$/g, '').trim()
  if (!rendered) return null

  const safe = sanitizeTemplateSegment(rendered)
  return safe ? safe : null
}

export function sanitizeTemplateSegment(value: string): string {
  const cleaned = value
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/[. ]+$/g, '')
    .trim()
  if (!cleaned || cleaned === '.' || cleaned === '..') return ''
  return cleaned
}
