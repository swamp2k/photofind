# Photofind — Local AI Photo Curator

A local desktop app that helps you sort years of unsorted photos: point it at
a folder, let it analyze every photo, and be left with the ones worth keeping.
It also repairs Google Takeout photo exports as a built-in tool. Original
Google Photos remains the source of truth; everything happens locally.

## Stack

- Electron + Vite + React + TypeScript (single runtime for now)
- ExifTool (`exiftool-vendored`) for metadata read/write
- FFmpeg for video thumbnails/metadata (later milestone)
- `sharp` for image thumbnails
- SQLite (`better-sqlite3`) for the local library index
- A Python sidecar (FastAPI + InsightFace/ONNX) is planned for the
  people-recognition milestone only — not part of the current build.

## Status: Milestone 1 — Curation

The app opens on the Curate view: choose a folder, hit Analyze, and Photofind
scores every photo (focus via Laplacian variance, exposure via luma
statistics), groups continuous-shot bursts by EXIF timestamp and camera, picks
the sharpest frame of each burst, and pre-sorts everything into
**keep / maybe / discard** piles with visible reasons ("blurry", "dark",
"best of burst of 5"). You confirm or override with keyboard shortcuts
(←/→ select, K/M/D verdict, U undo, Enter for a fast 1280px preview) and
export the keepers. Discard never deletes anything — it only leaves photos
out of the export. Verdicts persist in the local library index across scans.

Analysis is plain pixel math (sharp) plus ExifTool metadata — no ML runtime
yet. Face detection for finding the sentimental shots is the next milestone.

### Google Takeout repair

The original Takeout tooling lives in the sidebar under **Google Takeout**:
import a Takeout export or local folder, match media files to their Google
JSON sidecars, and repair EXIF/GPS metadata for confident matches. Nothing
here is silent — uncertain and missing matches are always surfaced in the
diagnostics log.

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
    services/      # scanner, quality analysis, burst grouping, verdicts,
                   # sidecar matcher, metadata repair (pure logic, unit-tested)
    ipc.ts         # IPC handlers exposed to the renderer
    index.ts       # Electron entry point
  preload/         # contextBridge API surface
  renderer/        # React UI (Vite): sidebar shell, Curate + Takeout views
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

### Done

- Takeout repair: sidecar matching, metadata health, EXIF/GPS repair,
  diagnostics log, export report.
- Curation: folder analysis with progress, blur/exposure scoring, burst
  grouping with best-frame pick, keep/maybe/discard suggestions with reasons,
  keyboard-driven review, fast lightbox previews, keeper export.

### Later milestones

- Face detection and person clusters (onnxruntime-node planned).
- Manual merge/split/rename people UI.
- AI-assisted memory keeper suggestions (the sentimental shots, even blurry).
- Trip/event grouping from GPS clusters and user-entered special dates
  (birthdays, weddings, vacations).
- Configurable export layouts (e.g. year/month folders).
- Duplicate detection beyond bursts; RAW and video support.
