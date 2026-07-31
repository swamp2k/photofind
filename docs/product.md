# PhotoFind product

PhotoFind helps people find the useful, technically strong, and meaningful photos hidden inside large local collections.

The active product is **PhotoFind Lite**: a centrally hosted web application whose photo processing and working index remain on the user's computer.

## Core experience

1. Open PhotoFind in desktop Chrome or Edge.
2. Choose a local folder or extracted Google Photos Takeout folder.
3. Build a private local index without uploading the originals.
4. Browse and filter by time, location, media type, similarity, and quality as those capabilities arrive.
5. Compare near-identical photos and find stronger candidates.
6. Mark `keep`, `maybe`, or `reject` when curation is useful.
7. Export selected originals or a curated standalone collection.

PhotoFind should work equally well for a temporary batch such as hundreds of swimming-class photos and for a large exported family archive.

## Local-first privacy model

The hosted application contains only HTML, CSS, JavaScript, WASM/models, and other application assets.

The user's browser owns:

- explicit directory permissions;
- the photo index;
- generated previews and analysis caches;
- review decisions;
- future similarity and quality signals.

Original photo bytes are not uploaded merely to scan, browse, score, or curate a collection.

The initial implementation uses the File System Access API and IndexedDB and therefore targets desktop Chromium browsers. Reconnecting a previously indexed folder after the browser asks for permission again is a normal workflow, not data loss.

## Google Photos Takeout

Takeout support remains important, but metadata repair is no longer the product centre.

PhotoFind should combine media files with matching JSON/XMP sidecars in its local index so dates, locations, descriptions, and other useful metadata can be searched without rewriting originals.

Actual metadata writes should only happen later during an explicit export/normalisation action.

## Finding photos

PhotoFind keeps different signals separate rather than hiding them behind one opaque score.

### Context

- capture date and time;
- GPS coordinates and map area;
- media type;
- future people/event information.

### Similarity

- exact duplicates;
- near-duplicates;
- bursts;
- visually similar scenes.

### Technical quality

- sharpness/focus;
- motion blur;
- exposure;
- resolution;
- face quality where available;
- composition signals only when explainable and useful.

### Human decisions

- `unreviewed`;
- `keep`;
- `maybe`;
- `reject`.

Technical quality and memory value are not the same thing. A technically imperfect unique family moment must not be discarded because another photo receives a higher sharpness score.

## Location experience

Location should become a first-class navigation surface rather than merely a metadata field.

Users should be able to:

- view indexed photos on a map;
- select or draw an area;
- filter the library to photos captured inside that area;
- combine geographic filtering with date ranges, quality, similarity, and later people/events;
- find photos with missing location data.

Map tiles may come from an external provider, but photo coordinates and the index remain local unless the user explicitly enables some future sync feature.

## Diagnostics

Diagnostics are part of the product contract.

Unknown file types, unreadable files, ambiguous sidecars, unsupported previews, analysis failures, and export failures must remain visible with useful context. Nothing should disappear silently.

## Media safety

- Treat originals as irreplaceable.
- Default to read-only browser folder access.
- Do not modify or delete source media during indexing or analysis.
- Forgetting a PhotoFind index only removes PhotoFind's local browser data.
- Export must never silently overwrite existing files.
- Recommendations assist a human decision; they do not make irreversible destructive choices.

## Optional future services

Accounts, settings sync, encrypted index sync, shared review, and a home-server edition are possible later. None are required for the core PhotoFind Lite experience.
