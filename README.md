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

Requires Node.js 20.

```bash
npm install
npm run dev        # launches the Electron app in development
npm run typecheck
npm test           # unit tests for the scanning/matching engine
npm run build      # production build (main/preload/renderer)
npm run pack:linux # unpacked Linux app in release/linux-unpacked
npm run dist:linux # Linux AppImage and deb packages in release/
```

`better-sqlite3` is a native dependency. The package scripts rebuild it for
Electron before `npm run dev` and restore the local checkout to the Node ABI
after Linux packaging so tests continue to run.

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

### Goal

Build a standalone local desktop app for repairing Google Takeout photo exports,
browsing large photo libraries quickly, identifying people, selecting meaningful
family photos, and exporting curated originals into normal folder structures.

### Core principles

- Runs locally as a desktop app.
- Original Google Photos remains the remote source of truth.
- Metadata repair only happens when explicitly enabled by the user.
- All operations produce visible status, warnings, and errors.
- No silent failure.
- Exported photos must be usable without this app.

### Proposed stack

- Electron + React/Vite for UI.
- Python worker for media processing and ML.
- SQLite for local index.
- ExifTool for metadata read/write.
- FFmpeg for video thumbnails/metadata.
- LibRaw/rawpy for RAW previews.
- InsightFace + ONNX Runtime for face recognition.
- CPU default, optional CUDA/DirectML/OpenVINO acceleration.

### MVP 0.1: Takeout Repair + Fast Viewer

- Select Takeout ZIP/folder.
- Scan media and JSON sidecars.
- Match Google metadata to files.
- Show safe/uncertain/failed matches.
- Repair metadata in-place for safe matches.
- Generate thumbnails.
- Show fast timeline/grid viewer.
- Mark keepers from any view.
- Export keepers to chosen folder structure.
- Include diagnostics log and export report.

### Later milestones

- Face detection and person clusters.
- Manual merge/split/rename people UI.
- Duplicate and burst grouping.
- Best photo scoring.
- AI-assisted memory keeper suggestions.
- Location/event-based curation.
