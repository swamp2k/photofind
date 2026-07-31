# PhotoFind Lite roadmap

The active roadmap is browser-native and local-first. The previous Electron/server/container work is frozen on `archive/container-milestone-1`.

## Lite 0 — Browser foundation

Goal: prove the hosted/no-upload architecture.

- Static React/Vite app.
- Capability-based Chromium desktop folder access.
- Recursive local indexing.
- Persistent IndexedDB libraries and file handles.
- Reopen and rescan indexed folders.
- Local image previews.
- File-type counts and Diagnostics.
- Cloudflare Pages deployment.

## Lite 1 — Takeout metadata and timeline

Goal: turn a folder dump into a useful searchable library.

- Parse EXIF where browser-compatible.
- Match Google Takeout JSON/XMP sidecars.
- Normalize effective capture date/time without modifying originals.
- Normalize GPS data.
- Incremental rescans using size/mtime fingerprints.
- Timeline filters by year/month/day and arbitrary date range.
- Filters for media type and missing metadata.
- Move heavy parsing into Web Workers where appropriate.

## Lite 2 — Map and location search

Goal: make geographic browsing a first-class way to find photos.

- Map view for photos with GPS.
- Cluster dense markers.
- Rectangle/polygon or viewport-area selection.
- Filter to photos inside the selected geographic area.
- Combine map selection with date and media filters.
- Show photos with missing location.
- Keep coordinates local; document map-tile privacy implications.

## Lite 3 — Duplicates, bursts, and similarity

Goal: reduce thousands of files into actual photographic moments.

- Exact duplicate hashing.
- Perceptual similarity fingerprints/embeddings.
- Near-duplicate grouping.
- Burst grouping using time and visual similarity.
- Compare strip for each group.
- Preserve every source file; groups are derived index data only.

## Lite 4 — Find the good ones

Goal: rank and explain technical photo quality.

- Sharpness/fine-detail signals.
- Conservative directional motion-blur risk signal rather than pretending blur cause can always be known.
- Exposure and clipping signals.
- Resolution/usable-detail signal.
- Explainable technical-quality reasons.
- Quality filters and ranking by individual technical signals.
- “Best technical candidate” inside duplicate/burst/similarity groups.
- Keep technical quality separate from memory value.
- Face-specific quality waits for a robust browser-local detector; person/face intelligence remains primarily Lite 6 scope.

## Lite 5 — Curation and export

Goal: turn search results into useful finished selections.

- `unreviewed`, `keep`, `maybe`, `reject`.
- Keeper tray.
- Bulk and visible-result actions.
- Export selected originals with collision safety.
- Optional folder templates.
- Optional sidecar/report export.
- Explicit metadata-normalised export without modifying sources.

## Lite 6 — People, events, and richer local intelligence

Goal: find meaningful family moments beyond dates and locations.

- Local face detection and clustering.
- Rename, merge, split, and ignore person clusters.
- Event grouping from time, place, similarity, and people.
- Rare-person and rare-combination discovery.
- Memory-keeper suggestions separate from technical scoring.
- Natural-language local search only if it adds clear value.

## Optional later services

These are not required by the core product:

- account/login;
- preference sync;
- encrypted index sync;
- shared/multi-review;
- PWA/offline application caching;
- optional home-server edition;
- private remote access.

Every milestone must preserve the no-silent-failure rule and keep original media safe.
