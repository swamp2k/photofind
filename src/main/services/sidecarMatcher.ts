import { dirname } from 'node:path'
import type { ScannedFile, SidecarMatch } from '../../shared/types'

const EDITED_SUFFIXES = ['-edited', '-EDITED', '(edited)', '-modified', '-effects']

/** Strips a trailing `(n)` counter, e.g. "IMG_1234(1).JPG" -> { base: "IMG_1234.JPG", counter: 1 } */
function splitCounter(name: string): { base: string; counter: number | null } {
  const match = name.match(/^(.*)\((\d+)\)(\.[^.]*)?$/)
  if (!match) return { base: name, counter: null }
  const [, stem, counter, ext] = match
  return { base: `${stem}${ext ?? ''}`, counter: Number(counter) }
}

function stripEditedSuffix(name: string): string | null {
  const dot = name.lastIndexOf('.')
  if (dot === -1) return null
  const stem = name.slice(0, dot)
  const ext = name.slice(dot)
  for (const suffix of EDITED_SUFFIXES) {
    if (stem.toLowerCase().endsWith(suffix.toLowerCase())) {
      return stem.slice(0, stem.length - suffix.length) + ext
    }
  }
  return null
}

function sidecarBaseName(sidecarName: string): string {
  return sidecarName
    .replace(/\.supplemental-metadata\.json$/i, '')
    .replace(/\.supplemental-meta.*\.json$/i, '') // handles Google's truncated variants
    .replace(/\.json$/i, '')
}

/**
 * Matches media files to their Google Takeout JSON sidecars.
 * Handles four known Takeout quirks: exact match, relocated (n) counters on
 * duplicate downloads, "-edited" copies reusing the original's sidecar, and
 * filename truncation on long names (matched by longest-prefix within the folder).
 */
export function matchSidecars(files: ScannedFile[]): SidecarMatch[] {
  const byDir = new Map<string, ScannedFile[]>()
  for (const file of files) {
    const dir = dirname(file.path)
    const list = byDir.get(dir) ?? []
    list.push(file)
    byDir.set(dir, list)
  }

  const results: SidecarMatch[] = []
  for (const [, dirFiles] of byDir) {
    const media = dirFiles.filter((f) => f.kind !== 'sidecar' && f.kind !== 'unknown')
    const sidecars = dirFiles.filter((f) => f.kind === 'sidecar' && f.name.toLowerCase().endsWith('.json'))
    const sidecarByExactName = new Map(sidecars.map((s) => [s.name.toLowerCase(), s]))

    for (const mediaFile of media) {
      results.push(matchOne(mediaFile, sidecars, sidecarByExactName))
    }
  }
  return results
}

function matchOne(
  mediaFile: ScannedFile,
  sidecars: ScannedFile[],
  sidecarByExactName: Map<string, ScannedFile>
): SidecarMatch {
  // 1. Exact match: "IMG_1234.JPG.json"
  const exact = sidecarByExactName.get(`${mediaFile.name.toLowerCase()}.json`)
  if (exact) return { media: mediaFile, sidecar: exact, confidence: 'safe', reason: 'exact filename match' }

  // 2. Supplemental-metadata suffix: "IMG_1234.JPG.supplemental-metadata.json"
  const supplemental = sidecarByExactName.get(`${mediaFile.name.toLowerCase()}.supplemental-metadata.json`)
  if (supplemental) {
    return { media: mediaFile, sidecar: supplemental, confidence: 'safe', reason: 'exact filename match (supplemental-metadata)' }
  }

  // 3. Duplicate counter relocation: "IMG_1234(1).JPG" -> "IMG_1234.JPG(1).json"
  const { base, counter } = splitCounter(mediaFile.name)
  if (counter !== null) {
    const relocated = sidecarByExactName.get(`${base.toLowerCase()}(${counter}).json`)
    if (relocated) {
      return { media: mediaFile, sidecar: relocated, confidence: 'safe', reason: 'matched via relocated duplicate counter' }
    }
  }

  // 4. Edited copy: "IMG_1234-edited.JPG" reuses "IMG_1234.JPG"'s sidecar
  const editedBase = stripEditedSuffix(mediaFile.name)
  if (editedBase) {
    const originalSidecar = sidecarByExactName.get(`${editedBase.toLowerCase()}.json`)
    if (originalSidecar) {
      return { media: mediaFile, sidecar: originalSidecar, confidence: 'safe', reason: 'edited copy, reusing original\'s metadata' }
    }
  }

  // 5. Truncated name: fuzzy-match by longest common prefix against sidecar base names in the same folder
  const mediaLower = mediaFile.name.toLowerCase()
  const candidates = sidecars.filter((s) => {
    const base = sidecarBaseName(s.name).toLowerCase()
    return base.length >= 5 && (mediaLower.startsWith(base) || base.startsWith(mediaLower.slice(0, base.length)))
  })

  if (candidates.length === 1) {
    return { media: mediaFile, sidecar: candidates[0], confidence: 'uncertain', reason: 'possible truncated filename match' }
  }
  if (candidates.length > 1) {
    return {
      media: mediaFile,
      sidecar: candidates[0],
      confidence: 'uncertain',
      reason: `${candidates.length} possible JSON sidecars, ambiguous`,
      alternateSidecars: candidates.slice(1)
    }
  }

  return { media: mediaFile, sidecar: null, confidence: 'missing', reason: 'no matching JSON sidecar found' }
}
