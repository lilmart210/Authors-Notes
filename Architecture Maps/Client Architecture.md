# Client Architecture

The desktop writing app. Lives in `Main/Client/`.

## Stack

- **SolidJS** (plain JavaScript, not TypeScript) + **Vite** — UI and dev/build.
- **Tauri 2** — bundles the web app as a native Windows desktop app. Rust host in
  `src-tauri/`.
- **CodeMirror 6** — the text editing surface (`@codemirror/state`, `view`,
  `commands`, `language`).
- **`@curruptnation/split-container`** — the custom dockable tab/pane workspace
  (drag-to-split panes, tabs, persistence). Published to the private Verdaccio
  registry `packages.curruptnation.com`.

## Layout

```
Main/Client/
  index.html                     title: "Authors Notes"
  vite.config.js                 solid plugin; port 1420 strictPort;
                                   split-container excluded from optimizeDeps
  package.json                   dev / build / preview / tauri scripts
  src/
    index.jsx                    render(App)
    index.css                    :root design tokens (--an-*) + global reset
    App.jsx                      renders <Workspace/>
    components/
      Workspace.jsx  + .css      SplitContainer host; registers the "Editor"
                                   tab renderer; toolbar with "New document"
      Editor.jsx     + .css      CodeMirror EditorView wrapper (prose theme)
  src-tauri/
    tauri.conf.json              window 1280x832; devUrl http://localhost:1420;
                                   identifier com.curruptnation.authorsnotes
    src/                         Rust entrypoint (lib.rs / main.rs)
    Cargo.toml, capabilities/, icons/
```

## Key wiring notes

- **The split-container ships raw `.jsx` Solid source** (`main: src/index.jsx`).
  It must be transpiled by `vite-plugin-solid`, so it is listed in
  `optimizeDeps.exclude` in `vite.config.js` to keep esbuild from pre-bundling it.
- **Documents are tabs.** Each manuscript is a tab in the SplitContainer; the tab's
  user-data carries `content` (text) and `Unsaved` (dirty flag), so switching tabs
  preserves text. The `"Editor"` renderer's `Button` shows the name + unsaved dot;
  its `Panel` mounts a CodeMirror `Editor`.
- **Editor is a thin CM wrapper.** `Editor.jsx` builds one `EditorState` on mount
  (history, line wrapping, prose theme) and reports edits via an `onChange` prop.
- **Theming** flows from `--an-*` CSS variables in `index.css` into both the app
  shell and the split-container's own `--splitcontainer-*` variables.

## Registry

The private scope is configured in the user `~/.npmrc`:
`@curruptnation:registry=https://packages.curruptnation.com/` (with auth token).
`npm install` resolves `@curruptnation/*` from there automatically.

## Current source structure (implemented)

```
Main/Client/src/
  project/
    format.js        pure on-disk format (manifest, frontmatter incl. arrays; chapter filename <slug>__<id>.md +
                     chapterLabel/FILE_DELIM/parseGeneratedFileName; generator-token grammar; import parsing)
    fsTauri.js       Tauri fs adapter (atomic writes w/ unique temp names, copyFile)
    service.js       open/create/import projects; load/save chapters, entities, banks; deleteChapter;
                     writeExport/exportWithPandoc/renderMarkdownToHtml; entity media (addEntityMedia/entityMediaUrl); index loaders
    components.js    optional programs downloaded on first use (Pandoc, AI engine) + every download's progress
    mentions.js      pure mention index (word-bounded, alias-aware) + buildMentionMatcher + surfaceForms (linter)
    bookExport.js    pure profile-based export (web-serial/markdown/plain + pandoc docx/epub/html); strips %comments + markers
    docSync.js       shared Y.Doc registry (ref-counted, debounced persist, flushAll) + local awareness channel
    ProjectContext.jsx  the store: project, docs, entities, banks, mentions index, autosave; split-container tab
                        plumbing (preview/permanent/duplicate/smart); shared-chapter-doc acquire/release;
                        arcs, chapter CRUD (decimal #s), search, recents, export/preview
  components/
    Shell.jsx        the whole chrome: titlebar, rail, collapsible sidebar, split-container center, context-aware
                     inspector dock, status; tab renderers (DocTabButton/DocPanel per-tab); ChapterView (Yjs);
                     File/View/Export menus; New-Chapter/Export/Recent/Arc/Delete-confirm modals; chapter right-click menu
    Editor.jsx       CodeMirror prose surface — page sheet vs scroll; binds a Y.Doc (+awareness) when given one
    yjsBinding.js    local CM↔Y.Text binding + remote caret/selection rendering (no network)
    marking.js       marking pack: entity underlines, %comments, ***→✳ dinkus, resolved-token boxes + resolve popover, selection toolbar
    EntityPage / GroupPage / BankPage / TimelineView   the doc-type panels (open as tabs)
    CastBrowser / BanksBrowser                         left-rail views (SearchPanel.jsx is now unused — rail Search removed)
    ImportWizard.jsx the import review flow (per-chapter number+title, duplicate detection)
    icons.jsx        the Lucide icon set;  avatar.js  deterministic entity avatars
  index.css          the design system (ported from Architecture Maps/UI Artifacts) + all component classes
  ai/
    catalog.js       the model list (Hugging Face GGUF files with sizes + SHA-256), tags, jobs
    aiStore.js       app-wide AI state: models folder, downloaded models, Use for, requests to a running model
    prose.js         pure text helpers (autocomplete suggestion tidying)
  components/AiModelsDialog.jsx  Tools → AI models;  components/ghostText.js  autocomplete (faded text, Tab accepts)
  scripts/           headless verifiers (unit tests + e2e-*-test.mjs over scripts/e2e-harness.mjs), seed-project.mjs
  src-tauri/src/     Rust host: fs+dialog+shell plugins, assetProtocol for media, and
    download.rs      resumable downloads, progress events, SHA-256 check
    models.rs        settings.json (app config dir) + the models folder: list / download / remove GGUF files
    components.rs    pinned Pandoc + llama.cpp engine: download, unpack to app local data, run Pandoc
    llm.rs           one llama-server per model on a free localhost port; requests stream back over a Channel
```

Storage on disk (a project): `project.json` + `chapters/<slug>__<id>.md` (frontmatter) +
`bible/*.md` (entities & groups) + `banks/*.csv`.

**Chapter filename scheme (revised 2026-07-24):** `<slug>__<id6>.md` — a title slug + the
deliberate `__` delimiter + 6 chars of the frontmatter id (`format.chapterFileName(title, id)`,
`FILE_DELIM`, `parseGeneratedFileName`). Deliberately: **the number is NOT in the filename** —
it lives in frontmatter (`number`, decimals allowed). Consequences: no digit-padding cap
(chapter 10000+ is fine), and **renumber/retitle never renames the file** (frontmatter edit
only) — which removes a whole class of rename races (the `.tmp` crash). Filenames are a
human hint; identity is always the frontmatter `id`; order is the manifest. Old
`NNNN-slug.md` files still load fine (filename is non-authoritative). Display label:
`format.chapterLabel(number, title)` → "Chapter 3.5 · Ghost Town".

## Export and Pandoc (downloaded on first use)

- **Web serial and Markdown** are pure JS (`src/project/bookExport.js`) and always work.
- **EPUB, Word and Print PDF** run Pandoc. Pandoc is **not bundled** (it was a 231 MB
  sidecar): `src-tauri/src/components.rs` pins its release zip (version, URL, size,
  SHA-256); the first export downloads it, checks the hash, and unpacks `pandoc.exe` into
  `<app local data>/components/pandoc/<version>/`. `service.runPandoc` calls
  `ensureComponent('pandoc')` then the `pandoc_run` command.
- The URLs point at GitHub releases until the author's server can host them; changing
  them in `components.rs` is the only step. No binary is needed to build the app.

## Local AI

- **Engine:** llama.cpp's `llama-server`, a pinned Windows Vulkan build (runs on NVIDIA,
  AMD and Intel GPUs, falls back to the CPU), downloaded with the first model like Pandoc.
- **Models folder:** one app-wide setting (`settings.json` in the app config dir), default
  `<app local data>/models`, can point at a NAS share. Every `.gguf` there (one level of
  subfolders too) is listed, including files copied in by hand.
- **Servers:** `llm_start(model, ctx)` starts one `llama-server` per model on a free
  localhost port with `--load-mode none` (reads the model into memory, safe over a network
  share) and `--fit on`; a second caller while it loads waits for it; all are stopped on
  app exit. Logs go to the app log dir (`llama-server-<port>.log`).
- **Requests** go through Rust (`llm_request`), never straight from the page, and stream
  back over a Tauri Channel; `llm_cancel` drops the connection, which stops generation.
- **Autocomplete** (`components/ghostText.js`): after a 650 ms pause at the end of a line,
  the last ~2,500 characters go to the autocomplete model's `/completion`; the reply is
  trimmed to one sentence (`ai/prose.js`) and shown faded at the cursor. Tab accepts,
  Esc / typing / moving drops it.

## Documents, tabs & live editing (current, 2026-07)

**Tabs are per-document, rendered by the split-container.** `Shell.DocPanel` is the
registered `Panel` renderer and runs **once per tab** (`useTab()` gives that tab's
`dkind`/`docId`/`file`), so panes are independent. Chapters render `<ChapterView>`
(keyed on `Tab.docId`); entity/group/bank/timeline still render from the single active
`CurrentDoc` (a known limitation — mixed-type splits aren't fully independent yet).

**Preview (italic) tabs — VS Code model.** One `previewTabId` slot in `ProjectContext`.
`openTabFor(descriptor, options)`: single-click opens a **preview** (italic) and reuses
the slot; it's **promoted to permanent** on edit, on drag (`tab.reorder/move/transfer`),
or on double-click. Double-click is "smart" (`{smart:true}`): promote an existing preview,
else open a permanent tab (opens it if closed, or a **second view** if already permanent).
`{duplicate:true}` forces a second view. Create flows open permanent (`{preview:false}`).

**Live editing is Yjs, local-only (offline, no server).** Author's decision: always route
chapter prose through Yjs — even solo. Pieces:
- `project/docSync.js` — a ref-counted registry: one `Y.Doc` per **file key** (chapter file),
  seeded from disk, **debounced-persisted** back to the `.md` (4s), flushed + disposed on last
  release. `acquireDoc(key, initialText, persist)` → `{ ydoc, awareness }`; `releaseDoc`,
  `docString`, `flushDoc`, `flushAll`. Also a tiny local **awareness** channel per doc
  (`makeAwareness()`: `Map<viewId → {anchor,head,color}>` + subscribe) — rolled our own
  because standard Y awareness keys by `doc.clientID`, which two views of one `Y.Doc` share.
- `components/yjsBinding.js` — local CM↔`Y.Text('document')` binding (per-binding `Symbol`
  origin so each view ignores its own delta; `Y.UndoManager` for undo). Publishes the view's
  selection (Y relative positions + per-view id + color) to awareness and renders peers'
  `.cm-remote-cursor` + `.cm-remote-selection`. No network, no remote-server awareness.
- `components/Editor.jsx` takes a `ydoc` (+ `awareness`) prop → binds via `createYjsBinding`
  (drops `history()` when Yjs owns undo); `onEdit` replaces `onChange`.
- `ChapterView` (in Shell) acquires the shared doc on mount, releases on cleanup, passes
  `ydoc`+`awareness` to `<Editor>`. Two views of one chapter acquire the same `Y.Doc` → sync.
- `ProjectContext`: `acquireChapterDoc(file,docId)` wires the persist (write `.md` + update
  `ChapterBodies.body` + `CurrentDoc.body` if active + `rebuildIndex`); `loadDocIntoCurrent`
  and `flushSave` read the **live** `docString(file)` so a meta save never clobbers unsaved
  prose; Export/RenderPreview call `docSync.flushAll()` first.
- **Trade-offs:** word count / cast-in-chapter update on the ~4s persist (not per keystroke);
  non-chapter docs aren't per-tab yet. All Yjs/CM/split-container behavior is runtime-only —
  build-verified, not GUI-tested by the assistant.

**Versioning:** NOT built. The author's `userland-file-explorer` (S1 project) offers versioning
as **server adapter hooks** (`onListVersions`/`onRevert`/`onDiff`) — server-side, over the wire.
Authors Notes is offline/no-server, so it doesn't inherit that; a local history (snapshots or
Yjs snapshots) would be a separate build. Deferred by the author.

## Right dock (inspector) model

`Shell` dock, when a chapter is displayed: a **non-collapsible chapter header** at top
(`.dock-chapterhead` = the `‹ [picker] › [open]` nav row + Chapter#/Title + Arc — it drives
both panes below and shows a **lock** when pinned), then collapsible **Cast in chapter**, then
collapsible **Chapter plan** (Summary/Objective/Timeline/Topics). The dock plans the *displayed*
chapter: `DockPinnedId` pins one (stepper/picker set it, lock clears it); default follows the
open chapter. Editing any chapter goes through `UpdateChapterMeta(id,…)` (edits a chapter even
when it isn't the open document; per-id debounced save). Pane headers toggle on click. When the
active doc is an entity/group (and no chapter pinned): the dock shows Mentions / Members.

## Known follow-ups (shell stage)

- Switching away from and back to a tab currently re-mounts the CodeMirror view,
  which resets cursor/undo history. Fine for the shell; revisit when persistence
  and file I/O land.
- No file save/load yet — documents are in-memory only. Pending the
  manuscript-format decision (see the formats/standards research).
