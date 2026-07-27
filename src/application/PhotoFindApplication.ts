import type { ExportResult, RepairResult, ScanResult, SidecarMatch } from '../shared/types'
import { LibraryStore } from '../persistence/libraryStore'
import { exportKeepers, type ExportOptions } from '../services/exportKeepers'
import { repairMetadata } from '../services/metadataRepair'
import { runScan } from '../services/scanOrchestrator'

export interface PhotoFindApplicationConfig {
  databasePath: string
  thumbnailCacheRoot: string
}

export class PhotoFindApplication {
  private readonly store: LibraryStore

  constructor(private readonly config: PhotoFindApplicationConfig) {
    this.store = new LibraryStore(config.databasePath)
  }

  async scan(sourceRoot: string): Promise<ScanResult> {
    const result = await runScan(sourceRoot, {
      thumbnailCacheRoot: this.config.thumbnailCacheRoot
    })
    this.store.upsertScan(sourceRoot, result)
    result.keepers = this.store.listKeepers(result.matches.map((match) => match.media.path))
    return result
  }

  repair(matches: SidecarMatch[], dryRun: boolean): Promise<RepairResult> {
    return repairMetadata(matches, { dryRun })
  }

  setKeeper(mediaPath: string, kept: boolean): void {
    this.store.setKeeper(mediaPath, kept)
  }

  exportKeepers(mediaPaths: string[], destinationRoot: string, options: Omit<ExportOptions, 'destinationRoot'> = {}): Promise<ExportResult> {
    return exportKeepers(mediaPaths, { destinationRoot, ...options })
  }

  close(): void {
    this.store.close()
  }
}
