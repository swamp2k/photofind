# AGENTS.md — PhotoFind

This file defines how Codex and delegated agents must work in this repository.

## 1. Product direction

PhotoFind is a self-hosted photo-curation application. Its purpose is to help users reduce large, overwhelming photo collections into smaller, useful and meaningful selections.

PhotoFind has two equal first-class workflows:

1. **Quick Sort** — process a temporary batch, group near-duplicates and bursts, recommend technically stronger images, review with Keep/Maybe/Reject, then export the selection.
2. **Library** — index a long-lived photo archive, browse and curate it over time, optionally collaborate with other household users, and export a standalone curated archive.

Google Takeout repair is an optional ingestion capability. It is not the main product.

Core principles:

- Run locally and remain suitable for an Unraid container.
- Keep original media local and protected.
- Prefer read-only access to original libraries.
- Never modify metadata unless the user explicitly enables Repair Mode.
- Never delete, overwrite or silently discard original media.
- Surface warnings, unsupported files and failures in Diagnostics.
- Keep solo use simple. Multiuser review must remain optional.
- Separate technical quality from emotional or historical importance.
- Recommendations assist the user; they never become irreversible automatic decisions.
- Exported collections must remain useful without PhotoFind.

## 2. Current and target architecture

The repository currently contains an Electron + React/Vite + TypeScript prototype with scanning, Takeout sidecar matching, metadata repair, thumbnail generation, SQLite keeper persistence and basic export.

The intended direction is:

- Browser-accessible React interface.
- Backend HTTP API.
- Persistent background jobs.
- SQLite initially, with explicit schema migrations.
- Container-first deployment for Unraid.
- Optional Electron wrapper later, using the same API and web interface.
- Optional separate media/ML worker when heavier processing is introduced.

Expected container mounts:

```text
/config   application database, configuration and migrations
/cache    generated thumbnails, previews and analysis data
/photos   permanent source libraries; read-only by default
/inbox    temporary Quick Sort input
/exports  completed exports and reports
```

Do not hard-code these paths. Treat them as configurable deployment defaults.

## 3. Authority and scope

For each task, follow instructions in this order:

1. The user's current request.
2. The active milestone handover in `docs/handovers/`, when present.
3. This `AGENTS.md`.
4. Product and roadmap documents in `docs/`, when present.
5. `README.md` and existing code conventions.

A milestone handover defines the implementation scope. Do not silently implement later-roadmap features because they appear useful.

When requirements conflict or a change would alter product direction, stop implementation and report the decision needed to the supervisor.

## 4. Supervisor and worker workflow

The primary agent acts as **supervisor**. In the configured workflow this is normally GPT-5.6 Sol with high reasoning effort.

The supervisor owns:

- Understanding the request and active handover.
- Repository orientation and architecture.
- Breaking work into bounded tasks.
- Deciding what may run in parallel.
- Delegating implementation.
- Reviewing all returned changes.
- Integration decisions and small corrective edits.
- Running or verifying final validation.
- Reporting completion, risks and remaining work.

For non-trivial implementation, delegate to `luna_worker`, normally GPT-5.6 Luna with medium reasoning effort.

The worker must:

- Work only on the explicitly delegated task.
- Read the relevant files before editing.
- Preserve existing architecture unless the task explicitly changes it.
- Avoid unrelated cleanup and refactoring.
- Add or update tests for changed behaviour.
- Run the most relevant validation available.
- Report changed files, validation results, assumptions and unresolved risks.
- Never broaden scope merely to make the implementation more elegant.

The supervisor must inspect the actual diff and relevant files. Never accept a worker's summary as proof that the implementation is correct.

### Delegation rules

- Normally use one writing worker at a time.
- Up to three concurrent agents may be used when tasks are genuinely independent.
- Parallel read-only exploration is encouraged when it reduces uncertainty.
- Parallel writers must have clearly disjoint files and responsibilities.
- Never assign multiple agents to edit the same file concurrently.
- Use `explorer` for focused read-only investigation when available.
- Use `luna_worker` for scoped production implementation.
- Do not delegate the final architectural decision or final acceptance review.
- If a worker fails twice on the same issue, stop looping. Reassess the task, narrow it or escalate deliberately.
- Use a higher-effort worker profile only when one is actually configured; never claim model routing that was not verified.

The supervisor may directly perform tiny documentation edits, integration fixes or corrections discovered during review. Substantial feature implementation should still be delegated.

## 5. Required task flow

For milestone or feature work:

1. Read this file, the active handover and the affected code.
2. Inspect repository status and preserve unrelated user changes.
3. State the bounded implementation goal.
4. Identify risks, data-safety concerns and acceptance requirements.
5. Delegate one or more explicit tasks.
6. Review returned changes against the handover, not merely against compilation.
7. Run applicable tests, type checks and builds.
8. Perform a focused acceptance or smoke check.
9. Report exactly what was completed and what remains unverified.

Do not begin a large implementation from a vague roadmap paragraph. Work from a handover with explicit acceptance criteria.

## 6. Safety around media and user data

PhotoFind works with irreplaceable personal media. Data safety outranks convenience.

- Original-library mounts should be read-only by default.
- Write operations require an explicit user action and an explicit API path.
- Metadata repair must support dry-run and visible confirmation.
- Export must not overwrite existing files silently.
- Deletion must distinguish temporary cache/job data from original media.
- Never follow untrusted paths outside configured roots.
- Validate upload names, archive entries and filesystem paths against traversal.
- Do not expose arbitrary host filesystem paths through the API.
- Store source paths and processing failures in auditable job records.
- Background jobs must be retryable or clearly terminal; never disappear silently.
- Database schema changes require migrations. Do not rely on destructive recreation.

Tests involving writes must use temporary fixtures, never real user folders.

## 7. Domain rules

### Review decisions

Use these states unless a handover explicitly changes them:

- `unreviewed`
- `keep`
- `maybe`
- `reject`

Solo mode uses one person's decisions directly.

Shared review stores per-user decisions separately from the final collection decision. One user's action must not overwrite another user's opinion.

### Recommendations

Keep distinct signals for:

- Technical quality.
- Similarity or duplicate grouping.
- Memory or emotional significance.
- User review decisions.

A blurry but unique family photo must not be discarded because it lost a technical-quality comparison.

Recommendations should include understandable reasons such as sharper face, less motion blur, eyes open, improved exposure or better framing.

### Diagnostics

Diagnostics are part of the product, not development-only logging.

Every unsupported file, ambiguous match, processing failure, skipped write and failed export must remain discoverable with actionable context.

Do not catch errors and return success-shaped results.

## 8. Engineering conventions

- Prefer clear, explicit TypeScript over clever abstractions.
- Keep shared contracts typed across backend and frontend boundaries.
- Keep filesystem, database, API and UI concerns separated.
- Isolate pure media-matching and scoring logic so it can be unit tested.
- Make background jobs idempotent where practical.
- Record job progress persistently rather than only in browser state.
- Avoid adding dependencies when platform or existing dependencies are sufficient.
- Explain any substantial new dependency in the implementation report.
- Do not perform broad version upgrades as part of unrelated work.
- Avoid mass formatting or renaming unrelated files.
- Preserve backwards compatibility within an active milestone unless the handover explicitly permits a break.
- Prefer incremental migration from Electron IPC to HTTP APIs; do not rewrite working domain logic unnecessarily.

## 9. Validation

The current project requires Node.js 20.

Run the applicable existing commands after changes:

```bash
npm run typecheck
npm test
npm run build
```

When container support exists, also run the relevant image build and container smoke checks defined by that milestone.

Validation rules:

- Never claim a command passed unless it was run successfully.
- Report skipped validation and the exact reason.
- New domain logic requires unit tests.
- Database changes require migration and persistence tests.
- API changes require success and failure-path tests.
- File-processing tests must include unsupported or corrupted input.
- UI work requires at least a focused manual or automated smoke check.
- A successful build does not prove the feature meets its acceptance criteria.

## 10. Git and repository hygiene

- Inspect `git status` before editing.
- Preserve unrelated changes already present in the working tree.
- Keep changes bounded to the active task.
- Do not commit, push, open a pull request or rewrite history unless explicitly requested.
- Never use destructive Git commands to clean up work you did not create.
- Do not include generated caches, user databases, imported media or export output in Git.

## 11. Completion report

At the end of implementation, the supervisor reports:

```text
Implemented
- User-visible and architectural changes

Changed files
- Important files and why they changed

Validation
- Commands and acceptance checks actually completed

Not verified
- Anything that could not be tested

Risks / follow-up
- Remaining limitations, migration concerns or next milestone dependencies
```

Keep the report concrete. Avoid claiming a milestone is complete when acceptance criteria remain untested.

## 12. Non-goals unless explicitly handed over

Do not introduce these opportunistically:

- Cloud storage of original media.
- Automatic destructive rejection or deletion.
- Face recognition before its milestone.
- Generative-AI dependencies for basic Quick Sort.
- Mandatory multiuser setup for solo users.
- Public internet exposure as a default deployment mode.
- PostgreSQL, distributed queues or microservices before scale justifies them.
- A full Electron rewrite when the existing React UI and domain logic can be migrated incrementally.
