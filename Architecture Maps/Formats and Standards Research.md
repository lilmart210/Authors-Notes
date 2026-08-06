# Formats & Standards Research

Research into the file formats and industry standards relevant to Authors Notes,
tied to the real workflow in [Case Study — Strongest World](./Case%20Study%20-%20Strongest%20World.md).
Covers four areas the author asked about: (1) on-disk storage format, (2) in-editor
prose markup, (3) submission/industry standards, (4) export/interchange.

> **Note:** These are recommendations to decide on, not decisions already made. The
> open questions at the end need the author's call before we commit.

### Decisions made (2026-07)

- **Markup:** **Full prose layer** — CommonMark + `*italics*`/`***` scene breaks + YAML
  frontmatter + `@char:`/`[[wikilink]]` tags + `%` comments. (Author caveat: writes in a
  plain, direct style — "don't take *prose* too literally." The markup layer is about
  structure/features, and applies regardless of writing style.)
- **Export engine:** **Pandoc, bundled as a Tauri sidecar** (industry standard, high
  fidelity, free DOCX import). Not the pure-JS route. Fully offline — see the
  self-contained principle in Development Guidelines.
- Storage/index internals default as recommended (manifest-driven order; JSON index now,
  SQLite later; atomic saves). Remaining open questions still stand.

**Export MVP built (2026-07-21):** the native, no-tool path — `src/project/bookExport.js`
(`buildExport(chapters, {profile, includeChapterHeadings})`, pure/testable). Three
**profiles**: web-serial (.txt, plain title, `* * *`), markdown (.md, `# Chapter N — Title`,
`***`), plain manuscript (.txt). Strips `%` comment/`%~` synopsis lines and resolves generator
markers (`⟦bank:value⟧`→value) so nothing editorial reaches a reader. Writes into
`<project>/exports/` (fs-scope-safe, no save dialog / no new capability). UI: **File → Export…**
modal (format · scope book/chapter · include-headings). **Still to do (needs Rust sidecar +
runtime):** Pandoc DOCX/EPUB/HTML profiles and the rendered/typeset preview.

---

## TL;DR — the recommendation

The four areas point to one coherent design:

- **Store** the project as a **folder of Markdown files + a `project.json` manifest +
  a regenerable index/cache**. This is novelWriter's proven architecture and matches
  the author's own `ideal editor.txt` vision (`.project` folder, config, per-save
  generated index). Human-readable filenames, atomic saves.
- **Write** in **CommonMark plus a thin prose layer** (YAML frontmatter, `***` scene
  breaks, `%` comments) with an **`@tag` / `[[wikilink]]` annotation namespace** for
  characters/locations/terms. This is a superset of how the author already writes
  (blank-line paragraphs *are* Markdown).
- **"Marking packs"** (the author's term) = **pluggable CodeMirror 6 language
  extensions** built on `@codemirror/lang-markdown` — simple ones via
  `StreamLanguage`, rich ones via a Lezer grammar.
- **Export** via **Pandoc bundled as a Tauri sidecar** (DOCX / EPUB / HTML, and DOCX
  *import* for free), with **profile-based** output because standard-manuscript and
  web-serial formatting are near-opposites. PDF deferred.

Rich-text JSON document models (ProseMirror / Lexical / TipTap) are **rejected** — their
canonical form is a JSON tree, which fights a CodeMirror text buffer and diffs badly.

---

## 1. On-disk storage format

**Constraint that drives everything:** CodeMirror edits a *text buffer*. Any format
whose canonical form is a structured tree (rich-text JSON) fights the editor. So the
source of truth must be text.

**Options weighed:**

| Option | Verdict |
| ------ | ------- |
| Plain `.txt`, folder-of-files | Right substrate, insufficient structure (no metadata, no cross-refs, no markup vocabulary). What the author does today. |
| **Markdown / CommonMark** | **The natural fit** — superset of current habit; YAML frontmatter for metadata; lingua franca of writer tooling; clean git diffs + CodeMirror round-trip. |
| **novelWriter** (`.nwx` XML index + `.nwd` files + regenerable `meta/*.json`) | **Closest existing model** — steal the architecture (folder + config + rebuildable index, atomic saves), but keep human-readable filenames instead of opaque hex handles. |
| Scrivener `.scriv` (RTF-in-a-bundle) | Informative, not adoptable — RTF is opaque, diffs poorly, proprietary. |
| Manuskript / Obsidian-for-writers | Proof the folder-of-Markdown pattern works in the wild. |
| ProseMirror / Lexical / TipTap JSON | **Reject** — architecturally incompatible with a text editor. |
| SQLite | **Ideal for the index/cache**, wrong for the source of truth (binary, opaque to git, single-file corruption blast radius). |

**Recommended layout:**

```
Strongest World.project/          ← the project (author's own ".project" term)
  project.json                    ← title, author, chapter order, settings,
                                     referenced marking/language packs
  chapters/
    0001-thoughts.md              ← order-prefixed, human-readable; one chapter/file
    0002-....md
  bible/
    characters/qin-peizhi.md
    terminology/spirit-stone.md
    plot/main-arc.md
  .cache/                         ← generated, git-ignored, disposable
    index.json                    ← per-chapter parsed entities, tags, word counts
```

- **One Markdown file per chapter**, blank-line paragraphs preserved, YAML frontmatter
  for per-chapter metadata.
- **Order/identity in `project.json`**, not the filename — the case study's messy names
  (`chapter 5.txt`, `Chapter unknown.txt`, gaps) prove filenames can't be authoritative.
- **`.cache/` is rebuildable** from the Markdown (JSON now; SQLite later if we need
  relational queries like "every chapter mentioning X"). Git-ignored.
- **Atomic saves** (temp file → rename), matching novelWriter's crash-safety.

Sources: [novelWriter storage](https://novelwriter.io/docs/technical/storage.html) ·
[Manuskript plain-text format](https://www.theologeek.ch/manuskript/2016/03/31/open-plain-text-file-format/) ·
[Scrivener format](http://justsolve.archiveteam.org/wiki/Scrivener) ·
[SQLite as a file format](https://sqlite.org/appfileformat.html) ·
[Why SQLite doesn't use git](https://sqlite.org/whynotgit.html) ·
[ProseMirror vs Tiptap data formats](https://oboe.com/learn/prosemirror-vs-tiptap-data-formats-1h4uc5n/comparative-analysis-of-data-formats-1h3mta9) ·
[Git + Markdown to write a novel](https://dev.to/raphink/git-markdown-to-write-a-novel-ag6)

---

## 2. In-editor prose markup

**Base:** CommonMark, constrained to what prose needs:
- `*italics*` for thoughts/emphasis (make it a one-keystroke toggle — the most-used mark),
  `**bold**` sparingly.
- `#` = Part/Book, `##` = Chapter, `###` = Scene — novelWriter's exact 4-level scheme.
- **Scene breaks:** author `***` on its own line, **render it as a centered dinkus**
  in preview/export (typographic convention; a bare blank line can vanish across page
  breaks).
- `>` block quotes for epigraphs / in-world documents.

**Per-document metadata:** leading `--- … ---` **YAML frontmatter** (`title`, `pov`,
`status` draft/revised/final, `wordgoal`, `tags`, `location`). De-facto standard across
Obsidian/Zettlr/Pandoc/Jekyll; drives dashboards without polluting prose.

**Story annotations (the "@" namespace)** — where a fiction editor earns its keep:
- novelWriter-style reference lines under a heading: `@pov:`, `@char:`, `@location:`,
  `@plot:` → clickable cross-refs + a mention index + per-scene "who/where".
- `%` line comments for private editorial notes/TODOs (stripped on export); `%~` for a
  scene synopsis.
- `[^id]` footnotes (MultiMarkdown/Markua) for annotated editions / author's notes.
- `[[Character]]` wikilinks as an alternative to `@char` for link-thinkers.
- CriticMarkup (`{++add++}`, `{--del--}`, `{>>comment<<}`) for tracked revisions — an
  *optional pack*, not core.

**Fountain (screenplay):** mostly **not relevant** to prose. Borrow only non-printing
notes `[[note]]`, boneyard `/* */`, and structural-only `#` sections. Offer full
Fountain as a separate pack for anyone writing scripts.

**Marking packs → CodeMirror 6:** a pack is a module exporting a `LanguageSupport`.
Two tiers: simple packs use `StreamLanguage.define()` (line tokenizer — easy for
`@tags`/`%comments`/dinkus); rich packs use a Lezer grammar (`.grammar` →
`lezer-generator` → `LRLanguage`) with `styleTags`. Build the base on
`@codemirror/lang-markdown`, whose parser supports **mixed/overlay extensions**, so a
pack injects new inline nodes without forking the grammar. Colors via a decoupled
`HighlightStyle`.

**Example chapter file** (`chapters/0002-the-harbor.md`):
```markdown
---
title: "The Harbor"
pov: Jane
status: draft
wordgoal: 2500
tags: [act1, betrayal]
---

## The Harbor
@pov: Jane
@location: Harbor
@char: John

%~ Jane confronts John; he lies about the ledger.

Jane pulled her coat tight. *He wouldn't dare*, she
thought, watching [[John]] cross the pier.

"You changed the numbers," she said.

% TODO: land this beat harder — feels rushed

***

The office was colder than the street.
```

Sources: [novelWriter tags & references](https://novelwriter.io/docs/usage/tags_and_references.html) ·
[novelWriter formatting](https://novelwriter.io/docs/usage/basic_formatting.html) ·
[CommonMark](https://commonmark.org/) · [Markua](https://markua.com/) ·
[MultiMarkdown](https://fletcher.github.io/MultiMarkdown-6/syntax.html) ·
[CriticMarkup](http://criticmarkup.com/) · [Fountain](https://fountain.io/syntax/) ·
[CodeMirror lang-package](https://codemirror.net/examples/lang-package/) ·
[Lezer guide](https://lezer.codemirror.net/docs/guide/) ·
[@codemirror/lang-markdown](https://github.com/codemirror/lang-markdown)

---

## 3. Submission / industry standards

"Standard manuscript format" (SMF) — the **William Shunn** de-facto reference — exists
to be uniform and length-estimable, *not* to look like a book. The only hard rule is
"follow the specific target's guidelines"; SMF is the safe default otherwise.

**Core rules:** 1" margins; **12pt Times New Roman** (modern default) or Courier
(Shunn "Classic"); **double-spaced**; left-aligned ragged-right (not justified); **0.5"
first-line indent via a paragraph style** (never tabs); running header
`Surname / TITLE / page#`; scene breaks as centered `#` or `* * *`; each **chapter starts
on a fresh page**, heading dropped ~⅓ down; center **"The End"**.

**Short story vs novel:** short story = no title page (contact block on page 1), round
word count to nearest 100; novel = separate title page, numbering from page 2, round to
nearest 1,000.

**Modern (2020s):** `.docx` is near-universal (`Lastname_Title.docx`); TNR has overtaken
Courier; word count shown rounded ("About 92,000 words"); agencies specify their own
quirks — **so export must be adjustable, not rigid**.

**Web-serial / self-pub is the OPPOSITE of SMF** (and it's what the author actually does):
Royal Road / mobile reading wants **no first-line indent, blank-line paragraph
separation**, simple font, chapters ~1,500–5,000 words. Kindle/EPUB is reflowable — never
hand-format indentation; the stylesheet owns it.

**→ Export should be profile-based**, not one "compile" button:
- **Web-serial/Royal Road** profile (blank-line paras, no indent) — the author's primary need.
- **Standard Manuscript Format** DOCX (Shunn defaults, all settings exposed) — for future
  agent/editor submission.
- **Clean EPUB/Kindle** profile (stylesheet owns layout).

Configurable with SMF defaults: font (TNR↔Courier), scene-break glyph, word-count rounding
(100/1,000/5,000/exact), header fields, title-page mode, "The End" toggle.

Sources: [Shunn — Novel](https://www.shunn.net/format/novel/) ·
[Shunn — Short Story](https://www.shunn.net/format/story/) ·
[Shunn — Classic](https://www.shunn.net/format/classic/) ·
[Nathan Bransford](https://nathanbransford.com/blog/2020/10/how-to-format-a-manuscript) ·
[Reedsy](https://reedsy.com/studio/resources/book-manuscript-format) ·
[Kindlepreneur](https://kindlepreneur.com/manuscript-format/) ·
[Writer's Digest — word count placement](https://www.writersdigest.com/getting-published/where-should-you-list-your-manuscripts-word-count-2) ·
[Royal Road — formatting](https://www.royalroad.com/forums/thread/136345)

---

## 4. Export / interchange

Six targets: DOCX (Word), DOCX (Shunn SMF), EPUB, PDF, HTML, Markdown/txt.

**Pandoc is the workhorse:** Markdown → DOCX / EPUB / HTML at high fidelity, one
toolchain, and it reads DOCX too (solves *import* of existing manuscripts).
- **DOCX styling** via `--reference-doc` (a DOCX whose styles are applied) — ship two
  reference docs (normal Word + Shunn).
- **EPUB**: cover image, Dublin Core metadata, embedded fonts, custom CSS.
- **PDF is the catch**: Pandoc's default PDF path needs LaTeX (multi-GB) or another
  external engine (Typst/WeasyPrint/wkhtmltopdf). **Defer PDF.**
- **Licensing**: GPL; bundling the unmodified binary as a sidecar and calling via CLI is
  mere aggregation (doesn't infect your code) — ship the license text.
- **Size**: ~150–230 MB on disk per platform (~30–40 MB compressed). Roughly triples
  installer size but is self-contained.

**Bundle it as a Tauri sidecar** via `bundle.externalBin` + `app.shell().sidecar()` + a
shell permission in `capabilities/default.json`. Well-trodden path.

**Pure-JS fallback** (if installer size hurts): [`docx`](https://www.npmjs.com/package/docx)
(precise programmatic DOCX — great for exact Shunn styling), `epub-gen` / `epub-gen-memory`,
`markdown-it` (HTML), `pdfmake`/jsPDF (PDF without a big binary). **Pure-Rust:** `docx-rs`,
`epub-builder`, `printpdf`/`genpdf`.

**Recommended pipeline & phasing:**
- **MVP:** Markdown/txt = native concatenation (no tool); Pandoc sidecar for DOCX,
  Shunn DOCX, EPUB, HTML; DOCX import via the same sidecar.
- **Later:** PDF (Typst sidecar for quality, or `pdfmake` for a lean install), EPUB
  cover/metadata UI, custom reference-doc themes, KDP presets.
- **If size unacceptable:** swap Pandoc for pure-JS `docx` + `epub-gen` + `markdown-it`.

Sources: [Tauri sidecar](https://v2.tauri.app/develop/sidecar/) ·
[Pandoc manual](https://pandoc.org/MANUAL.html) · [Pandoc install/size](https://pandoc.org/installing.html) ·
[docx (npm)](https://www.npmjs.com/package/docx) · [epub-gen](https://www.npmjs.com/package/epub-gen) ·
[markdown-it](https://github.com/markdown-it/markdown-it) · [pdfmake](http://pdfmake.org/) ·
[docx-rs](https://crates.io/crates/docx-rs) · [epub-builder](https://crates.io/crates/epub-builder) ·
[EPUB 3 anatomy](https://www.edrlab.org/open-standards/anatomy-of-an-epub-3-file/) ·
[EPUB 3.3 spec](https://www.w3.org/TR/epub-33/)

---

## Open questions (need the author's decision)

1. **Markup strictness** — strict CommonMark, or the small superset (`@tags`, `%comments`,
   `[[wikilinks]]`)? How much lives in frontmatter vs inline?
2. **Chapter ordering** — numeric filename prefixes vs an explicit `order` array in
   `project.json` (single source of truth, but renames need care)?
3. **Index technology** — per-chapter JSON vs one SQLite cache (depends on how relational
   the entity queries get)?
4. **Inline markup at all** — does the author want `*italics*`/scene markers, or stay
   nearly paragraph-only for now?
5. **Backups/snapshots** — rely on the author's git, or build automatic per-save snapshots
   into the `.project` folder (Scrivener-style)?
6. **Export engine** — accept the Pandoc sidecar's installer bloat for fidelity + free
   import, or go pure-JS to keep the app lean?
7. **Entity parsing** — glossary-driven exact match vs NLP; how do marking packs declare
   what to extract?
