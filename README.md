# Photofind — Local AI Photo Curator

A local desktop app for repairing Google Takeout photo exports, browsing large
photo libraries quickly, identifying people, and exporting curated originals
into plain folder structures. Original Google Photos remains the source of
truth; this app repairs metadata and curates locally.

## Stack

- Electron + Vite + React + TypeScript (single runtime for now)
- ExifTool (`exiftool-vendored`) for metadata read/write
- FFmpeg for video thumbnails/metadata (later milestone)
- `sharp` for image thumbnails
- SQLite (`better-sqlite3`) for the local library index
- A Python sidecar (FastAPI + InsightFace/ONNX) is planned for the
  people-recognition milestone only — not part of the current build.

## Status: MVP 0.1 — Takeout Repair

The current build implements the first mockup: import a Takeout export or a
local folder, scan it, match media files to their Google JSON sidecars, and
repair EXIF/GPS metadata for confident matches. Nothing here is silent —
uncertain and missing matches are always surfaced in the diagnostics log.

Sidecar matching handles the known Google Takeout quirks:

- exact `file.ext.json` and `file.ext.supplemental-metadata.json` matches
- duplicate downloads, where the `(n)` counter relocates to the sidecar name
- `-edited` copies, which reuse the original file's sidecar
- truncated filenames on long names, matched by longest-prefix within a folder
  (flagged `uncertain` rather than assumed correct)

## Getting started

```bash
npm install
npm run dev        # launches the Electron app in development
npm run typecheck
npm test           # unit tests for the scanning/matching engine
npm run build      # production build (main/preload/renderer)
```

## Project layout

```
src/
  shared/          # types shared between main and renderer
  main/
    services/      # scanner, sidecar matcher, metadata repair (pure logic, unit-tested)
    ipc.ts         # IPC handlers exposed to the renderer
    index.ts       # Electron entry point
  preload/         # contextBridge API surface
  renderer/        # React UI (Vite)
```

## Roadmap

See the handover doc for the full milestone list: fast library viewer,
event/day curation, people recognition with merge/split review, and
standalone export with folder templates and an export report.
