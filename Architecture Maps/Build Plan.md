# Build Plan / Roadmap

Where the project stands and the order to build it. The other Architecture Maps docs are the
**living spec** — this is the sequencing.

## Where we are (2026-07)

- **Client shell** runs: Tauri 2 + SolidJS + Vite + CodeMirror + the split-container, in-memory
  docs only, dev port 1420.
- **Design is well-specified** for the three cores — see [UI Design](./UI%20Design.md),
  [Plotline and Timeline Editor](./Plotline%20and%20Timeline%20Editor.md),
  [Entity and Mentions Model](./Entity%20and%20Mentions%20Model.md), grounded in the
  [Case Study](./Case%20Study%20-%20Strongest%20World.md) and the
  [Formats research](./Formats%20and%20Standards%20Research.md).
- **Decision:** stop at "enough mockups." Start building in thin vertical slices; keep refining
  the design docs as building surfaces real questions. The app becomes the feedback loop the
  author needs to "get a feel."

## The whole system, in one view

Everything hangs off a **resilient project model** (self-describing Markdown files + a manifest
+ a regenerable index). On top of that:

- **Editor** — write chapters (page/scroll, CommonMark+prose, autosave).
- **Entity/mentions index** — one graph parsed from the text; powers cast-in-chapter, mentions,
  the timeline's "introduces", and consistency linting.
- **Story bible** — typed, extensible entities; **groups** carry inheritable attributes +
  relationships + graph "plots"; **generators** + **media galleries**; = a character creator.
- **Plotline/timeline** — chapters as typed-note cards, arcs, threads; same data as chapter plans.
- **Data banks + generator language** — CSV banks; tokens/attributes resolve by
  **select / shuffle / set**; the naming/worldbuilding engine.
- **Export** (Pandoc sidecar) and **AI add-ons** (local, offline) layer on last.

## Phases (thin vertical slices)

1. **Foundation — a novel you can actually write in.** *(recommended first)*
   Project model on disk (`.project` + manifest + atomic autosave, resilient naming); editor
   reads/writes real chapter files; open/create projects; **import the existing Strongest World
   `.txt` chapters**; page/scroll view; basic CommonMark+prose highlighting. → You're writing in
   your real novel, in the app.
2. **Story bible lite.** Entity records (typed, categorized sections, portrait); capture via
   highlight→save-as; the parsed **mentions index**; cast-in-chapter dock.
3. **Timeline/plotline.** The chapter-spine timeline; typed notes; arcs; links to chapters.
4. **Groups, attributes & graph / character creator.** Type/group schemas + inheritance;
   relationship graph; media galleries.
5. **Data banks + generator language.** CSV banks; the resolve popover (select/shuffle/set);
   marking-pack integration; entity generators.
6. **Export + AI add-ons.** Pandoc sidecar (profiles); optional local models.

Each phase is usable on its own and refines the spec docs as it lands.

## Data banks — feasibility (short)

Not a technical risk. A **bank** is a CSV/list of entries. A **generator** is a small resolver.
The editor token (`/city`) and the attribute field share one interaction — a **resolve popover**
backed by a bank with three actions: **shuffle** (random entry), **select** (pick from list),
**set** (type your own, optionally add back to the bank). All local/offline, cheap to run in JS,
and it drops cleanly onto the entity attribute system (the "character creator"). Deferred because
it's additive and best tuned inside a running app — not because it's hard.

## Refinement TODO (raised during app use, 2026-07)

Deferred items that need bigger work or a package change:

- **Two synced instances of one chapter** (open in a split, edit both, stay in sync).
  Blocked by the app's single-`CurrentDoc` model — needs **per-tab document state + a
  shared CRDT (Yjs)**. The split-container already supports the two-pane layout; the
  limitation is ours, not the package's.
- **Preview tabs** (single italic preview slot, promoted to permanent on edit / double-click):
  buildable at the app level via a `preview` flag + `UpdateTab` (no package change) — being
  built as part of the chapter batch.
- **True paginated page view** (real page breaks + "Page N of M"): lives in the **Rendered
  preview** (Pandoc → paginated output), NOT the live editor — the editor sheet is a reading
  aesthetic and can't be print-accurate (screen px ≠ print pages). Decided with the author.
- **Named system** (user-defined entity collections) — see the story-bible redesign; needs a
  design pass before building.

## Working principle

Docs stay the source of truth; we refine them as we build. Build order favors **foundation →
feedback**: get the author writing in the real app early, then layer the bible, timeline, groups,
and banks on top.
