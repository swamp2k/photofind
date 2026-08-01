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
- Face-specific quality remains separate from person identity and must never make destructive decisions.

## Visual refresh — Photo-first application shell

Goal: make the product pleasant, focused and coherent before adding more intelligence.

Implemented:

- Authoritative visual and interaction contract in `docs/visual-design.md`.
- Calm dark shell with compact global search and privacy state.
- Task-based navigation: Library, Events, Map, People, Groups, Quality, Review, Compare and Selection.
- Larger photo-led layouts and reduced dashboard/card noise.
- Progressive disclosure for filters, bulk actions and Diagnostics.
- Stable Keep / Maybe / Reject semantics and keyboard shortcuts.
- Responsive layouts down to narrow mobile-sized windows.
- Reduced-motion and visible keyboard-focus support.

## Lite 5 — Curation and export

Goal: turn search results into useful finished selections.

Implemented:

- Persistent `unreviewed`, `keep`, `maybe`, `reject` decisions.
- Review filters, counters, per-photo controls and bulk actions for current results.
- Review from photo grid, map, quality ranking, similarity groups and full-size viewer.
- Keeper tray / Selection view.
- Export Keep or Keep+Maybe copies to an explicitly selected local folder.
- Flat, date-day, date-month and source-folder export layouts.
- Collision-safe filenames with no destination overwrite.
- Optional standalone JSON and HTML selection reports.
- Visible per-file and report-generation failures.
- Review decisions preserved through rescans.

### Lite 5.1 — Metadata-aware export

Implemented:

- Reliable normalized EXIF/Takeout capture date and GPS are embedded directly in exported JPEG copies.
- Existing JPEG EXIF is preserved where possible.
- File-mtime fallback is not written as a claimed capture date.
- Formats that cannot be safely rewritten receive an XMP sidecar.
- JPEG rewrite failures fall back to the original copy plus XMP rather than losing the export.
- Export reports identify embedded, sidecar and unchanged metadata results.
- Source files remain read-only.

### Lite 5.2 — Viewer polish

Implemented:

- Full-size local viewer with 1× / 2× / 4× zoom.
- Pointer pan while zoomed.
- Double-click and keyboard zoom controls.
- Filmstrip navigation.
- Contextual metadata and technical-quality inspector.
- Stable navigation/review keyboard shortcuts.

### Lite 5.3 — Compare and pick best

Implemented:

- First-class Compare mode for exact duplicates, bursts and similar scenes.
- Side-by-side candidates with technical signals and current review state.
- Technical suggestion clearly separated from the user's memory-value decision.
- Keep, Maybe or Reject the selected candidate.
- Atomic “Keep one · reject others” action with reversible persisted decisions.

### Lite 5.4 — Review sessions

Implemented:

- Focused one-photo-at-a-time review mode.
- Large Keep / Maybe / Reject actions.
- Keyboard-only workflow with automatic advance.
- Session progress, nearby-photo strip and contextual quality/metadata.
- Review sessions honour current search/date/location/review filters.
- Decisions persist immediately in the local index.

## Source provenance

Goal: make copied folders and duplicate origins easy to locate without claiming browser capabilities that do not exist.

Implemented:

- Parent folder and full relative path in the full-size viewer and focused Review inspector.
- Source path in Map selection, Groups and Compare candidates.
- Source-folder counts for duplicate, burst and similarity groups.
- Copy relative path.
- “Show folder in Library” exact-parent-folder filtering.
- Source-folder context and navigation from Events and People face details.
- Paths remain relative to the explicitly selected library root; PhotoFind does not invent an unavailable absolute path or claim it can open Explorer/Finder.

## Lite 6 — People

Goal: find recurring people locally while keeping biometric data private and correction workflows reversible.

Implemented:

- Explicit opt-in browser-local face detection and face-description embeddings.
- Same-origin detector/descriptor model assets loaded only when People analysis starts.
- Versioned/reusable analysis persisted in IndexedDB.
- Suggested people clusters with local face crops.
- Rename, merge, split and ignore/restore operations.
- Atomic persistence of people records and media assignments.
- Named-cluster preservation across reanalysis when embeddings still match confidently.
- Search by named people.
- Rare person-combination discovery.
- Rescans preserve unchanged face analysis and assignments.
- Forgetting a library also removes its local people data.
- Age, gender, race and emotion inference are disabled and out of scope.

Accepted limitations:

- Clusters are assistive suggestions and can contain false joins or splits.
- Large libraries can require long-running analysis.
- Face analysis currently yields between photos to keep progress visible but may still be computationally demanding.

## Lite 7 — Events

Goal: turn a flat archive into understandable moments without reorganizing source folders.

Implemented:

- Deterministic event grouping from capture time.
- Supporting continuity evidence from nearby GPS, exact source folder, known people and similarity groups.
- Hard time-gap boundaries to avoid implausibly large events.
- Stable generated event IDs and date/folder-oriented titles.
- Event cards with photo mosaics, date range, photo count, people and folder context.
- Event detail with grouping evidence, navigable source folders, review controls and full-size browsing.
- Filter events by named person.
- Events remain derived views of the local index and never alter source files or review decisions.

Accepted limitations:

- Generated titles are intentionally simple rather than AI-authored.
- Event thresholds are conservative defaults and are not yet user-configurable.
- Natural-language memory search is a later milestone.

## Lite 8 — Memory search

Potential next intelligence milestone after People and Events have real-world acceptance:

- Local semantic descriptions/embeddings only when privacy and performance remain acceptable.
- Search across named people, events, time, place and user-approved context.
- Queries such as “Balder learning to ride a bike” should return evidence-backed results rather than opaque automatic selections.
- No cloud photo upload as a prerequisite.

## Later — Story and album creation

Potential scope after people/events prove useful:

- Turn an event or selection into a chronological story.
- Suggest a cover photo without overriding the user.
- Produce standalone HTML galleries, slideshows, PDF albums or optional videos.
- Keep all generation local unless a later explicit opt-in service is introduced.

## Possible later curation/export extensions

- More configurable folder/filename templates.
- Additional embedded metadata fields and sidecar formats.
- Explicit session save/naming independent of current filters.
- Undo history spanning multiple bulk/compare/people operations.

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
