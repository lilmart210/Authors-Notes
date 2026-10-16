// Project service — open, create, import, load, and save projects on disk.
//
// Framework-agnostic async functions over the fs adapter + the pure format
// module. The Solid store wraps these; nothing here touches UI.

import { Command } from '@tauri-apps/plugin-shell'
import { convertFileSrc } from '@tauri-apps/api/core'
import * as format from './format.js'
import * as fs from './fsTauri.js'
import * as cardTree from './cardTree.js'
import * as book from './book.js'
import * as drafts from './drafts.js'

// Adapter that lets the pure card-tree walker use the Tauri fs.
const fsAdapter = { join: fs.joinPath, listDir: fs.listDir, readText: fs.readText, exists: fs.pathExists }

const { joinPath } = fs
const { MEDIA_DIR } = format

function chapterPath(projectDir, file) {
  return joinPath(projectDir, format.CHAPTER_DIR, file)
}

function manifestPath(projectDir) {
  return joinPath(projectDir, format.MANIFEST_FILE)
}

// Create a brand-new empty project folder.
export async function createProject(projectDir, { name, author } = {}) {
  await fs.ensureDir(joinPath(projectDir, format.CHAPTER_DIR))
  const manifest = format.createManifest({ name, author })
  await fs.writeTextAtomic(manifestPath(projectDir), format.serializeManifest(manifest))
  return { dir: projectDir, manifest }
}

// Open an existing project. If the manifest is missing/corrupt, rebuild it from
// the self-describing chapter files (resilience — a lost manifest never loses work).
export async function openProject(projectDir) {
  const path = manifestPath(projectDir)
  if (await fs.pathExists(path)) {
    try {
      return { dir: projectDir, manifest: format.parseManifest(await fs.readText(path)) }
    } catch {
      /* fall through to rebuild */
    }
  }
  return { dir: projectDir, manifest: await rebuildManifest(projectDir) }
}

async function rebuildManifest(projectDir) {
  const dir = joinPath(projectDir, format.CHAPTER_DIR)
  const docs = []
  if (await fs.pathExists(dir)) {
    for (const entry of await fs.listDir(dir)) {
      if (entry.isDirectory || !entry.name.endsWith('.md')) continue
      const { meta } = format.parseDocument(await fs.readText(joinPath(dir, entry.name)))
      docs.push({ fileName: entry.name, meta })
    }
  }
  const ordered = format.rebuildOrderFromDocs(docs)
  const name = projectDir.split('/').pop().replace(/\.project$/i, '')
  const manifest = format.createManifest({ name })
  manifest.tree[0].children = ordered.map((doc) => ({
    id: doc.meta.id || format.generateId(),
    kind: 'chapter',
    file: doc.fileName,
    title: doc.meta.title || doc.fileName,
  }))
  return manifest
}

export async function loadDocument(projectDir, file) {
  return format.parseDocument(await fs.readText(chapterPath(projectDir, file)))
}

export async function saveDocument(projectDir, file, meta, body) {
  await fs.writeTextAtomic(chapterPath(projectDir, file), format.stringifyDocument(meta, body))
}

export async function deleteChapter(projectDir, file) {
  await fs.removePath(chapterPath(projectDir, file))
}

// Read every chapter's body (for building the mention index).
export async function loadChaptersForIndex(projectDir, manifest) {
  const group = manifest.tree.find((node) => node.kind === 'group')
  const chapters = []
  for (const child of group?.children ?? []) {
    const { meta, body } = format.parseDocument(await fs.readText(chapterPath(projectDir, child.file)))
    chapters.push({ id: child.id, file: child.file, number: meta.number ?? null, title: meta.title ?? child.title, body, meta })
  }
  return chapters
}

// --- Pages: self-describing card trees (World = bible/, plot/, notes/, front-matter/, back-matter/) ---
// Every card carries `root` (which folder tree it belongs to) and `file`, its path
// relative to that root (possibly nested). Containers are folders with `_index.md`.
function cardRootDir(projectDir, root) {
  return joinPath(projectDir, root)
}
function cardFilePath(projectDir, root, file) {
  return joinPath(projectDir, root, file)
}
// A container card's folder (relative to its root); null for a leaf.
const containerFolder = (card) => (card.isContainer ? card.file.slice(0, card.file.lastIndexOf('/')) : null)
const parentDirOf = (file) => (file.includes('/') ? file.slice(0, file.lastIndexOf('/')) : '')

async function loadCards(projectDir, root) {
  const rootDir = cardRootDir(projectDir, root)
  if (!(await fs.pathExists(rootDir))) return []
  const tree = await cardTree.loadCardTree(fsAdapter, rootDir)
  const prefix = `${rootDir}/`
  const flat = []
  const walk = (cards, parentId) => {
    for (const card of cards) {
      const path = card.isContainer ? joinPath(card.path, cardTree.INDEX_FILE) : card.path
      const file = path.startsWith(prefix) ? path.slice(prefix.length) : path
      const childIds = (card.children || []).map((c) => c.meta?.id).filter(Boolean)
      flat.push({ root, file, meta: card.meta, body: card.body, isContainer: card.isContainer, parentId, childIds })
      if (card.children?.length) walk(card.children, card.meta?.id ?? null)
    }
  }
  walk(tree, null)
  return flat
}

// Every page in every tree, flattened. Each entry: { root, file, meta, body, isContainer, parentId, childIds }.
export async function loadEntities(projectDir) {
  const all = []
  for (const root of format.CARD_ROOTS) all.push(...(await loadCards(projectDir, root)))
  return all
}

export async function saveCard(projectDir, root, file, meta, body) {
  const path = cardFilePath(projectDir, root, file)
  const slash = path.lastIndexOf('/')
  if (slash > 0) await fs.ensureDir(path.slice(0, slash)) // nested sub-pages
  await fs.writeTextAtomic(path, format.stringifyDocument(meta, body))
}

// Turn a leaf card (`x.md`) into a container (`x__id/_index.md`) so it can hold
// children — the one structural move. Returns the card's new file (relative to root).
async function ensureContainer(projectDir, card) {
  if (card.isContainer) return card.file
  const rootDir = cardRootDir(projectDir, card.root)
  const folderRel = joinPath(parentDirOf(card.file), cardTree.cardFolderName(card.meta.name, card.meta.id))
  await fs.ensureDir(joinPath(rootDir, folderRel))
  const content = await fs.readText(joinPath(rootDir, card.file))
  await fs.writeTextAtomic(joinPath(rootDir, folderRel, cardTree.INDEX_FILE), content)
  await fs.removePath(joinPath(rootDir, card.file))
  return joinPath(folderRel, cardTree.INDEX_FILE)
}

// Create a page at the top of a tree (parent = null) or inside a parent page.
// Returns { file } relative to `root`.
export async function createCard(projectDir, root, parent, meta, body = '') {
  let dirRel = ''
  if (parent) {
    const parentFile = await ensureContainer(projectDir, parent)
    dirRel = parentDirOf(parentFile)
  }
  await fs.ensureDir(joinPath(cardRootDir(projectDir, root), dirRel))
  const file = joinPath(dirRel, cardTree.cardLeafName(meta.name, meta.id))
  await saveCard(projectDir, root, file, meta, body)
  return { file }
}

// Kept for existing callers: a sub-page inside `parent`, in the parent's own tree.
export async function createSubCard(projectDir, parent, childMeta, childBody) {
  return createCard(projectDir, parent.root || format.WORLD_DIR, parent, childMeta, childBody)
}

// Delete a page; a container goes with everything inside it.
export async function deleteCard(projectDir, card) {
  const rootDir = cardRootDir(projectDir, card.root)
  await fs.removePath(card.isContainer ? joinPath(rootDir, containerFolder(card)) : joinPath(rootDir, card.file))
}

// Move a page (and its children) into another parent or to the top of a tree —
// possibly a different tree (e.g. a scrap in Notes moved into Plot).
export async function moveCard(projectDir, card, targetRoot, targetParent) {
  let targetDirRel = ''
  if (targetParent) targetDirRel = parentDirOf(await ensureContainer(projectDir, targetParent))
  const fromRootDir = cardRootDir(projectDir, card.root)
  const toRootDir = cardRootDir(projectDir, targetRoot)
  const sourceRel = card.isContainer ? containerFolder(card) : card.file
  const baseName = sourceRel.split('/').pop()
  const destRel = joinPath(targetDirRel, baseName)
  if (card.root === targetRoot && sourceRel === destRel) return
  await fs.ensureDir(joinPath(toRootDir, targetDirRel))
  await fs.renamePath(joinPath(fromRootDir, sourceRel), joinPath(toRootDir, destRel))
}

// --- Book pages (book/*.md) ---
export async function loadBook(projectDir, projectName) {
  const pages = {}
  for (const page of book.BOOK_PAGES) {
    const path = joinPath(projectDir, book.BOOK_DIR, book.bookPageFile(page))
    const parsed = (await fs.pathExists(path)) ? format.parseDocument(await fs.readText(path)) : { meta: {}, body: '' }
    pages[page] = { meta: book.withBookDefaults(page, parsed.meta, projectName), body: parsed.body }
  }
  return pages
}

export async function saveBookPage(projectDir, page, meta, body) {
  await fs.ensureDir(joinPath(projectDir, book.BOOK_DIR))
  await fs.writeTextAtomic(joinPath(projectDir, book.BOOK_DIR, book.bookPageFile(page)), format.stringifyDocument(meta, body))
}

// Copy a picked image in as the book cover. Returns its path relative to the project.
export async function setBookCover(projectDir, sourcePath) {
  const dir = joinPath(projectDir, MEDIA_DIR, 'book')
  await fs.ensureDir(dir)
  const base = sourcePath.split(/[\\/]/).pop() || 'cover'
  const stored = `cover-${format.generateId().slice(0, 6)}-${base}`
  await fs.copyBinary(sourcePath, joinPath(dir, stored))
  return joinPath(MEDIA_DIR, 'book', stored)
}

// A webview-loadable URL for any file inside the project (Tauri asset protocol).
export function projectFileUrl(projectDir, relativePath) {
  return convertFileSrc(joinPath(projectDir, relativePath))
}

// --- Drafts (.drafts/<owner>/NNN.md next to the document) ---
export const chapterDraftDir = (file) => joinPath(format.CHAPTER_DIR, drafts.DRAFTS_DIR, file.replace(/\.md$/i, ''))
export const bookDraftDir = (page) => joinPath(book.BOOK_DIR, drafts.DRAFTS_DIR, page)

// All published drafts of a document, oldest first: [{ n, date, note, text }].
export async function loadDrafts(projectDir, draftDir) {
  const dir = joinPath(projectDir, draftDir)
  if (!(await fs.pathExists(dir))) return []
  const list = []
  for (const entry of await fs.listDir(dir)) {
    const n = entry.isDirectory ? null : drafts.draftNumberFromFile(entry.name)
    if (n == null) continue
    const { meta, body } = format.parseDocument(await fs.readText(joinPath(dir, entry.name)))
    list.push({ n, date: meta.date || '', note: meta.note || '', text: body })
  }
  return list.sort((a, b) => a.n - b.n)
}

export async function writeDraft(projectDir, draftDir, { n, date, note = '', text }) {
  const dir = joinPath(projectDir, draftDir)
  await fs.ensureDir(dir)
  await fs.writeTextAtomic(joinPath(dir, drafts.draftFileName(n)), format.stringifyDocument({ n, date, note }, text))
}

// --- Arc pages (arcs/<slug>.md) ---
export async function loadArcs(projectDir) {
  const dir = joinPath(projectDir, format.ARC_DIR)
  if (!(await fs.pathExists(dir))) return []
  const arcs = []
  for (const entry of await fs.listDir(dir)) {
    if (entry.isDirectory || !entry.name.toLowerCase().endsWith('.md')) continue
    const { meta, body } = format.parseDocument(await fs.readText(joinPath(dir, entry.name)))
    if (meta.name) arcs.push({ file: entry.name, meta, body })
  }
  return arcs
}

export async function saveArc(projectDir, file, meta, body) {
  await fs.ensureDir(joinPath(projectDir, format.ARC_DIR))
  await fs.writeTextAtomic(joinPath(projectDir, format.ARC_DIR, file), format.stringifyDocument(meta, body))
}

export async function deleteArcFile(projectDir, file) {
  await fs.removePath(joinPath(projectDir, format.ARC_DIR, file))
}

// --- Data banks (banks/*.csv) ---
function bankPath(projectDir, file) {
  return joinPath(projectDir, format.BANK_DIR, file)
}

export async function loadBanks(projectDir) {
  const dir = joinPath(projectDir, format.BANK_DIR)
  const banks = []
  if (await fs.pathExists(dir)) {
    for (const entry of await fs.listDir(dir)) {
      if (entry.isDirectory || !entry.name.toLowerCase().endsWith('.csv')) continue
      const raw = await fs.readText(bankPath(projectDir, entry.name))
      banks.push({ file: entry.name, name: entry.name.replace(/\.csv$/i, ''), entries: format.bankEntries(raw) })
    }
  }
  return banks
}

export async function saveBankRaw(projectDir, file, rawText) {
  await fs.ensureDir(joinPath(projectDir, format.BANK_DIR))
  await fs.writeTextAtomic(bankPath(projectDir, file), rawText)
}

export async function createBank(projectDir, name) {
  const file = format.bankFileName(name)
  await saveBankRaw(projectDir, file, '')
  return { file, name: file.replace(/\.csv$/i, ''), entries: [] }
}

export async function importBankFromFile(projectDir, sourcePath) {
  const sourceName = sourcePath.split(/[\\/]/).pop().replace(/\.[^.]+$/, '')
  const raw = await fs.readText(sourcePath)
  const file = format.bankFileName(sourceName)
  await saveBankRaw(projectDir, file, raw)
  return { file, name: file.replace(/\.csv$/i, ''), entries: format.bankEntries(raw) }
}

// Write an exported manuscript into the project's own exports/ folder (stays in
// the fs scope — no save dialog, no extra capability). Returns the relative path.
export async function exportBook(projectDir, filename, content) {
  await fs.ensureDir(joinPath(projectDir, 'exports'))
  await fs.writeTextAtomic(joinPath(projectDir, 'exports', filename), content)
  return joinPath('exports', filename)
}

// Convert the markdown build to a rich format via the bundled Pandoc sidecar.
// Writes both the markdown source and the output into exports/. Requires the
// pandoc binary at src-tauri/binaries/pandoc-<target-triple>.
export async function exportViaPandoc(projectDir, markdown, stem, outName, pandocTo) {
  const dir = joinPath(projectDir, 'exports')
  await fs.ensureDir(dir)
  const inputPath = joinPath(dir, `${stem}.md`)
  const outputPath = joinPath(dir, outName)
  await fs.writeTextAtomic(inputPath, markdown)

  const command = Command.sidecar('binaries/pandoc', ['-f', 'markdown', '-t', pandocTo, '-o', outputPath, inputPath])
  const result = await command.execute()
  if (result.code !== 0) throw new Error(`pandoc exited ${result.code}: ${result.stderr || 'unknown error'}`)
  return joinPath('exports', outName)
}

// Render markdown to an HTML fragment via Pandoc (stdout) for the in-app
// typeset preview. Same sidecar, no output file.
export async function renderMarkdownToHtml(projectDir, markdown) {
  const dir = joinPath(projectDir, 'exports')
  await fs.ensureDir(dir)
  const inputPath = joinPath(dir, '.preview.md')
  await fs.writeTextAtomic(inputPath, markdown)
  const command = Command.sidecar('binaries/pandoc', ['-f', 'markdown', '-t', 'html', inputPath])
  const result = await command.execute()
  if (result.code !== 0) throw new Error(`pandoc exited ${result.code}: ${result.stderr || 'unknown error'}`)
  return result.stdout
}

// --- Entity media (media/<entityId>/*) ---
// Copy a picked image into the entity's media folder. Returns { file, name } —
// `file` is the collision-safe stored name, `name` the original for display.
export async function addEntityMedia(projectDir, entityId, sourcePath) {
  const dir = joinPath(projectDir, MEDIA_DIR, entityId)
  await fs.ensureDir(dir)
  const base = sourcePath.split(/[\\/]/).pop() || 'image'
  const stored = `${format.generateId().slice(0, 6)}-${base}`
  await fs.copyBinary(sourcePath, joinPath(dir, stored))
  return { file: stored, name: base }
}

export async function removeEntityMedia(projectDir, entityId, file) {
  await fs.removePath(joinPath(projectDir, MEDIA_DIR, entityId, file))
}

// A webview-loadable URL for a stored media file (Tauri asset protocol).
export function entityMediaUrl(projectDir, entityId, file) {
  return convertFileSrc(joinPath(projectDir, MEDIA_DIR, entityId, file))
}

export async function saveManifest(projectDir, manifest) {
  const stamped = { ...manifest, modified: new Date().toISOString() }
  await fs.writeTextAtomic(manifestPath(projectDir), format.serializeManifest(stamped))
}

// --- Import (READ-ONLY on the source) ---------------------------------------

// List the .txt files inside a folder (full paths).
export async function listTextFiles(dir) {
  const paths = []
  for (const entry of await fs.listDir(dir)) {
    if (!entry.isDirectory && entry.name.toLowerCase().endsWith('.txt')) {
      paths.push(joinPath(dir, entry.name))
    }
  }
  return paths
}

// Read one source file and parse its detected number/title/body for preview.
export async function readSourceFile(path) {
  const name = path.split(/[\\/]/).pop()
  const raw = await fs.readText(path)
  return { path, name, ...format.parseSourceChapter(name, raw) }
}

// Write a project from an explicit, ordered, number-assigned chapter list.
export async function writeImportedProject(projectDir, chapters, { name, author } = {}) {
  await fs.ensureDir(joinPath(projectDir, format.CHAPTER_DIR))
  const manifest = format.createManifest({ name, author })
  const group = manifest.tree[0]

  for (let i = 0; i < chapters.length; i++) {
    const chapter = chapters[i]
    const id = format.generateId()
    const number = chapter.number ?? null
    const file = format.chapterFileName(chapter.title, id)
    const meta = { id, title: chapter.title, type: 'chapter', number, status: 'imported' }
    await saveDocument(projectDir, file, meta, chapter.body)
    group.children.push({ id, kind: 'chapter', file, title: chapter.title })
  }

  await fs.writeTextAtomic(manifestPath(projectDir), format.serializeManifest(manifest))
  return { dir: projectDir, manifest }
}

// Import the author's existing plain-text chapters from a source folder
// (READ-ONLY on the source) into a project folder. (Kept for programmatic use.)
export async function importPlainTextChapters(sourceDir, projectDir, { name, author } = {}) {
  const parsed = []
  for (const entry of await fs.listDir(sourceDir)) {
    if (entry.isDirectory || !entry.name.toLowerCase().endsWith('.txt')) continue
    const raw = await fs.readText(joinPath(sourceDir, entry.name))
    parsed.push(format.parseSourceChapter(entry.name, raw))
  }

  const ordered = [...parsed].sort((a, b) => {
    const an = a.number ?? Number.POSITIVE_INFINITY
    const bn = b.number ?? Number.POSITIVE_INFINITY
    return an !== bn ? an - bn : String(a.sourceName).localeCompare(String(b.sourceName))
  })

  await fs.ensureDir(joinPath(projectDir, format.CHAPTER_DIR))
  const manifest = format.createManifest({ name, author })
  const group = manifest.tree[0]

  for (let i = 0; i < ordered.length; i++) {
    const doc = ordered[i]
    const id = format.generateId()
    const file = format.chapterFileName(doc.title, id)
    const meta = { id, title: doc.title, type: 'chapter', number: doc.number ?? null, status: 'imported' }
    await saveDocument(projectDir, file, meta, doc.body)
    group.children.push({ id, kind: 'chapter', file, title: doc.title })
  }

  await fs.writeTextAtomic(manifestPath(projectDir), format.serializeManifest(manifest))
  return { dir: projectDir, manifest }
}
