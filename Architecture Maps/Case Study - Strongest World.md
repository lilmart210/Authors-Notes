# Case Study — "Strongest World"

A study of the author's real, existing novel project, used to derive concrete
feature requirements for Authors Notes. **The source files are read-only and must
never be modified** — this doc is a study of them, not a copy.

The novel is long-form web-serial fiction (xianxia / cultivation), ~65,000 words
across ~26 chapters, plus a substantial "story bible."

## Where the material lives (two parallel copies)

1. **`C:\Users\mrmar\Strongest World`** — a **novelWriter** project
   (`nwProject.nwx` XML index + `content/*.nwd` docs + `meta/*.json`). Currently a
   near-empty skeleton (20 stub chapters) — the author set it up but kept writing
   elsewhere. Useful as a *format reference*, not as the live manuscript.
2. **`C:\Users\mrmar\Desktop\story board\Strongest World`** — the **actual working
   folder**: the real manuscript plus all worldbuilding/planning notes. Edited in
   **VS Code** (`.vscode/`, `babel.json`), with DIY word-count scripts
   (`count.js`, `total.js`).

## How the manuscript is actually written

- **Plain `.txt`, one file per chapter** in `final Revised Chapters/` (~64.9k words,
  29 files).
- **Blank-line-separated paragraphs**, standard `"…"` dialogue, no markup.
- A loose per-file header convention: `Chapter : 1` then `Chapter Title : Thoughts`.
- **Messy, human filenames**: `Chapter 5.txt` vs `chapter 5.txt`,
  `Chapter Beginning.txt`, `Chapter unknown.txt`, a stray `chapters.zip`, gaps in
  numbering. → *Order and identity must not depend on filename.*
- **Multiple draft generations** of the same chapters exist side by side:
  `original chapters/`, `reviewed chapters/`, `final Revised Chapters/`.
  → *The app needs document drafts/versions, not just one file per chapter.*

## The "story bible" (this is half the project)

Loose `.txt` files, each an ad-hoc format:

| File | Purpose | Implied feature |
| ---- | ------- | --------------- |
| `character list.txt` | `name - description. ch 22` | Character wiki w/ **first-appearance chapter refs** |
| `terminology.txt` | worldbuilding glossary entries | Encyclopedia / glossary note type |
| `Power System.txt`, `Power System Higher Level.txt` | cultivation tiers/rules | Structured "system" reference |
| `PlotLine.txt`, `PlotLineTracker.txt` | plot + tracking | Outline / plot-thread tracker |
| `lore/` | background lore | Free notes, categorized |
| `Summary.txt`, `final Summary.txt`, `Future Plot.txt`, `scrapped.txt` | synopses, cut material | Synopsis + trash/archive |
| `Example Dialogues.txt`, `random dialogues/` | voice/dialogue drafts | Scratch snippets |
| `places.txt`, `Abilities.txt`, `mc power.txt` | entities | Locations / abilities catalogs |
| `chat knowledge.txt` | AI-context dump | (author already feeds notes to an assistant) |

Names recur constantly across chapters (Qin Peizhi, ShouShan, Lei clan, Cloud
Sect…) and appear in **inconsistent spellings** (ShouShan / Shoushan). The prose
also has frequent typos (apreciated, gaurds, nuetral, aniversary).

## The author's stated "ideal editor" (`ideal editor.txt`)

Verbatim intent:
- A **`.project` folder** with a **`project.json`** config that "sets up stuff and
  connections."
- **Downloadable language / marking packs of code** (pluggable syntax modes).
- **Files generated on each save** that parse the edited file — e.g.
  `chapter 1.characters.txt` listing characters in that chapter — mirroring the
  project's file structure inside `.project/files/` "for quick parsing."
- Basically: a **generated index/cache** that extracts entities (characters, names)
  from prose automatically.

## Derived feature list for Authors Notes

**Core**
- Project = a folder (a `.project`/manifest + a tree of documents). Order/identity
  tracked in the manifest, independent of filenames.
- Multi-document organizer with categories: **Manuscript** (chapters/scenes),
  **Characters**, **Locations**, **Terminology/Lore**, **Plot**, **Archive/Trash**
  (mirrors novelWriter's ROOT classes and the author's own folders).
- Plain-text/Markdown-ish prose in CodeMirror; blank-line paragraphs; scene breaks.
- **Document drafts/versions** (original → reviewed → final).
- **Status + importance labels** per doc (New/Draft/Finished; Minor/Major/Main) —
  exactly novelWriter's model, which the author already opted into.

**Story bible & cross-referencing**
- Structured note types for characters/terms/locations with fields
  (e.g. first-appearance chapter, tier, aliases).
- **Entity auto-indexing**: on save, parse each chapter for known character/location/
  term mentions; maintain a generated index (the author's explicit `.project/files`
  idea). Powers "where does X appear," first-appearance detection, and a per-chapter
  cast list.
- **Marking packs** = pluggable CodeMirror language extensions that add
  highlighting/parsing for entity tags, scene markers, etc.

**Consistency & counts**
- Word count per document / chapter / project / writing session (replaces the DIY
  `count.js`). novelWriter already tracks char/word/para counts per doc.
- Spell check (lots of typos) and, higher-value, a **name/terminology consistency
  checker** (flag ShouShan vs Shoushan) driven by the glossary.

**Import / export**
- **Import the existing plain-text chapters** (folder of `.txt`, tolerant of the
  messy names) as the first real dataset — the migration test.
- Export to shareable/submission formats (see the export research).

## Open questions this raises

- How much structure to impose on the prose vs keep it near-plain-text.
- Whether the story bible entries are Markdown docs with YAML frontmatter, or a
  structured DB — see the storage-format research.
- How entity parsing is defined (glossary-driven exact match vs NLP) and how marking
  packs declare what to extract.
