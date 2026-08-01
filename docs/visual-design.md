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
- **Events** — browse moments derived from time and supporting context;
- **Map** — browse by place;
- **People** — name and correct private local face clusters;
- **Groups** — inspect duplicates, bursts and similar scenes;
- **Quality** — rank by technical signals;
- **Review** — make Keep / Maybe / Reject decisions quickly;
- **Compare** — pick the best frame from a related group;
- **Selection** — inspect and export the finished selection.

Operational and diagnostic views are advanced tools and must not visually dominate these modes.

### 3. Progressive disclosure

- Show common actions first.
- Put detailed EXIF, diagnostics, full relative paths and algorithm explanations in inspectors, details panels or secondary text.
- Parent source-folder context may remain visible in comparison workflows because it directly informs duplicate decisions.
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
- People analysis explains its local model/embedding behaviour at the moment analysis is started.
- Export and map views explain their specific external or write behaviour at the point of action.
- Do not claim that map tiles are local.
- Never imply that PhotoFind can modify source media; exported copies are the only writable media output.
- Never imply that PhotoFind knows an unavailable absolute filesystem path or can open Explorer/Finder from a hosted browser.

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
- People and Event workspaces collapse their master/detail columns rather than compressing face or photo previews into unreadable cards.

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
- Relative paths may use monospace inside an inspector; folder labels remain ordinary interface text.

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
- An active exact-source-folder filter is shown clearly and can be cleared in one action.
- The selection tray is a compact workflow affordance, not a separate operations panel.

## Source provenance

- Individual-photo inspectors show the parent folder and full path relative to the selected library root.
- A Copy path action is available without making the path the primary visual element.
- Source-folder labels are actionable and filter Library to the exact parent folder.
- Duplicate/burst/similarity groups summarise every represented source folder and count.
- Compare candidates show source folder near the candidate metadata because origin may determine which copy to keep.
- Never show an absolute-looking prefix that PhotoFind does not actually know.
- Never label exact-folder filtering as “Open folder” or imply OS file-manager integration.

## Events view

- Event cards are photo mosaics, not rows of metadata.
- Event title, date span and photo count provide the first reading layer.
- Known people and dominant source folders are secondary context.
- Event detail explains grouping evidence in plain language: time, place, source folder, people or visual relation.
- Event source folders remain navigable back to Library.
- Generated events are presented as useful groupings, not objective truth.

## People view

- People analysis is an explicit primary action, never an automatic background surprise.
- The empty state explains that models and embeddings stay local and that sensitive demographic inference is disabled.
- Person cards use local face crops large enough to recognise, with cluster/photo counts as secondary text.
- Rename, merge, split, ignore and restore are visible correction tools.
- Merge requires explicit confirmation.
- Split is performed on a concrete face example, not through abstract cluster controls.
- Unnamed and one-off faces may be hidden by default to preserve calm, but remain discoverable.
- The UI never claims a real-world identity until the user supplies a name.

## Focused review mode

- One photo is visually dominant.
- Progress and session name remain visible but quiet.
- Keep, Maybe and Reject are large, stable targets.
- Similar photos and technical detail are secondary panels.
- Source folder/path remains visible in the inspector because it may explain duplicates or copied folders.
- The user can complete a session entirely with keyboard shortcuts.
- Decisions persist immediately and are reversible.

## Compare mode

- Present related frames as peers.
- Technical quality is a suggestion, never an automatic deletion decision.
- The current technical favourite may be marked clearly.
- Each candidate exposes its source folder without hiding the image.
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
- Raw logs and full source paths use monospace only inside the diagnostic detail region.
- Model-load and face-analysis failures are reported without exposing raw embeddings.
- Diagnostics must not interrupt normal browsing unless data loss or an incomplete operation is possible.

## Motion and feedback

- Use 120–220 ms transitions for hover, selection and panel changes.
- Avoid ornamental animation.
- Long-running analysis and export show progress, current item and reused work.
- Review decisions should feel immediate; persistence errors must roll back or clearly explain uncertainty.
- People operations should update immediately but must surface persistence failures rather than silently losing labels or assignments.

## Accessibility

- Every interaction is keyboard reachable.
- Focus states remain visible.
- Icon-only controls have accessible names and tooltips where useful.
- Colour contrast targets WCAG AA.
- Review state and quality never rely on colour alone.
- Face/person UI does not depend on face images alone; names/counts/state remain textual.
- Reduced-motion preferences are respected.

## Anti-patterns

Do not:

- make the main experience resemble server monitoring;
- expose node health, ingestion queues or source topology in primary navigation;
- use dense permanent side filters for every available property;
- nest multiple bordered cards merely to group content;
- fill the screen with tiny badges;
- allow technical quality to masquerade as memory value;
- present face clusters or generated events as certain facts;
- add controls that are visually present but non-functional;
- trade mobile usability for a desktop-only visual composition.
