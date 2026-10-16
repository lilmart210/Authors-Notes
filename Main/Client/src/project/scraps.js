// Pure logic for scraps — text cut from a chapter and kept beside where it was.
//
// A scrap lives in its chapter's frontmatter (`scraps: [...]`):
//   { id, text, from, to, rewrite, sealed, date }
// `from` is the anchor (where the text was cut); `from..to` is whatever now
// stands in its place. A Rewrite scrap stays open — text typed at the anchor
// grows `to` — until an edit happens elsewhere, which seals it. A plain Scrap is
// sealed from the start. Positions are character offsets into the chapter body.

export function newScrap(text, at, { rewrite = false, id, date } = {}) {
  return {
    id: id || Math.random().toString(16).slice(2, 10),
    text: String(text || '').trim(),
    from: at,
    to: at,
    rewrite: Boolean(rewrite),
    sealed: !rewrite,
    date: date || new Date().toISOString(),
  }
}

// Move a scrap through one edit (the CodeMirror change mapping does the
// position maths; `mapPos(pos, assoc)` is ChangeSet.mapPos). `touched` is the
// list of changed ranges [fromA, toA] in the old document.
export function mapScrap(scrap, mapPos, touched) {
  const open = scrap.rewrite && !scrap.sealed
  // Typing at an open scrap's anchor or end belongs to it; otherwise new text
  // at the anchor goes before it.
  const from = mapPos(scrap.from, open ? -1 : 1)
  const to = Math.max(from, mapPos(scrap.to, open ? 1 : -1))
  const editedElsewhere = touched.some(([a, b]) => b < scrap.from || a > scrap.to)
  const sealed = scrap.sealed || (open && editedElsewhere)
  if (from === scrap.from && to === scrap.to && sealed === scrap.sealed) return scrap
  return { ...scrap, from, to, sealed }
}

// The story around a scrap as it reads now — cut at paragraph breaks and whole
// words — so a margin card reads like the passage it came from.
export function scrapContext(doc, scrap, reach = 80) {
  const text = String(doc || '')
  const from = Math.min(scrap.from, text.length), to = Math.min(Math.max(scrap.to, from), text.length)
  let before = text.slice(Math.max(0, from - reach), from)
  let after = text.slice(to, to + reach)
  const lastBreak = before.lastIndexOf('\n')
  if (lastBreak >= 0) before = before.slice(lastBreak + 1)
  else if (from > reach) before = '…' + before.replace(/^\S*\s/, '')
  const firstBreak = after.indexOf('\n')
  if (firstBreak >= 0) after = after.slice(0, firstBreak)
  else if (to + reach < text.length) after = after.replace(/\s\S*$/, '') + '…'
  return { before, now: text.slice(from, to), after }
}

// Only the fields worth saving (and nothing else that might ride along).
export const serializeScraps = (scraps) => scraps.map(({ id, text, from, to, rewrite, sealed, date }) => ({ id, text, from, to, rewrite, sealed, date }))
