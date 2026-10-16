// Headless tests for export by destination: the pure builders, then the real
// bundled Pandoc on what they produce (read back with Pandoc).  node scripts/export-test.mjs
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as ex from '../src/project/bookExport.js'

let failures = 0
function check(ok, label) {
  console.log(`  ${ok ? '✓' : '✗'} ${label}`)
  if (!ok) failures++
}

const overview = { title: 'The Strongest World', subtitle: 'Book One', author: 'J. Watson', series: 'Strongest', seriesNo: '1', cover: '' }
const publishing = { language: 'English', copyright: '', isbnE: '978-1-0000-0000-1', isbnP: '' }
const blurb = 'A city lord on the edge of the world.'
const raw = [
  { id: 'a', number: 1, title: 'The Beginning', body: 'It was a *dark* night.\n\n% note to self\n\n***\n\nAnother scene.', published: 'It was a night.' },
  { id: 'b', number: 2, title: 'Qin Peizhi', body: 'He was Qin Peizhi, city lord of Extreme Path City.', published: null },
  { id: 'c', number: 3, title: 'Planned', body: '', published: null },
  { id: 'd', number: 4, title: 'Fourth [draft]', body: 'Four words right here.', published: 'Four.' },
]
const front = [{ title: 'Dedication', body: 'For my readers.' }]
const back = [{ title: 'About the Author', body: 'Writes at night.' }]

console.log('choosing chapters')
const all = ex.exportChapters(raw, { ...ex.DEFAULT_EXPORT_OPTIONS })
check(all.map((c) => c.id).join() === 'a,b,d', 'All written skips chapters with no text')
check(all[0].text.includes('dark'), 'Current text uses the working text')
const pub = ex.exportChapters(raw, { ...ex.DEFAULT_EXPORT_OPTIONS, scope: 'published', source: 'published' })
check(pub.map((c) => c.id).join() === 'a,d' && pub[0].text === 'It was a night.', 'Published only + latest published drafts')
const mixed = ex.exportChapters(raw, { ...ex.DEFAULT_EXPORT_OPTIONS, source: 'published' })
check(mixed.find((c) => c.id === 'b').text.startsWith('He was'), 'an unpublished chapter falls back to its working text')
const range = ex.exportChapters(raw, { ...ex.DEFAULT_EXPORT_OPTIONS, scope: 'range', from: '2', to: '4' })
check(range.map((c) => c.id).join() === 'b,d', 'Range is by chapter number')

console.log('options per destination')
const counts = { frontCount: 1, backCount: 0 }
check(ex.includeAvailability('epub', counts).cover && !ex.includeAvailability('docx', counts).cover, 'only EPUB carries the cover')
check(!ex.includeAvailability('docx', counts).copyright && ex.includeAvailability('pdf', counts).copyright, 'no copyright page in a Word manuscript')
check(!ex.includeAvailability('epub', counts).back && ex.includeAvailability('epub', counts).front, 'matter options need pages')
check(!ex.includeAvailability('serial', counts).titlePage && ex.includeAvailability('serial', counts).headings, 'serial: chapters and headings only')
const applied = ex.effectiveOptions({ format: 'md', cover: true, titlePage: true }, counts)
check(!applied.cover && !applied.titlePage && applied.headings, 'unavailable options are applied as off')

console.log('book details')
check(ex.languageCode('English') === 'en' && ex.languageCode('en-GB') === 'en-GB' && ex.languageCode('Klingon') === '', 'language names become codes')
check(ex.copyrightLine(overview, publishing, 2026) === '© 2026 J. Watson', 'copyright line defaults from the author')
const epubChecks = ex.metadataChecks('epub', { overview, publishing, blurb, hasCover: false })
check(epubChecks.find((c) => c.label === 'Cover').ok === false && epubChecks.find((c) => c.label === 'Title').ok, 'EPUB checks flag a missing cover')
check(!ex.metadataChecks('docx', { overview, publishing, blurb }).some((c) => c.label === 'ISBN'), 'Word asks for no ISBN')
check(ex.metadataChecks('serial', { overview, publishing }).length === 0, 'serial needs nothing from the Book pages')

console.log('file names')
check(ex.exportFileName('Who: Me? / You', 'epub') === 'Who Me You.epub', 'titles become safe file names')
check(ex.serialFileName({ number: 7, title: 'The Fall!' }) === '007-the-fall.txt' && ex.SERIAL_FILE_RE.test('007-the-fall.txt'), 'serial files are numbered')

console.log('serial and markdown')
const options = ex.effectiveOptions({ ...ex.DEFAULT_EXPORT_OPTIONS, format: 'serial' }, counts)
const files = ex.buildSerialFiles(all, options)
check(files.length === 3 && files[0].name === '001-the-beginning.txt', 'one file per chapter')
check(files[0].content.startsWith('Chapter 1 · The Beginning\n\nIt was') && !files[0].content.includes('note to self'), 'heading first, comments stripped')
check(files[0].content.includes('\n* * *\n'), 'scene breaks as * * *')
const md = ex.buildMarkdownBook(all, ex.effectiveOptions({ format: 'md' }, counts))
check(md.includes('# Chapter 4 · Fourth \\[draft\\]'), 'markdown headings are escaped')

console.log('pandoc source')
const epubOptions = ex.effectiveOptions({ ...ex.DEFAULT_EXPORT_OPTIONS, format: 'epub' }, { frontCount: 1, backCount: 1 })
const epubSource = ex.buildPandocSource({ format: 'epub', overview, publishing, blurb, chapters: all, front, back, options: epubOptions, year: 2026 })
check(epubSource.startsWith('---\ntitle: "The Strongest World"'), 'EPUB metadata block first')
check(epubSource.includes('epub:type=copyright-page') && epubSource.includes('epub:type=dedication'), 'copyright and dedication marked as front matter')
check(epubSource.indexOf('Dedication') < epubSource.indexOf('Chapter 1') && epubSource.indexOf('Chapter 4') < epubSource.indexOf('About the Author'), 'front matter, chapters, back matter in order')
const docxOptions = ex.effectiveOptions({ ...ex.DEFAULT_EXPORT_OPTIONS, format: 'docx' }, counts)
const docxSource = ex.buildPandocSource({ format: 'docx', overview, publishing, blurb, chapters: all, front, back, options: docxOptions, year: 2026 })
check(docxSource.includes('about 100 words') && docxSource.includes('by J. Watson'), 'Word manuscript title page')
check((docxSource.match(/w:type="page"/g) || []).length === 4, 'Word: each section after the title page starts a new page')
const noHeads = ex.buildPandocSource({ format: 'pdf', overview, publishing, chapters: all, options: { ...docxOptions, format: 'pdf', headings: false } })
check(!noHeads.includes('# ') && noHeads.includes('Another scene.\n\n***\n\nHe was'), 'headings off: chapters run on with a scene break')
check(ex.approximateWords(63612) === 'about 64,000 words' && ex.approximateWords(420) === 'about 400 words', 'manuscript word count is rounded')

console.log('print html')
const html = ex.buildPrintHtml({ bodyHtml: '<h1>x</h1>', overview, publishing: { ...publishing, isbnP: '978-2' }, options: { ...docxOptions, format: 'pdf', trim: '5x8', copyright: true }, year: 2026 })
check(html.includes('size: 5in 8in') && html.includes('class="titlepage"') && html.includes('ISBN 978-2'), 'trim size, title page and print ISBN')

// --- the real Pandoc ---
const pandoc = join(process.cwd(), 'src-tauri', 'binaries', 'pandoc-x86_64-pc-windows-msvc.exe')
if (!existsSync(pandoc)) {
  console.log('  (bundled Pandoc not found — skipping the Pandoc round-trip)')
} else {
  console.log('pandoc round-trip')
  const dir = mkdtempSync(join(tmpdir(), 'an-export-'))
  const run = (args) => execFileSync(pandoc, args, { encoding: 'utf8' })
  try {
    const css = join(dir, 'epub.css')
    writeFileSync(css, ex.EPUB_CSS)
    writeFileSync(join(dir, 'book.md'), epubSource)
    run(ex.pandocArgs({ format: 'epub', input: join(dir, 'book.md'), output: join(dir, 'book.epub'), css, cover: '', options: epubOptions }))
    const epubBack = run(['-f', 'epub', '-t', 'markdown', '-s', join(dir, 'book.epub')])
    check(/title: The Strongest World/.test(epubBack) && /J\. Watson/.test(epubBack), 'EPUB carries title and author')
    check(epubBack.includes('978-1-0000-0000-1') && epubBack.includes('2026 J. Watson'), 'EPUB carries the ISBN and copyright')
    check(epubBack.includes('For my readers.') && epubBack.includes('Another scene.') && epubBack.includes('Writes at night.'), 'EPUB has matter and chapters')
    check(!epubBack.includes('note to self'), 'EPUB has no editorial comments')

    writeFileSync(join(dir, 'ms.md'), docxSource)
    run(ex.pandocArgs({ format: 'docx', input: join(dir, 'ms.md'), output: join(dir, 'ms.docx'), options: docxOptions }))
    const docxBack = run(['-f', 'docx', '-t', 'plain', join(dir, 'ms.docx')])
    check(docxBack.startsWith('J. Watson') && docxBack.includes('about 100 words') && docxBack.includes('by J. Watson'), 'Word starts with the manuscript title page')
    check(/Chapter 1\s—\sThe Beginning/.test(docxBack), 'Word chapter heading reads "Chapter 1 — The Beginning"')

    writeFileSync(join(dir, 'print.md'), ex.buildPandocSource({ format: 'pdf', overview, publishing, chapters: all, front, options: { ...docxOptions, format: 'pdf', front: true } }))
    const fragment = run(ex.pandocArgs({ format: 'pdf', input: join(dir, 'print.md'), output: '', options: docxOptions }))
    check(fragment.includes('<span class="chn">Chapter 1</span>') && fragment.includes('<hr />'), 'print HTML has stacked chapter headings and scene breaks')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

console.log(failures ? `\n${failures} FAILED` : '\nall passed')
process.exit(failures ? 1 : 0)
