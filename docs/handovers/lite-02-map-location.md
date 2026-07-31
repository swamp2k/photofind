# Lite 2 Handover — Metadata, Timeline, Map and Location Search

**Status:** ready for implementation

## Objective

Make PhotoFind Lite useful for a real exported photo archive by enriching the browser-local index with effective capture date/time and GPS, then making time and geography first-class filters.

This milestone intentionally includes the minimum Lite 1 metadata/timeline foundation required by the Lite 2 map. The previous Lite 0 browser foundation remains the deployment model: static Cloudflare-hosted application, no PhotoFind backend, no photo uploads.

## Included

- Browser-side EXIF extraction for supported images.
- Google Takeout JSON sidecar matching and metadata parsing.
- Effective capture date/time with explicit source (`takeout`, `exif`, `file`).
- Effective GPS with explicit source (`takeout`, `exif`).
- Image dimensions where browser/EXIF extraction provides them.
- Persist enriched metadata in IndexedDB.
- Preserve metadata for unchanged files during rescans using size + mtime fingerprints.
- Date filters: arbitrary from/to range plus quick year selection.
- Metadata filters for missing capture date and missing GPS.
- Map view for GPS-bearing photos.
- MapLibre clustering for dense libraries.
- Optional “filter to visible map area” mode.
- Date/media/location filters combine instead of replacing one another.
- Clicking a map point/cluster should make it possible to inspect the associated photos.
- Visible Diagnostics for malformed/ambiguous Takeout sidecars and EXIF parse failures.
- Explicit map-tile privacy note.

## Metadata precedence

PhotoFind does not modify originals. It derives an effective local interpretation.

Capture time precedence:

1. Google Takeout `photoTakenTime.timestamp` when valid.
2. EXIF capture date (`DateTimeOriginal`, then create/media date where available).
3. File `lastModified` only as a fallback and clearly labelled as file time.

GPS precedence:

1. Valid Google Takeout `geoData` coordinates when they are non-zero/meaningful.
2. EXIF GPS.
3. Missing.

Never silently invent GPS or capture time.

## Takeout matching

Port the proven matching behaviour from the archived implementation into browser-safe pure TypeScript:

- exact `media.ext.json`;
- `.supplemental-metadata.json`;
- relocated `(n)` duplicate counters;
- edited-copy reuse;
- truncated-name fallback only when uniquely resolvable;
- ambiguous fuzzy matches remain Diagnostics and must not silently become authoritative metadata.

Sidecars are read locally from their File/FileSystemFileHandle. Their contents are never uploaded.

## Rescan behaviour

A rescan must not re-parse unchanged media when an existing record has the same relative path, size and mtime and its metadata schema version is current.

Changed/new files are parsed. Removed files disappear from the derived index. Sidecar changes must cause the affected media metadata to be reconsidered.

## Map implementation

Use MapLibre GL JS with a simple OpenStreetMap raster tile source unless implementation discovers a concrete blocker.

- Photo coordinates are represented as local in-memory GeoJSON only.
- Enable source clustering.
- Default map bounds should fit the currently filtered GPS-bearing photos.
- A user toggle may constrain the photo result set to the current map viewport.
- Map movement must not permanently mutate photo metadata or review state.
- Do not send photo IDs, filenames, dates, coordinates, index records or other photo metadata to any PhotoFind service.

Map tile requests inherently reveal the approximate map area being viewed to the tile provider. Show this plainly in the UI/docs.

## Explicitly not included

- Reverse geocoding/place-name lookup.
- Exact/near duplicate detection.
- Similarity embeddings.
- Technical quality scoring.
- Face detection or people clustering.
- Keep/Maybe/Reject.
- Export.
- Accounts, sync or multiuser.
- Uploading originals or the local index.

## Dependencies

Keep dependencies bounded. Expected additions:

- `exifr` for browser-local EXIF/GPS extraction.
- `maplibre-gl` for the interactive map and clustering.

Do not add a server or hosted metadata service.

## Acceptance

### Automated

```bash
npm install
npm run typecheck
npm test
npm run build
```

Unit coverage must include:

- Takeout exact/supplemental/counter/edited/ambiguous matching;
- Takeout timestamp and GPS parsing;
- metadata precedence;
- map-bounds point inclusion, including antimeridian-safe behaviour if the helper supports wrapped bounds;
- filtering combinations.

### Browser smoke

Use Chrome/Edge/Brave or another desktop browser exposing the File System Access API.

1. Index a disposable folder containing geotagged and non-geotagged JPGs plus at least one Takeout JSON pair.
2. Confirm effective capture dates appear and source attribution is visible in the inspector/card metadata.
3. Confirm GPS counts distinguish located vs missing-location photos.
4. Confirm year/date filtering changes the grid.
5. Open Map view; GPS photos appear and dense points cluster.
6. Enable visible-area filtering and pan/zoom; grid count follows the viewport.
7. Combine viewport + date filtering and confirm both constraints apply.
8. Confirm “missing location” can be selected independently.
9. Refresh/reopen the library and confirm enriched metadata remains available.
10. Rescan unchanged library and confirm unchanged records are reused rather than re-parsed where observable through progress/diagnostics.

### Privacy acceptance

With DevTools Network open during indexing, filtering and map browsing:

- application assets and map tile requests are expected;
- no selected photo bytes, sidecar contents, filenames, paths, EXIF values, GPS coordinates or local index records may be POSTed/uploaded anywhere;
- map tile requests may reveal the approximate viewport to the external tile provider and this must be disclosed.

## Completion report

Report implemented behaviour, important files, tests/build actually run, browser smoke actually run, anything unverified, and known format/metadata limitations.
