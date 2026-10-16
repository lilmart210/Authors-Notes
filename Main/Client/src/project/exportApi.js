// Export by destination: gathers the book (chapters in reading order, front and
// back matter, the Book pages) and writes it out through bookExport's builders.
//
// Composed into ProjectContext like the binder; `ctx` hands in what it reads.

import { createSignal } from 'solid-js'
import { unwrap } from 'solid-js/store'
import * as service from './service.js'
import * as format from './format.js'
import * as bookExport from './bookExport.js'
import * as docSync from './docSync.js'

export function createExportApi(ctx) {
  const { Project, flushSave, Book, ChapterBodies, ReadingOrder, PagesIn } = ctx

  // chapter id → { n, text } of its latest published draft
  const [PublishedTexts, SetPublishedTexts] = createSignal({})

  // Read the latest published draft of every chapter that has one (cached by draft number).
  async function LoadPublishedTexts() {
    if (!Project.dir) return
    const known = PublishedTexts()
    const next = {}
    for (const chapter of ChapterBodies()) {
      const stamp = chapter.meta?.lastDraft
      if (!stamp?.n) continue
      if (known[chapter.id]?.n === stamp.n) {
        next[chapter.id] = known[chapter.id]
        continue
      }
      const text = await service.loadDraftText(Project.dir, service.chapterDraftDir(chapter.file), stamp.n)
      if (text != null) next[chapter.id] = { n: stamp.n, text }
    }
    SetPublishedTexts(next)
  }

  // Front or back matter pages, depth-first in sidebar order. Empty folders are skipped.
  function MatterPages(section) {
    const root = format.SECTION_ROOT[section]
    const out = []
    const walk = (parentId) => {
      for (const card of PagesIn(root, parentId)) {
        const children = PagesIn(root, card.meta.id)
        const body = card.body || ''
        if (body.trim() || !children.length) out.push({ title: card.meta.name, body })
        walk(card.meta.id)
      }
    }
    walk(null)
    return out
  }

  function candidates() {
    const published = PublishedTexts()
    return ReadingOrder().map((chapter) => ({
      id: chapter.id,
      number: chapter.number,
      title: chapter.meta?.title ?? chapter.title,
      body: chapter.body || '',
      published: chapter.meta?.lastDraft ? published[chapter.id]?.text ?? null : null,
    }))
  }

  // Everything the dialog shows and the export writes, for a set of options.
  function ExportPlan(options) {
    const front = MatterPages('front')
    const back = MatterPages('back')
    const counts = { frontCount: front.length, backCount: back.length }
    const effective = bookExport.effectiveOptions(options, counts)
    const chapters = bookExport.exportChapters(candidates(), effective)
    const words = chapters.reduce((sum, chapter) => sum + bookExport.wordsIn(chapter.text), 0)
    const title = Book.overview.meta.title || Project.manifest?.name || ''
    const fileName = effective.format === 'serial' ? '' : bookExport.exportFileName(title, effective.format)
    return { options: effective, chapters, words, front, back, counts, title, fileName }
  }

  // Write the export. Returns { path, count?, printHtml? } (paths relative to the project).
  async function ExportBook(options) {
    if (!Project.dir) throw new Error('No project open')
    docSync.flushAll() // land any pending edits into ChapterBodies first
    await flushSave()
    await LoadPublishedTexts()
    const plan = ExportPlan(options)
    if (!plan.chapters.length) throw new Error('No chapters to export')
    const dir = Project.dir
    const target = plan.options.format
    const overview = unwrap(Book.overview.meta)
    const publishing = unwrap(Book.publishing.meta)

    if (target === 'serial') {
      const files = bookExport.buildSerialFiles(plan.chapters, plan.options)
      return { path: await service.writeSerialExport(dir, files), count: files.length }
    }
    if (target === 'md') {
      return { path: await service.writeExport(dir, plan.fileName, bookExport.buildMarkdownBook(plan.chapters, plan.options)) }
    }
    const markdown = bookExport.buildPandocSource({
      format: target, overview, publishing, blurb: Book.blurb.body,
      chapters: plan.chapters, front: plan.front, back: plan.back, options: plan.options,
    })
    if (target === 'pdf') {
      const bodyHtml = await service.exportWithPandoc(dir, { format: target, markdown, options: plan.options })
      const printHtml = bookExport.buildPrintHtml({ bodyHtml, overview, publishing, options: plan.options })
      const path = await service.writeExport(dir, `${bookExport.fileStem(plan.title)} (print).html`, printHtml)
      return { path, printHtml }
    }
    const path = await service.exportWithPandoc(dir, { format: target, markdown, outName: plan.fileName, coverRel: overview.cover, options: plan.options })
    return { path }
  }

  return { LoadPublishedTexts, MatterPages, ExportPlan, ExportBook }
}
