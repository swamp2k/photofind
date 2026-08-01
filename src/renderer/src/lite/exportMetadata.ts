import piexif from 'piexifjs'
import type { LiteMediaRecord } from './types'

export type LiteExportMetadataMode = 'embedded' | 'sidecar' | 'unchanged'

export interface LitePreparedExport {
  blob: Blob
  metadataMode: LiteExportMetadataMode
  sidecar?: Blob
  notes: string[]
}

export async function prepareMetadataAwareExport(
  item: LiteMediaRecord,
  source: File,
  embedMetadata: boolean
): Promise<LitePreparedExport> {
  if (!embedMetadata) return { blob: source, metadataMode: 'unchanged', notes: [] }

  const normalized = exportMetadataFor(item)
  if (!normalized.captureTime && !normalized.location) {
    return { blob: source, metadataMode: 'unchanged', notes: ['No reliable normalized date or location was available to write.'] }
  }

  if (isJpeg(source, item.name)) {
    try {
      const blob = await writeJpegExif(source, normalized)
      return {
        blob,
        metadataMode: 'embedded',
        notes: ['Reliable normalized date/location metadata was embedded in the exported JPEG copy.']
      }
    } catch (cause) {
      return {
        blob: source,
        metadataMode: 'sidecar',
        sidecar: buildXmpSidecar(item, normalized),
        notes: [`JPEG EXIF writing failed; wrote an XMP sidecar instead: ${messageOf(cause)}`]
      }
    }
  }

  return {
    blob: source,
    metadataMode: 'sidecar',
    sidecar: buildXmpSidecar(item, normalized),
    notes: ['This format was copied unchanged and received an XMP sidecar with normalized metadata.']
  }
}

export function formatExifDate(time: number): string {
  const date = new Date(time)
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${date.getFullYear()}:${pad(date.getMonth() + 1)}:${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

export function decimalToDmsRational(value: number): Array<[number, number]> {
  const absolute = Math.abs(value)
  const degrees = Math.floor(absolute)
  const minutesFloat = (absolute - degrees) * 60
  const minutes = Math.floor(minutesFloat)
  const seconds = (minutesFloat - minutes) * 60
  return [[degrees, 1], [minutes, 1], [Math.round(seconds * 10_000), 10_000]]
}

export function xmpSidecarName(exportedFileName: string): string {
  const dot = exportedFileName.lastIndexOf('.')
  return `${dot > 0 ? exportedFileName.slice(0, dot) : exportedFileName}.xmp`
}

function exportMetadataFor(item: LiteMediaRecord): {
  captureTime?: number
  location?: { latitude: number; longitude: number }
} {
  const captureTime = item.captureTimeSource !== 'file' && isFinitePositive(item.effectiveCaptureTime)
    ? item.effectiveCaptureTime
    : undefined
  const location = validLocation(item.latitude, item.longitude)
  return {
    ...(captureTime ? { captureTime } : {}),
    ...(location ? { location } : {})
  }
}

async function writeJpegExif(
  source: File,
  metadata: { captureTime?: number; location?: { latitude: number; longitude: number } }
): Promise<Blob> {
  const binary = arrayBufferToBinary(await source.arrayBuffer())
  let exif: ReturnType<typeof piexif.load>
  try {
    exif = piexif.load(binary)
  } catch {
    exif = { '0th': {}, Exif: {}, GPS: {} }
  }
  exif['0th'] ??= {}
  exif.Exif ??= {}
  exif.GPS ??= {}

  if (metadata.captureTime) {
    const value = formatExifDate(metadata.captureTime)
    exif['0th'][piexif.ImageIFD.DateTime] = value
    exif.Exif[piexif.ExifIFD.DateTimeOriginal] = value
    exif.Exif[piexif.ExifIFD.DateTimeDigitized] = value
  }

  if (metadata.location) {
    const { latitude, longitude } = metadata.location
    exif.GPS[piexif.GPSIFD.GPSLatitudeRef] = latitude < 0 ? 'S' : 'N'
    exif.GPS[piexif.GPSIFD.GPSLatitude] = decimalToDmsRational(latitude)
    exif.GPS[piexif.GPSIFD.GPSLongitudeRef] = longitude < 0 ? 'W' : 'E'
    exif.GPS[piexif.GPSIFD.GPSLongitude] = decimalToDmsRational(longitude)
  }

  if (piexif.ImageIFD.Software) exif['0th'][piexif.ImageIFD.Software] = 'PhotoFind Lite'
  const output = piexif.insert(piexif.dump(exif), binary)
  return new Blob([binaryToArrayBuffer(output)], { type: 'image/jpeg' })
}

function buildXmpSidecar(
  item: LiteMediaRecord,
  metadata: { captureTime?: number; location?: { latitude: number; longitude: number } }
): Blob {
  const capture = metadata.captureTime ? new Date(metadata.captureTime).toISOString() : undefined
  const latitude = metadata.location?.latitude
  const longitude = metadata.location?.longitude
  const attributes = [
    'xmlns:x="adobe:ns:meta/"',
    'xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"',
    'xmlns:xmp="http://ns.adobe.com/xap/1.0/"',
    'xmlns:exif="http://ns.adobe.com/exif/1.0/"',
    'xmlns:dc="http://purl.org/dc/elements/1.1/"',
    ...(capture ? [`xmp:CreateDate="${escapeXml(capture)}"`, `exif:DateTimeOriginal="${escapeXml(capture)}"`] : []),
    ...(typeof latitude === 'number' ? [`exif:GPSLatitude="${latitude}"`] : []),
    ...(typeof longitude === 'number' ? [`exif:GPSLongitude="${longitude}"`] : [])
  ].join(' ')
  const xml = `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>\n<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="PhotoFind Lite">\n  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">\n    <rdf:Description rdf:about="" ${attributes}>\n      <dc:source><rdf:Bag><rdf:li>${escapeXml(item.relativePath)}</rdf:li></rdf:Bag></dc:source>\n    </rdf:Description>\n  </rdf:RDF>\n</x:xmpmeta>\n<?xpacket end="w"?>\n`
  return new Blob([xml], { type: 'application/rdf+xml' })
}

function arrayBufferToBinary(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  const chunks: string[] = []
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) {
    chunks.push(String.fromCharCode(...bytes.subarray(index, Math.min(index + chunkSize, bytes.length))))
  }
  return chunks.join('')
}

function binaryToArrayBuffer(binary: string): ArrayBuffer {
  const buffer = new ArrayBuffer(binary.length)
  const bytes = new Uint8Array(buffer)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index) & 0xff
  return buffer
}

function isJpeg(file: File, name: string): boolean {
  return file.type === 'image/jpeg' || /\.jpe?g$/i.test(name)
}

function isFinitePositive(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function validLocation(latitude: number | undefined, longitude: number | undefined): { latitude: number; longitude: number } | undefined {
  if (typeof latitude !== 'number' || typeof longitude !== 'number') return undefined
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return undefined
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return undefined
  return { latitude, longitude }
}

function escapeXml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;')
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : 'unknown metadata-writing error'
}
