# Entity & Mentions Model

The story-bible core. Every character, location, sect, item, technique, term, etc. is an
**entity**; entities link to each other and to the manuscript through **mentions**
(backlinks). Designed from the author's real bibles (`character list.txt`, `terminology.txt`,
the typed lists in `PlotLine.txt` / `PlotLineTracker.txt`). Mockup published ("Authors Notes
— Entities & Mentions").

## Entity types (extensible & managed)

The author already keeps many typed lists — Characters, Sects, Clans, Cities/Locations,
Items, Techniques, Creatures, Terms/Concepts, Cultivation stages, Ability markings. So:

- **Types are first-class and user-managed** — the type list is not fixed. Create, rename,
  delete, and reorder types. Ships with a default set; the author adds their own
  ("Conditions", "Red Demon Markings").
- Each type has a **schema** (its default attributes + sections — its template) and a
  **color** used consistently everywhere (pills, timeline "introduces", browser).
- **Each type/group can have a generator** (see Generators) that produces populated entities
  from the data banks.

## Where structured attributes come from — three layers

An entity's attributes are the **union** of three sources; inherited fields show their origin:

1. **Type schema** — attributes defined on the entity *type*. Editing the type propagates to
   every entity of that type.
2. **Group schema (inheritable)** — a **group** (family, faction, race) defines shared
   attributes its members **inherit as slots**. Add "Pattern" to the *Red Demons* group →
   every member gets a Pattern field. **Groups nest**, so attributes cascade down the
   hierarchy (Jin Family *inherits* Red Demons).
3. **Per-entity ad-hoc** — a one-off attribute on a single entity.

You **edit the schema** at the type/group level (add/rename/reorder/type a field, set fixed
vs per-member) and **fill values** per entity. A field can be *fixed* (Surname = "Jin" for
all) or *per-member* (each fills their own Pattern).

## Groups = attributes + relationships + graphs (one system)

The author's insight: a **group unifies three things**.

- **Membership is a relationship** — being in "Jin Family" *is* the kinship link. Groups model
  families, sects, factions, races.
- **Groups carry the inheritable attribute schema** (above).
- **Groups plot as graphs** — a group opens as a **graph/"plot" tab**: a **family tree**,
  an **org chart** (Cloud Sect's Grand Elder → … → Outer disciple), or a free relationship
  web. Views: **Tree / Graph / Table**. Nodes are entities (with portraits), edges are typed
  relationships. This is the relationship analog of the plotline timeline — a spatial "plot"
  of the bible.
- A **member × attribute** view shows one inherited attribute down all members (who has set
  their Pattern, who hasn't) — the inheritance made visible.

## Generators

A type or group can carry a **generator** that fills its schema from the **data banks** —
e.g. "Generate a Red Demon" pulls a surname from `names.surnames.csv`, assigns a Pattern from
a list, and creates a populated entity in one click. This is the entity-facing side of the
generator language / data banks (that subsystem comes later).

## Media (not just a portrait)

Each entity has a **media gallery** — attach **multiple images/files** (reference art, maps,
mood boards, audio). One image is chosen as the **portrait** (avatar shown in graphs, browser,
pills); the rest live in a per-entity gallery. Media is stored in the project folder (offline;
part of the resilient project model).

## Writer's linter — approved (v1 built)

The name/terminology consistency checker (below) is confirmed as a wanted feature.

**Built (2026-07-21):** `mentions.surfaceForms(entity, chapters)` returns the distinct spellings
of an entity actually found in the manuscript, each with a count (word-bounded, alias-aware).
The entity page shows a **banner** when >1 spelling exists ("N spellings — ShouShan (5),
Shoushan (3) …") with a **Unify** button that adds the unregistered forms as aliases. This is
the exact-match/casing tier; fuzzy edit-distance suggestions are a later enhancement.

## An entity record (wiki page)

Opens as a **full tab** (like a chapter) for deep editing, and is also reachable in the left
panel for quick edits. It has:

- **Header** — name, avatar, **type pill**, **status** (e.g. "Sealed — dead Ch.27"), and
  **aliases** (see below).
- **Infobox** — a compact table of **structured attributes** for the type (Origin,
  Cultivation, Pattern, First-seen/Hatched, POV chapters…). Semi-structured: mostly free, a
  few known keys the app can use (first-appearance, status).
- **Free-form categorized sections** — Overview, Origin, Abilities, … with **＋ Add section**.
  Arbitrary prose, exactly the author's habit of "writing in detail about a topic." Sections
  can contain `[[wikilinks]]` to other entities.
- **Relationships** — typed links to other entities ("mother → Jin Meixiu", "previous body →
  Mei Lin", "first resurrection → Devil King White"). These are real edges (queryable), not
  just text.

## Aliases & the consistency checker

The MC is *Jin Dandan / Xiao Dan'er / Xiao Dan / Dan'er*, and was *Mei Lin* — so aliases are
essential:

- Each entity has an **alias list**; mention-detection matches any alias.
- The **name/terminology consistency checker** (the writing-app analog of a linter) flags
  spelling drift — "Jin DanDan (8) / Jin Dandan (12) / dandan (3): unify as aliases?" — and can
  **unify** them in one action. Powered by the entity index; catches the author's real
  ShouShan/Shoushan-style drift.

## Capture — how entities get created

Three paths, all feeding the same record:

1. **From prose** — highlight → right-click → **Save as {type}** (from the editor's selection
   toolbar). Opens the new entity to edit.
2. **From the timeline** — an "introduces" note on a chapter creates/links the entity and sets
   its **first-appearance chapter**.
3. **Manually** — new entity in the Cast browser.

## Mentions (backlinks) — the payoff

Every entity shows **where it is referenced**, tabbed by source:

- **Manuscript** — chapters that name it (any alias), with **counts** and first/last, marking
  the "introduced" one.
- **Story bible** — other entities whose notes mention it, **with the snippet** (e.g. Devil
  King White's Origin: "White was the mc's first attempt at resurrection"). This is the
  author's exact ask: "in a character's description I say 'kills X' → see it from X."
- **Timeline** — plotline notes that reference it.

Mentions are the read side of the same index that powers **"cast in chapter"** (incl. the
"unused" tag) and the timeline's "introduces" pills — one graph, many views.

## Browser (Cast rail view)

Left panel: a **filter box + type chips** (All / Characters / Locations / Sects / Items /
Techniques / Terms …) over a grouped, searchable list. Each row: avatar, name, one-line role,
first-seen chapter.

## How the index works (implementation sketch)

- On save, parse each document (chapters + entity notes + timeline) for **known names/aliases**
  and `[[wikilinks]]`; write occurrences to the regenerable index (`.cache/`, see
  [UI Design](./UI%20Design.md) project model). Glossary-driven exact/alias match first;
  fuzzy match surfaces *suggestions* (the consistency checker), never silent auto-links.
- The index is disposable and rebuildable from the text — nothing about entity identity lives
  only in the cache.

## Open questions

- **Structured vs free:** which attributes are known keys the app reasons about (first-seen,
  status, type) vs purely free infobox rows?
- **Relationship types:** fixed vocabulary, or free-text labels? (Leaning free-text with
  autocomplete.)
- **Auto-link aggressiveness:** auto-link every known name in prose, or only `[[explicit]]`
  links + a "possible mention" underline? (Leaning: explicit links are hard, known names get a
  faint suggested-mention marker the author can confirm.)
- **Spoiler control:** status like "dead Ch.27" is a spoiler — hide beyond the reading
  position?
- **Entity page vs left-panel editor:** confirm both (full tab for depth, panel for quick).
