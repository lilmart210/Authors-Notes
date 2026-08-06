// Pure, dependency-free logic for the on-disk project format.
//
// NO filesystem or Tauri access lives here — this module is plain data
// transforms, so it runs and tests in bare Node as well as in the app.
//
// Design principle (from Architecture Maps/UI Design.md): files are
// self-describing. Every document carries its identity + metadata in YAML
// frontmatter, so a missing or corrupt manifest can never orphan a chapter —
// the tree can be rebuilt by scanning files. The manifest is a fast index on
// top of that, not the source of truth.

export const FORMAT_VERSION = 1
export const MANIFEST_FILE = 'project.json'
export const CHAPTER_DIR = 'chapters'
export const ENTITY_DIR = 'bible'
export const BANK_DIR = 'banks'

// ---------------------------------------------------------------------------
// Generator tokens — a resolved "/bank" value that stays live
// ---------------------------------------------------------------------------
//
// A generated name is stored inline as `⟦bank:value⟧`. The editor renders it as
// the faint resolved-token box (click to reroll) and reveals the raw marker
// while editing inside it. The delimiters ⟦ ⟧ never occur in prose; the bank
// name has no `:`, and the value is everything up to the closing bracket.
// Export/plain-text consumers call stripGeneratorMarkers to get clean prose.
export const GENERATOR_TOKEN_RE = /⟦([^:⟦⟧]+):([^⟦⟧]*)⟧/g

export function generatorToken(bank, value) {
  return `⟦${bank}:${value}⟧`
}

export function stripGeneratorMarkers(text) {
  return String(text ?? '').replace(GENERATOR_TOKEN_RE, (_match, _bank, value) => value)
}

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

// Random 13-char hex handle. Identity lives here, never in the filename.
export function generateId() {
  const bytes = new Uint8Array(7)
  globalThis.crypto.getRandomValues(bytes)
  let hex = ''
  for (const byte of bytes) hex += byte.toString(16).padStart(2, '0')
  return hex.slice(0, 13)
}

// ---------------------------------------------------------------------------
// Filenames — human-readable + sortable, but NOT authoritative
// ---------------------------------------------------------------------------

export function slugify(title) {
  return String(title || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'untitled'
}

// Deliberate section delimiter for generated filenames: `<slug>__<id>.md`. Slugs
// never contain `__` (slugify collapses non-alphanumeric runs to a single `-`),
// so the sections are always unambiguously parseable.
export const FILE_DELIM = '__'

// e.g. ("Blue Mountain", "4f2a1c…") -> "blue-mountain__4f2a1c.md".
// The number is NOT in the filename — it lives in the frontmatter (so a chapter
// can be renumbered/retitled without ever renaming the file, and there's no
// digit-padding limit). The slug is a human hint; the id suffix guarantees
// uniqueness. Identity is the frontmatter id, never the filename.
export function chapterFileName(title, id) {
  const suffix = String(id || generateId()).slice(0, 6)
  return `${slugify(title || 'chapter')}${FILE_DELIM}${suffix}.md`
}

// Split a generated filename back into its sections: "slug__id.md" -> { slug, id }.
export function parseGeneratedFileName(fileName) {
  const base = String(fileName || '').replace(/\.[^.]+$/, '')
  const at = base.lastIndexOf(FILE_DELIM)
  if (at === -1) return { slug: base, id: null }
  return { slug: base.slice(0, at), id: base.slice(at + FILE_DELIM.length) }
}

// The display label for a chapter: "Chapter 3 · Ghost Town" (middle dot), or just
// "Chapter 3" when untitled, or the title alone when there's no number.
export function chapterLabel(number, title) {
  const text = String(title || '').trim()
  if (number == null || number === '') return text || 'Untitled'
  return text ? `Chapter ${number} · ${text}` : `Chapter ${number}`
}

// Entity files live flat in bible/, named by slug; identity is the frontmatter id.
export function entityFileName(name) {
  return `${slugify(name)}.md`
}

// Banks are plain CSV lists in banks/, named by slug.
export function bankFileName(name) {
  return `${slugify(name)}.csv`
}

// Bank entries <-> raw CSV text (one entry per line; blank lines dropped).
export function bankEntries(rawText) {
  return String(rawText ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

// ---------------------------------------------------------------------------
// Frontmatter documents (a controlled subset of YAML — we only ever emit
// scalar key: value pairs, so a minimal parser is correct and dependency-free)
// ---------------------------------------------------------------------------

const FRONTMATTER_KEY_ORDER = ['id', 'title', 'name', 'type', 'number', 'aliases', 'status', 'arc']

function stringifyScalar(value) {
  if (Array.isArray(value) || (value && typeof value === 'object')) return JSON.stringify(value)
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  const text = String(value)
  // Quote when it could be misread (leading/trailing space, special chars).
  return /^[\w .,'!?()–—-]+$/.test(text) && text.trim() === text
    ? text
    : JSON.stringify(text)
}

function parseScalar(raw) {
  const text = raw.trim()
  if (text === '') return ''
  if (text === 'true') return true
  if (text === 'false') return false
  if (/^-?\d+(\.\d+)?$/.test(text)) return Number(text)
  if (text.startsWith('[') || text.startsWith('{')) {
    try { return JSON.parse(text) } catch { return text }
  }
  if (text.startsWith('"')) {
    try { return JSON.parse(text) } catch { return text.replace(/^"|"$/g, '') }
  }
  return text
}

export function stringifyDocument(meta, body) {
  const keys = [
    ...FRONTMATTER_KEY_ORDER.filter((key) => meta[key] !== undefined && meta[key] !== null),
    ...Object.keys(meta).filter(
      (key) => !FRONTMATTER_KEY_ORDER.includes(key) && meta[key] !== undefined && meta[key] !== null,
    ),
  ]
  const lines = keys.map((key) => `${key}: ${stringifyScalar(meta[key])}`)
  return `---\n${lines.join('\n')}\n---\n\n${body ?? ''}`
}

export function parseDocument(text) {
  const source = String(text ?? '')
  const match = source.match(/^﻿?---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  if (!match) return { meta: {}, body: source }

  const meta = {}
  for (const line of match[1].split(/\r?\n/)) {
    const at = line.indexOf(':')
    if (at === -1) continue
    const key = line.slice(0, at).trim()
    if (key) meta[key] = parseScalar(line.slice(at + 1))
  }
  const body = source.slice(match[0].length).replace(/^\r?\n/, '')
  return { meta, body }
}

// ---------------------------------------------------------------------------
// Importing the author's existing plain-text chapters
//
// Source files look like:
//   "Chapter : 1\n\nChapter Title : Thoughts\n\n<prose…>"
// but are messy: some have no header, odd filenames ("Chapter Beginning.txt",
// "Chapter unknown.txt", "chapter 5.txt"), gaps and duplicate numbers. Be
// tolerant: recover what we can, never throw.
// ---------------------------------------------------------------------------

export function parseSourceChapter(fileName, rawText) {
  const text = String(rawText ?? '').replace(/^﻿/, '')

  // Two header styles seen in the wild:
  //   A) "Chapter : 1"  +  "Chapter Title : Thoughts"   (number and title on separate lines)
  //   B) "Chapter 2 : Forced"  /  "Chapter 21 - Senses" (number and title on one line;
  //      the author uses a colon OR a dash/en-dash/em-dash as the separator)
  const combined = text.match(/^\s*chapter\s+(\d+)\s*[:–—-]\s*(.+?)\s*$/im) // style B
  const numberColon = text.match(/^\s*chapter\s*:\s*(\d+)/im) // style A number
  const titleLine = text.match(/^\s*chapter\s+title\s*:\s*(.+?)\s*$/im) // style A title

  const base = String(fileName || '').replace(/\.[^.]+$/, '')
  const numberInName = base.match(/chapter\s*(\d+)/i)
  const nameRemainder = base.replace(/chapter\s*\d*/i, '').replace(/^[\s:_-]+/, '').trim()

  let number = null
  if (combined) number = Number(combined[1])
  else if (numberColon) number = Number(numberColon[1])
  else if (numberInName) number = Number(numberInName[1])

  let title = ''
  if (titleLine) title = titleLine[1].trim() // explicit "Chapter Title:" wins
  else if (combined) title = combined[2].trim() // inline title from style B
  else if (nameRemainder) title = nameRemainder
  else if (number == null) title = base || 'Untitled'
  // A numbered chapter with no real title stays '' — chapterLabel renders just
  // "Chapter 21" (never the doubled "Chapter 21 · Chapter 21").

  // Strip the recognised header lines from the top of the body.
  const body = stripSourceHeader(text)

  return { number, title, body, sourceName: fileName }
}

function stripSourceHeader(text) {
  const lines = text.split(/\r?\n/)
  let cut = 0
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (line === '') { cut = i + 1; continue }
    if (/^chapter\s*:?\s*\d+/i.test(line) || /^chapter\s+title\s*:/i.test(line)) {
      cut = i + 1
      continue
    }
    break
  }
  return lines.slice(cut).join('\n').replace(/^\s+/, '')
}

// ---------------------------------------------------------------------------
// Manifest — the fast index (tree/order/arcs). Rebuildable from documents.
// ---------------------------------------------------------------------------

export function createManifest({ name, author, timestamp } = {}) {
  const stamp = timestamp || new Date().toISOString()
  return {
    formatVersion: FORMAT_VERSION,
    id: generateId(),
    name: name || 'Untitled Project',
    author: author || '',
    created: stamp,
    modified: stamp,
    tree: [{ id: generateId(), kind: 'group', name: 'Manuscript', children: [] }],
  }
}

export function serializeManifest(manifest) {
  return JSON.stringify(manifest, null, 2)
}

export function parseManifest(json) {
  const manifest = typeof json === 'string' ? JSON.parse(json) : json
  if (!manifest || typeof manifest !== 'object') throw new Error('Invalid manifest')
  if (!Array.isArray(manifest.tree)) manifest.tree = []
  return manifest
}

// Resilience: recover chapter order from document frontmatter alone (used when
// the manifest is missing/corrupt). Sorts by `number`, then by filename.
export function rebuildOrderFromDocs(docs) {
  return [...docs].sort((a, b) => {
    const an = a.meta?.number ?? Number.POSITIVE_INFINITY
    const bn = b.meta?.number ?? Number.POSITIVE_INFINITY
    if (an !== bn) return an - bn
    return String(a.fileName).localeCompare(String(b.fileName))
  })
}
