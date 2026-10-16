import { createContext, useContext, createSignal } from 'solid-js'
import { createStore, produce, unwrap } from 'solid-js/store'
import { open } from '@tauri-apps/plugin-dialog'
import * as service from './service.js'
import * as format from './format.js'
import * as cardTree from './cardTree.js'
import * as mentions from './mentions.js'
import * as bookExport from './bookExport.js'
import * as docSync from './docSync.js'
import { createBinderApi } from './binderApi.js'

const AUTOSAVE_DELAY_MS = 1500

const ProjectContext = createContext()

const entityRef = (entity) => ({
  id: entity.meta.id,
  name: entity.meta.name,
  aliases: entity.meta.aliases,
})

export function ProjectProvider(props) {
  // 2. Signals / stores
  const [Project, SetProject] = createStore({ dir: null, manifest: null })
  // CurrentDoc.kind is 'chapter' | 'entity' | null
  const [CurrentDoc, SetCurrentDoc] = createStore({ kind: null, id: null, file: null, root: null, meta: null, body: '' })
  const [Status, SetStatus] = createSignal('idle')
  const [Notice, SetNotice] = createSignal(null) // last failed action (open/import/…), not a save
  const [Busy, SetBusy] = createSignal(false)
  const [Importing, SetImporting] = createSignal(false)
  const [ImportFiles, SetImportFiles] = createSignal([])
  const [Cards, SetCards] = createSignal([]) // every page in every tree: World (bible/), Plot, Notes, front/back matter
  const [ChapterBodies, SetChapterBodies] = createSignal([])
  const [EntityIndex, SetEntityIndex] = createSignal({ byEntity: {}, firstSeen: {} })
  const [Banks, SetBanks] = createSignal([])
  const [RecentProjects, SetRecentProjects] = createSignal(loadRecents())
  const [LeftView, SetLeftView] = createSignal('explorer') // 'explorer' | 'cast' | 'banks'

  let SaveTimer
  let containerApi = null
  let pendingTabs = []
  let previewTabId = null // the single VS-Code-style preview (italic) tab, if any

  // 5. Functions / handlers
  // The World (story bible) is the cards in bible/; mentions, cast and pickers use only these.
  const Entities = () => Cards().filter((card) => card.root === format.WORLD_DIR)
  const HasProject = () => Boolean(Project.dir)
  const Chapters = () => manuscriptGroup()?.children ?? []

  function manuscriptGroup() {
    return Project.manifest?.tree?.find((node) => node.kind === 'group')
  }

  const projectNameFromDir = (dir) => dir.split(/[\\/]/).pop().replace(/\.project$/i, '')

  function loadRecents() {
    try {
      return JSON.parse(globalThis.localStorage?.getItem('an.recentProjects') || '[]')
    } catch {
      return []
    }
  }
  function recordRecent(dir) {
    const next = [dir, ...RecentProjects().filter((d) => d !== dir)].slice(0, 8)
    SetRecentProjects(next)
    try {
      globalThis.localStorage?.setItem('an.recentProjects', JSON.stringify(next))
    } catch {
      /* ignore */
    }
  }

  async function pickFolder(title) {
    const dir = await open({ directory: true, multiple: false, title })
    return typeof dir === 'string' ? dir : null
  }

  async function run(action) {
    if (Busy()) return
    SetBusy(true)
    SetNotice(null)
    try {
      await action()
    } catch (err) {
      console.error(err)
      SetNotice(String(err?.message || err))
    } finally {
      SetBusy(false)
    }
  }

  // --- save tracking: the status bar reports real disk writes, never a guess ---
  // Status: 'idle' (nothing to report) | 'saving' (a write is in flight) |
  // 'saved' (just finished; drops back to idle) | 'error' (a write failed — retryable).
  const FailedSaves = new Map() // file -> write() to retry
  const PendingWrites = new Set()
  let InFlight = 0
  let SavedTimer
  function refreshSaveStatus() {
    if (FailedSaves.size) SetStatus('error')
    else if (InFlight) SetStatus('saving')
    else {
      SetStatus('saved')
      clearTimeout(SavedTimer)
      SavedTimer = setTimeout(() => { if (Status() === 'saved') SetStatus('idle') }, 1500)
    }
  }
  function trackSave(key, write) {
    const job = (async () => {
      InFlight += 1
      if (!FailedSaves.size) SetStatus('saving')
      try {
        await write()
        FailedSaves.delete(key)
        return true
      } catch (err) {
        console.error(err)
        FailedSaves.set(key, write)
        return false
      } finally {
        InFlight -= 1
        refreshSaveStatus()
      }
    })()
    PendingWrites.add(job)
    job.finally(() => PendingWrites.delete(job))
    return job
  }
  function RetrySaves() {
    for (const [key, write] of [...FailedSaves]) trackSave(key, write)
  }
  // Write every pending edit now (window close, project switch). True when all landed.
  async function FlushEverything() {
    docSync.flushAll()
    await flushSave()
    binder.flushBinder()
    for (const id of [...chapterSaveTimers.keys()]) {
      clearTimeout(chapterSaveTimers.get(id))
      chapterSaveTimers.delete(id)
      saveChapterNow(id)
    }
    await Promise.allSettled([...PendingWrites])
    return FailedSaves.size === 0
  }

  // --- split-container tab plumbing ---
  // Each open document is a tab; the container owns the tab strip + panels.
  function SetContainerApi(api) {
    containerApi = api
    const queued = pendingTabs
    pendingTabs = []
    for (const descriptor of queued) openTabFor(descriptor, { preview: descriptor.preview !== false })
  }

  // A tab opens as a reusable PREVIEW (italic) by default; the preview slot is
  // reused for the next single-click, and promoted to permanent on edit /
  // double-click (permanent open) / drag. Pass { preview: false } to open pinned.
  function openTabFor(descriptor, options = {}) {
    const preview = options.preview !== false
    if (!containerApi) {
      pendingTabs = [...pendingTabs.filter((d) => d.key !== descriptor.key), { ...descriptor, preview }]
      return
    }
    const tabData = {
      name: 'doc',
      Name: descriptor.title,
      key: descriptor.key,
      dkind: descriptor.dkind,
      docId: descriptor.docId,
      file: descriptor.file,
      params: descriptor.params,
      preview,
    }
    // Double-click semantics: if a PREVIEW (italic) tab of this doc is open,
    // promote it to permanent; otherwise open a new permanent tab — which opens
    // the doc if it's closed, or a SECOND synced view if it's already permanent.
    if (options.smart) {
      const previewTab = containerApi.Tabs().find((t) => t.key === descriptor.key && t.preview)
      if (previewTab) {
        if (previewTabId === previewTab.id) previewTabId = null
        containerApi.UpdateTab(previewTab.id, { preview: false })
        containerApi.SelectTab(previewTab.id)
        return
      }
      containerApi.OpenTab({ ...tabData, preview: false })
      return
    }
    // Force a second view (shares the same Y.Doc, stays in sync).
    if (options.duplicate) {
      containerApi.OpenTab({ ...tabData, preview: false })
      return
    }
    const existing = containerApi.Tabs().find((t) => t.key === descriptor.key)
    if (existing) {
      if (descriptor.params) containerApi.UpdateTab(existing.id, { params: descriptor.params })
      containerApi.SelectTab(existing.id)
      // SelectTab is a no-op on the active tab — reload so new params show
      if (descriptor.params) { const tab = containerApi.GetTab(existing.id); if (tab) loadDocIntoCurrent(tab) }
      if (!preview) promoteTab(existing.id) // explicit permanent open
      return
    }
    const previewAlive = previewTabId != null && containerApi.Tabs().some((t) => t.id === previewTabId)
    if (preview && previewAlive) {
      // reuse the preview slot for this doc (keeps the tab's position)
      containerApi.UpdateTab(previewTabId, tabData)
      containerApi.SelectTab(previewTabId)
      const tab = containerApi.GetTab(previewTabId)
      if (tab) loadDocIntoCurrent(tab)
      return
    }
    const id = containerApi.OpenTab(tabData)
    if (preview) previewTabId = id
  }

  function promoteTab(id) {
    if (id != null && id === previewTabId) {
      previewTabId = null
      containerApi?.UpdateTab(id, { preview: false })
    }
  }
  // Making a change (typing) promotes the current preview tab to permanent.
  function promoteCurrentTab() {
    if (previewTabId == null || !containerApi) return
    const tab = containerApi.GetTab(previewTabId)
    if (tab && tab.docId === CurrentDoc.id) promoteTab(previewTabId)
  }

  function HandleContainerChange(event) {
    if (!containerApi) return
    if (event.action === 'tab.select' || event.action === 'tab.open') {
      const tab = containerApi.GetTab(event.tabId)
      if (tab) loadDocIntoCurrent(tab)
    } else if (event.action === 'tab.close') {
      if (event.tabId === previewTabId) previewTabId = null
      if (!containerApi.Tabs().length) SetCurrentDoc({ kind: null, id: null, file: null, meta: null, body: '' })
    } else if (event.action === 'tab.reorder' || event.action === 'tab.move' || event.action === 'tab.transfer') {
      promoteTab(event.tabId) // dragging a tab makes it permanent
    }
  }

  async function loadDocIntoCurrent(tab) {
    await flushSave()
    if (tab.dkind === 'chapter') {
      const { meta, body } = await service.loadDocument(Project.dir, tab.file)
      // Prefer the live shared-doc text if this chapter is already open elsewhere.
      const live = docSync.docString(tab.file)
      SetCurrentDoc({ kind: 'chapter', id: tab.docId, file: tab.file, meta, body: live ?? body })
    } else if (tab.dkind === 'entity' || tab.dkind === 'group') {
      const entity = Cards().find((e) => e.meta.id === tab.docId)
      if (entity) SetCurrentDoc({ kind: entity.meta.type === 'group' ? 'group' : 'entity', id: entity.meta.id, file: entity.file, root: entity.root, meta: entity.meta, body: entity.body })
    } else if (tab.dkind === 'bank') {
      const bank = Banks().find((b) => b.file === tab.file)
      if (bank) SetCurrentDoc({ kind: 'bank', id: bank.file, file: bank.file, meta: { name: bank.name }, body: bank.entries.join('\n') })
    } else if (tab.dkind === 'timeline') {
      SetCurrentDoc({ kind: 'timeline', id: '__timeline__', file: null, meta: null, body: '' })
    } else if (tab.dkind === 'graph') {
      SetCurrentDoc({ kind: 'graph', id: '__graph__', file: null, meta: null, body: '' })
    } else if (tab.dkind === 'book') {
      SetCurrentDoc({ kind: 'book', id: tab.docId, file: null, root: null, meta: null, body: '' })
    } else if (tab.dkind === 'scraps') {
      SetCurrentDoc({ kind: 'scraps', id: '__scraps__', file: null, root: null, meta: null, body: '' })
    } else if (tab.dkind === 'arc') {
      SetCurrentDoc({ kind: 'arc', id: tab.docId, file: null, root: null, meta: null, body: '' })
    } else if (tab.dkind === 'diff') {
      SetCurrentDoc({ kind: 'diff', id: tab.docId, file: null, root: null, meta: { ...(tab.params || {}) }, body: '' })
    }
  }

  // --- projects ---
  function NewProject() {
    return run(async () => {
      const dir = await pickFolder('Choose an empty folder for the new project')
      if (!dir) return
      if (Project.dir) await FlushEverything()
      const { manifest } = await service.createProject(dir, { name: projectNameFromDir(dir) })
      SetProject({ dir, manifest })
      recordRecent(dir)
      SetCurrentDoc({ kind: null, id: null, file: null, meta: null, body: '' })
      await AddChapter()
      await loadBibleAndIndex()
      await binder.loadBinder()
    })
  }

  function OpenProject() {
    return run(async () => {
      const dir = await pickFolder('Open a project folder')
      if (!dir) return
      await openProjectAt(dir)
    })
  }

  function OpenProjectPath(dir) {
    return run(() => openProjectAt(dir))
  }

  async function openProjectAt(dir) {
    // land the current project's pending edits before its files leave memory
    if (Project.dir) await FlushEverything()
    const { manifest } = await service.openProject(dir)
    SetProject({ dir, manifest })
    recordRecent(dir)
    await loadBibleAndIndex()
    await binder.loadBinder()
    await openFirstChapter(manifest)
  }

  async function openFirstChapter(manifest) {
    const first = manifest.tree.find((node) => node.kind === 'group')?.children?.[0]
    if (first) await OpenDocument(first)
  }

  // --- chapters ---
  const nextChapterNumber = () => {
    const nums = ChapterBodies().map((c) => c.number).filter((n) => n != null)
    return nums.length ? Math.max(...nums) + 1 : 1
  }
  // New chapters inherit the arc of the last chapter (not retroactively).
  const lastChapterArc = () => {
    const bodies = ChapterBodies()
    for (let i = bodies.length - 1; i >= 0; i -= 1) if (bodies[i].meta?.arc) return bodies[i].meta.arc
    return ''
  }
  const chapterNumberExists = (n) => n != null && ChapterBodies().some((c) => c.number === Number(n))

  // `arc` places the chapter in that arc; when omitted it inherits the last chapter's arc.
  async function AddChapter({ number, title = '', status = 'draft', open = true, arc: arcName } = {}) {
    if (!Project.dir) return
    const num = number != null && number !== '' ? Number(number) : nextChapterNumber()
    const id = format.generateId()
    const file = format.chapterFileName(title, id)
    const meta = { id, title, type: 'chapter', number: num, status }
    const arc = arcName !== undefined ? arcName : lastChapterArc()
    if (arc) meta.arc = arc
    await service.saveDocument(Project.dir, file, meta, '')

    const child = { id, kind: 'chapter', file, title }
    SetProject(
      'manifest',
      produce((manifest) => {
        manifest.tree.find((node) => node.kind === 'group')?.children.push(child)
      }),
    )
    await service.saveManifest(Project.dir, unwrap(Project.manifest))
    SetChapterBodies([...ChapterBodies(), { id, file, number: num, title, body: '', meta }])
    if (open) await OpenDocument(child, { preview: false })
    return child
  }

  // Declare that a chapter introduces an entity (author-set, written to the
  // chapter's `introduces` frontmatter). If the entity isn't in the prose yet
  // it shows up as "not yet seen" on the timeline.
  function AddIntroducesToChapter(chapterId, entityId) {
    const chapter = ChapterById(chapterId)
    const existing = chapter?.meta?.introduces || []
    if (!entityId || existing.includes(entityId)) return
    UpdateChapterMeta(chapterId, 'introduces', [...existing, entityId])
  }
  function RemoveIntroducesFromChapter(chapterId, entityId) {
    const chapter = ChapterById(chapterId)
    const existing = chapter?.meta?.introduces || []
    UpdateChapterMeta(chapterId, 'introduces', existing.filter((id) => id !== entityId))
  }

  function OpenDocument(child, options) {
    if (!Project.dir || !child) return
    const info = ChapterBodies().find((c) => c.id === child.id)
    const label = format.chapterLabel(info?.number ?? null, info?.meta?.title ?? child.title)
    openTabFor({ key: `ch:${child.id}`, dkind: 'chapter', docId: child.id, file: child.file, title: label }, options)
  }

  // Bulk-set an arc on several chapters at once (multi-select in the explorer).
  function SetArcForChapters(ids, arc) {
    for (const id of ids) UpdateChapterMeta(id, 'arc', arc)
  }

  // Delete chapters: remove their files, tabs, manifest entries, and index rows.
  async function DeleteChapters(ids) {
    if (!Project.dir || !ids.length) return
    const group = manuscriptGroup()
    const doomed = ids.map((id) => group?.children.find((c) => c.id === id)).filter(Boolean)
    // Forget them first: closing a tab flushes the open doc, and closing a chapter's
    // last view persists its text — either would write a deleted file back.
    for (const child of doomed) docSync.discardDoc(child.file)
    forgetDocs(ids)
    closeTabsWhere((tab) => ids.includes(tab.docId) && (tab.dkind === 'chapter' || tab.dkind === 'diff'))
    for (const child of doomed) await service.deleteChapter(Project.dir, child.file).catch(console.error)
    SetProject('manifest', produce((manifest) => {
      const g = manifest.tree.find((node) => node.kind === 'group')
      if (g) g.children = g.children.filter((c) => !ids.includes(c.id))
    }))
    await service.saveManifest(Project.dir, unwrap(Project.manifest))
    SetChapterBodies(ChapterBodies().filter((c) => !ids.includes(c.id)))
    rebuildIndex()
  }

  // A document is being deleted: if it's the open one, drop its pending autosave
  // and stop treating it as current (so nothing writes it back).
  function forgetDocs(ids) {
    if (!ids.includes(CurrentDoc.id)) return
    if (SaveTimer) clearTimeout(SaveTimer)
    SaveTimer = undefined
    SetCurrentDoc({ kind: null, id: null, file: null, root: null, meta: null, body: '' })
  }

  // Keep every open tab's label in sync when a chapter is renamed/renumbered.
  function syncTabName(docId, number, title) {
    if (!containerApi) return
    for (const tab of containerApi.Tabs()) {
      if (tab.key === `ch:${docId}`) containerApi.UpdateTab(tab.id, { Name: format.chapterLabel(number, title) })
    }
  }

  // --- shared chapter documents (Yjs; two views of a chapter stay in sync) ---
  // Acquire the shared Y.Doc for a chapter file, seeding it from disk and wiring
  // a debounced persist (write the .md + refresh the index). Reused across panes.
  function acquireChapterDoc(file, docId) {
    const info = ChapterBodies().find((c) => c.id === docId)
    const persist = (text) => {
      SetChapterBodies((cs) => cs.map((c) => (c.id === docId ? { ...c, body: text } : c)))
      const dir = Project.dir
      // `file` is the doc's own key, so it can't drift from what's on disk. A chapter
      // missing from memory is reported as a failed save, never skipped silently.
      if (dir) {
        trackSave(file, async () => {
          const chapter = ChapterBodies().find((c) => c.id === docId)
          if (!chapter) throw new Error(`Chapter ${docId} is not loaded — couldn't save ${file}`)
          await service.saveDocument(dir, file, chapter.meta, text)
        })
      }
      if (CurrentDoc.id === docId) SetCurrentDoc('body', text)
      rebuildIndex()
    }
    return docSync.acquireDoc(file, info?.body ?? '', persist)
  }
  const releaseChapterDoc = (file) => docSync.releaseDoc(file)

  // Typing in a chapter (via Yjs) promotes its preview tab to permanent.
  function PromoteDocTab(docId) {
    if (previewTabId == null || !containerApi) return
    const tab = containerApi.GetTab(previewTabId)
    if (tab && tab.docId === docId) promoteTab(previewTabId)
  }

  // --- entities / bible ---
  async function loadBibleAndIndex() {
    if (!Project.dir || !Project.manifest) return
    const cards = await service.loadEntities(Project.dir)
    const chapters = await service.loadChaptersForIndex(Project.dir, unwrap(Project.manifest))
    SetCards(cards)
    SetChapterBodies(chapters)
    SetBanks(await service.loadBanks(Project.dir))
    SetEntityIndex(mentions.buildIndex(chapters, cards.filter((c) => c.root === format.WORLD_DIR).map(entityRef)))
  }

  async function CreateBank(name = 'new-bank') {
    if (!Project.dir) return
    const bank = await service.createBank(Project.dir, name)
    SetBanks([...Banks(), bank])
    await OpenBank(bank, { preview: false })
  }

  async function ImportBank() {
    try {
      const selection = await open({ multiple: false, filters: [{ name: 'CSV / text', extensions: ['csv', 'txt'] }] })
      if (typeof selection !== 'string') return
      const bank = await service.importBankFromFile(Project.dir, selection)
      SetBanks([...Banks().filter((b) => b.file !== bank.file), bank])
      await OpenBank(bank, { preview: false })
    } catch (err) {
      console.error(err)
    }
  }

  function OpenBank(bank, options) {
    if (!bank) return
    openTabFor({ key: `bank:${bank.file}`, dkind: 'bank', docId: bank.file, file: bank.file, title: bank.name }, options)
  }

  function rebuildIndex() {
    SetEntityIndex(mentions.buildIndex(ChapterBodies(), Entities().map(entityRef)))
  }

  async function createEntityRecord(name, type, extraMeta = {}, root = format.WORLD_DIR) {
    const id = format.generateId()
    const file = cardTree.cardLeafName(name, id) // a leaf card at the top of its tree
    const meta = { id, name, type, aliases: [], status: 'new', ...extraMeta }
    if (type === 'group') {
      meta.members = []
      meta.attributes = [] // [{ key, mode: 'fixed'|'per-member', value? }]
      meta.relationships = [] // [{ from, to, label }]
    }
    await service.saveCard(Project.dir, root, file, meta, '')
    const entity = { root, file, meta, body: '', isContainer: false, parentId: null, childIds: [] }
    SetCards([...Cards(), entity])
    rebuildIndex()
    return entity
  }

  // Add a sub-page (a child document) to a card. Converts the parent from a leaf
  // file to a folder on the first child, then reloads the bible so the tree +
  // childIds are consistent, and opens the new page.
  async function AddSubPage(parentId, name = 'New page', type = 'Lore') {
    if (!Project.dir) return
    const parent = EntityById(parentId)
    if (!parent) return
    const childMeta = { id: format.generateId(), name, type, aliases: [], status: 'new' }
    await service.createSubCard(Project.dir, parent, childMeta, '')
    await reloadCards()
    const child = EntityById(childMeta.id)
    if (child) await OpenEntity(child, { preview: false })
  }

  async function CreateEntity(name = 'New character', type = 'Character') {
    if (!Project.dir) return
    await OpenEntity(await createEntityRecord(name, type), { preview: false })
  }

  // "Character creator": spin up a member of the current group, populating its
  // per-member attributes from matching data banks and its name from surname /
  // given-name banks (or the group's fixed Surname). Adds it as a member.
  async function GenerateMember() {
    if (!Project.dir || CurrentDoc.kind !== 'group') return
    const groupMeta = CurrentDoc.meta
    const banks = Banks()
    const roll = (bank) => bank.entries[Math.floor(Math.random() * bank.entries.length)]
    const pick = (names) => {
      const bank = banks.find((b) => names.includes(b.name.toLowerCase()) && b.entries.length)
      return bank ? roll(bank) : null
    }
    const surnameAttr = (groupMeta.attributes || []).find((a) => a.mode === 'fixed' && /surname/i.test(a.key))
    const surname = surnameAttr?.value || pick(['surnames', 'surname'])
    const given = pick(['given-names', 'given names', 'givennames', 'names', 'given'])
    const name = [surname, given].filter(Boolean).join(' ') || 'New member'

    const extraMeta = {}
    for (const attr of (groupMeta.attributes || []).filter((a) => a.mode !== 'fixed' && a.key)) {
      const bank = banks.find((b) => b.name.toLowerCase() === attr.key.toLowerCase() && b.entries.length)
      if (bank) extraMeta[attr.key] = roll(bank)
    }

    const entity = await createEntityRecord(name, 'Character', extraMeta)
    SetCurrentDoc('meta', 'members', [...(groupMeta.members || []), entity.meta.id])
    scheduleSave()
  }

  const Groups = () => Entities().filter((e) => e.meta.type === 'group')
  const EntityById = (id) => Cards().find((e) => e.meta.id === id)

  // A collection's effective members = explicitly-listed ids PLUS every entity
  // that matches the collection's attribute rule. So "Red Demons" can be defined
  // as `Race = Red Demon` and any entity with that attribute joins automatically —
  // membership is derived from a parent attribute, not hand-maintained.
  const MembersOf = (groupMeta) => {
    const set = new Set(groupMeta?.members || [])
    const rule = groupMeta?.memberRule
    if (rule?.key && rule?.value != null && rule?.value !== '') {
      const value = String(rule.value).toLowerCase()
      for (const entity of Entities()) {
        if (entity.meta.id === groupMeta.id) continue
        if (String(entity.meta[rule.key] ?? '').toLowerCase() === value) set.add(entity.meta.id)
      }
    }
    return [...set]
  }

  // Create an entity and put it in a collection: if the collection is rule-based,
  // stamp the rule's attribute onto the new entity so it joins automatically;
  // otherwise add it to the explicit member list.
  async function CreateEntityInCollection(name, type, collectionId) {
    if (!Project.dir) return
    const collection = collectionId ? EntityById(collectionId) : null
    const rule = collection?.meta?.memberRule
    const extraMeta = {}
    if (rule?.key && rule?.value != null && rule?.value !== '') extraMeta[rule.key] = rule.value
    const entity = await createEntityRecord(name || 'New entity', type || 'Character', extraMeta)
    if (collection && !(rule?.key)) {
      const members = [...(collection.meta.members || []), entity.meta.id]
      const meta = { ...collection.meta, members }
      await trackSave(`${collection.root}/${collection.file}`, () => service.saveCard(Project.dir, collection.root, collection.file, meta, collection.body))
      SetCards((list) => list.map((e) => (e.meta.id === collection.meta.id ? { ...e, meta } : e)))
      if (CurrentDoc.id === collectionId) SetCurrentDoc('meta', 'members', members)
    }
    await OpenEntity(entity, { preview: false })
  }

  function OpenEntity(entity, options) {
    if (!entity) return
    openTabFor({
      key: `e:${entity.meta.id}`,
      dkind: entity.meta.type === 'group' ? 'group' : 'entity',
      docId: entity.meta.id,
      file: entity.file,
      title: entity.meta.name,
    }, options)
  }

  function OpenEntityById(id, options) {
    const entity = EntityById(id)
    if (entity) return OpenEntity(entity, options)
  }

  // Register a phrase as an alias of a card, so it links wherever it appears
  // (the editor's "Assign to card…" action).
  async function AddAliasToEntity(id, form) {
    const entity = EntityById(id)
    const clean = String(form || '').trim()
    if (!entity || !Project.dir || !clean) return
    const aliases = entity.meta.aliases || []
    const already = entity.meta.name === clean || aliases.some((a) => (typeof a === 'object' ? a.form : a) === clean)
    if (already) return
    const meta = { ...entity.meta, aliases: [...aliases, clean] }
    await trackSave(`${entity.root}/${entity.file}`, () => service.saveCard(Project.dir, entity.root, entity.file, meta, entity.body))
    SetCards(Cards().map((e) => (e.meta.id === entity.meta.id ? { ...e, meta } : e)))
    if (CurrentDoc.id === id) SetCurrentDoc('meta', 'aliases', meta.aliases)
    rebuildIndex()
  }

  // Persist which card a shared name resolves to within a chapter (the
  // ambiguity picker). Lives in that chapter's frontmatter `resolve` map.
  function ResolveMention(chapterId, form, cardId) {
    const chapter = ChapterById(chapterId)
    const existing = chapter?.meta?.resolve || {}
    UpdateChapterMeta(chapterId, 'resolve', { ...existing, [String(form).toLowerCase()]: cardId })
  }

  // Compact card data for the editor's hover preview.
  const PreviewFor = (id) => {
    const entity = EntityById(id)
    if (!entity) return null
    const hits = EntityIndex().byEntity[id] || []
    const total = hits.reduce((sum, hit) => sum + hit.count, 0)
    const first = EntityIndex().firstSeen[id]
    const bits = []
    if (entity.meta.role) bits.push(entity.meta.role)
    if (first != null) bits.push(`intro Ch.${first}`)
    if (total) bits.push(`${total} mention${total === 1 ? '' : 's'}`)
    return { name: entity.meta.name, type: entity.meta.type, subtitle: bits.join(' · ') }
  }

  // --- entity media gallery ---
  async function AddEntityMedia() {
    if (!Project.dir || !(CurrentDoc.kind === 'entity' || CurrentDoc.kind === 'group')) return
    const selection = await open({ multiple: true, filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] }] })
    const paths = Array.isArray(selection) ? selection : selection ? [selection] : []
    const added = []
    for (const path of paths) added.push(await service.addEntityMedia(Project.dir, CurrentDoc.id, path))
    if (!added.length) return
    const media = [...(CurrentDoc.meta?.media || []), ...added]
    UpdateMeta('media', media)
    if (!CurrentDoc.meta?.portrait) UpdateMeta('portrait', media[0].file)
  }
  function RemoveEntityMedia(file) {
    const media = (CurrentDoc.meta?.media || []).filter((m) => m.file !== file)
    UpdateMeta('media', media)
    if (CurrentDoc.meta?.portrait === file) UpdateMeta('portrait', media[0]?.file || null)
    service.removeEntityMedia(Project.dir, CurrentDoc.id, file).catch(console.error)
  }
  const SetPortrait = (file) => UpdateMeta('portrait', file)
  const EntityMediaUrl = (file) => service.entityMediaUrl(Project.dir, CurrentDoc.id, file)

  // Entities appearing in the current chapter (from its body), plus entities
  // named only in the chapter's plan (summary/objective) → tagged "unused".
  // Works on ANY chapter object { body, meta } — so the dock can show one chapter
  // while a different one is open in the editor.
  const CastForChapter = (chapter) => {
    if (!chapter) return []
    const body = chapter.body || ''
    const planText = `${chapter.meta?.summary || ''}\n${chapter.meta?.objective || ''}`
    const index = EntityIndex()
    const cast = []
    for (const entity of Entities()) {
      const ref = entityRef(entity)
      const inBody = mentions.countMentions(ref, body)
      const inPlan = mentions.isMentioned(ref, planText)
      if (inBody === 0 && !inPlan) continue
      const hits = index.byEntity[entity.meta.id] || []
      cast.push({
        id: entity.meta.id,
        name: entity.meta.name,
        type: entity.meta.type,
        count: inBody,
        unused: inBody === 0 && inPlan,
        intro: index.firstSeen[entity.meta.id] ?? null,
        lastSeen: hits.length ? hits[hits.length - 1].number : null,
      })
    }
    cast.sort((a, b) => b.count - a.count)
    return cast
  }
  const CastInChapter = () => (CurrentDoc.kind === 'chapter' ? CastForChapter(CurrentDoc) : [])

  const ChapterById = (id) => ChapterBodies().find((c) => c.id === id) || null

  // Edit a chapter's frontmatter whether or not it's the open document (the dock
  // can plan a chapter that isn't in the editor). Saves that chapter's own file.
  const chapterSaveTimers = new Map()
  function saveChapterNow(id) {
    const chapter = ChapterBodies().find((c) => c.id === id)
    const dir = Project.dir
    if (chapter && dir) trackSave(chapter.file, () => service.saveDocument(dir, chapter.file, chapter.meta, chapter.body))
  }
  function scheduleChapterSave(id) {
    if (chapterSaveTimers.has(id)) clearTimeout(chapterSaveTimers.get(id))
    chapterSaveTimers.set(id, setTimeout(() => {
      chapterSaveTimers.delete(id)
      saveChapterNow(id)
    }, AUTOSAVE_DELAY_MS))
  }
  function UpdateChapterMeta(id, key, value) {
    if (id === CurrentDoc.id && CurrentDoc.kind === 'chapter') {
      UpdateMeta(key, value) // the open doc — normal path (live tab/index sync)
      return
    }
    const chapter = ChapterBodies().find((c) => c.id === id)
    if (!chapter) return
    const meta = { ...chapter.meta, [key]: value }
    SetChapterBodies(
      ChapterBodies().map((c) => (c.id === id ? { ...c, meta, title: key === 'title' ? value : c.title, number: key === 'number' ? value ?? null : c.number } : c)),
    )
    if (key === 'title' || key === 'number') syncTabName(id, meta.number ?? null, meta.title)
    scheduleChapterSave(id)
  }

  // Manuscript chapters grouped into contiguous arc bands. Arc membership lives
  // in each chapter's frontmatter (`arc`), so it survives a lost manifest; the
  // band order + ranges are derived from chapter order. A band with arc === null
  // is a run of unsorted chapters.
  const ArcBands = () => {
    const infoById = new Map(ChapterBodies().map((c) => [c.id, c]))
    const bands = []
    for (const child of Chapters()) {
      const info = infoById.get(child.id)
      const arc = info?.meta?.arc || null
      const entry = { id: child.id, title: info?.meta?.title ?? info?.title ?? child.title, file: child.file, number: info?.number ?? null }
      const last = bands[bands.length - 1]
      if (last && last.arc === arc) last.chapters.push(entry)
      else bands.push({ arc, chapters: [entry] })
    }
    for (const band of bands) {
      const nums = band.chapters.map((c) => c.number).filter((n) => n != null)
      band.from = nums.length ? Math.min(...nums) : null
      band.to = nums.length ? Math.max(...nums) : null
    }
    return bands
  }

  const MentionsFor = (id) => EntityIndex().byEntity[id] || []

  // Distinct spellings of an entity found in the manuscript (the consistency
  // checker): more than one form is drift the author may unify as aliases.
  const SurfaceForms = (id) => {
    const entity = EntityById(id)
    return entity ? mentions.surfaceForms(entityRef(entity), ChapterBodies()) : []
  }

  function snippet(text, at, len) {
    const start = Math.max(0, at - 24)
    const end = Math.min(text.length, at + len + 34)
    return (start > 0 ? '…' : '') + text.slice(start, end).replace(/\s+/g, ' ').trim() + (end < text.length ? '…' : '')
  }

  // Project-wide search: name/title hits first ("direct"), then content hits.
  const SearchProject = (query) => {
    const q = String(query || '').trim().toLowerCase()
    if (!q) return { direct: [], content: [] }
    const direct = []
    const content = []

    for (const child of Chapters()) {
      if ((child.title || '').toLowerCase().includes(q)) {
        direct.push({ kind: 'Chapter', label: child.title, sub: '', open: () => OpenDocument(child) })
      }
    }
    for (const c of ChapterBodies()) {
      const at = (c.body || '').toLowerCase().indexOf(q)
      if (at >= 0) {
        const child = manuscriptGroup()?.children.find((ch) => ch.id === c.id)
        if (child) content.push({ kind: 'Ch', label: c.title, sub: snippet(c.body, at, q.length), open: () => OpenDocument(child) })
      }
    }
    for (const e of Entities()) {
      const names = [e.meta.name, ...(e.meta.aliases || [])].join(' ').toLowerCase()
      if (names.includes(q)) direct.push({ kind: e.meta.type || 'Entity', label: e.meta.name, sub: '', open: () => OpenEntity(e) })
      else {
        const at = (e.body || '').toLowerCase().indexOf(q)
        if (at >= 0) content.push({ kind: e.meta.type || 'Entity', label: e.meta.name, sub: snippet(e.body, at, q.length), open: () => OpenEntity(e) })
      }
    }
    for (const b of Banks()) {
      if (b.name.toLowerCase().includes(q)) direct.push({ kind: 'Bank', label: b.name, sub: '', open: () => OpenBank(b) })
    }
    return { direct: direct.slice(0, 8), content: content.slice(0, 8) }
  }

  function OpenChapterById(id, options) {
    const child = manuscriptGroup()?.children.find((candidate) => candidate.id === id)
    if (child) return OpenDocument(child, options)
  }

  // --- timeline / plotline ---
  function OpenTimeline(options) {
    openTabFor({ key: 'timeline', dkind: 'timeline', docId: '__timeline__', file: null, title: 'Outline' }, options)
  }

  // The whole-bible connection graph (every entity + its relationships).
  function OpenGraph(options) {
    openTabFor({ key: 'graph', dkind: 'graph', docId: '__graph__', file: null, title: 'Relationships' }, options)
  }

  // Chapter spine for the timeline: order + status + the whole plan + word count,
  // and the entities each chapter introduces. Introduces is the union of the
  // derived first-seen entities and the author-declared `introduces` list, split
  // into `introduces` (actually mentioned in the prose = "seen") and `unseen`
  // (declared but not yet written).
  const TimelineChapters = () => {
    const index = EntityIndex()
    const mentionedIn = (entityId, chapterId) => (index.byEntity[entityId] || []).some((h) => h.chapterId === chapterId)
    const bySort = (a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name)
    return ChapterBodies().map((chapter) => {
      const matched = format.stripGeneratorMarkers(chapter.body || '').trim().match(/\S+/g)
      const info = (e) => ({ id: e.meta.id, name: e.meta.name, type: e.meta.type || 'Other' })
      const seen = new Map()
      for (const e of Entities()) {
        if (chapter.number != null && index.firstSeen[e.meta.id] === chapter.number) seen.set(e.meta.id, info(e))
      }
      const unseen = []
      for (const id of chapter.meta?.introduces || []) {
        const e = EntityById(id)
        if (!e) continue
        if (mentionedIn(id, chapter.id)) seen.set(id, info(e))
        else if (!seen.has(id)) unseen.push(info(e))
      }
      return {
        id: chapter.id,
        number: chapter.number,
        title: chapter.title,
        status: chapter.meta?.status || 'draft',
        summary: chapter.meta?.summary || '',
        objective: chapter.meta?.objective || '',
        topics: chapter.meta?.topics || [],
        pov: chapter.meta?.pov || '',
        arc: chapter.meta?.arc || null,
        timeline: chapter.meta?.timeline || '',
        words: matched ? matched.length : 0,
        introduces: [...seen.values()].sort(bySort),
        unseen: unseen.sort(bySort),
      }
    })
  }

  // --- editing / autosave ---
  function UpdateBody(text) {
    SetCurrentDoc('body', text)
    promoteCurrentTab() // typing makes a preview tab permanent
    scheduleSave()
  }

  function UpdateMeta(key, value) {
    if (!CurrentDoc.meta) return
    SetCurrentDoc('meta', key, value)
    // Renaming/renumbering a chapter reflects live in the explorer + open tab.
    if (CurrentDoc.kind === 'chapter' && (key === 'title' || key === 'number')) {
      const meta = unwrap(CurrentDoc.meta)
      SetChapterBodies(ChapterBodies().map((c) => (c.id === CurrentDoc.id ? { ...c, title: meta.title, number: meta.number ?? null, meta } : c)))
      syncTabName(CurrentDoc.id, meta.number ?? null, meta.title)
    }
    promoteCurrentTab() // editing the plan makes a preview tab permanent
    scheduleSave()
  }

  function scheduleSave() {
    if (SaveTimer) clearTimeout(SaveTimer)
    SaveTimer = setTimeout(flushSave, AUTOSAVE_DELAY_MS)
  }

  async function flushSave() {
    if (SaveTimer) {
      clearTimeout(SaveTimer)
      SaveTimer = undefined
    }
    if (!Project.dir || !CurrentDoc.file || !CurrentDoc.meta) return
    const dir = Project.dir, file = CurrentDoc.file, kind = CurrentDoc.kind, id = CurrentDoc.id, root = CurrentDoc.root || format.WORLD_DIR
    const meta = unwrap(CurrentDoc.meta)
    const body = CurrentDoc.body
    if (kind === 'bank') {
      if (await trackSave(file, () => service.saveBankRaw(dir, file, body))) {
        SetBanks(Banks().map((b) => (b.file === file ? { ...b, entries: format.bankEntries(body) } : b)))
      }
      return
    }
    if (kind === 'entity' || kind === 'group') {
      if (await trackSave(`${root}/${file}`, () => service.saveCard(dir, root, file, meta, body))) {
        SetCards(Cards().map((e) => (e.meta.id === id ? { ...e, meta, body } : e)))
      }
    } else {
      // The prose body lives in the shared Y.Doc — use its live text so a meta
      // save (from the dock) never clobbers unsaved edits with a stale body.
      const liveBody = docSync.docString(file) ?? body
      if (await trackSave(file, () => service.saveDocument(dir, file, meta, liveBody))) {
        SetChapterBodies(
          ChapterBodies().map((c) =>
            c.id === id ? { ...c, title: meta.title, number: meta.number ?? null, body: liveBody, meta } : c,
          ),
        )
      }
    }
    rebuildIndex()
  }

  // --- export (offline, native Markdown/text) ---
  async function ExportBook({ profile = 'web-serial', scope = 'book', includeChapterHeadings = true } = {}) {
    if (!Project.dir) return null
    docSync.flushAll() // land any pending Yjs edits into ChapterBodies first
    await flushSave() // make sure the chapter you're editing is on disk / in the index
    let chapters
    if (scope === 'chapter' && CurrentDoc.kind === 'chapter') {
      chapters = [{ number: CurrentDoc.meta?.number ?? null, title: CurrentDoc.meta?.title || 'Chapter', body: CurrentDoc.body }]
    } else {
      chapters = ChapterBodies().map((c) => ({ number: c.number, title: c.title, body: c.body }))
    }
    const slug = (text) => String(text || '').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') || 'export'
    const stem = scope === 'chapter' ? `${slug(Project.manifest?.name)}-${slug(CurrentDoc.meta?.title)}` : slug(Project.manifest?.name)

    if (bookExport.isPandocProfile(profile)) {
      const markdown = bookExport.buildExport(chapters, { profile: 'markdown', includeChapterHeadings })
      const ext = bookExport.exportExtension(profile)
      return service.exportViaPandoc(Project.dir, markdown, `${stem}-${profile}`, `${stem}-${profile}.${ext}`, bookExport.EXPORT_PROFILES[profile].pandocTo)
    }

    const content = bookExport.buildExport(chapters, { profile, includeChapterHeadings })
    const filename = `${stem}-${profile}.${bookExport.exportExtension(profile)}`
    return service.exportBook(Project.dir, filename, content)
  }

  // Typeset preview — the current chapter (or book) rendered via Pandoc → HTML.
  async function RenderPreview({ scope = 'chapter' } = {}) {
    if (!Project.dir) return ''
    docSync.flushAll()
    await flushSave()
    let chapters
    if (scope === 'chapter' && CurrentDoc.kind === 'chapter') {
      chapters = [{ number: CurrentDoc.meta?.number ?? null, title: CurrentDoc.meta?.title || 'Chapter', body: CurrentDoc.body }]
    } else {
      chapters = ChapterBodies().map((c) => ({ number: c.number, title: c.title, body: c.body }))
    }
    const markdown = bookExport.buildExport(chapters, { profile: 'markdown', includeChapterHeadings: true })
    return service.renderMarkdownToHtml(Project.dir, markdown)
  }

  // --- import wizard ---
  function BeginImport() {
    SetImportFiles([])
    SetImporting(true)
  }
  function CancelImport() {
    SetImporting(false)
    SetImportFiles([])
  }
  async function PickImportFiles() {
    try {
      const selection = await open({ multiple: true, filters: [{ name: 'Text', extensions: ['txt', 'md'] }] })
      const paths = Array.isArray(selection) ? selection : selection ? [selection] : []
      await addImportPaths(paths)
    } catch (err) {
      console.error(err)
    }
  }
  async function PickImportFolder() {
    try {
      const dir = await open({ directory: true })
      if (typeof dir !== 'string') return
      await addImportPaths(await service.listTextFiles(dir))
    } catch (err) {
      console.error(err)
    }
  }
  async function addImportPaths(paths) {
    if (!paths.length) return
    const known = new Set(ImportFiles().map((file) => file.path))
    const loaded = []
    for (const path of paths) {
      if (!known.has(path)) loaded.push(await service.readSourceFile(path))
    }
    const merged = [...ImportFiles(), ...loaded].sort((a, b) => {
      const an = a.number ?? Number.POSITIVE_INFINITY
      const bn = b.number ?? Number.POSITIVE_INFINITY
      return an !== bn ? an - bn : a.name.localeCompare(b.name)
    })
    SetImportFiles(merged)
  }
  function RemoveImportFile(path) {
    SetImportFiles(ImportFiles().filter((file) => file.path !== path))
  }
  function CommitImport(chapters) {
    return run(async () => {
      const target = await pickFolder('Choose an empty folder for the imported project')
      if (!target) return
      const { manifest } = await service.writeImportedProject(target, chapters, {
        name: projectNameFromDir(target),
      })
      SetProject({ dir: target, manifest })
      recordRecent(target)
      SetImporting(false)
      SetImportFiles([])
      await loadBibleAndIndex()
      await binder.loadBinder()
      await openFirstChapter(manifest)
    })
  }

  // --- binder plumbing ---
  // Reload every page tree. An open page that moved (or became a folder) keeps
  // saving to its new path.
  async function reloadCards() {
    if (!Project.dir) return
    const cards = await service.loadEntities(Project.dir)
    SetCards(cards)
    if (CurrentDoc.kind === 'entity' || CurrentDoc.kind === 'group') {
      const fresh = cards.find((c) => c.meta.id === CurrentDoc.id)
      if (fresh && (fresh.file !== CurrentDoc.file || fresh.root !== CurrentDoc.root)) {
        SetCurrentDoc('file', fresh.file)
        SetCurrentDoc('root', fresh.root)
      }
    }
    if (containerApi) {
      for (const tab of containerApi.Tabs()) {
        const card = (tab.dkind === 'entity' || tab.dkind === 'group') && cards.find((c) => c.meta.id === tab.docId)
        if (card && card.file !== tab.file) containerApi.UpdateTab(tab.id, { file: card.file })
      }
    }
    rebuildIndex()
  }
  function closeTabsWhere(predicate) {
    if (!containerApi) return
    for (const tab of containerApi.Tabs()) if (predicate(tab)) containerApi.RemoveTab(tab.id)
  }
  function retitleTabs(key, title, patch = {}) {
    if (!containerApi) return
    for (const tab of containerApi.Tabs()) if (tab.key === key) containerApi.UpdateTab(tab.id, { Name: title, ...patch })
  }
  // Replace a chapter's whole text (restoring a draft). Open views update live.
  function ReplaceChapterBody(id, text) {
    const chapter = ChapterById(id)
    if (!chapter) return
    if (docSync.replaceText(chapter.file, text)) return // the shared doc saves itself
    SetChapterBodies(ChapterBodies().map((c) => (c.id === id ? { ...c, body: text } : c)))
    const dir = Project.dir
    trackSave(chapter.file, () => service.saveDocument(dir, chapter.file, chapter.meta, text))
    rebuildIndex()
  }
  const binder = createBinderApi({
    Project, trackSave, openTabFor, closeTabsWhere, retitleTabs, flushSave, forgetDocs, CurrentDoc,
    ChapterBodies, ChapterById, UpdateChapterMeta, ReplaceChapterBody, ArcBands,
    Cards, SetCards, reloadCards, OpenEntityById, UpdateMeta, Banks, MembersOf, OpenChapterById,
  })

  const projectApi = {
    ...binder,
    Cards,
    WorldDir: format.WORLD_DIR,
    Project,
    CurrentDoc,
    Status,
    Notice,
    RetrySaves,
    FlushEverything,
    Busy,
    HasProject,
    Chapters,
    Entities,
    EntityIndex,
    LeftView,
    SetLeftView,
    NewProject,
    OpenProject,
    OpenProjectPath,
    RecentProjects,
    AddChapter,
    nextChapterNumber,
    chapterNumberExists,
    SetArcForChapters,
    DeleteChapters,
    OpenDocument,
    CreateEntity,
    CreateEntityInCollection,
    AddSubPage,
    GenerateMember,
    Groups,
    MembersOf,
    OpenGraph,
    EntityById,
    OpenEntity,
    OpenEntityById,
    OpenChapterById,
    AddAliasToEntity,
    ResolveMention,
    PreviewFor,
    AddEntityMedia,
    RemoveEntityMedia,
    SetPortrait,
    EntityMediaUrl,
    CastInChapter,
    CastForChapter,
    ChapterById,
    UpdateChapterMeta,
    ArcBands,
    MentionsFor,
    SurfaceForms,
    SearchProject,
    OpenTimeline,
    TimelineChapters,
    AddIntroducesToChapter,
    RemoveIntroducesFromChapter,
    Banks,
    CreateBank,
    ImportBank,
    OpenBank,
    UpdateBody,
    UpdateMeta,
    acquireChapterDoc,
    releaseChapterDoc,
    PromoteDocTab,
    ExportBook,
    RenderPreview,
    SaveNow: flushSave,
    SetContainerApi,
    HandleContainerChange,
    Importing,
    ImportFiles,
    BeginImport,
    CancelImport,
    PickImportFiles,
    PickImportFolder,
    RemoveImportFile,
    CommitImport,
  }

  return <ProjectContext.Provider value={projectApi}>{props.children}</ProjectContext.Provider>
}

export function useProject() {
  return useContext(ProjectContext)
}
