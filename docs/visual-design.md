# PhotoFind visual design system

This document is the visual and interaction contract for the browser-native PhotoFind product. New work must follow it unless a deliberate design revision updates this document first.

## Product character

PhotoFind is a private family-photo curator, not an infrastructure dashboard or enterprise digital-asset manager.

The interface should feel:

- photo-first;
- calm and modern;
- warm without becoming playful or childish;
- fast and trustworthy;
- useful to a non-technical family member without hiding important safety information.

A screen should answer one primary user question. System internals, diagnostics, source provenance and technical measurements are secondary layers rather than the visual centre.

## Core principles

### 1. Photos are the dominant visual material

- Media receives the largest area and strongest contrast.
- Controls frame the photos rather than competing with them.
- Thumbnail grids use generous sizing and restrained metadata.
- Full-size review and compare modes minimise surrounding chrome.

### 2. Task-based navigation

The primary product modes are:

- **Library** — find and browse;
- **Map** — browse by place;
- **Groups** — inspect duplicates, bursts and similar scenes;
- **Quality** — rank by technical signals;
- **Review** — make Keep / Maybe / Reject decisions quickly;
- **Compare** — pick the best frame from a related group;
- **Selection** — inspect and export the finished selection.

Operational and diagnostic views are advanced tools and must not visually dominate these modes.

### 3. Progressive disclosure

- Show common actions first.
- Put detailed EXIF, diagnostics, source paths and algorithm explanations in drawers, details panels or secondary text.
- Do not present every filter permanently when a compact chip, popover or expandable panel will do.
- Never hide destructive or privacy-relevant consequences.

### 4. Quiet surfaces, clear hierarchy

- Avoid boxes inside boxes.
- Prefer spacing, tone and typography over borders.
- Use borders for structure or state, not decoration.
- Reserve strong colour for active navigation, review state, warnings and primary actions.
- Use one obvious primary action per region.

### 5. Consistent review semantics

Review state colours are stable everywhere:

- **Keep:** green;
- **Maybe:** amber;
- **Reject:** red;
- **Unreviewed:** neutral grey.

Colour must be paired with a label, icon or shape. It must never be the only indicator.

Keyboard shortcuts are stable:

- `K` — Keep;
- `M` — Maybe;
- `R` — Reject;
- `U` — reset to Unreviewed;
- `←` / `→` — previous / next;
- `Z` — cycle zoom in the viewer;
- `Esc` — leave the current focused mode.

### 6. Private-by-design reassurance

Privacy is communicated calmly, not as repeated alarm text.

- The global shell may show a compact “Local only” indicator.
- Export and map views explain their specific external or write behaviour at the point of action.
- Do not claim that map tiles are local.
- Never imply that PhotoFind can modify source media; exported copies are the only writable media output.

## Layout system

### Desktop

- Compact top bar for brand, search, privacy state and the primary folder action.
- Persistent left navigation for product modes and local indexes.
- Main content is wide and photo-led.
- Contextual controls stay near the content they affect.
- A sticky selection/review summary may sit near the lower edge when useful.

### Mobile and narrow windows

- Preserve all core workflows at 320 CSS pixels.
- Collapse the left navigation into a horizontally scrollable mode bar or bottom navigation.
- Stack controls rather than shrinking text below readable sizes.
- Review mode prioritises the current photo and three large decision actions.
- Compare mode may use a horizontal media strip when side-by-side cards no longer fit.

## Spacing and shape

- Use an 8 px spacing rhythm, with 4 px only for tightly related micro-elements.
- Primary panels use 14–18 px corner radii.
- Thumbnails use 10–14 px corner radii.
- Pills are reserved for filters, statuses and compact counters.
- Shadows are subtle and limited to overlays, floating controls and focused media.
- Avoid glow effects and decorative gradients. A restrained background gradient is allowed in the application shell.

## Typography

- Use the platform/system sans-serif stack; do not require hosted fonts.
- Default body text remains comfortably readable, normally 14–16 px.
- Use medium weight for headings and active controls rather than heavy bold everywhere.
- Eyebrow labels are rare and only used for genuine context changes.
- Metadata and helper text may be smaller, but essential actions and values are never muted or tiny.

## Colour tokens

The implementation should expose semantic CSS variables rather than scattering literal colours:

- background and elevated surfaces;
- primary and secondary text;
- subtle and strong borders;
- accent and accent-muted;
- keep, maybe, reject and neutral review states;
- warning and error;
- quality tiers.

Dark mode is the first supported theme. Tokens must leave room for a later light theme without rewriting components.

## Photo grid

- Use a responsive justified-feeling grid with consistent visual rhythm.
- Default thumbnails are large enough to judge content, not merely identify files.
- Show filename only when useful; date, review state and quality are more important in normal browsing.
- Quick review controls appear on hover/focus on desktop and remain accessible on touch.
- Selected, focused and reviewed states must remain obvious without adding permanent visual clutter.

## Library / timeline view

- Organise photos into meaningful date sections where practical.
- Search and primary filter chips are visible near the top.
- Advanced filters may expand below the search row.
- Keep/Maybe/Reject totals are visible but not presented as dashboard KPIs.
- The selection tray is a compact workflow affordance, not a separate operations panel.

## Focused review mode

- One photo is visually dominant.
- Progress and session name remain visible but quiet.
- Keep, Maybe and Reject are large, stable targets.
- Similar photos and technical detail are secondary panels.
- The user can complete a session entirely with keyboard shortcuts.
- Decisions persist immediately and are reversible.

## Compare mode

- Present related frames as peers.
- Technical quality is a suggestion, never an automatic deletion decision.
- The current technical favourite may be marked clearly.
- The user can Keep one, Maybe alternatives, or Reject the remaining frames with explicit actions.
- Zooming and switching between candidates must preserve context.

## Selection and export

- The keeper tray shows the actual photos being exported.
- Export options are understandable without knowledge of EXIF, XMP or file-system APIs.
- “Embed repaired metadata” is enabled by default and explained in plain language.
- JPEG exports embed reliable normalized date/GPS metadata directly.
- Formats that cannot be safely rewritten receive an XMP sidecar and an explicit result note.
- Existing destination files are never overwritten.
- The source collection is never modified.

## Diagnostics

- Diagnostics are collapsed by default when there are no urgent failures.
- Warnings identify the affected file and suggested next action.
- Raw logs and source paths use monospace only inside the diagnostic detail region.
- Diagnostics must not interrupt normal browsing unless data loss or an incomplete operation is possible.

## Motion and feedback

- Use 120–220 ms transitions for hover, selection and panel changes.
- Avoid ornamental animation.
- Long-running analysis and export show progress, current item and reused work.
- Review decisions should feel immediate; persistence errors must roll back or clearly explain uncertainty.

## Accessibility

- Every interaction is keyboard reachable.
- Focus states remain visible.
- Icon-only controls have accessible names and tooltips where useful.
- Colour contrast targets WCAG AA.
- Review state and quality never rely on colour alone.
- Reduced-motion preferences are respected.

## Anti-patterns

Do not:

- make the main experience resemble server monitoring;
- expose node health, ingestion queues or source topology in primary navigation;
- use dense permanent side filters for every available property;
- nest multiple bordered cards merely to group content;
- fill the screen with tiny badges;
- allow technical quality to masquerade as memory value;
- add controls that are visually present but non-functional;
- trade mobile usability for a desktop-only visual composition.
