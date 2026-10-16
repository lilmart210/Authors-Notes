// Pure logic for the Book section — the book's own pages (Overview, Blurb,
// Synopsis, Publishing) and the planned-length math. No filesystem.
//
// On disk each Book page is one self-describing file in `book/`:
//   book/overview.md    title, subtitle, series, author, cover, title ideas, logline, tags, plan
//   book/blurb.md       the blurb text (body) + its draft stamp
//   book/synopsis.md    the synopsis text (body) + its draft stamp
//   book/publishing.md  platforms, language, rating, copyright, ISBNs
// A missing file simply means "not filled in yet" — defaults below.

export const BOOK_DIR = 'book'
export const BOOK_PAGES = ['overview', 'blurb', 'synopsis', 'publishing']
export const BOOK_PAGE_TITLES = { overview: 'Overview', blurb: 'Blurb', synopsis: 'Synopsis', publishing: 'Publishing' }

export const bookPageFile = (page) => `${page}.md`

export function defaultBookMeta(page, projectName = '') {
  if (page === 'overview') {
    return { title: projectName, subtitle: '', series: '', seriesNo: '', author: '', cover: '', titles: projectName ? [projectName] : [], logline: '', tags: [], plan: { arcs: '', perArc: '', words: '' } }
  }
  if (page === 'publishing') {
    return { platforms: [], language: 'English', rating: '', copyright: '', isbnE: '', isbnP: '' }
  }
  return {}
}

// Fill any keys a hand-edited or older file is missing, keeping what's there.
export function withBookDefaults(page, meta, projectName) {
  const defaults = defaultBookMeta(page, projectName)
  const merged = { ...defaults, ...(meta || {}) }
  if (page === 'overview') merged.plan = { ...defaults.plan, ...(meta?.plan || {}) }
  return merged
}

const toCount = (value) => (value === '' || value == null ? 0 : Math.max(0, Number(value) || 0))

// Planned length = chapters planned per arc (the arc's own number, or the book
// default) × words per chapter. Arcs not created yet count at the default.
//   plan: { arcs, perArc, words } from the Overview
//   arcs: [{ name, plan, written }] — `plan` is the arc's override ('' = default)
export function planTarget(plan, arcs) {
  const perArc = toCount(plan?.perArc)
  const wordsPer = toCount(plan?.words)
  const rows = (arcs || []).map((arc) => ({
    ...arc,
    planned: arc.plan === '' || arc.plan == null ? perArc : toCount(arc.plan),
  }))
  const extraArcs = Math.max(0, toCount(plan?.arcs) - rows.length)
  const chapters = rows.reduce((sum, row) => sum + row.planned, 0) + extraArcs * perArc
  return { arcs: rows, extraArcs, perArc, wordsPer, chapters, words: chapters * wordsPer }
}
