// Pure logic for the bible as a self-describing document TREE.
//
// A "card" is a document: frontmatter (structure) + a long-form body + children.
// On disk a LEAF card is a single `.md`; a CONTAINER card (one with children) is
// a folder holding `_index.md` (its own frontmatter + body) plus its child files
// and folders. The tree is discovered by SCANNING the filesystem — no manifest is
// required, so a lost/absent manifest never loses the bible (the resilient model).
// Child order is a per-card `order` field, not a central list.
//
// FS-agnostic: loadCardTree takes a tiny adapter so it runs under Tauri's fs in
// the app AND under node:fs in tests.

import { slugify, parseDocument, generateId } from './format.js'

export const INDEX_FILE = '_index.md'

// A leaf card's filename / a container card's folder name: `<slug>__<id6>`.
export function cardLeafName(name, id) {
  return `${slugify(name || 'card')}__${String(id || generateId()).slice(0, 6)}.md`
}
export function cardFolderName(name, id) {
  return `${slugify(name || 'card')}__${String(id || generateId()).slice(0, 6)}`
}
export const isIndexFile = (name) => name === INDEX_FILE

// Children order: a per-card `order` number (self-describing), then name, then
// path — resilient, with no central list to keep in sync.
export function sortCards(cards) {
  return [...cards].sort((a, b) => {
    const ao = a.meta?.order ?? Number.POSITIVE_INFINITY
    const bo = b.meta?.order ?? Number.POSITIVE_INFINITY
    if (ao !== bo) return ao - bo
    const an = (a.meta?.name || '').toLowerCase()
    const bn = (b.meta?.name || '').toLowerCase()
    if (an !== bn) return an.localeCompare(bn)
    return String(a.path || '').localeCompare(String(b.path || ''))
  })
}

// Recursively read a directory into a card tree.
//   fs: { join(...parts) -> string,
//         listDir(path)  -> [{ name, isDirectory }],
//         readText(path) -> string,
//         exists(path)   -> boolean }
// Returns [{ meta, body, children, isContainer, path }] sorted. Dependency-free
// apart from the injected adapter, so it's Node-testable.
export async function loadCardTree(fs, dir) {
  const out = []
  let entries
  try {
    entries = await fs.listDir(dir)
  } catch {
    return out // missing dir → empty tree, never throw
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue // hidden folders (e.g. .drafts) aren't cards
    if (entry.isDirectory) {
      const folder = fs.join(dir, entry.name)
      const indexPath = fs.join(folder, INDEX_FILE)
      let meta = {}
      let body = ''
      if (await fs.exists(indexPath)) {
        const parsed = parseDocument(await fs.readText(indexPath))
        meta = parsed.meta
        body = parsed.body
      }
      // A folder with no _index.md is still a container — recover a name so the
      // subtree isn't orphaned (resilience).
      if (!meta.name) meta = { ...meta, name: entry.name.replace(/__[0-9a-f]{1,6}$/i, '') }
      const children = await loadCardTree(fs, folder)
      out.push({ meta, body, children, isContainer: true, path: folder })
    } else if (entry.name.toLowerCase().endsWith('.md') && !isIndexFile(entry.name)) {
      const { meta, body } = parseDocument(await fs.readText(fs.join(dir, entry.name)))
      out.push({ meta, body, children: [], isContainer: false, path: fs.join(dir, entry.name) })
    }
  }
  return sortCards(out)
}

// Flatten a tree depth-first (parents before children), tagging depth + parentId.
// Handy for a flat mention index or explorer rows.
export function flattenCards(tree, parentId = null, depth = 0) {
  const rows = []
  for (const card of tree) {
    rows.push({ meta: card.meta, body: card.body, isContainer: card.isContainer, path: card.path, parentId, depth })
    if (card.children?.length) rows.push(...flattenCards(card.children, card.meta?.id ?? null, depth + 1))
  }
  return rows
}

// Find a card anywhere in the tree by id.
export function findCard(tree, id) {
  for (const card of tree) {
    if (card.meta?.id === id) return card
    const found = card.children?.length ? findCard(card.children, id) : null
    if (found) return found
  }
  return null
}

// The on-disk path for a card in a parent directory, given whether it has kids.
// (Container → its `_index.md`; leaf → its `.md`.) `join` defaults to '/'.
export function cardPath(parentDir, name, id, hasChildren, join = (...p) => p.filter(Boolean).join('/')) {
  return hasChildren
    ? join(parentDir, cardFolderName(name, id), INDEX_FILE)
    : join(parentDir, cardLeafName(name, id))
}
