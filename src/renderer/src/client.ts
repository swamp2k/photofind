import type { ExportResult, RepairResult, ScanResult, SidecarMatch } from '../../shared/types'

export interface PhotoFindClient {
  runScan(path: string): Promise<ScanResult>
  runRepair(matches: SidecarMatch[], dryRun: boolean): Promise<RepairResult>
  setKeeper(path: string, kept: boolean): Promise<void>
  exportKeepers(paths: string[], destinationRoot: string): Promise<ExportResult>
}

export interface FolderPicker {
  selectFolder(): Promise<string | null>
  selectExportFolder(): Promise<string | null>
}

export const electronClient: PhotoFindClient = window.api
export const electronFolderPicker: FolderPicker = window.api
