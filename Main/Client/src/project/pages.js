// Pure logic for pages (World / Plot / Notes cards): quick-add parsing, name
// lookup and "linked from" — no filesystem, Node-testable.

// Frontmatter keys with a fixed meaning — everything else on a page is a field.
export const RESERVED_PAGE_KEYS = new Set([
  'id', 'name', 'type', 'aliases', 'status', 'relationships', 'members', 'attributes', 'memberRule',
  'media', 'portrait', 'order', 'sections', 'columns', 'summary', 'inherits', 'introduces', 'lastDraft',
])

// A page's own fields, in file order: [[key, value]] (scalars only).
export function pageFields(meta) {
  return Object.entries(meta || {}).filter(([key, value]) => !RESERVED_PAGE_KEYS.has(key) && value !== undefined && value !== null && typeof value !== 'object')
}

const aliasForm = (alias) => (typeof alias === 'object' ? alias?.form : alias)
export const pageNames = (card) => [card?.meta?.name, ...(card?.meta?.aliases || []).map(aliasForm)].filter((n) => n && String(n).trim().length >= 2)

// Find a page whose name or alias is exactly this text (case-insensitive).
export function findPageByName(cards, text) {
  const wanted = String(text || '').trim().toLowerCase()
  if (wanted.length < 2) return null
  return cards.find((card) => pageNames(card).some((n) => String(n).toLowerCase() === wanted)) || null
}

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Every other page that points at `card`: a field whose value names it (e.g.
// `Race: Red Demon` → Red Demons) or a body that mentions it by name.
// Returns [{ card, via }] where via is the field key or 'mentioned'.
export function linkedFrom(cards, card) {
  const names = pageNames(card)
  if (!names.length) return []
  const lowered = names.map((n) => String(n).toLowerCase())
  const mention = new RegExp(`(?<![\\p{L}\\p{N}])(${names.map((n) => escapeRegex(String(n))).join('|')})(?![\\p{L}\\p{N}])`, 'u')
  const out = []
  for (const other of cards) {
    if (other.meta?.id === card.meta?.id) continue
    const field = pageFields(other.meta).find(([, value]) => String(value).split(',').some((part) => lowered.includes(part.trim().toLowerCase())))
    if (field) { out.push({ card: other, via: field[0] }); continue }
    if (other.body && mention.test(other.body)) out.push({ card: other, via: 'mentioned' })
  }
  return out
}

// Names typed all lowercase get title-cased ("long yan" → "Long Yan").
export const titleCase = (text) => (text === text.toLowerCase() ? text.replace(/(^|[\s'-])(\p{L})/gu, (_, lead, letter) => lead + letter.toUpperCase()) : text)

// One quick-add line → { name, summary, chapter }. Accepts the author's list style:
//   "long yan - a disciple of the traveling cloud sect, promising tier 2. ch 22"
// The name is before the first " - " / " — " / ": ", a trailing "ch 22" /
// "chapter 24" becomes the first-seen chapter.
export function parseEntryLine(line) {
  let text = String(line || '').trim().replace(/^[-*•]\s+/, '')
  if (!text) return null
  let chapter = ''
  const ref = text.match(/[.,;]?\s*\b(?:ch(?:apter)?\.?)\s*(\d+(?:\.\d+)?)\s*\.?$/i)
  if (ref) { chapter = `Ch. ${ref[1]}`; text = text.slice(0, ref.index).trim() }
  const split = text.match(/^(.+?)(?:\s+[-–—]\s+|:\s+)(.+)$/)
  const name = titleCase((split ? split[1] : text).trim())
  const summary = split ? split[2].trim().replace(/^\p{Ll}/u, (c) => c.toUpperCase()) : ''
  return name ? { name, summary, chapter } : null
}

export const parseEntryList = (text) => String(text || '').split(/\r?\n/).map(parseEntryLine).filter(Boolean)
