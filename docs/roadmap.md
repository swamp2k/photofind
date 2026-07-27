# PhotoFind roadmap

Milestone 0 is represented as implemented here. The Milestone 1 code foundation
is present, but its Node 20, container, browser and Electron acceptance checks
must be completed in a suitable environment before it is treated as released.
Later milestone descriptions state product direction, not current capability.

## Foundation release

Milestone 1 web and container foundation is implemented in code; later milestones
remain planned.

- **Milestone 0 — Product and architecture reset:** curation-first documentation,
  reusable application/services, renderer client boundary, and safe SQLite migrations.
- **Milestone 1 — Web and container foundation:** add an HTTP adapter and initial
  container packaging around the same application facade.
- **Milestone 2 — Durable ingestion jobs:** introduce mounted inbox/browser ingestion
  choices and persistent, observable background processing.

## Quick Sort release

- **Milestone 3 — Four-state review:** implement `unreviewed`, `keep`, `maybe`, and
  `reject` for temporary jobs without automatic destructive actions.
- **Milestone 4 — Exact duplicates and bursts:** group exact copies and obvious bursts
  while preserving all originals.
- **Milestone 5 — Similarity and technical signals:** add near-identical grouping and
  explainable quality measurements.
- **Milestone 6 — Recommendations and export:** recommend technically stronger
  candidates, preserve memory-keeper judgment, and harden standalone export.

## Library and household release

- **Milestone 7 — Long-lived Library:** index configured read-only sources and provide
  timeline-oriented archive browsing.
- **Milestone 8 — People, places, and events:** add optional organisation signals with
  explicit privacy and correction controls.
- **Milestone 9 — Shared household review:** store per-user opinions separately from a
  final collection decision while keeping solo mode simple.

## Production release

- **Milestone 10 — Scale and operations:** improve cache lifecycle, job recovery,
  observability, performance, and optional separated heavy-media workers.
- **Milestone 11 — Release hardening:** complete security, backup/restore, migration,
  packaging, accessibility, and end-to-end acceptance for supported deployments.

Sequencing may be refined by later handovers. Each milestone must preserve media
safety, explicit diagnostics, and exports that remain useful without PhotoFind.
