// The binder: Book pages, numbered drafts, arc pages, and page create / rename /
// move / delete across the trees (World, Plot, Notes, front and back matter).
//
// Composed into ProjectContext (see createBinderApi there) so the context file
// doesn't keep growing. `ctx` hands in the pieces of the project it builds on.

import { createSignal } from 'solid-js'
import { createStore, unwrap } from 'solid-js/store'
import { open } from '@tauri-apps/plugin-dialog'
import * as service from './service.js'
import * as format from './format.js'
import * as book from './book.js'
import * as drafts from './drafts.js'
import * as docSync from './docSync.js'
import * as pages from './pages.js'

const SAVE_DELAY_MS = 1500
const IMAGE_FILTER = [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] }]

const blankPage = (page) => ({ meta: book.defaultBookMeta(page), body: '' })

export function createBinderApi(ctx) {
  const {
    Project, trackSave, openTabFor, closeTabsWhere, retitleTabs, flushSave, forgetDocs, CurrentDoc,
    ChapterBodies, ChapterById, UpdateChapterMeta, ReplaceChapterBody, ArcBands,
    Cards, reloadCards, OpenEntityById, UpdateMeta, Banks,
  } = ctx

  // ---------------------------------------------------------------- Book pages
  const [Book, SetBook] = createStore(Object.fromEntries(book.BOOK_PAGES.map((page) => [page, blankPage(page)])))
  // Bumped when a page's text is replaced from outside its editor (restore a draft),
  // so the editor remounts with the new text.
  const [BookRevision, SetBookRevision] = createSignal(0)
  const bookTimers = new Map()

  async function loadBook() {
    SetBook(await service.loadBook(Project.dir, Project.manifest?.name || ''))
  }

  function saveBookPageNow(page) {
    const dir = Project.dir
    if (!dir) return Promise.resolve(false)
    const meta = unwrap(Book[page].meta)
    const body = Book[page].body
    return trackSave(`book/${page}`, () => service.saveBookPage(dir, page, meta, body))
  }
  function scheduleBookSave(page) {
    clearTimeout(bookTimers.get(page))
    bookTimers.set(page, setTimeout(() => { bookTimers.delete(page); saveBookPageNow(page) }, SAVE_DELAY_MS))
  }
  // Pending Book edits, written now (window close / project switch).
  function flushBook() {
    for (const page of [...bookTimers.keys()]) {
      clearTimeout(bookTimers.get(page))
      bookTimers.delete(page)
      saveBookPageNow(page)
    }
  }

  function UpdateBookMeta(page, key, value) {
    SetBook(page, 'meta', key, value)
    if (page === 'overview' && key === 'title') retitleTabs('book:overview', value || 'Overview')
    scheduleBookSave(page)
  }
  function UpdateBookBody(page, text) {
    SetBook(page, 'body', text)
    scheduleBookSave(page)
  }

  async function PickBookCover() {
    const selection = await open({ multiple: false, filters: IMAGE_FILTER })
    if (typeof selection !== 'string') return
    UpdateBookMeta('overview', 'cover', await service.setBookCover(Project.dir, selection))
  }
  const ClearBookCover = () => UpdateBookMeta('overview', 'cover', '')
  const BookCoverUrl = () => (Book.overview.meta.cover && Project.dir ? service.projectFileUrl(Project.dir, Book.overview.meta.cover) : '')

  const bookPageTitle = (page) => (page === 'overview' ? Book.overview.meta.title || 'Overview' : book.BOOK_PAGE_TITLES[page])
  function OpenBookPage(page, options) {
    openTabFor({ key: `book:${page}`, dkind: 'book', docId: page, file: null, title: bookPageTitle(page) }, options)
  }

  // -------------------------------------------------------------------- Drafts
  // A draft owner is 'blurb', 'synopsis', or a chapter id.
  const isBookOwner = (owner) => owner === 'blurb' || owner === 'synopsis'

  // The owner's current state: { meta, body, label } (live chapter text when open).
  function DraftDoc(owner) {
    if (isBookOwner(owner)) return { meta: Book[owner].meta, body: Book[owner].body, label: book.BOOK_PAGE_TITLES[owner] }
    const chapter = ChapterById(owner)
    if (!chapter) return null
    const live = docSync.docString(chapter.file)
    return { meta: chapter.meta, body: live ?? chapter.body, label: format.chapterLabel(chapter.number, chapter.meta?.title ?? chapter.title) }
  }
  const draftDirOf = (owner) => (isBookOwner(owner) ? service.bookDraftDir(owner) : service.chapterDraftDir(ChapterById(owner).file))

  const [DraftLists, SetDraftLists] = createSignal({}) // owner → [{ n, date, note, text }] once loaded
  const DraftList = (owner) => DraftLists()[owner] || []
  async function LoadDrafts(owner) {
    if (!Project.dir || DraftLists()[owner]) return
    const list = await service.loadDrafts(Project.dir, draftDirOf(owner))
    SetDraftLists((all) => ({ ...all, [owner]: list }))
  }

  // Stamp the current text as the working draft number. Nothing is uploaded.
  async function PublishDraft(owner, note = '') {
    // land the chapter's latest keystrokes first, so the stamp matches what's saved
    if (!isBookOwner(owner) && ChapterById(owner)) docSync.flushDoc(ChapterById(owner).file)
    const doc = DraftDoc(owner)
    if (!doc || !drafts.canPublish(doc.meta, doc.body)) return false
    await LoadDrafts(owner)
    const n = drafts.workingDraftNumber(doc.meta)
    const date = new Date().toISOString()
    const text = doc.body
    const dir = Project.dir, draftDir = draftDirOf(owner)
    const written = await trackSave(`${draftDir}/${drafts.draftFileName(n)}`, () => service.writeDraft(dir, draftDir, { n, date, note, text }))
    if (!written) return false
    const stamp = drafts.lastDraftStamp(n, text, date)
    if (isBookOwner(owner)) UpdateBookMeta(owner, 'lastDraft', stamp)
    else UpdateChapterMeta(owner, 'lastDraft', stamp)
    SetDraftLists((all) => ({ ...all, [owner]: [...(all[owner] || []), { n, date, note, text }] }))
    return true
  }

  // Put an old draft back as the working text (the history itself is unchanged).
  function RestoreDraft(owner, n) {
    const draft = DraftList(owner).find((d) => d.n === n)
    if (!draft) return
    if (isBookOwner(owner)) {
      UpdateBookBody(owner, draft.text)
      SetBookRevision((r) => r + 1)
    } else {
      ReplaceChapterBody(owner, draft.text)
    }
  }

  // A compare view for an owner: from / to are draft numbers or 'now'.
  function OpenDiff(owner, from, to = 'now') {
    const doc = DraftDoc(owner)
    if (!doc) return
    openTabFor({ key: `diff:${owner}`, dkind: 'diff', docId: owner, file: null, title: `${doc.label} · drafts`, params: { from, to } }, { preview: false })
  }

  // ---------------------------------------------------------------- Arc pages
  const [ArcFiles, SetArcFiles] = createSignal([]) // [{ file, meta: { name, plan }, body }]
  const arcTimers = new Map()

  async function loadArcs() {
    SetArcFiles(await service.loadArcs(Project.dir))
  }

  // Arcs in reading order: the ones chapters use (by chapter order), then arcs
  // that have a page but no chapters yet.
  function ArcNames() {
    const names = []
    for (const band of ArcBands()) if (band.arc && !names.includes(band.arc)) names.push(band.arc)
    for (const arc of ArcFiles()) if (!names.includes(arc.meta.name)) names.push(arc.meta.name)
    return names
  }
  const ArcPage = (name) => ArcFiles().find((a) => a.meta.name === name) || { file: format.arcFileName(name), meta: { name, plan: '' }, body: '' }
  const ArcChapters = (name) => ChapterBodies().filter((c) => (c.meta?.arc || '') === name).sort((a, b) => (a.number ?? 1e9) - (b.number ?? 1e9))

  function saveArcNow(name) {
    const page = ArcPage(name), dir = Project.dir
    return trackSave(`arcs/${page.file}`, () => service.saveArc(dir, page.file, page.meta, page.body))
  }
  function UpdateArc(name, key, value) {
    const page = ArcPage(name)
    const next = key === 'body' ? { ...page, body: value } : { ...page, meta: { ...page.meta, [key]: value } }
    SetArcFiles((list) => [...list.filter((a) => a.meta.name !== name), next])
    clearTimeout(arcTimers.get(name))
    arcTimers.set(name, setTimeout(() => { arcTimers.delete(name); saveArcNow(name) }, SAVE_DELAY_MS))
  }
  function flushArcs() {
    for (const name of [...arcTimers.keys()]) {
      clearTimeout(arcTimers.get(name))
      arcTimers.delete(name)
      saveArcNow(name)
    }
  }

  async function CreateArc(name) {
    const clean = String(name || '').trim()
    if (!clean || ArcNames().includes(clean)) return false
    const page = { file: format.arcFileName(clean), meta: { name: clean, plan: '' }, body: '' }
    SetArcFiles((list) => [...list, page])
    await saveArcNow(clean)
    OpenArc(clean, { preview: false })
    return true
  }

  async function RenameArc(oldName, newName) {
    const clean = String(newName || '').trim()
    if (!clean || clean === oldName || ArcNames().includes(clean)) return false
    const page = ArcPage(oldName)
    const hadFile = ArcFiles().some((a) => a.meta.name === oldName)
    for (const chapter of ChapterBodies()) if (chapter.meta?.arc === oldName) UpdateChapterMeta(chapter.id, 'arc', clean)
    const renamed = { file: format.arcFileName(clean), meta: { ...page.meta, name: clean }, body: page.body }
    SetArcFiles((list) => [...list.filter((a) => a.meta.name !== oldName), renamed])
    await saveArcNow(clean)
    if (hadFile && page.file !== renamed.file) await service.deleteArcFile(Project.dir, page.file).catch(console.error)
    retitleTabs(`arc:${oldName}`, clean, { key: `arc:${clean}`, docId: clean })
    return true
  }

  // Removes the arc; its chapters stay, just no longer grouped.
  async function DeleteArc(name) {
    const page = ArcPage(name)
    const hadFile = ArcFiles().some((a) => a.meta.name === name)
    for (const chapter of ChapterBodies()) if (chapter.meta?.arc === name) UpdateChapterMeta(chapter.id, 'arc', '')
    SetArcFiles((list) => list.filter((a) => a.meta.name !== name))
    if (hadFile) await service.deleteArcFile(Project.dir, page.file).catch(console.error)
    closeTabsWhere((tab) => tab.key === `arc:${name}`)
    return async () => { // undo
      SetArcFiles((list) => [...list, page])
      await saveArcNow(name)
    }
  }

  // Planned length (Overview × arc overrides) with how much is written per arc.
  const hasText = (chapter) => Boolean(String(chapter.body || '').trim() || chapter.meta?.lastDraft)
  function PlanSummary() {
    const arcs = ArcNames().map((name) => ({ name, plan: ArcPage(name).meta.plan ?? '', written: ArcChapters(name).filter(hasText).length }))
    return book.planTarget(Book.overview.meta.plan, arcs)
  }

  function OpenArc(name, options) {
    openTabFor({ key: `arc:${name}`, dkind: 'arc', docId: name, file: null, title: name || 'Untitled arc' }, options)
  }

  // ------------------------------------------------------------------- Pages
  const findCard = (id) => Cards().find((c) => c.meta.id === id)
  const childrenOf = (card) => Cards().filter((c) => c.parentId === card.meta.id && c.root === card.root)
  function descendantsOf(card) {
    const out = []
    const walk = (parent) => { for (const child of childrenOf(parent)) { out.push(child); walk(child) } }
    walk(card)
    return out
  }
  const byOrder = (a, b) => (a.meta.order ?? 1e9) - (b.meta.order ?? 1e9) || String(a.meta.name || '').localeCompare(String(b.meta.name || ''))
  // Pages directly under a parent (or at the top of a tree when parentId is null).
  const PagesIn = (root, parentId) => Cards().filter((c) => c.root === root && (c.parentId ?? null) === (parentId ?? null)).sort(byOrder)

  // What a page holds: its sub-pages, plus (old collections) its members.
  function PageChildren(id) {
    const card = findCard(id)
    if (!card) return []
    const children = PagesIn(card.root, id)
    if (card.meta.type !== 'group' || !ctx.MembersOf) return children
    const seen = new Set(children.map((c) => c.meta.id))
    const members = ctx.MembersOf(card.meta).map(findCard).filter((m) => m && !seen.has(m.meta.id))
    return [...children, ...members.sort((a, b) => String(a.meta.name).localeCompare(String(b.meta.name)))]
  }

  // A folder's table columns: its own, else the nearest ancestor's, else (old
  // collections) its per-member attribute keys.
  function ColumnsOf(card) {
    let current = card
    while (current) {
      if (Array.isArray(current.meta.columns)) return current.meta.columns
      if (Array.isArray(current.meta.attributes) && current.meta.attributes.length) {
        return current.meta.attributes.filter((a) => a.mode !== 'fixed' && a.key).map((a) => a.key)
      }
      current = current.parentId ? findCard(current.parentId) : null
    }
    return []
  }
  // A page's own fields, in file order: [[key, value]].
  const FieldsOf = (card) => pages.pageFields(card?.meta)

  function nextOrder(root, parentId) {
    const orders = PagesIn(root, parentId).map((c) => c.meta.order).filter((n) => typeof n === 'number')
    return orders.length ? Math.max(...orders) + 1 : PagesIn(root, parentId).length + 1
  }

  // Create one page (or folder). section: 'world'|'plot'|'notes'|'front'|'back'
  // (ignored when a parent is given — the page lives in its parent's tree).
  async function createPageRecord(section, parentId, name, { folder = false, summary = '', fields = {} } = {}) {
    const parent = parentId ? findCard(parentId) : null
    const root = parent ? parent.root : format.SECTION_ROOT[section]
    const meta = { id: format.generateId(), name, type: folder ? 'folder' : 'page', aliases: [], order: nextOrder(root, parentId ?? null) }
    if (summary) meta.summary = summary
    if (!folder && parent) for (const column of ColumnsOf(parent)) meta[column] = fields[column] ?? ''
    if (!folder) Object.assign(meta, fields)
    await service.createCard(Project.dir, root, parent, meta, '')
    return meta.id
  }

  async function CreatePage(section, parentId, name, options = {}) {
    const clean = String(name || '').trim()
    if (!clean || !Project.dir) return null
    await flushSave()
    const id = await createPageRecord(section, parentId, clean, options)
    await reloadCards()
    if (options.open !== false) OpenEntityById(id, { preview: false })
    return id
  }

  // Quick add under a folder: [{ name, summary, fields }] → one page each.
  async function AddPagesTo(parentId, entries) {
    if (!Project.dir || !entries.length) return 0
    await flushSave()
    for (const entry of entries) await createPageRecord(null, parentId, entry.name, { summary: entry.summary, fields: entry.fields })
    await reloadCards()
    return entries.length
  }

  async function savePageMeta(card, meta) {
    await trackSave(`${card.root}/${card.file}`, () => service.saveCard(Project.dir, card.root, card.file, meta, card.body))
  }

  async function RenamePage(id, name) {
    const card = findCard(id)
    const clean = String(name || '').trim()
    if (!card || !clean) return
    if (CurrentDoc.id === id) UpdateMeta('name', clean)
    else await savePageMeta(card, { ...unwrap(card.meta), name: clean })
    retitleTabs(`e:${id}`, clean)
    await reloadCards()
  }

  // Set one frontmatter value on any page (open or not). The open page goes
  // through the normal autosave; others are written after a short pause, so
  // typing in a table cell doesn't hit the disk on every keystroke.
  const pageTimers = new Map()
  function savePageSoon(id) {
    clearTimeout(pageTimers.get(id))
    pageTimers.set(id, setTimeout(() => savePageNow(id), SAVE_DELAY_MS))
  }
  function savePageNow(id) {
    clearTimeout(pageTimers.get(id))
    pageTimers.delete(id)
    const card = findCard(id)
    if (card) savePageMeta(card, unwrap(card.meta))
  }
  function UpdatePageMeta(id, key, value) {
    if (CurrentDoc.id === id) { UpdateMeta(key, value); return }
    const card = findCard(id)
    if (!card) return
    const meta = { ...unwrap(card.meta), [key]: value }
    if (value === undefined) delete meta[key]
    ctx.SetCards((list) => list.map((c) => (c.meta.id === id ? { ...c, meta } : c)))
    savePageSoon(id)
  }

  // Delete a page and everything inside it. Returns an undo function.
  async function DeletePage(id) {
    const card = findCard(id)
    if (!card || !Project.dir) return null
    await flushSave()
    const doomed = [card, ...descendantsOf(card)]
    const backup = doomed.map((c) => ({ root: c.root, file: c.file, meta: unwrap(c.meta), body: c.body }))
    const ids = new Set(doomed.map((c) => c.meta.id))
    forgetDocs([...ids]) // before tabs close, or closing them would save the page back
    closeTabsWhere((tab) => ids.has(tab.docId))
    await service.deleteCard(Project.dir, card)
    await reloadCards()
    return async () => {
      for (const saved of backup) await service.saveCard(Project.dir, saved.root, saved.file, saved.meta, saved.body)
      await reloadCards()
    }
  }

  async function DuplicatePage(id) {
    const card = findCard(id)
    if (!card) return null
    await flushSave()
    const meta = { ...unwrap(card.meta), id: format.generateId(), name: `${card.meta.name} copy` }
    delete meta.order
    const parent = card.parentId ? findCard(card.parentId) : null
    meta.order = nextOrder(card.root, card.parentId ?? null)
    await service.createCard(Project.dir, card.root, parent, meta, card.body)
    await reloadCards()
    OpenEntityById(meta.id, { preview: false })
    return meta.id
  }

  // Move a page into another parent / tree. With `beforeId`/`afterId` it's placed
  // next to that sibling (sibling order is the per-page `order` field).
  async function MovePage(id, { section, parentId = null, beforeId = null, afterId = null } = {}) {
    const card = findCard(id)
    if (!card || !Project.dir) return
    const parent = parentId ? findCard(parentId) : null
    if (parent && (parent.meta.id === id || descendantsOf(card).some((c) => c.meta.id === parent.meta.id))) return
    const root = parent ? parent.root : format.SECTION_ROOT[section] || card.root
    await flushSave()
    await service.moveCard(Project.dir, card, root, parent)
    await reloadCards()
    const siblings = PagesIn(root, parentId).filter((c) => c.meta.id !== id)
    const moved = findCard(id)
    if (!moved) return
    let at = siblings.length
    if (beforeId) at = Math.max(0, siblings.findIndex((c) => c.meta.id === beforeId))
    else if (afterId) at = siblings.findIndex((c) => c.meta.id === afterId) + 1
    siblings.splice(at, 0, moved)
    for (let i = 0; i < siblings.length; i++) {
      if (siblings[i].meta.order !== i + 1) await savePageMeta(siblings[i], { ...unwrap(siblings[i].meta), order: i + 1 })
    }
    await reloadCards()
  }

  // Every other page that points at this one (a field naming it, or a mention).
  const LinkedFrom = (id) => (findCard(id) ? pages.linkedFrom(Cards(), findCard(id)) : [])
  const PageNamed = (text) => pages.findPageByName(Cards(), text)
  const RetitlePageTabs = (id, name) => retitleTabs(`e:${id}`, name || 'Untitled')

  // "Generate from banks": a new page in a folder, named from the surname /
  // given-name banks, each column filled from a bank with the same name.
  const NAME_BANKS = { surname: ['surnames', 'surname'], given: ['given-names', 'given names', 'givennames', 'names', 'given'] }
  const bankNamed = (names) => Banks().find((bank) => names.includes(bank.name.toLowerCase()) && bank.entries.length)
  const roll = (bank) => bank.entries[Math.floor(Math.random() * bank.entries.length)]
  const CanGenerate = () => Boolean(bankNamed(NAME_BANKS.surname) || bankNamed(NAME_BANKS.given))
  async function GeneratePageIn(folderId) {
    const folder = findCard(folderId)
    if (!folder) return null
    const fixedSurname = (folder.meta.attributes || []).find((a) => a.mode === 'fixed' && /surname/i.test(a.key))?.value
    const surname = fixedSurname || (bankNamed(NAME_BANKS.surname) ? roll(bankNamed(NAME_BANKS.surname)) : '')
    const given = bankNamed(NAME_BANKS.given) ? roll(bankNamed(NAME_BANKS.given)) : ''
    const name = [surname, given].filter(Boolean).join(' ')
    if (!name) return null
    const fields = {}
    for (const column of ColumnsOf(folder)) {
      const bank = Banks().find((b) => b.name.toLowerCase() === column.toLowerCase() && b.entries.length)
      if (bank) fields[column] = roll(bank)
    }
    return CreatePage(null, folderId, name, { fields })
  }

  // ------------------------------------------------------------------ Scraps
  // Every chapter's scraps, for the review page: [{ chapter, scrap }] in reading order.
  function AllScraps() {
    const order = ArcNames().flatMap((name) => ArcChapters(name)).concat(ArcChapters(''))
    return order.flatMap((chapter) => (chapter.meta?.scraps || []).map((scrap) => ({ chapter, scrap })))
  }
  function OpenScraps(options) {
    openTabFor({ key: 'scraps', dkind: 'scraps', docId: '__scraps__', file: null, title: 'Scrapped text' }, options)
  }
  // Open a chapter at a scrap: the chapter's editor picks this up and selects it.
  const [PendingScrapFocus, SetPendingScrapFocus] = createSignal(null) // { chapterId, scrapId }
  function FocusScrap(chapterId, scrapId) {
    SetPendingScrapFocus({ chapterId, scrapId })
    ctx.OpenChapterById(chapterId)
  }
  const ClearScrapFocus = () => SetPendingScrapFocus(null)

  // Everything pending in this module, written now.
  function flushBinder() {
    flushBook()
    flushArcs()
    for (const id of [...pageTimers.keys()]) savePageNow(id)
  }

  async function loadBinder() {
    SetDraftLists({})
    await Promise.all([loadBook(), loadArcs()])
  }

  return {
    // book
    Book, BookRevision, UpdateBookMeta, UpdateBookBody, PickBookCover, ClearBookCover, BookCoverUrl, OpenBookPage,
    // drafts
    DraftDoc, DraftList, LoadDrafts, PublishDraft, RestoreDraft, OpenDiff,
    // arcs
    ArcNames, ArcPage, ArcChapters, PlanSummary, UpdateArc, CreateArc, RenameArc, DeleteArc, OpenArc,
    // pages
    PagesIn, PageChildren, ColumnsOf, FieldsOf, LinkedFrom, PageNamed, RetitlePageTabs, CanGenerate, GeneratePageIn, CreatePage, AddPagesTo, RenamePage, UpdatePageMeta, DeletePage, DuplicatePage, MovePage,
    // scraps
    AllScraps, OpenScraps, FocusScrap, PendingScrapFocus, ClearScrapFocus,
    // lifecycle (used by ProjectContext)
    loadBinder, flushBinder,
  }
}
