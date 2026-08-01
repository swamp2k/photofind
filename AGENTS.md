# AGENTS.md — PhotoFind Lite

This file defines how Codex and delegated agents must work in this repository.

## 1. Product direction

PhotoFind Lite is a centrally hosted, browser-native photo finder and curation tool.

The application is downloaded from the web, but core photo work happens locally in the user's browser against folders the user explicitly selects.

Core principles:

- Do not upload original photos merely to scan, browse, analyse, score, identify people, group events, or curate them.
- Keep the working index, review decisions, derived metadata, face observations/embeddings, people labels, events, and analysis local by default.
- Treat source media as irreplaceable and read-only during indexing/analysis.
- Google Takeout metadata should be merged logically into the local index before considering physical metadata writes.
- Surface unsupported files, ambiguous metadata, and failures in Diagnostics.
- Keep technical quality separate from emotional or historical importance.
- Face clusters and events are assistive suggestions; they never justify irreversible destructive decisions.
- The hosted application must remain useful without accounts, profiles, a backend database, or a home server.
- The primary UI is a calm family-photo curator, not an operations console or enterprise asset manager.

The previous Electron/server/container implementation is frozen on `archive/container-milestone-1`. Do not preserve its architecture at the expense of the browser-native product.

## 2. Active architecture

The active application is:

```text
Cloudflare Pages
  static HTML/CSS/JS/WASM/models
            |
            v
Browser-native React application
  File System Access API
  IndexedDB local index
  OPFS/cache later where appropriate
  Web Workers for expensive processing
  opt-in same-origin face models
            |
            v
Local user-selected photo folders
```

The primary target is a desktop Chromium-based browser exposing the required local-folder capabilities. Support is capability-based, not tied to Chrome branding. Fallback directory selection may be offered where persistent handles are unavailable.

Cloudflare Pages hosts application/model assets only. Do not add Workers, Pages Functions, D1, R2, or another backend unless a later task explicitly requires it.

## 3. Authority and scope

For each task, follow instructions in this order:

1. The user's current request.
2. The active milestone/handover, when present.
3. This `AGENTS.md`.
4. `docs/product.md`, `docs/architecture.md`, `docs/roadmap.md`, and `docs/visual-design.md`.
5. `README.md` and existing code conventions.

`docs/visual-design.md` is the visual and interaction contract. UI work must follow it unless the task explicitly revises that contract first.

Do not silently implement later-roadmap features because they appear useful.

When a requirement conflicts with the local-first privacy model or would materially change product direction, stop and report the decision needed to the supervisor.

## 4. Supervisor and worker workflow

The primary agent acts as supervisor, normally GPT-5.6 Sol with high reasoning effort when that routing is configured.

The supervisor owns:

- understanding the requested slice;
- repository orientation and architecture decisions;
- breaking work into bounded tasks;
- deciding what can safely run in parallel;
- delegating implementation;
- inspecting returned diffs and relevant files;
- integration fixes;
- final validation and acceptance;
- reporting risks and unverified areas.

For non-trivial implementation, delegate scoped work to `luna_worker`, normally GPT-5.6 Luna with medium reasoning effort when configured.

Workers must:

- work only on the delegated scope;
- read affected files before editing;
- avoid unrelated cleanup/refactors;
- add/update tests for changed logic;
- run relevant validation;
- report changed files, validation, assumptions, and remaining risks;
- never broaden scope just to make the implementation more elegant.

The supervisor must inspect actual changes. A worker summary is not proof of correctness.

### Delegation rules

- Normally use one writing worker at a time.
- Up to three concurrent agents may be used only for genuinely independent work.
- Parallel read-only exploration is encouraged.
- Parallel writers must own disjoint files/responsibilities.
- Never assign multiple writers to the same file concurrently.
- Use `explorer` for focused read-only investigation when available.
- Use `luna_worker` for scoped production implementation.
- Do not delegate the final architectural decision or final acceptance review.
- After two failed attempts on the same issue, reassess instead of looping.
- Never claim a model/profile was used unless routing was actually verified.

## 5. Required task flow

For feature/milestone work:

1. Read this file and the relevant product/roadmap/design material.
2. Inspect repository state and preserve unrelated work.
3. State the bounded implementation goal.
4. Identify browser/privacy/data-safety risks.
5. Delegate bounded implementation where appropriate.
6. Review actual changes against the requested outcome.
7. Run typecheck, tests, and production build.
8. Perform a focused browser acceptance check when UI/file access/ML changed.
9. Report exactly what is complete and what remains unverified.

## 6. Browser and media safety

PhotoFind works with irreplaceable personal media.

- Directory access should request `read` mode unless an explicit export task requires otherwise.
- Indexing, metadata parsing, hashing, similarity, quality, face analysis and event grouping must not modify source files.
- Forgetting a library must remove PhotoFind browser data only, never source media.
- Never upload photo bytes, GPS, extracted metadata, hashes, visual fingerprints, face embeddings, people labels, events or review decisions without an explicit product requirement and user-visible opt-in.
- Avoid hidden network dependencies in media analysis. Static same-origin model assets are permitted only for an explicit local feature.
- External map tiles are allowed when explicitly part of map UI, but document that the viewed geographic region can be visible to the tile provider.
- Treat File System Access permission loss/re-prompting as normal; do not interpret it as a missing/deleted library.
- Validate archive/sidecar parsing defensively; malformed metadata must not abort the whole library silently.
- Generated object URLs and image bitmaps must be released when no longer used.
- Large processing must move off the UI thread as soon as it becomes expensive enough to affect interaction. Until then, yield visibly and preserve resumable/reusable analysis state.
- Metadata-normalised export may write only to newly exported copies. It must preserve originals, preserve existing destination files, and report whether metadata was embedded or written as a sidecar.
- Browser security limitations must be represented honestly: PhotoFind can show/copy paths relative to the selected root and filter to a source folder, but must not claim an unavailable absolute path or pretend to open Explorer/Finder.

Tests must use synthetic/mock handles or disposable fixtures, never real personal photo folders.

## 7. People and biometric rules

Face information is especially sensitive.

- People analysis must be explicit and opt-in.
- Face detector/descriptor models must be same-origin assets; do not send photos to a model API.
- Store the minimum useful local data: normalized face boxes, embeddings, assignments, labels and analysis status.
- Do not create persistent face-crop image files unless a later design explicitly requires them.
- Do not enable or infer age, gender, race, ethnicity, emotion, health, attractiveness or other demographic/sensitive traits.
- Do not identify a person automatically by a real-world name. Names come from the user.
- Clusters are suggestions and must support correction: rename, merge, split, ignore and restore.
- Reanalysis should preserve user labels only when matching confidence is sufficient; uncertain identity continuity must not silently relabel faces.
- Forgetting a library must remove its people records and assignments.
- Never log embeddings or expose them in ordinary diagnostics.

## 8. Domain rules

Canonical review states remain:

- `unreviewed`
- `keep`
- `maybe`
- `reject`

Keep distinct signals for:

- context (date/time/location/media type/source path);
- similarity/grouping;
- technical quality;
- people/face assignments;
- events;
- user review decisions.

A blurry but unique family photo must not be discarded because it loses a technical-quality comparison.

Recommendations should explain useful reasons such as sharper subject, reduced motion blur, improved exposure, higher usable detail, or better face quality. People identity and event membership must remain separate from technical scoring.

Events are derived views. They may use time, place, exact source folder, similarity and user-labelled people as evidence, but must not reorganize folders or rewrite metadata.

## 9. Visual and interaction rules

- Make photos the dominant visual material.
- Organise navigation around user tasks: Library, Events, Map, People, Groups, Quality, Review, Compare, and Selection.
- Use progressive disclosure for advanced filters, diagnostics, source paths, and technical measurements.
- Keep review-state semantics and shortcuts consistent across every mode.
- Source provenance must be visible in individual-photo inspectors and comparison/group workflows without overwhelming the photo-first hierarchy.
- Avoid dense dashboard KPI layouts, nested bordered cards, tiny badges, or infrastructure terminology in the primary experience.
- Preserve keyboard access, visible focus states, mobile usability down to 320 CSS pixels, and reduced-motion support.
- Do not add decorative controls that are not functional.

See `docs/visual-design.md` for the complete contract.

## 10. Diagnostics

Diagnostics are product behaviour, not developer-only logging.

Unknown file types, unreadable files, ambiguous/missing sidecars, unsupported previews, metadata parse failures, analysis failures, model-load failures and export failures must remain discoverable with actionable context.

Do not catch errors and return success-shaped results. Do not include raw biometric embeddings in diagnostics.

## 11. Engineering conventions

- Prefer clear explicit TypeScript over clever abstractions.
- Keep pure classification/matching/scoring/clustering/event logic independently testable.
- Keep browser persistence behind a small storage boundary.
- Design IndexedDB schema evolution deliberately; do not casually destroy a user's local index.
- Prefer incremental index updates over rescanning/recomputing everything once metadata/scoring grows expensive.
- Keep large binary caches out of ordinary index rows; prefer OPFS or browser cache storage when appropriate.
- Prefer Web Workers for CPU-heavy parsing, hashing, image analysis, and ML.
- Large optional dependencies must be dynamically imported and excluded from the initial interaction path where practical.
- Copy only the model files actually required by enabled features.
- Avoid unnecessary dependencies, especially ones that add backend/native assumptions to the static build.
- Explain substantial new dependencies in the completion report.
- Do not introduce Node filesystem APIs into browser runtime code.
- Do not add Cloudflare-specific runtime APIs to core photo logic.
- Avoid broad version upgrades and mass formatting during unrelated work.
- Use semantic CSS variables for visual states instead of scattering literal colours through components.

## 12. Validation

Run the applicable commands after changes:

```bash
npm run typecheck
npm test
npm run build
```

Validation rules:

- Never claim a command passed unless it actually ran successfully.
- Report skipped validation and the reason.
- New pure/domain logic requires unit tests.
- IndexedDB schema/persistence changes require persistence/migration coverage where practical.
- Folder-access/UI changes require a focused supported-browser manual smoke test.
- A successful static build does not prove folder permissions, IndexedDB handle persistence, local previews, metadata writing, zoom/pan, face-model loading, clustering quality or responsive layout work.
- People analysis requires a disposable real-browser test covering model loading, no-photo-upload network inspection, persistence, rename/merge/split/ignore and false-match correction.
- Event grouping requires a disposable multi-day/location/folder fixture and review-state regression test.
- Metadata-aware export must be tested with disposable files and the result inspected independently for embedded EXIF/XMP.
- Cloudflare deployment changes should verify the `dist/` artifact and, when access is available, a Pages preview deployment.

## 13. Git and repository hygiene

- Preserve unrelated work.
- Keep changes bounded to the active task.
- Do not rewrite shared history destructively.
- Do not commit local indexes, caches, photo fixtures, exported user media, or generated model files outside the build output.
- Static third-party model assets may be copied into `dist/` during build but must not be duplicated into source control.
- The archived container branch is a historical fallback, not a target for routine changes.

## 14. Non-goals unless explicitly requested

Do not introduce these opportunistically:

- server-side photo uploads/storage;
- mandatory accounts or login;
- Cloudflare D1/R2/Workers for the core local workflow;
- automatic destructive rejection/deletion;
- demographic or emotion inference;
- automatic real-world identity naming;
- multiuser/shared review;
- Electron or Docker dependencies on the active static app;
- generative AI as a prerequisite for basic sorting;
- natural-language search before its roadmap slice;
- sync architecture before the local product proves useful.
