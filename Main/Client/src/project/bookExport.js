// Manuscript export, organized by where the book is going: EPUB for the ebook
// stores, Word for editors and agents, a print PDF for paperback interiors, one
// file per chapter for web serials, and a plain Markdown copy.
//
// Everything here is pure (no filesystem, no Pandoc), so it runs and tests in
// Node. The project layer gathers the text, calls these builders, and hands the
// result to Pandoc (EPUB / Word / print HTML) or writes it straight out.
import { stripGeneratorMarkers, chapterLabel } from './format.js'

// ---------------------------------------------------------------------------
// Typeset preview (Pandoc → HTML of the current chapter or the whole book)
// ---------------------------------------------------------------------------

const PREVIEW_SCENE_BREAK = '***'

// chapters: [{ number, title, body }] in reading order.
export function buildExport(chapters, { includeChapterHeadings = true } = {}) {
  const parts = chapters.map((chapter) => {
    const heading = includeChapterHeadings ? `# ${chapter.number != null ? `Chapter ${chapter.number} — ` : ''}${chapter.title}` : ''
    return [heading, cleanBody(chapter.body, PREVIEW_SCENE_BREAK)].filter(Boolean).join('\n\n')
  })
  return `${parts.join('\n\n').trim()}\n`
}

// ---------------------------------------------------------------------------
// Destinations and options
// ---------------------------------------------------------------------------

export const EXPORT_FORMATS = [
  { id: 'epub', name: 'EPUB', ext: 'epub', use: 'Ebook stores: Kindle (KDP), Apple Books, Kobo, Google Play, Draft2Digital' },
  { id: 'docx', name: 'Word (.docx)', ext: 'docx', use: 'Editors and agents. KDP and Draft2Digital also accept it' },
  { id: 'pdf', name: 'Print PDF', ext: 'pdf', use: 'Paperback interior: KDP Print, IngramSpark' },
  { id: 'serial', name: 'Web serial', ext: 'txt', use: 'One file per chapter, ready to paste into Royal Road and similar sites' },
  { id: 'md', name: 'Markdown', ext: 'md', use: 'Plain-text copy of the whole book' },
]
export const exportFormat = (id) => EXPORT_FORMATS.find((f) => f.id === id) || EXPORT_FORMATS[0]

// Trim sizes for the print interior, in inches.
export const TRIM_SIZES = [
  { id: '5x8', label: '5 × 8 in', width: 5, height: 8 },
  { id: '5.5x8.5', label: '5.5 × 8.5 in', width: 5.5, height: 8.5 },
  { id: '6x9', label: '6 × 9 in', width: 6, height: 9 },
]
export const trimSize = (id) => TRIM_SIZES.find((t) => t.id === id) || TRIM_SIZES[2]

export const DEFAULT_EXPORT_OPTIONS = {
  format: 'epub',
  scope: 'all', // all | published | range
  from: '',
  to: '',
  source: 'current', // current | published
  trim: '6x9',
  cover: true,
  titlePage: true,
  copyright: true,
  front: true,
  back: true,
  headings: true,
}

// Book formats get the book around the chapters (title page, matter, metadata);
// serial and Markdown are just the chapters.
export const isBookFormat = (format) => format === 'epub' || format === 'docx' || format === 'pdf'

// Which "Include" options apply to a format. A Word manuscript has no copyright
// page; only an EPUB carries its cover inside the file.
export function includeAvailability(format, { frontCount = 0, backCount = 0 } = {}) {
  const book = isBookFormat(format)
  return {
    cover: format === 'epub',
    titlePage: book,
    copyright: book && format !== 'docx',
    front: book && frontCount > 0,
    back: book && backCount > 0,
    headings: true,
  }
}

// The options as they will actually be applied: anything unavailable is off.
export function effectiveOptions(options, counts) {
  const available = includeAvailability(options.format, counts)
  const out = { ...DEFAULT_EXPORT_OPTIONS, ...options }
  for (const key of Object.keys(available)) out[key] = Boolean(out[key] && available[key])
  return out
}

export const wordsIn = (text) => (stripGeneratorMarkers(text || '').match(/\S+/g) || []).length

// chapters: [{ number, title, body, published }] in reading order, where
// `published` is the text of the chapter's latest published draft (or null).
// Returns the chapters to export, each with the `text` that goes out.
export function exportChapters(chapters, options) {
  const pick = (chapter) => (options.source === 'published' && chapter.published != null ? chapter.published : chapter.body || '')
  let list = chapters.map((chapter) => ({ ...chapter, text: pick(chapter) })).filter((chapter) => wordsIn(chapter.text) > 0)
  if (options.scope === 'published') list = list.filter((chapter) => chapter.published != null)
  if (options.scope === 'range') {
    const low = options.from === '' || options.from == null ? -Infinity : Number(options.from)
    const high = options.to === '' || options.to == null ? Infinity : Number(options.to)
    list = list.filter((chapter) => chapter.number != null && chapter.number >= low && chapter.number <= high)
  }
  return list
}

// ---------------------------------------------------------------------------
// Book details
// ---------------------------------------------------------------------------

const LANGUAGE_CODES = {
  english: 'en', spanish: 'es', french: 'fr', german: 'de', italian: 'it', portuguese: 'pt', dutch: 'nl',
  japanese: 'ja', chinese: 'zh', korean: 'ko', russian: 'ru', polish: 'pl', swedish: 'sv', norwegian: 'nb',
  danish: 'da', finnish: 'fi', turkish: 'tr', arabic: 'ar', hindi: 'hi', indonesian: 'id', vietnamese: 'vi',
  thai: 'th', greek: 'el', czech: 'cs', hungarian: 'hu', romanian: 'ro', ukrainian: 'uk', hebrew: 'he',
  tagalog: 'tl', filipino: 'fil', malay: 'ms',
}

// "English" → "en"; a code typed directly ("en-GB") passes through.
export function languageCode(language) {
  const text = String(language || '').trim()
  if (!text) return ''
  if (/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/i.test(text)) return text
  return LANGUAGE_CODES[text.toLowerCase()] || ''
}

export function copyrightLine(overview, publishing, year = new Date().getFullYear()) {
  return String(publishing?.copyright || '').trim() || `© ${year} ${overview?.author || ''}`.trim()
}

const isbnFor = (format, publishing) => String((format === 'pdf' ? publishing?.isbnP : publishing?.isbnE) || '').trim()

// What the destination wants from the Book pages, and whether it's there.
//   book: { overview, publishing, blurb } (metas, blurb as text), hasCover
export function metadataChecks(format, { overview, publishing, blurb, hasCover }) {
  if (!isBookFormat(format)) return []
  const checks = [
    { label: 'Title', ok: Boolean(String(overview?.title || '').trim()), hint: 'add on Overview' },
    { label: 'Author', ok: Boolean(String(overview?.author || '').trim()), hint: 'add on Overview' },
  ]
  if (format === 'epub') {
    checks.push({ label: 'Cover', ok: Boolean(hasCover), hint: 'stores require one — upload on Overview' })
    checks.push({ label: 'Description (blurb)', ok: Boolean(String(blurb || '').trim()), hint: 'write one under Blurb' })
  }
  checks.push({ label: 'Language', ok: Boolean(languageCode(publishing?.language)), hint: 'set on Publishing' })
  if (format !== 'docx') checks.push({ label: 'ISBN', ok: Boolean(isbnFor(format, publishing)), hint: 'optional' })
  return checks
}

// ---------------------------------------------------------------------------
// File names
// ---------------------------------------------------------------------------

// A book title as a file name (Windows-safe, never empty).
export function fileStem(title) {
  return String(title || '').replace(/[<>:"/\\|?*\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '') || 'book'
}

export function exportFileName(title, format) {
  return `${fileStem(title)}.${exportFormat(format).ext}`
}

const slug = (text) => String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'chapter'

// 001-the-beginning.txt — numbered so the files sort in reading order.
export function serialFileName(chapter, index = 0) {
  const number = chapter.number != null && Number.isFinite(Number(chapter.number)) ? Number(chapter.number) : index + 1
  return `${String(number).padStart(3, '0')}-${slug(chapter.title)}.txt`
}
export const SERIAL_FILE_RE = /^\d{3,}-[a-z0-9-]+\.txt$/

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

// Strip editorial markup that must never reach a reader: `%` comment / `%~`
// synopsis lines, and render `***` scene-break lines with the given glyph.
function cleanBody(body, sceneBreak) {
  return stripGeneratorMarkers(String(body || ''))
    .split(/\r?\n/)
    .filter((line) => !/^\s*%/.test(line))
    .map((line) => (line.trim() === '***' ? sceneBreak : line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// The first paragraph of a chapter as a reader would see it (for the preview).
export function firstParagraph(text, max = 260) {
  return cleanBody(text, '* * *').split(/\n\s*\n/)[0].slice(0, max)
}

const chapterHeading = (chapter) => chapterLabel(chapter.number, chapter.title)

// Web serial: one plain-text file per chapter.
export function buildSerialFiles(chapters, options) {
  return chapters.map((chapter, index) => {
    const body = cleanBody(chapter.text, '* * *')
    const content = [options.headings ? chapterHeading(chapter) : '', body].filter(Boolean).join('\n\n')
    return { name: serialFileName(chapter, index), content: `${content}\n` }
  })
}

// Markdown: the whole book in one file.
export function buildMarkdownBook(chapters, options) {
  const parts = chapters.map((chapter) => [options.headings ? `# ${escapeInline(chapterHeading(chapter))}` : '', cleanBody(chapter.text, '***')].filter(Boolean).join('\n\n'))
  return `${parts.join('\n\n').trim()}\n`
}

// ---------------------------------------------------------------------------
// Pandoc source (EPUB / Word / print)
// ---------------------------------------------------------------------------

const escapeInline = (text) => String(text ?? '').replace(/([\\`*_{}[\]<>#|~^$])/g, '\\$1')
const escapeXml = (text) => String(text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const escapeHtml = escapeXml
const yamlString = (text) => JSON.stringify(String(text ?? ''))
const NBSP = ' '

// "Chapter 1" and the title as two spans: the EPUB and print styles stack them,
// Word reads them as one line ("Chapter 1 — The Beginning").
function bookChapterHeading(chapter) {
  const title = String(chapter.title || '').trim()
  if (chapter.number == null || chapter.number === '') return `# ${escapeInline(title || 'Untitled')}`
  const label = `[Chapter ${escapeInline(chapter.number)}]{.chn}`
  return title ? `# ${label}[${NBSP}—${NBSP}]{.sep}[${escapeInline(title)}]{.cht}` : `# ${label}`
}

// EPUB places these page kinds in the book's front / back matter.
const EPUB_PAGE_TYPES = {
  dedication: 'dedication', acknowledgments: 'acknowledgments', acknowledgements: 'acknowledgments',
  foreword: 'foreword', preface: 'preface', epigraph: 'epigraph', prologue: 'prologue', epilogue: 'epilogue',
  afterword: 'afterword', appendix: 'appendix', glossary: 'glossary', 'about the author': 'contributors',
  'also by': 'seriespage', colophon: 'colophon',
}

function matterPage(page, format) {
  const title = String(page.title || '').trim() || 'Untitled'
  const type = format === 'epub' ? EPUB_PAGE_TYPES[title.toLowerCase()] : null
  const attrs = ['.unnumbered', '.matter', type ? `epub:type=${type}` : ''].filter(Boolean).join(' ')
  return [`# ${escapeInline(title)} {${attrs}}`, cleanBody(page.body, '***')].filter(Boolean).join('\n\n')
}

const OPENXML_PAGE_BREAK = '```{=openxml}\n<w:p><w:r><w:br w:type="page"/></w:r></w:p>\n```'

// "about 64,000 words" — manuscript convention rounds to the thousand.
export function approximateWords(words) {
  const rounded = words >= 1000 ? Math.round(words / 1000) * 1000 : Math.max(100, Math.round(words / 100) * 100)
  return `about ${rounded.toLocaleString('en-US')} words`
}

// Standard manuscript first page: author and word count across the top, the
// title and byline centred a third of the way down.
function manuscriptTitlePage(overview, words) {
  const author = escapeXml(overview?.author || '')
  const title = escapeXml(overview?.title || 'Untitled')
  const run = (text, props = '') => `<w:r>${props}<w:t xml:space="preserve">${text}</w:t></w:r>`
  return [
    '```{=openxml}',
    `<w:p><w:pPr><w:tabs><w:tab w:val="right" w:pos="9360"/></w:tabs></w:pPr>${run(author)}<w:r><w:tab/></w:r>${run(escapeXml(approximateWords(words)))}</w:p>`,
    `<w:p><w:pPr><w:spacing w:before="4800"/><w:jc w:val="center"/></w:pPr>${run(title, '<w:rPr><w:caps/></w:rPr>')}</w:p>`,
    author ? `<w:p><w:pPr><w:jc w:val="center"/></w:pPr>${run(`by ${author}`)}</w:p>` : '',
    '```',
  ].filter(Boolean).join('\n')
}

function epubMetadata({ overview, publishing, blurb, options }) {
  const lines = ['---']
  const add = (key, value) => { if (String(value ?? '').trim()) lines.push(`${key}: ${yamlString(String(value).trim())}`) }
  add('title', overview?.title || 'Untitled')
  add('subtitle', overview?.subtitle)
  add('author', overview?.author)
  add('lang', languageCode(publishing?.language))
  add('rights', options.copyrightText)
  add('description', blurb)
  add('belongs-to-collection', overview?.series)
  if (String(overview?.series || '').trim()) add('group-position', overview?.seriesNo)
  const isbn = isbnFor('epub', publishing)
  if (isbn) lines.push('identifier:', '  - scheme: ISBN', `    text: ${yamlString(isbn)}`)
  lines.push('---')
  return lines.join('\n')
}

// The Pandoc markdown for a book format.
//   format:     epub | docx | pdf
//   overview / publishing: Book page metas;  blurb: blurb text
//   chapters:   from exportChapters();  front / back: [{ title, body }]
//   options:    effectiveOptions()
// For pdf the title and copyright pages are added by buildPrintHtml instead.
export function buildPandocSource({ format, overview, publishing, blurb = '', chapters, front = [], back = [], options, year }) {
  const copyrightText = copyrightLine(overview, publishing, year)
  const blocks = []
  if (format === 'epub') blocks.push(epubMetadata({ overview, publishing, blurb, options: { ...options, copyrightText } }))
  else {
    const lang = languageCode(publishing?.language)
    if (lang) blocks.push(`---\nlang: ${yamlString(lang)}\n---`)
  }

  // Word: every section after the first starts on a new page.
  let started = false
  const section = (markdown) => {
    if (format === 'docx' && started) blocks.push(OPENXML_PAGE_BREAK)
    blocks.push(markdown)
    started = true
  }

  if (format === 'docx' && options.titlePage) {
    blocks.push(manuscriptTitlePage(overview, chapters.reduce((sum, c) => sum + wordsIn(c.text), 0)))
    started = true
  }
  if (format === 'epub' && options.copyright) {
    const isbn = isbnFor(format, publishing)
    section([`# Copyright {.unnumbered .unlisted .copyright epub:type=copyright-page}`, escapeInline(copyrightText), isbn ? `ISBN ${escapeInline(isbn)}` : ''].filter(Boolean).join('\n\n'))
  }
  if (options.front) for (const page of front) section(matterPage(page, format))
  chapters.forEach((chapter, index) => {
    const body = cleanBody(chapter.text, '***')
    if (options.headings) section([bookChapterHeading(chapter), body].filter(Boolean).join('\n\n'))
    else if (index === 0) section(body)
    else blocks.push('***', body) // headings off: chapters run on, a scene break between them
  })
  if (options.back) for (const page of back) section(matterPage(page, format))
  return `${blocks.join('\n\n').trim()}\n`
}

// Arguments for the Pandoc sidecar. Paths are absolute.
export function pandocArgs({ format, input, output, css, cover, options }) {
  const to = format === 'epub' ? 'epub3' : format === 'docx' ? 'docx' : 'html5'
  const args = ['-f', 'markdown', '-t', to]
  if (format === 'epub') {
    if (css) args.push(`--css=${css}`)
    if (cover && options.cover) args.push(`--epub-cover-image=${cover}`)
    args.push(`--epub-title-page=${options.titlePage ? 'true' : 'false'}`)
  }
  if (output) args.push('-o', output)
  args.push(input)
  return args
}

// The EPUB stylesheet (replaces Pandoc's default).
export const EPUB_CSS = `body { margin: 0 5%; font-family: serif; line-height: 1.5; }
p { margin: 0; text-indent: 1.2em; }
h1 + p, hr + p, section > p:first-child { text-indent: 0; }
h1 { text-align: center; font-weight: normal; font-size: 1.6em; margin: 3em 0 1.6em; page-break-before: always; }
h1 .chn { display: block; font-size: 0.5em; letter-spacing: 0.14em; text-transform: uppercase; margin-bottom: 0.6em; }
h1 .sep { display: none; }
hr { border: 0; margin: 1.2em 0; text-align: center; }
hr::after { content: "* * *"; }
section.copyright h1 { display: none; }
section.copyright p { text-indent: 0; font-size: 0.8em; margin-bottom: 0.6em; }
nav#toc ol { list-style: none; padding-left: 0; }
nav#toc .chn::after { content: " — "; }
nav#toc .sep { display: none; }
`

// The print interior: Pandoc's HTML of the book inside a page set to the trim
// size, with its own title and copyright pages. The webview prints it to PDF.
export function buildPrintHtml({ bodyHtml, overview, publishing, options, year }) {
  const trim = trimSize(options.trim)
  const marginV = 0.75, marginH = 0.625
  const contentHeight = (trim.height - marginV * 2).toFixed(2)
  const title = escapeHtml(overview?.title || 'Untitled')
  const pages = []
  if (options.titlePage) {
    pages.push(`<section class="titlepage"><div class="tp-title">${title}</div>${overview?.subtitle ? `<div class="tp-sub">${escapeHtml(overview.subtitle)}</div>` : ''}${overview?.author ? `<div class="tp-author">${escapeHtml(overview.author)}</div>` : ''}</section>`)
  }
  if (options.copyright) {
    const isbn = isbnFor('pdf', publishing)
    pages.push(`<section class="copyright"><p>${escapeHtml(copyrightLine(overview, publishing, year))}</p>${isbn ? `<p>ISBN ${escapeHtml(isbn)}</p>` : ''}</section>`)
  }
  return `<!doctype html>
<html lang="${escapeHtml(languageCode(publishing?.language) || 'en')}">
<head>
<meta charset="utf-8">
<title>${title}</title>
<style>
@page { size: ${trim.width}in ${trim.height}in; margin: ${marginV}in ${marginH}in; @bottom-center { content: counter(page); font: 8pt Georgia, serif; } }
@page :first { @bottom-center { content: none; } }
html, body { margin: 0; padding: 0; background: #fff; color: #000; }
body { font-family: Georgia, "Times New Roman", serif; font-size: 10.5pt; line-height: 1.45; }
p { margin: 0; text-indent: 1.2em; text-align: justify; hyphens: auto; orphans: 2; widows: 2; }
h1 + p, hr + p, .copyright p { text-indent: 0; }
h1 { break-before: page; text-align: center; font-weight: normal; font-size: 17pt; margin: 0 0 2em; padding-top: 22%; break-after: avoid; }
h1 .chn { display: block; font-family: system-ui, "Segoe UI", sans-serif; font-size: 7.5pt; letter-spacing: 0.14em; text-transform: uppercase; margin-bottom: 0.7em; }
h1 .sep { display: none; }
hr { border: 0; margin: 1em 0; text-align: center; }
hr::after { content: "* * *"; }
section { break-before: page; }
body > section:first-child, body > h1:first-child { break-before: auto; }
.titlepage { min-height: ${contentHeight}in; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; gap: 0.5em; }
.tp-title { font-size: 24pt; line-height: 1.15; }
.tp-sub { font-size: 12pt; color: #444; }
.tp-author { margin-top: 2.5em; font-family: system-ui, "Segoe UI", sans-serif; font-size: 9pt; letter-spacing: 0.14em; text-transform: uppercase; color: #444; }
.copyright { min-height: ${contentHeight}in; display: flex; flex-direction: column; justify-content: flex-end; font-size: 8pt; color: #333; gap: 0.4em; }
</style>
</head>
<body>
${pages.join('\n')}
${bodyHtml}
</body>
</html>
`
}
