# Plotline / Timeline Editor

A core subsystem. Designed from the author's real artifact — the per-chapter plotline at
the end of `PlotLineTracker.txt` (and `PlotLine.txt`, `Future Plot.txt`). A first mockup is
published ("Authors Notes — Plotline / Timeline").

## What the author actually does (the source model)

Their plotline is an **ordered list of chapters**, each carrying free notes that are
*implicitly typed*:

- **Chapter N — Title** (sometimes alternate titles: `Voices of Others | Observation`).
- **Synopsis** — a prose paragraph of what happens.
- **Introduces** — new characters (with role: "Jin Meixiu - mc mom"), techniques
  ("Blue Mountain - the sword technique"), items, locations. This is where entities enter
  the story.
- **Future** — forward plot ideas ("future plot, they should be friends?").
- **Authoring notes** — "cut this from the chapter", "time skip?", "do I need a filler arc?".
- **Arc markers** bracket ranges — "Start of Lost history arc" … "End of Lost history arc".
- **Future chapter plot** — untethered ideas not yet placed on any chapter.
- **Human messiness** — duplicate chapter numbers (two Ch.17, two Ch.27, a second Ch.21),
  inconsistent casing. Identity must not depend on the number. (See the resilient project
  model in [UI Design](./UI%20Design.md).)

The editor is built to hold exactly this, but structured and cross-linked.

## The design

A **full-tab document** (opens like a chapter), listed in the explorer under
"Plot & Timelines". Three views of the same data:

- **Timeline (default):** a vertical **chapter spine**, grouped into **arc bands**. Each
  chapter is a card.
- **Board:** the same chapters as a kanban by status (or by arc) for reordering/triage.
- **Threads:** filter to a single plot thread / POV / entity and see just the chapters that
  touch it ("show every chapter where the World Revealing Stone matters").

### The chapter card

- **Number + title(s)**, a **status** (written / draft / planned), optional POV + word count.
- **Typed notes**, each with a small colored tag:
  - `synopsis` — the prose beat.
  - `introduces` — **entity pills** (character / technique / item / location), color-coded by
    type, each linking to the entity. *These pills are the source of the "cast in chapter"
    list and each entity's "introduced in Ch.N".*
  - `future` — forward-looking idea (amber).
  - `note` — authoring todo (cut / time-skip / filler), stripped from any export.
- **＋ Add note** to append a typed note.
- **Planned/unwritten chapters** render as ghost/dashed cards — they exist on the timeline
  before the prose does.
- **Numbering-conflict flag** — when two chapters share a number, the card shows a warning to
  resolve it (the app tracks identity independently, so this is a lint, not a crash).

### Arc bands

Arcs group chapters (sticky headers with the chapter range + overall status). Defined in the
project model, not folders. Collapsible.

### Future-ideas lane

A parking area at the bottom for **unplaced** plot ideas (from `Future Plot.txt`). Drag an
idea onto a chapter to place it.

### Inspector (right)

The selected chapter: editable synopsis, status/POV/words/arc, **Introduces** and **Appears
in this chapter** entity lists, and **Open chapter in editor**.

## How it connects to the rest of the app

- **Entities:** `introduces` notes create/link entities and set their *first-appearance*
  chapter → feeds the [entity/mentions model] and the "cast in chapter (unused)" dock.
- **Chapter plan:** a chapter's Topics/Summary/Objective (the right-dock plan) are the same
  data as its timeline card — two views of one thing.
- **Manuscript:** each node links to the actual chapter document; status is derived from it.

## Scope of "timeline"

Two granularities, both editable full-tab docs:
- **Series timeline** — the whole book (shown in the mockup).
- **Per-arc / per-chapter plotline** — a zoom into one arc or chapter's beat breakdown.

## Open questions

- **Threads model:** are plot threads explicit tags the author maintains, or inferred from
  shared entities? (Leaning: explicit, lightweight tags.)
- **Board axis:** status vs arc vs custom — configurable?
- **Ordering vs numbering:** the spine order is the truth; chapter *numbers* are just labels
  that can conflict. Confirm numbers are display-only, order is the manifest's.
- **Two-axis timeline** (chapters × POV/thread lanes) — worth it, or does the single spine +
  Threads filter cover it?
