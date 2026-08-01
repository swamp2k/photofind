declare module 'piexifjs' {
  type ExifValue = string | number | number[] | Array<[number, number]> | [number, number] | null
  type ExifIfd = Record<number, ExifValue>

  interface ExifData {
    '0th': ExifIfd
    Exif: ExifIfd
    GPS: ExifIfd
    Interop?: ExifIfd
    '1st'?: ExifIfd
    thumbnail?: string | null
  }

  interface PiexifApi {
    load(jpegData: string): ExifData
    dump(exif: ExifData): string
    insert(exifBytes: string, jpegData: string): string
    remove(jpegData: string): string
    ImageIFD: Record<string, number>
    ExifIFD: Record<string, number>
    GPSIFD: Record<string, number>
  }

  const piexif: PiexifApi
  export default piexif
}
