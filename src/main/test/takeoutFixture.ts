import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import sharp from 'sharp'

export interface TakeoutFixture {
  root: string
  cleanup: () => Promise<void>
}

export async function createTakeoutFixture(): Promise<TakeoutFixture> {
  const root = await mkdtemp(join(tmpdir(), 'photofind-takeout-'))

  await writeMedia(root, 'IMG_1001.JPG')
  await writeSidecar(root, 'IMG_1001.JPG.json', {
    title: 'IMG_1001.JPG',
    photoTakenTime: { timestamp: '1717243200', formatted: 'Jun 1, 2024, 12:00:00 PM UTC' },
    geoData: { latitude: 55.6761, longitude: 12.5683, altitude: 8 }
  })

  await writeMedia(root, 'IMG_1002(1).JPG')
  await writeSidecar(root, 'IMG_1002.JPG(1).json', {
    title: 'IMG_1002.JPG',
    photoTakenTime: { timestamp: '1717329600', formatted: 'Jun 2, 2024, 12:00:00 PM UTC' },
    geoData: { latitude: 0, longitude: 0 }
  })

  await writeMedia(root, 'IMG_1003-edited.JPG')
  await writeSidecar(root, 'IMG_1003.JPG.json', {
    title: 'IMG_1003.JPG',
    photoTakenTime: { timestamp: '1717416000', formatted: 'Jun 3, 2024, 12:00:00 PM UTC' }
  })

  await writeMedia(root, 'long_family_trip_filename_that_google_kept_full.jpg')
  await writeSidecar(root, 'long_family_trip_filename_that_google.json', {
    title: 'long_family_trip_filename_that_google_kept_full.jpg',
    photoTakenTime: { timestamp: '1717502400' }
  })

  await writeMedia(root, 'IMG_9999.JPG')
  await writeFile(join(root, 'notes.txt'), 'not media metadata\n')

  return {
    root,
    cleanup: () => rm(root, { recursive: true, force: true })
  }
}

async function writeMedia(root: string, name: string): Promise<void> {
  await sharp({
    create: {
      width: 64,
      height: 48,
      channels: 3,
      background: '#57c66f'
    }
  })
    .jpeg()
    .toFile(join(root, name))
}

async function writeSidecar(root: string, name: string, metadata: unknown): Promise<void> {
  await writeFile(join(root, name), `${JSON.stringify(metadata, null, 2)}\n`)
}
