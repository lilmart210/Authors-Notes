# Binder Redesign

The left side of the app, rebuilt around **the parts of a book**. Replaces the old
Series Timeline / Manuscript / Story Bible explorer, which the author found to be mostly
boilerplate that didn't help them lay out a book.

- **Design spec:** [`UI Artifacts/05 - Binder (proposal).html`](./UI%20Artifacts/05%20-%20Binder%20(proposal).html)
  (published: https://claude.ai/artifact/U1kiepXaujsfwCfrRJH1i4). Port its CSS/DOM, as with
  the other artifacts.
- **Grounding:** the sections follow how the author organized *Strongest World* before the
  app existed: Summary.txt with many blurb versions and title ideas, PlotLine and Future Plot,
  a one-line character list, a term glossary, scrapped.txt, random dialogues, chat
  brainstorms, and original → reviewed → final chapter folders.

> Status (2026-10-15): **direction agreed by the author** after four prototype rounds
> ("this is so much better"), and **built in the app** on branch `binder-redesign`, except
> Local AI, which waits on the runtime decision. See [Build status](#build-status).

## File menu

File menu: **Open project… · New project… · Open recent… · Import chapters… · Export…**.
Open recent opens the recent-projects modal; recents are no longer listed in the dropdown.

**Save status (fixed 2026-10-15).** The old "All changes saved" label was never updated by
chapter typing, and it could be wrong:

- It showed "saved" during the ~4 s before chapter text was written.
- A failed chapter write only went to the console.
- Switching tabs reset an error back to "saved".
- **Closing the window within those 4 s lost the last edits.**

Now every write goes through one tracker (`trackSave` in ProjectContext):

- The status bar is empty while idle. It shows **Saving…** during a write, **Saved** for
  1.5 s afterwards, and a sticky **Couldn't save · Retry** when a write fails.
- Closing the window, or switching or creating a project, writes everything first
  (`FlushEverything`). If a write fails, the window stays open, and closing again quits
  anyway. This needs the capability `core:window:allow-destroy`.
- Failed actions (open, import…) show their own message instead of a false "Save failed".

## Sidebar sections

| Section | Holds |
| --- | --- |
| **Book** | A book row (cover thumbnail, title, words vs plan) that opens the Overview. Also **Blurb**, **Synopsis** and **Publishing**. |
| **Plot** | **Outline**, the chapter-by-chapter cards by arc that used to be Series Timeline (each card shows its draft chip and dot; a chapter with no text is a dashed "planned" card), plus free pages and folders (e.g. Threads). |
| **Manuscript** | Front matter, arcs (each arc is an openable page), chapters (with word counts), back matter. |
| **World** | The story bible as folders of pages (Characters, Places, Factions, Power System, Techniques, Treasures, Creatures, Lore, Glossary…). |
| **Notes** | Ideas, Research (links), Scraps, Style guide: anything that isn't the book itself. |

Rail: Explorer; Cast, Data banks and Preferences (not redesigned yet); the AI icon opens AI
models. The old Timeline rail button is removed. It looked "always on" because it lit up
whenever the timeline tab was open.

## Everything is a page

- Every row outside the Manuscript is a **page**: title, one-line description, optional
  fields, a long-form body, and child pages. This is the "card = document container" model
  from [Entity and Mentions Model](./Entity%20and%20Mentions%20Model.md), applied everywhere.
- **A folder is a page whose children show as a table.** Folder columns (e.g. Characters:
  Role · Race · Affiliation · First seen) are inherited by sub-folders, and new entries get
  those fields. Removing a column never deletes the values on the pages.
- This **replaces collections and member rules.** A field value that names another page
  links to it (`Race: Red Demon` opens Red Demons), and that page lists everything that
  links to it under **Linked from**.
- **Quick add** under a folder table: `long yan - a disciple of the traveling cloud sect. ch 22`
  creates an entry. The name is title-cased, the rest becomes the description, and `ch 22`
  fills First seen. Pasting a multi-line list adds every line.
- **Creating never makes placeholder names.** "+" opens a name box right in the tree; Enter
  creates and opens the page, Esc cancels. Right-click offers Rename, New page/folder
  inside, Duplicate and Delete. Drag moves a page into or around folders. Delete always has an Undo.
- Right panel for a World page: **Appears in** (chapters naming it or its aliases) and
  **Linked from**.

## Book pages

- **Overview:** cover (upload or drop; a typographic cover when there's no image), title,
  subtitle, series and book number, author, title ideas (click one to make it the title),
  logline, genre and tags, and the planned length.
- **Copy buttons** on tags, logline, blurb and synopsis, for pasting into store and site forms.
- **Planned length** = arcs × chapters per arc × words per chapter. Each arc can override its
  own chapter count. The panel shows chapters and words against the plan, a per-arc
  written / planned breakdown, and a projection from the current words-per-chapter average.
- **Blurb** and **Synopsis** get the **same draft treatment as chapters**. Each is one
  document; the right panel shows Draft N, **Publish draft N**, the draft log, and
  compare/restore. In the sample, each Summary.txt version became one published draft of
  the blurb, with its old name kept as the draft's note. The earlier "named versions + in
  use" tabs were dropped. Word and character counts and a Copy button sit in the page header.
- **Publishing:** stats (published, changed since last draft, never published), a chapter
  table with a Publish button per chapter and "Publish all changes", platforms (name, link,
  notes), and language, rating, copyright line and ISBNs, which Export uses.

## Chapters: numbered drafts

- **There are no stages.** Planned / Draft / Revised / Final / Published was removed because
  it confused the author.
- Every chapter is on **Draft N**. **Publish draft N** stamps the current text with a date
  and moves the chapter to Draft N+1. Nothing is uploaded anywhere.
- The Publish button is **chip-styled** (outlined accent). It never disappears; it is only
  greyed out when nothing has changed since the last draft.
- Tree dot: empty (dashed) · never published · published · changed since last draft (amber).
- Right panel: a **draft log**, newest first, which scales to 20+ drafts. Clicking a draft
  shows what changed in it. The working draft shows the change since the last published draft.
- **Compare any two drafts:** from / to selects plus a numbered strip (click = from,
  shift-click = to). It shows a word-level diff (green added, red struck out) and can
  **restore** an old draft as the working text, with Undo.
- Real history for testing: Chapter 1's drafts 1–2 are the author's `original chapters/` and
  `reviewed chapters/` files.
- The right panel also has Number, POV, Arc, Summary, Objective, **Topics** (title, note,
  done toggle, add and remove) and **In this chapter** (World entries named in the text).

## Editing: selection menu and margin scraps

- Selecting prose shows a **floating menu: Cut · Copy · Scrap · Rewrite**. It is positioned
  over the text, so nothing in the page moves. (The first prototype's inline button shifted
  the layout, and the author flagged it.)
- **Scrap** removes the text and keeps it as a card in the **left margin**, lined up with
  where it was cut.
- **Rewrite** does the same, and whatever you type in that spot becomes the card's
  replacement text, until you start editing somewhere else.
- Cards read **in place**: a little of the story before, the struck-out scrap, the
  replacement, and a little after. **Put back** restores the text; **Dismiss** drops the
  card. Both can be undone.
- Anchors follow edits: typing before a scrap moves it, and typing inside the replacement grows it.
- Chapters always keep the margin column, so the page doesn't jump when the first scrap appears.
- **Notes › Scraps** lists every chapter's scraps in one place for review, above any loose scrap pages.

## Export

File → Export… or **Export book…** on Publishing. Choices are organized by destination:

| Format | Destination |
| --- | --- |
| EPUB | Ebook stores: KDP, Apple Books, Kobo, Google Play, Draft2Digital |
| Word (.docx) | Editors and agents (standard manuscript title page); KDP and Draft2Digital accept it |
| Print PDF | Paperback interior (KDP Print, IngramSpark); trim 5×8 / 5.5×8.5 / 6×9 |
| Web serial | One file per chapter, for pasting into sites like Royal Road |
| Markdown | Plain copy of the book |

- Options: chapters (all / published only / range); text (current or latest published
  drafts); cover, title page, copyright page, front and back matter, chapter headings.
- It checks the Book pages for title, author, cover, blurb, language and ISBN, and shows a
  preview of the first pages.
- Files go to the project's own `exports/` folder: `exports/<Title>.epub` and so on;
  web serial writes `exports/serial/001-chapter-title.txt`, one per chapter. Pandoc's input
  is kept in `exports/.build/`.
- **EPUB:** Pandoc with the book's title, subtitle, author, language, copyright line (rights),
  blurb (description), series and number, ebook ISBN and cover. Pandoc's own title page is
  switched on or off by the Title page option. The copyright page and pages named
  Dedication, Acknowledgments, Foreword… are marked as front matter for readers' tables
  of contents. Chapter headings read "Chapter 1" over the title.
- **Word:** a standard manuscript first page (author and "about 64,000 words" across the
  top, title and byline centred), then every chapter on a new page.
- **Print PDF:** Pandoc's HTML of the book, laid out at the trim size with a title page,
  copyright page and page numbers, saved as `exports/<Title> (print).html` and sent to the
  print dialog, where **Save as PDF** writes the file. No PDF engine is bundled.
- **Still open:** Word uses Pandoc's default styles (not double-spaced 12 pt Times; that needs
  a manuscript `reference.docx`), and the print dialog has only been checked headlessly, not
  in the Tauri window.

## Local AI

- **Tools → AI models…** (also the rail AI icon). **Nothing is installed by default**; the
  user downloads what fits their machine.
- **Any downloaded model can do any job.** "Use for" assigns one model to **Autocomplete** and
  one to **Assistant**. If the Assistant model can't call tools, a note says it can't add
  World entries or fill data banks.
- The catalog is built to scroll at 20+ models. It has search and filter chips (Downloaded,
  Tool calling, Runs on CPU, Long context). Each row shows name, size with a ✓ once
  downloaded, what it's good for, and **capability tags** (Tool calling, Long context,
  Instant, Runs on CPU, Needs a GPU). Download on the right becomes Remove once downloaded.
- The prototype's list is an **example** (2024-era open models, approximate 4-bit download
  sizes). The author will curate the real list.
- Runtime, recommended and **pending the author's decision:** llama.cpp `llama-server` as an
  on-demand-downloaded sidecar (same pattern as Pandoc, no Python). It runs GGUF models from
  Hugging Face stored in app data, checked by hash, over localhost OpenAI-style HTTP with
  streaming. A Python process over WebSocket was rejected as too heavy;
  transformers.js / WebGPU is a fallback for tiny models only.
- "The AI can do whatever the user can do" requires turning `ProjectContext` actions into
  **one command registry** used by both the UI and the AI, with confirm and undo.
  Autocomplete = a small model showing faded suggested text in CodeMirror; Tab accepts.

## Build status

Built on branch `binder-redesign` in this order, each step tested headlessly with the
end-to-end harness (see [Development Guidelines](./Development%20Guidelines.md#end-to-end-tests))
and committed:

| Step | State |
| --- | --- |
| Save status fix (chapter text never saving; honest status bar) | Built |
| Storage: book pages, drafts, arcs, page trees | Built |
| Sidebar by parts of a book; Book pages; chapter drafts, draft log, compare and restore | Built |
| Page views: folder tables, fields that link, quick add, Linked from | Built |
| Selection menu and margin scraps; Notes › Scrapped text | Built |
| Export dialog by destination | Built (gaps listed under Export) |
| Outline with draft states | Built |
| Seeded test project (Book, Plot, Notes, draft history) | Built — `scripts/seed-project.mjs` |
| AI: command registry → model manager and downloads → autocomplete → assistant tools | **Waiting on the author's runtime decision** |

Known limitations:

- Two open views of the same chapter keep separate scrap states.
- Old collections show their members as child pages; they aren't rewritten on disk.
- The cover is picked with a file dialog; dropping an image on it isn't supported yet.
