# UI Design

The visual + layout design for the app. Grounded in the author's own workflow (see
[Case Study — Strongest World](./Case%20Study%20-%20Strongest%20World.md)) and how they
use VS Code today. A first interactive mockup exists (published Artifact, "Authors Notes
— UI Concept") — this doc is the source of truth; the mockup is a snapshot to react to.

> Status: **direction agreed, details in progress.** This captures the current shared
> picture, not a frozen spec.

## Aesthetic

- **Many selectable themes**, each with light + dark. The author **prefers a gray-set
  theme** → **gray is the default**. The warm "candlelit" palette (amber accent) is one of
  the shipped themes, not the only look. Theme picker in the top bar + full list in
  Preferences. All theme-aware; neutrals chosen (warm or cool), never flat grey.
- **Book-like serif** for the manuscript prose (Iowan/Georgia); a clean/sans option and the
  real choice live in **Preferences**. UI chrome uses a system sans; data/counters/tokens
  use monospace.
- **Icons: Lucide** (author preference). MIT-licensed, inlines as SVG, ships with the app —
  fits the offline/self-contained rule. Standardize on it; don't mix icon sets.
- **Overflow discipline:** panes, cards, tree rows, and the search breadcrumb must clip
  gracefully (`min-width:0` + ellipsis on flex text children). The app is dense; watch the
  CSS cascade so spacing/overflow doesn't break as content grows.

## Copy / tone — no filler

The UI does its job and nothing more. **No explanatory blurbs, marketing lines, reassurances,
or "here's how this works" text.** Controls are labelled by what they do; that's it. Don't
describe the app to the user inside the app (e.g. never "a project is a folder of Markdown
files…", "everything stays on your machine"). Empty states and errors may give a short,
functional instruction, but no prose padding.

## Reveal boxes are animated (author, 2026-10-16)

Anything that expands and collapses (sidebar sections, tree folders and arcs, right-panel
panes like Topics, Outline arcs, an Outline card opening for editing) animates:

- **Opening:** the height grows to fit while the contents stay **transparent**; once the
  box is full height, the contents fade in.
- **Closing:** the contents fade out first, then the height shrinks away.
- Toggling mid-animation continues from where it is; "reduce motion" in the OS snaps instead.

Use `Reveal` (`<Reveal when={open()}>…</Reveal>`) for content that mounts and unmounts, and
`morph` / `togglePane` from `components/Reveal.jsx` for layout changes that swap or resize
existing boxes. New collapsibles use these; don't add a bare `<Show>` for a reveal.

The right panel scrolls as a whole and each pane keeps its natural height (as in the binder
artifact); panes no longer split the panel's height, which squeezed Chapter plan and Topics
to less than their headers on shorter windows.

## Implemented layout behaviors (current build — durable record)

These are decided and built in `Main/Client`; keep them:

- **Center = the split-container.** The middle section is `@curruptnation/split-container`.
  Opening a chapter, the timeline, a character/group, or a bank opens a **tab** in it;
  tabs switch, close, and drag-to-split. Themed via `--splitcontainer-*` vars from the
  active theme. (Context drives it: `SetContainerApi` / `HandleContainerChange`; each open*
  routes through `openTabFor`; `onChange` loads the tab's doc into `CurrentDoc`.)
- **Left sidebar is collapsible.** Clicking a rail view icon opens its panel; clicking the
  **active** icon collapses the whole sidebar (width animates + fades). Rail views:
  Explorer, Cast, Timeline (opens a tab), Data Banks; AI + Settings are placeholders.
  Settings uses the proper closed Lucide gear. (**No rail Search** — the scoped search lives
  in the top bar; a second one was redundant. `SearchPanel.jsx` is now unused.)
- **CodeMirror chrome is theme-tokened, not CM's light/dark default.** The editor theme
  (`Editor.jsx` `PROSE_THEME`) sets the **selection** (`.cm-selectionBackground` → `--sel`,
  focused + unfocused, also forced with `!important` in `Editor.css`) and **all popups**
  (`.cm-tooltip` → `--chrome`/`--border`/`--ink`: the selection toolbar, resolve popover, and
  `/bank` autocomplete) from our tokens — CM's built-in defaults rendered light in dark mode
  (washed-out selection, white popup). The popover inner divs are layout-only. Theme `<select>`
  has **no border**; `select option` is themed globally so dropdown lists stay readable.
- **Right dock = a permanent, collapsible inspector.** Always present when a project is
  open; a top-bar **panel toggle** collapses/expands it (animated). Content is
  **context-aware**: a chapter shows **Cast-in-chapter + Chapter plan**; **clicking a cast
  character shows that character's info in the panel** (avatar, aliases, notes, mention
  count, "Open full page") with a back button — not a new tab.
- **Overflow discipline (critical).** Every panel is a bounded box that scrolls internally.
  Grid/flex children carry `min-height:0` (+ `min-width:0`, `overflow:hidden`); the
  split-container's panel chain is forced bounded so editor content scrolls instead of
  clipping. Nothing may overflow the screen.
- **Editor is a real page in Page view.** CodeMirror runs at `height:auto` inside an outer
  `.editor-scroll`; the prose sits on a `.sheet` (`--page` bg, shadow, `620px` bounded
  width) with the **chapter header on the sheet** (`Chapter : N` + serif title). Page view
  is a bounded sheet, **not** full-width (that was the "too big" bug). Scroll view drops the
  sheet chrome for a `44rem` measure. Structure lives in `components/Editor.{jsx,css}`.
- **Scrollbars are slim + theme-aware.** Global `::-webkit-scrollbar` (WebView2/Chromium) +
  `scrollbar-*` in `index.css`, thumb `--faint`→`--dim`, transparent track, ~10px w/ padding
  inset. The split-container's own fullscreen button + tab-scroll thumb are repainted from
  the theme with `!important` (the package hardcodes white rgba → invisible on light themes).
- **Inspector follows the open chapter.** The right-dock character drill-in (`InspectedId`)
  is transient: a `createEffect` on `CurrentDoc.id` clears it, so switching chapters always
  shows the new chapter's cast + plan, never a stale character.
- **Status bar fields (artifact parity).** Save state · POV (if set) · doc words · project
  total (summed from the chapter bodies) · `CommonMark + prose` · version. No page x/y yet
  (CodeMirror is one continuous buffer — real pagination is deferred).
- **Marking pack (in-prose chrome).** `components/marking.js` = CodeMirror decorations:
  **known entities get a dotted underline** (`Ctrl/Cmd-click` opens the entity — plain click
  still edits, matching VS Code), **`%` lines** render faint italic, and **`***`** renders as
  a centered **✳ dinkus** (raw `***` shows when the cursor is on the line, live-preview style).
  A **selection toolbar** (CM tooltip) offers **＋Character / ＋Location / ＋Term** (creates the
  entity from the selection and opens it) **· Look up** (fills the search). Entity matching
  reuses `mentions.buildMentionMatcher` (word-bounded, alias-aware, longest-first). The entity
  list is captured at editor mount, so new entities underline after the chapter is reopened.
- **Resolved generator tokens (live & re-rollable).** A generated `/bank` value is stored
  inline as `⟦bank:value⟧` (grammar in `project/format.js`: `generatorToken`,
  `stripGeneratorMarkers`, `GENERATOR_TOKEN_RE`). The editor renders it as a **faint box**
  showing only the value; **click it to open a resolve popover** (`.cm-resolve`, a CM tooltip)
  with **⟳ Shuffle** and a **scrollable list of the bank's entries to pick from** (current one
  marked); it **reveals the raw `⟦…⟧`** while the cursor is inside so you can edit it. `/bank`
  autocomplete inserts the marker (both the "random" pick and specific entries). Word counts
  strip the markers; export (later) strips them too. **Still deferred:** add-to-bank /
  type-your-own from the popover (a focused input in the tooltip — the "set" verb), and explorer
  **arc grouping** (needs an arc data model in the manifest).
- **Icons: Lucide, sized ~14–16px.** No tiny text-glyph buttons (chevrons, stepper arrows,
  topic pins, ＋ are all Lucide). Icon set lives in `src/components/icons.jsx`.
- **Titlebar:** fully draggable (drag regions on the whole bar incl. the right cluster and
  search area); custom window controls; File menu opens left-aligned under its tab and
  closes on click-away (fixed the overlay z-index). Search is centered.
- **Empty state:** no project → a small centered **launcher** with three uniform options
  (no accent-filled button, author's call): **Open project · New project · Open recent**.
  "Open recent" opens a **modal** (`.modal-overlay`/`.modal`, backdrop-click to close) listing
  recent projects (name + path); selecting one opens it. Import is **not** here (File menu).
- **Recent projects:** File menu lists recents *and* the blank-state "Open recent" modal shows
  them (persisted in `localStorage`).
- **View menu (real dropdown).** File + View share one `Menu` signal (`'file'|'view'|null`,
  one overlay). View has **Page view / Scroll view** (checkmarked) and **Page width** ± steppers
  (420–920px, default 620, live via a `--sheet-width` CSS var on the editor host; disabled in
  Scroll view). **Deferred:** a **Rendered/typeset preview** (PDF-like) — needs the Pandoc
  export sidecar (Phase 6), not yet built.
- **Explorer twisties are Lucide chevrons** (`Chevron{Down,Right}Icon`, size 15) — the old
  tiny `▾/▸` glyphs were too small.

## Test data — durable record

A fully-populated **test project** lives in the repo at
`Test Project/Strongest World.project`, built by `Main/Client/scripts/seed-project.mjs`
from the Strongest World material (28 chapters + characters + terms + the Jin Family group
+ banks + Ch.1 plan). **The Strongest World source files are never modified — read-only.**
Re-seed anytime with `node scripts/seed-project.mjs`.

## Chrome — VS Code-esque, one uniform color

Three framing bars, all the same chrome color, wrapping the substance areas:

- **Left activity rail — thickest.** An icon rail that switches the left panel's view.
- **Top command bar — thin, "the overwritable one."** Menu + a context command/breadcrumb
  center (e.g. `Strongest World › Manuscript › Chapter 1 — Thoughts`) + right-side actions
  (theme picker). Its contents change with context. **Update button appears here only when
  an update is actually available** — otherwise absent.
- **Bottom status strip — thinnest.** **Same color as the left rail/chrome** (a differently
  colored status bar was distracting — no accent fill). Shows autosave state, POV,
  page/chapter position, word counts (this-doc + project total), active markup mode,
  version. **No "Offline" indicator** (offline is the norm; don't clutter).

## Left activity-rail views

Explorer is first; the rest are proposals to confirm:

1. **Explorer** — the project tree (Manuscript, Story Bible, Data Banks). *Not a raw
   filesystem* — see "Project model" below.
2. **Search** — across manuscript + bible.
3. **Cast** — browse characters/entities (the story bible's people).
4. **Timeline & Plot** — arcs, chapter plans, future plotting.
5. **Data Banks** — the CSV collections (cities, names, ranks…).
6. **AI add-ons** — downloadable local models (see
   [AI Integration Research](./AI%20Integration%20Research.md)).
7. **Preferences** (pinned bottom).

## Default workspace layout (the split-container)

Center = the **editor** (current chapter, tabbed, book-serif prose). To its right, a
**dock of two collapsible panes**, both fed by the entity index:

- **Top — "Cast in chapter":** characters appearing in the current + preceding chapters,
  sorted **most-recently-used**, each showing role + **introduced-in / last-seen-in chapter**
  (e.g. "intro Ch.1 · last seen Ch.40"). **Includes characters named only in the chapter's
  summary/plot but not yet written into the prose — marked inline as "- unused" (amber)** so
  the author sees who's *meant* to be here vs who actually is.
- **Bottom — "Chapter plan":** this chapter's **Summary** + **Objective** + **Topics**
  (see below). The planning surface, attached to the scene you're writing.

Both panes **collapse/expand freely**. The Chapter-plan header (`Ch.1 · Thoughts`) is a
**stepper** — `‹ ›` walk up/down chapters to **peek another chapter's plan and stats
without opening it** from the explorer.

This is a *default* — the split-container is dockable, so the author rearranges freely.
(Note: custom controls can't live in the split-container's own tab strip — the package
owns it — so per-editor controls like Page/Scroll live in our chrome/menus, not the tabs.)

## Search — scoped, peelable, tiered

The top-bar search is **scoped to whatever the author last clicked** (a chapter, a summary,
a bible entry). Behavior:

- Scope shows as a **plain breadcrumb** (`Strongest World › Manuscript › Chapter 1`) — no
  pills, no × buttons, no separate backgrounds. Single line, clips gracefully.
- With the cursor in an empty search box, **Backspace removes the last scope level**,
  **Ctrl+Backspace clears back to the project root**. The **project root is locked** — it's
  the project itself and can never be peeled away.
- Typing shows a results dropdown, **tiered**: **direct matches first**, then matches across
  **creative content** (a name or phrase found in chapters + bible entries), then matching
  **settings/preferences**.

## Arcs

The explorer groups chapters into **arcs** ("Arc I — The Auction", chapters 1–7). A chapter
belongs to an arc; unsorted chapters list loosely. Arcs are an organizing layer over the
manuscript, defined in the project model (not by folders).

**Implemented (2026-07-21):** arc membership is a **chapter frontmatter field** (`arc: "Name"`)
— resilient (survives a lost manifest), no manifest schema change. `ProjectContext.ArcBands()`
groups the chapter order into **contiguous bands** (arc === null → a run of unsorted chapters)
and derives each band's number range. The **explorer** renders collapsible arc nodes (Lucide
chevron + range tag) with chapters nested beneath; unsorted chapters sit directly under
Manuscript. The **timeline** renders the same bands as sticky arc headers. A chapter is assigned
an arc via an **Arc field in the chapter-plan dock** (with a datalist autocomplete of existing
arc names). The seed script tags the sample with "The Auction / The Jin Family / Lost History".

## Timelines & plotlines are editable documents

The author keeps a giant per-chapter plotline (today: `PlotLineTracker.txt`). In the app:

- A **Timeline & Plot** rail view for browsing/opening plotlines.
- **Series timeline** and **per-arc / per-chapter plotlines** are **first-class editable
  documents that open as full center tabs**, just like chapters, and are listed in the
  explorer under "Plot & Timelines."

## Editor: Page view vs Scroll view

Taking a page from Google Docs. Two rendering modes, toggled in **View** (and a segmented
control on the editor):

- **Page view (default):** the manuscript is laid out on a **"page"** with real **margins**,
  and **new pages break automatically** for long text — you see how the text sets on the
  page, page numbers, page count. Margins/page can be shown or hidden.
- **Scroll view:** the normal infinite-scroll writing column (no sheet, no page breaks).

The page size/margins are configurable (a View/Preferences setting). Autosave and all
other behavior are identical across modes — it's purely presentation.

## Autosave

**All changes save automatically ~5 seconds after the author stops typing.** No manual
save step in normal use. The status bar reflects state ("All changes saved" / "Saving…").
Pairs with the resilient project model (self-describing files) so an interrupted save never
orphans work.

## Entities: capture, edit, and backlinks (story wiki)

The author writes *in depth* about characters, power systems, locations — and wants those
notes cross-referenced. So the story bible behaves like a **wiki with backlinks**:

- **Capture from prose:** highlight text → right-click → **Save as character** (or location /
  term). Creates the entity and opens it for editing on the **left panel**.
- **Arbitrary, categorized notes:** each entity is free-form with **user-defined sections**
  ("Overview", "Cultivation", "Relationships", "+ Add section") — write whatever, however.
- **Cross-references:** naming an entity inside another entity's notes (or in the prose)
  links them. E.g. writing "kills Qin Peizhi" in one character's description creates a link.
- **Mentions / backlinks:** every entity shows **where it is mentioned** — across chapters
  *and* inside other entities' notes — with counts and snippets. Answers "where does this
  character appear?" This is powered by the entity index.
- **Resolved tokens are faint:** generator/resolved names (e.g. from `/city`) render **as
  close to normal prose as possible** — a faint off-white/transparent marker, never a loud
  colored box. The goal is readable text, with resolution available on click.

## Chapter planning is first-class

A distinct workflow the author values: **pre-plot a chapter before writing it** and lay out
**future plots on a timeline**. Not a buried feature — it has its own rail view (Timeline &
Plot) and lives in the default dock. A chapter plan holds:

- **Summary** and **Objective** (free text).
- **Topics** (renamed from "beats") — the ordered points the chapter must hit, with an
  **＋ Add topic** button. Each topic can be **marked to a location in the chapter** (an
  anchor/pin), so "the reveal" links to where it actually lands in the prose. A topic shows
  placed (pinned) vs unplaced.

## Data banks + the generator language (the signature)

The most distinctive feature, and the app's signature:

- **Data banks** = editable/downloadable **CSV** collections — cities, surnames, given
  names, cultivation ranks, "whatever it may be." **Dynamically extensible** (add entries,
  add whole new banks).
- **A generator language** in the editor: tokens like `/city` or `/random surname` **resolve
  against a bank inline** — pick, reroll, or add the result to the bank on the spot. The
  author previously built exactly this ("/random cities → resolves to a random city").
- Implemented as a **marking pack** = a pluggable CodeMirror language extension (see
  [Formats and Standards Research](./Formats%20and%20Standards%20Research.md) §2). Banks +
  generator tokens are how naming/worldbuilding stops being manual.

## Import (wizard, not a one-shot)

Importing existing chapters is a **review step**, never an immediate dump:

- **Choose sources** — select **specific `.txt` files** *or* add a whole folder (and mix/add
  more). Remove any from the list.
- **Preview & click through** — a file list on the left, a scrollable **chapter preview** on
  the right; click any file to read it before importing.
- **Assign numbering** — **Auto** (use the number detected in each file), **Number from N**
  (assign a contiguous region across the list), or **Manual** (set each chapter's number).
- **Confirm** — pick the target project folder; only then are files written. Source stays
  read-only.

## Project model — resilient, not a raw filesystem

**Firm principle from the author.** The "filesystem" in the Explorer is a **project model**,
not a folder view:

- A **project root / manifest** *describes* the directory, labeling, and order.
- But files and their states are **deliberately named and self-identifying**, so state is
  **resilient**: a stateless directory listing works, 1,000 chapters list without issue,
  and a **missing or corrupt manifest never orphans a chapter.**
- So the manifest is a **descriptor/optimization layered on top of self-describing files**,
  never the sole source of truth. **Apply this everywhere** — name files and states so they
  survive without the manifest. (This sharpens the storage design: identity lives in the
  files; the manifest adds order/labels/metadata on top.)

## Open UI questions

- The exact set + order of activity-rail views (confirm the 7 above).
- Is there a dedicated distraction-free **Focus mode**, and what it hides.
- How the generator popover behaves (accept/reroll/add-to-bank keybindings).
- Whether "Chapter plan" and the manuscript are one doc with regions, or linked docs.
- Light-vs-dark default on first launch.
