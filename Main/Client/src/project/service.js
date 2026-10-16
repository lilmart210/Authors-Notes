// Project service — open, create, import, load, and save projects on disk.
//
// Framework-agnostic async functions over the fs adapter + the pure format
// module. The Solid store wraps these; nothing here touches UI.

import { Command } from '@tauri-apps/plugin-shell'
import { convertFileSrc } from '@tauri-apps/api/core'
import * as format from './format.js'
import * as fs from './fsTauri.js'
import * as cardTree from './cardTree.js'

// Adapter that lets the pure card-tree walker use the Tauri fs.
const fsAdapter = { join: fs.joinPath, listDir: fs.listDir, readText: fs.readText, exists: fs.pathExists }

const { joinPath } = fs
const MEDIA_DIR = 'media'

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

// --- Story bible entities (bible/*.md) ---
function entityPath(projectDir, file) {
  return joinPath(projectDir, format.ENTITY_DIR, file)
}

// The story bible is a self-describing document TREE (see cardTree.js). Load it
// and flatten to the list the rest of the app works on — each entry keeps its
// relative `file` path (possibly nested), plus `isContainer` / `parentId` /
// `childIds` so the explorer can rebuild the sub-page hierarchy.
export async function loadEntities(projectDir) {
  const bibleDir = joinPath(projectDir, format.ENTITY_DIR)
  if (!(await fs.pathExists(bibleDir))) return []
  const tree = await cardTree.loadCardTree(fsAdapter, bibleDir)
  const prefix = `${bibleDir}/`
  const flat = []
  const walk = (cards, parentId) => {
    for (const card of cards) {
      const file = card.path.startsWith(prefix) ? card.path.slice(prefix.length) : card.path
      const childIds = (card.children || []).map((c) => c.meta?.id).filter(Boolean)
      flat.push({ file, meta: card.meta, body: card.body, isContainer: card.isContainer, parentId, childIds })
      if (card.children?.length) walk(card.children, card.meta?.id ?? null)
    }
  }
  walk(tree, null)
  return flat
}

export async function saveEntity(projectDir, file, meta, body) {
  const path = entityPath(projectDir, file)
  const slash = path.lastIndexOf('/')
  if (slash > 0) await fs.ensureDir(path.slice(0, slash)) // nested sub-pages
  await fs.writeTextAtomic(path, format.stringifyDocument(meta, body))
}

// Create a child card inside a parent card. If the parent is currently a LEAF
// (`x.md`), it's converted to a CONTAINER (`x/_index.md`) first — the one move.
// Returns the parent's (possibly new) file and the child's file, relative to bible/.
export async function createSubCard(projectDir, parent, childMeta, childBody) {
  const bibleDir = joinPath(projectDir, format.ENTITY_DIR)
  let parentFolderRel
  if (parent.isContainer) {
    parentFolderRel = parent.file.slice(0, parent.file.lastIndexOf('/'))
  } else {
    const folderName = cardTree.cardFolderName(parent.meta.name, parent.meta.id)
    const dirRel = parent.file.includes('/') ? parent.file.slice(0, parent.file.lastIndexOf('/')) : ''
    parentFolderRel = dirRel ? joinPath(dirRel, folderName) : folderName
    await fs.ensureDir(joinPath(bibleDir, parentFolderRel))
    const content = await fs.readText(joinPath(bibleDir, parent.file))
    await fs.writeTextAtomic(joinPath(bibleDir, parentFolderRel, cardTree.INDEX_FILE), content)
    await fs.removePath(joinPath(bibleDir, parent.file))
  }
  await fs.ensureDir(joinPath(bibleDir, parentFolderRel))
  const childRel = joinPath(parentFolderRel, cardTree.cardLeafName(childMeta.name, childMeta.id))
  await fs.writeTextAtomic(joinPath(bibleDir, childRel), format.stringifyDocument(childMeta, childBody))
  return { parentFile: joinPath(parentFolderRel, cardTree.INDEX_FILE), childFile: childRel }
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
