// Pure logic for numbered drafts — no filesystem, runs in Node tests and the app.
//
// Chapters, the blurb and the synopsis each have a draft history. A document is
// always on "Draft N" (= last published draft + 1). Publishing stamps the current
// text as Draft N into a file under a `.drafts/` folder next to the document;
// nothing is uploaded anywhere.
//
// The document's own frontmatter keeps `lastDraft: { n, date, hash }`, so the
// explorer can tell "changed since the last draft" from the document alone,
// without opening the draft files (self-describing, like the rest of the format).

export const DRAFTS_DIR = '.drafts'

// FNV-1a 32-bit hash of a text, as 8 hex chars. Only used to compare a document
// with its last published draft — not for security.
export function textHash(text) {
  let hash = 0x811c9dc5
  const source = String(text ?? '')
  for (let i = 0; i < source.length; i++) {
    hash ^= source.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

// The draft a document is currently on.
export const workingDraftNumber = (meta) => (Number(meta?.lastDraft?.n) || 0) + 1

// 'empty' (nothing written, never published) | 'new' (written, never published) |
// 'pub' (identical to the last published draft) | 'changed' (edited since then).
export function draftState(meta, body) {
  const text = String(body ?? '')
  const last = meta?.lastDraft
  if (!last && !text.trim()) return 'empty'
  if (!last) return 'new'
  return textHash(text) === last.hash ? 'pub' : 'changed'
}

export const canPublish = (meta, body) => {
  const state = draftState(meta, body)
  return state === 'new' || state === 'changed'
}

// Short date for display: "Oct 15, 2026". Stored dates are ISO strings.
export function displayDate(iso) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return String(iso || '')
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function stateLine(meta, body) {
  const last = meta?.lastDraft
  const state = draftState(meta, body)
  if (state === 'empty') return 'Not started'
  if (state === 'new') return 'Never published'
  if (state === 'changed') return `Changes since draft ${last.n}`
  return `Draft ${last.n} published ${displayDate(last.date)}`
}

// Draft files are numbered so they sort and read naturally: 001.md, 002.md…
export const draftFileName = (n) => `${String(n).padStart(3, '0')}.md`
export const draftNumberFromFile = (name) => {
  const match = String(name).match(/^(\d+)\.md$/i)
  return match ? Number(match[1]) : null
}

// The frontmatter stamped on a document after publishing draft `n` of `text`.
export const lastDraftStamp = (n, text, dateIso) => ({ n, date: dateIso, hash: textHash(text) })

// ---------------------------------------------------------------------------
// Word-level diff
//
// Paragraphs are matched first (LCS over whole paragraphs), then only the runs
// that differ are diffed word by word. That keeps memory small for long
// chapters: an unchanged paragraph never enters the word-level table.
// Returns [[op, text], …] with op '=' | '+' | '-'; concatenating the '=' and '+'
// parts reproduces `after`, the '=' and '-' parts reproduce `before`.
// ---------------------------------------------------------------------------

const splitParagraphs = (text) => String(text ?? '').match(/[^\n]*\n*/g).filter(Boolean)
const splitWords = (text) => String(text ?? '').match(/\S+\s*|\s+/g) || []

function lcsTable(a, b, same) {
  const n = a.length, m = b.length
  const table = new Uint32Array((n + 1) * (m + 1))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i * (m + 1) + j] = same(a[i], b[j])
        ? table[(i + 1) * (m + 1) + j + 1] + 1
        : Math.max(table[(i + 1) * (m + 1) + j], table[i * (m + 1) + j + 1])
    }
  }
  return table
}

function diffTokens(a, b, same) {
  const table = lcsTable(a, b, same)
  const m = b.length
  const ops = []
  let i = 0, j = 0
  while (i < a.length && j < b.length) {
    if (same(a[i], b[j])) { ops.push(['=', b[j]]); i++; j++ }
    else if (table[(i + 1) * (m + 1) + j] >= table[i * (m + 1) + j + 1]) ops.push(['-', a[i++]])
    else ops.push(['+', b[j++]])
  }
  while (i < a.length) ops.push(['-', a[i++]])
  while (j < b.length) ops.push(['+', b[j++]])
  return ops
}

function mergeRuns(ops) {
  const out = []
  for (const [op, text] of ops) {
    const last = out[out.length - 1]
    if (last && last[0] === op) last[1] += text
    else out.push([op, text])
  }
  return out
}

export function diffWords(before, after) {
  const paragraphOps = diffTokens(splitParagraphs(before), splitParagraphs(after), (x, y) => x === y)
  const out = []
  let removed = '', added = ''
  const flushRun = () => {
    if (!removed && !added) return
    const sameWord = (x, y) => x.trimEnd() === y.trimEnd()
    out.push(...diffTokens(splitWords(removed), splitWords(added), sameWord))
    removed = ''
    added = ''
  }
  for (const [op, text] of paragraphOps) {
    if (op === '-') removed += text
    else if (op === '+') added += text
    else { flushRun(); out.push(['=', text]) }
  }
  flushRun()
  return mergeRuns(out)
}

export function diffStats(ops) {
  let added = 0, removed = 0
  for (const [op, text] of ops) {
    const words = (text.match(/\S+/g) || []).length
    if (op === '+') added += words
    else if (op === '-') removed += words
  }
  return { added, removed }
}
