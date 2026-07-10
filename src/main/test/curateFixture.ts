import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import sharp from 'sharp'
import { getExiftool } from '../services/exiftoolClient'

export interface CurateFixture {
  root: string
  /** Paths keyed by role so tests don't hard-code filenames */
  paths: {
    sharpNoise: string
    blurred: string
    dark: string
    blown: string
    burst: string[]
    afterBurst: string
    noExif: string
    corrupt: string
  }
  cleanup: () => Promise<void>
}

const BURST_CAMERA = 'PixelTest'
const BURST_BASE = '2024:06:01 12:00:05'

/**
 * Generates real JPEGs covering every analysis branch: a high-detail noise
 * image and its blurred copy, dark and blown-out frames, a four-shot burst
 * with same-second EXIF timestamps (subsecond ordering) and varying blur,
 * a control shot ten minutes later, an EXIF-less image and a corrupt file.
 */
export async function createCurateFixture(): Promise<CurateFixture> {
  const root = await mkdtemp(join(tmpdir(), 'photofind-curate-'))

  const noise = noiseImage(320, 240)

  const sharpNoise = join(root, 'sharp.jpg')
  await sharp(noise.data, { raw: noise.info }).jpeg({ quality: 95 }).toFile(sharpNoise)

  const blurred = join(root, 'blurred.jpg')
  await sharp(noise.data, { raw: noise.info }).blur(8).jpeg({ quality: 95 }).toFile(blurred)

  const dark = join(root, 'dark.jpg')
  await sharp({ create: { width: 320, height: 240, channels: 3, background: '#050505' } })
    .jpeg()
    .toFile(dark)

  const blown = join(root, 'blown.jpg')
  await sharp({ create: { width: 320, height: 240, channels: 3, background: '#fefefe' } })
    .jpeg()
    .toFile(blown)

  // Four-shot burst: same second, distinct subseconds, varying blur so the
  // sharpest frame (index 1) is the unambiguous pick.
  const burstBlur = [4, 0, 8, 12]
  const burst: string[] = []
  for (let i = 0; i < burstBlur.length; i++) {
    const path = join(root, `burst_${i}.jpg`)
    const pipeline = sharp(noise.data, { raw: noise.info })
    await (burstBlur[i] > 0 ? pipeline.blur(burstBlur[i]) : pipeline).jpeg({ quality: 95 }).toFile(path)
    await stampExif(path, `${BURST_BASE}.${String(i * 20).padStart(2, '0')}0`, BURST_CAMERA)
    burst.push(path)
  }

  const afterBurst = join(root, 'after_burst.jpg')
  await sharp(noise.data, { raw: noise.info }).jpeg({ quality: 95 }).toFile(afterBurst)
  await stampExif(afterBurst, '2024:06:01 12:10:05', BURST_CAMERA)

  const noExif = join(root, 'no_exif.jpg')
  await sharp(noise.data, { raw: noise.info }).jpeg({ quality: 95 }).toFile(noExif)

  const corrupt = join(root, 'corrupt.jpg')
  await writeFile(corrupt, 'this is not an image\n')

  return {
    root,
    paths: { sharpNoise, blurred, dark, blown, burst, afterBurst, noExif, corrupt },
    cleanup: () => rm(root, { recursive: true, force: true })
  }
}

/** Deterministic pseudo-random noise: maximal Laplacian response when sharp. */
function noiseImage(width: number, height: number): { data: Buffer; info: { width: number; height: number; channels: 3 } } {
  const data = Buffer.alloc(width * height * 3)
  let seed = 42
  for (let i = 0; i < data.length; i++) {
    // Math.imul keeps the LCG in 32-bit space; plain * overflows 2^53 and
    // silently zeroes the low bits, skewing every pixel dark.
    seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff
    data[i] = (seed >>> 16) & 0xff
  }
  return { data, info: { width, height, channels: 3 } }
}

async function stampExif(path: string, dateTimeOriginal: string, model: string): Promise<void> {
  const [datePart, subsec] = splitSubsec(dateTimeOriginal)
  await getExiftool().write(
    path,
    {
      DateTimeOriginal: datePart,
      ...(subsec ? { SubSecTimeOriginal: subsec } : {}),
      Make: 'Photofind',
      Model: model
    } as never,
    { writeArgs: ['-overwrite_original'] }
  )
}

function splitSubsec(value: string): [string, string | null] {
  const dot = value.indexOf('.')
  if (dot === -1) return [value, null]
  return [value.slice(0, dot), value.slice(dot + 1)]
}
