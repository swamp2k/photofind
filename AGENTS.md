# AGENTS.md — PhotoFind Lite

This file defines how Codex and delegated agents must work in this repository.

## 1. Product direction

PhotoFind Lite is a centrally hosted, browser-native photo finder and curation tool.

The application is downloaded from the web, but core photo work happens locally in the user's browser against folders the user explicitly selects.

Core principles:

- Do not upload original photos merely to scan, browse, analyse, score, or curate them.
- Keep the working index, review decisions, derived metadata, and analysis local by default.
- Treat source media as irreplaceable and read-only during indexing/analysis.
- Google Takeout metadata should be merged logically into the local index before considering physical metadata writes.
- Surface unsupported files, ambiguous metadata, and failures in Diagnostics.
- Keep technical quality separate from emotional or historical importance.
- Recommendations assist the user; they never make irreversible destructive decisions.
- The hosted application must remain useful without accounts, profiles, a backend database, or a home server.

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
            |
            v
Local user-selected photo folders
```

Current supported target is desktop Chrome/Edge. Broader browser support may be added later but must not compromise the core no-upload workflow.

Cloudflare Pages hosts application assets only. Do not add Workers, Pages Functions, D1, R2, or another backend unless a later task explicitly requires it.

## 3. Authority and scope

For each task, follow instructions in this order:

1. The user's current request.
2. The active milestone/handover, when present.
3. This `AGENTS.md`.
4. `docs/product.md`, `docs/architecture.md`, and `docs/roadmap.md`.
5. `README.md` and existing code conventions.

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

1. Read this file and the relevant product/roadmap material.
2. Inspect repository state and preserve unrelated work.
3. State the bounded implementation goal.
4. Identify browser/privacy/data-safety risks.
5. Delegate bounded implementation where appropriate.
6. Review actual changes against the requested outcome.
7. Run typecheck, tests, and production build.
8. Perform a focused browser acceptance check when UI/file access changed.
9. Report exactly what is complete and what remains unverified.

## 6. Browser and media safety

PhotoFind works with irreplaceable personal media.

- Directory access should request `read` mode unless an explicit export task requires otherwise.
- Indexing, metadata parsing, hashing, similarity, and quality analysis must not modify source files.
- Forgetting a library must remove PhotoFind browser data only, never source media.
- Never upload photo bytes, GPS, extracted metadata, embeddings, or review decisions without an explicit product requirement and user-visible opt-in.
- Avoid hidden network dependencies in media analysis.
- External map tiles are allowed when explicitly part of map UI, but document that the viewed geographic region can be visible to the tile provider.
- Treat File System Access permission loss/re-prompting as normal; do not interpret it as a missing/deleted library.
- Validate archive/sidecar parsing defensively; malformed metadata must not abort the whole library silently.
- Generated object URLs must be revoked when no longer used.
- Large processing must move off the UI thread as soon as it becomes expensive enough to affect interaction.

Tests must use synthetic/mock handles or disposable fixtures, never real personal photo folders.

## 7. Domain rules

Canonical review states remain:

- `unreviewed`
- `keep`
- `maybe`
- `reject`

Keep distinct signals for:

- context (date/time/location/media type);
- similarity/grouping;
- technical quality;
- people/events later;
- user review decisions.

A blurry but unique family photo must not be discarded because it loses a technical-quality comparison.

Recommendations should explain useful reasons such as sharper subject, reduced motion blur, improved exposure, higher usable detail, or better face quality.

## 8. Diagnostics

Diagnostics are product behaviour, not developer-only logging.

Unknown file types, unreadable files, ambiguous/missing sidecars, unsupported previews, metadata parse failures, analysis failures, and export failures must remain discoverable with actionable context.

Do not catch errors and return success-shaped results.

## 9. Engineering conventions

- Prefer clear explicit TypeScript over clever abstractions.
- Keep pure classification/matching/scoring logic independently testable.
- Keep browser persistence behind a small storage boundary.
- Design IndexedDB schema evolution deliberately; do not casually destroy a user's local index.
- Prefer incremental index updates over rescanning/recomputing everything once metadata/scoring grows expensive.
- Keep large binary caches out of ordinary index rows; prefer OPFS or browser cache storage when appropriate.
- Prefer Web Workers for CPU-heavy parsing, hashing, image analysis, and ML.
- Avoid unnecessary dependencies, especially ones that add backend/native assumptions to the static build.
- Explain substantial new dependencies in the completion report.
- Do not introduce Node filesystem APIs into browser code.
- Do not add Cloudflare-specific runtime APIs to core photo logic.
- Avoid broad version upgrades and mass formatting during unrelated work.

## 10. Validation

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
- Folder-access/UI changes require a focused Chrome/Edge manual smoke test.
- A successful static build does not prove folder permissions, IndexedDB handle persistence, or local previews work.
- Cloudflare deployment changes should verify the `dist/` artifact and, when access is available, a Pages preview deployment.

## 11. Git and repository hygiene

- Preserve unrelated work.
- Keep changes bounded to the active task.
- Do not rewrite shared history destructively.
- Do not commit local indexes, caches, photo fixtures, models generated at runtime, or exported user media.
- The archived container branch is a historical fallback, not a target for routine changes.

## 12. Non-goals unless explicitly requested

Do not introduce these opportunistically:

- server-side photo uploads/storage;
- mandatory accounts or login;
- Cloudflare D1/R2/Workers for the core local workflow;
- automatic destructive rejection/deletion;
- multiuser/shared review;
- Electron or Docker dependencies on the active static app;
- face recognition before its roadmap slice;
- generative AI as a prerequisite for basic sorting;
- sync architecture before the local product proves useful.
