import { For, Show, Switch, Match, createSignal, createEffect, onMount, onCleanup } from 'solid-js'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { SplitContainer, useTab } from '@curruptnation/split-container'
import '@curruptnation/split-container/styles.css'
import { useProject } from '../project/ProjectContext.jsx'
import Editor from './Editor.jsx'
import EntityPage from './EntityPage.jsx'
import GroupPage from './GroupPage.jsx'
import CastBrowser from './CastBrowser.jsx'
import BanksBrowser from './BanksBrowser.jsx'
import BankPage from './BankPage.jsx'
import TimelineView from './TimelineView.jsx'
import RelationshipGraph from './RelationshipGraph.jsx'
import BibleTree from './BibleTree.jsx'
import ImportWizard from './ImportWizard.jsx'
import { avatarColor, avatarInitial } from './avatar.js'
import { stripGeneratorMarkers, chapterLabel } from '../project/format.js'
import { EXPORT_PROFILES } from '../project/bookExport.js'
import {
  FilesIcon, SearchIcon, UsersIcon, TimelineIcon, DatabaseIcon,
  SparkleIcon, SettingsIcon, BookIcon, PageIcon, ScrollIcon,
  ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, CircleIcon, CheckCircleIcon,
  PlusIcon, MinusIcon, PanelRightIcon, LockIcon, OpenIcon, GraphIcon,
} from './icons.jsx'

const appWindow = getCurrentWindow()
const APP_VERSION = 'v0.1.0'

export default function Shell() {
  const {
    Project, CurrentDoc, Status, Notice, RetrySaves, FlushEverything, Busy, HasProject, Chapters, Entities, Banks,
    LeftView, SetLeftView, NewProject, OpenProject, OpenProjectPath, RecentProjects, BeginImport, Importing,
    AddChapter, nextChapterNumber, chapterNumberExists, OpenDocument, OpenChapterById, OpenEntity, OpenEntityById, EntityById, Groups, MembersOf, MentionsFor, OpenTimeline, OpenGraph,
    CastInChapter, CastForChapter, ChapterById, UpdateChapterMeta, SetArcForChapters, DeleteChapters, ArcBands, SearchProject, UpdateBody, UpdateMeta, TimelineChapters, CreateEntity, CreateEntityInCollection,
    AddAliasToEntity, ResolveMention, PreviewFor,
    acquireChapterDoc, releaseChapterDoc, PromoteDocTab,
    ExportBook, RenderPreview, SetContainerApi, HandleContainerChange,
  } = useProject()

  // Renderers for the split-container tabs (the middle section).
  function DocTabButton() {
    const { Tab } = useTab()
    return <span classList={{ 'tab-preview': Tab.preview }}>{Tab.Name || 'Untitled'}</span>
  }

  // A chapter editor bound to its file's SHARED Y.Doc — two views of the same
  // chapter (via double-click) acquire the same doc and stay in sync.
  function ChapterView(props) {
    const [Handle, SetHandle] = createSignal(null)
    onMount(() => SetHandle(acquireChapterDoc(props.file, props.docId)))
    onCleanup(() => releaseChapterDoc(props.file))
    const info = () => ChapterById(props.docId)
    return (
      <Show when={Handle()}>
        <Editor
          ydoc={Handle().ydoc}
          awareness={Handle().awareness}
          onEdit={() => PromoteDocTab(props.docId)}
          pageView={PageView()}
          pageWidth={PageWidth()}
          banks={Banks}
          title={info()?.meta?.title ?? info()?.title}
          chapterNumber={info()?.number}
          entities={Entities}
          onOpenEntity={OpenEntityById}
          onSaveAs={(type, text) => CreateEntity(text, type)}
          onAssign={(text) => openAssign(text)}
          onLookup={(text) => { SetSearchQuery(text); SetSearchFocus(true) }}
          resolveMap={info()?.meta?.resolve || {}}
          onResolveMention={(form, id) => ResolveMention(props.docId, form, id)}
          previewFor={PreviewFor}
        />
      </Show>
    )
  }

  // Rendered once PER TAB (each tab's own Panel), so panes are independent.
  function DocPanel() {
    const { Tab } = useTab()
    return (
      <Switch>
        <Match when={Tab.dkind === 'chapter'}>
          <Show when={Tab.docId} keyed>
            {(docId) => <ChapterView file={Tab.file} docId={docId} />}
          </Show>
        </Match>
        <Match when={Tab.dkind !== 'chapter'}>
          <Show when={CurrentDoc.id} keyed>
            {() => (
              <Switch>
                <Match when={CurrentDoc.kind === 'entity'}><EntityPage /></Match>
                <Match when={CurrentDoc.kind === 'group'}><GroupPage /></Match>
                <Match when={CurrentDoc.kind === 'bank'}><BankPage /></Match>
                <Match when={CurrentDoc.kind === 'timeline'}><TimelineView /></Match>
                <Match when={CurrentDoc.kind === 'graph'}><RelationshipGraph /></Match>
              </Switch>
            )}
          </Show>
        </Match>
      </Switch>
    )
  }
  function handleContainerReady(api) {
    SetContainerApi(api)
    api.Register('doc', { Button: DocTabButton, Panel: DocPanel })
  }

  // 2. Signals
  const [Menu, SetMenu] = createSignal(null) // 'file' | 'view' | null
  const [RecentOpen, SetRecentOpen] = createSignal(false)
  const [ExportOpen, SetExportOpen] = createSignal(false)
  const [ExportProfile, SetExportProfile] = createSignal('web-serial')
  const [ExportScope, SetExportScope] = createSignal('book')
  const [ExportHeadings, SetExportHeadings] = createSignal(true)
  const [ExportResult, SetExportResult] = createSignal(null)
  const [ExportBusy, SetExportBusy] = createSignal(false)
  const [PreviewOpen, SetPreviewOpen] = createSignal(false)
  const [PreviewHtml, SetPreviewHtml] = createSignal('')
  const [PreviewError, SetPreviewError] = createSignal(null)
  const [NewChapterOpen, SetNewChapterOpen] = createSignal(false)
  const [NewChapterNumber, SetNewChapterNumber] = createSignal('')
  const [NewChapterTitle, SetNewChapterTitle] = createSignal('')
  const [AssignOpen, SetAssignOpen] = createSignal(false)
  const [AssignText, SetAssignText] = createSignal('')
  const [AssignQuery, SetAssignQuery] = createSignal('')
  const [NewEntityOpen, SetNewEntityOpen] = createSignal(false)
  const [NewEntityName, SetNewEntityName] = createSignal('')
  const [NewEntityType, SetNewEntityType] = createSignal('Character')
  const [NewEntityColl, SetNewEntityColl] = createSignal(null)
  const [TopicsOpen, SetTopicsOpen] = createSignal(true)
  const [ThemeName, SetThemeName] = createSignal('gray-dark')
  const [PageView, SetPageView] = createSignal(true)
  const [PageWidth, SetPageWidth] = createSignal(620)
  const [SearchQuery, SetSearchQuery] = createSignal('')
  const [SearchFocus, SetSearchFocus] = createSignal(false)
  const [SidebarOpen, SetSidebarOpen] = createSignal(true)
  const [DockOpen, SetDockOpen] = createSignal(true)
  const [InspectedId, SetInspectedId] = createSignal(null)
  const [DockPinnedId, SetDockPinnedId] = createSignal(null)
  const [SelectedIds, SetSelectedIds] = createSignal([])
  const [BulkArc, SetBulkArc] = createSignal('')
  const [ConfirmDeleteOpen, SetConfirmDeleteOpen] = createSignal(false)
  const [ArcModalOpen, SetArcModalOpen] = createSignal(false)
  const [CtxMenu, SetCtxMenu] = createSignal(null) // { x, y } for the chapter right-click menu
  let SelectAnchor = null // anchor for shift-range selection
  const [ArcOpenMap, SetArcOpenMap] = createSignal({})
  const [ManuscriptOpen, SetManuscriptOpen] = createSignal(true)
  const [BibleOpen, SetBibleOpen] = createSignal(true)
  const [CollOpen, SetCollOpen] = createSignal({})
  const [CastOpen, SetCastOpen] = createSignal(true)
  const [PlanOpen, SetPlanOpen] = createSignal(true)

  // apply initial theme
  document.documentElement.setAttribute('data-theme', ThemeName())

  // 3. onMount
  // Closing the window writes every pending edit first (chapter text otherwise waits
  // a few seconds after the last keystroke). If a write fails the window stays open
  // with the error in the status bar; closing a second time quits anyway.
  let CloseBlocked = false
  onMount(() => {
    const unlisten = appWindow.onCloseRequested(async (event) => {
      const saved = await FlushEverything()
      if (!saved && !CloseBlocked) {
        CloseBlocked = true
        event.preventDefault()
      }
    })
    onCleanup(() => { unlisten.then((stop) => stop()) })
  })

  // 4. Effects
  createEffect(() => {
    if (Status() !== 'error') CloseBlocked = false
  })
  // The inspector is a transient drill-in on one character; whenever the open
  // document changes, drop it so the dock reflects the chapter you're in.
  createEffect(() => {
    CurrentDoc.id
    SetInspectedId(null)
  })

  // 5. Handlers
  const handleMinimize = () => appWindow.minimize()
  const handleToggleMaximize = () => appWindow.toggleMaximize()
  const handleClose = () => appWindow.close()
  const handleTheme = (name) => {
    SetThemeName(name)
    document.documentElement.setAttribute('data-theme', name)
  }
  const toggleMenu = (name) => SetMenu((current) => (current === name ? null : name))
  const runMenu = (action) => { SetMenu(null); action() }
  const openNewChapter = () => { SetNewChapterNumber(String(nextChapterNumber())); SetNewChapterTitle(''); SetNewChapterOpen(true) }
  async function runNewChapter() {
    await AddChapter({ number: NewChapterNumber(), title: NewChapterTitle().trim() })
    SetNewChapterOpen(false)
  }
  const aliasForms = (entity) => (entity.meta.aliases || []).map((a) => (typeof a === 'object' ? a.form : a))
  const openAssign = (text) => { SetAssignText(text); SetAssignQuery(''); SetAssignOpen(true) }
  const assignMatches = () => {
    const q = AssignQuery().trim().toLowerCase()
    const list = Entities()
    if (!q) return list.slice(0, 24)
    return list.filter((e) => [e.meta.name, ...aliasForms(e)].join(' ').toLowerCase().includes(q)).slice(0, 24)
  }
  const assignToCard = (id) => { AddAliasToEntity(id, AssignText()); SetAssignOpen(false) }
  const createFromAssign = (type) => { CreateEntity(AssignText(), type); SetAssignOpen(false) }
  const entityTypes = () => Array.from(new Set(Entities().map((e) => e.meta.type).filter((t) => t && t !== 'group')))
  const openNewEntity = (collId = null) => { SetNewEntityColl(collId); SetNewEntityName(''); SetNewEntityType('Character'); SetNewEntityOpen(true) }
  async function runNewEntity() {
    await CreateEntityInCollection(NewEntityName().trim() || 'New entity', NewEntityType().trim() || 'Character', NewEntityColl())
    SetNewEntityOpen(false)
  }
  const openExport = () => { SetExportResult(null); SetExportOpen(true) }
  async function openPreview() {
    SetPreviewError(null)
    SetPreviewHtml('')
    SetPreviewOpen(true)
    try {
      SetPreviewHtml(await RenderPreview({ scope: isChapter() ? 'chapter' : 'book' }))
    } catch (err) {
      console.error(err)
      SetPreviewError(String(err?.message || err))
    }
  }
  async function runExport() {
    SetExportBusy(true)
    try {
      const path = await ExportBook({ profile: ExportProfile(), scope: ExportScope(), includeChapterHeadings: ExportHeadings() })
      SetExportResult(path ? { ok: true, path } : { ok: false })
    } catch (err) {
      console.error(err)
      SetExportResult({ ok: false, message: String(err?.message || err) })
    } finally {
      SetExportBusy(false)
    }
  }
  const adjustPageWidth = (delta) => SetPageWidth((w) => Math.min(920, Math.max(420, w + delta)))

  const isChapter = () => CurrentDoc.kind === 'chapter'

  // Activity-bar behavior: click a view's icon to open its panel; click the
  // active one again to collapse the sidebar.
  const selectView = (view) => {
    if (LeftView() === view && SidebarOpen()) SetSidebarOpen(false)
    else {
      SetLeftView(view)
      SetSidebarOpen(true)
    }
  }
  const bodyCols = () => {
    const side = SidebarOpen() ? '340px' : '0px'
    const dock = HasProject() ? (DockOpen() ? ' 300px' : ' 0px') : ''
    return `52px ${side} minmax(300px,1fr)${dock}`
  }

  // The dock plans/inspects the DISPLAYED chapter: the current one by default,
  // or a pinned one you deliberately stepped/picked to (which shows a lock).
  const displayedChapterId = () => DockPinnedId() ?? (isChapter() ? CurrentDoc.id : null)
  const displayedChapter = () => {
    const id = displayedChapterId()
    if (!id) return null
    if (id === CurrentDoc.id && isChapter()) return { id, meta: CurrentDoc.meta, body: CurrentDoc.body }
    return ChapterById(id)
  }
  const updatePlanMeta = (key, value) => {
    const id = displayedChapterId()
    if (id) UpdateChapterMeta(id, key, value)
  }
  const stepDock = (delta) => {
    const list = TimelineChapters()
    const idx = list.findIndex((c) => c.id === displayedChapterId()) + delta
    if (idx < 0 || idx >= list.length) return
    const targetId = list[idx].id
    SetDockPinnedId(targetId === CurrentDoc.id ? null : targetId)
  }
  const pickDock = (id) => SetDockPinnedId(id === CurrentDoc.id ? null : id)
  const openDisplayedChapter = () => { const id = displayedChapterId(); if (id) { OpenChapterById(id); SetDockPinnedId(null) } }

  const topics = () => displayedChapter()?.meta?.topics || []
  const addTopic = () => updatePlanMeta('topics', [...topics(), { title: 'New topic', note: '', done: false }])
  const updateTopic = (i, patch) => updatePlanMeta('topics', topics().map((t, idx) => (idx === i ? { ...t, ...patch } : t)))

  // Arcs start collapsed — open on demand.
  const arcOpen = (name) => ArcOpenMap()[name] === true
  const toggleArc = (name) => SetArcOpenMap((m) => ({ ...m, [name]: !m[name] }))
  // Story-bible collection tree: collections (groups) hold members; a member can
  // itself be a collection (a sect with sub-sects beneath it).
  const collOpen = (id) => CollOpen()[id] === true
  const toggleColl = (id) => SetCollOpen((m) => ({ ...m, [id]: !m[id] }))
  const groupMemberIds = () => new Set(Groups().flatMap((g) => MembersOf(g.meta)))
  const isMemberSomewhere = (id) => groupMemberIds().has(id)
  // Deterministic order so clicking/saving never reshuffles the tree: authored
  // `order` first (sub-pages), then name.
  const byOrderName = (a, b) => (a.meta.order ?? 1e9) - (b.meta.order ?? 1e9) || String(a.meta.name || '').localeCompare(String(b.meta.name || ''))
  const documentChildren = (entity) => (entity.childIds || []).map((id) => EntityById(id)).filter(Boolean).sort(byOrderName)
  const memberCards = (entity) => (entity.meta.type === 'group' ? MembersOf(entity.meta).map((id) => EntityById(id)).filter(Boolean).sort(byOrderName) : [])
  // A card's explorer children = its sub-pages (document children) plus, for a
  // collection, its members (rule/explicit). Deduped. Indent is computed from
  // depth (inline) so arbitrarily-deep nesting lines up.
  const childCardsOf = (entity) => {
    const seen = new Set()
    const out = []
    for (const card of [...documentChildren(entity), ...memberCards(entity)]) {
      if (card && !seen.has(card.meta.id)) { seen.add(card.meta.id); out.push(card) }
    }
    return out
  }
  const topLevelCards = () => Entities().filter((e) => !e.parentId && !isMemberSomewhere(e.meta.id)).sort(byOrderName)
  function BibleNode(props) {
    const ent = () => props.entity
    const isGroup = () => ent().meta.type === 'group'
    const kids = () => childCardsOf(ent())
    const hasKids = () => kids().length > 0
    // One operation per gesture: the ROW toggles expand for a container (or opens
    // a leaf, which has nothing to expand); an explicit Open button opens the card.
    const handleRow = () => (hasKids() ? toggleColl(ent().meta.id) : OpenEntity(ent()))
    return (
      <>
        <button class="node" classList={{ sel: CurrentDoc.id === ent().meta.id }} style={{ 'padding-left': `${10 + props.depth * 14}px` }}
          onClick={handleRow} onDblClick={() => OpenEntity(ent(), { smart: true })}>
          <span class="tw">
            <Show when={hasKids()}>{collOpen(ent().meta.id) ? <ChevronDownIcon size={15} /> : <ChevronRightIcon size={15} />}</Show>
          </span>
          <span class="lbl">{ent().meta.name}</span>
          <Show when={hasKids()}><span class="tag">{kids().length}</span></Show>
          <span class="node-actions">
            <Show when={hasKids()}>
              <button class="nodebtn" title="Open" onClick={(e) => { e.stopPropagation(); OpenEntity(ent()) }}><OpenIcon size={13} /></button>
            </Show>
            <Show when={isGroup()}>
              <button class="nodebtn" title="New member in this collection" onClick={(e) => { e.stopPropagation(); openNewEntity(ent().meta.id) }}><PlusIcon size={14} /></button>
            </Show>
          </span>
        </button>
        <Show when={hasKids() && collOpen(ent().meta.id) && props.depth < 8}>
          <For each={kids()}>{(m) => <BibleNode entity={m} depth={props.depth + 1} />}</For>
        </Show>
      </>
    )
  }
  // Multi-select: Ctrl/Cmd-click toggles, Shift-click selects a range, plain click opens.
  const isSelected = (id) => SelectedIds().includes(id)
  const toggleSelect = (id) => SetSelectedIds((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  const selectRange = (toId) => {
    const order = TimelineChapters().map((c) => c.id)
    const a = order.indexOf(SelectAnchor ?? toId)
    const b = order.indexOf(toId)
    if (a < 0 || b < 0) return
    const [lo, hi] = a < b ? [a, b] : [b, a]
    SetSelectedIds(order.slice(lo, hi + 1))
  }
  const handleChapterClick = (e, child) => {
    if (e.metaKey || e.ctrlKey) { SelectAnchor = child.id; toggleSelect(child.id); return }
    if (e.shiftKey && (SelectedIds().length || SelectAnchor)) { selectRange(child.id); return }
    SelectAnchor = child.id
    SetSelectedIds([])
    OpenDocument(child)
  }
  const openChapterMenu = (e, child) => {
    e.preventDefault()
    if (!isSelected(child.id)) { SelectAnchor = child.id; SetSelectedIds([child.id]) }
    SetCtxMenu({ x: e.clientX, y: e.clientY })
  }
  const applyArc = () => { SetArcForChapters(SelectedIds(), BulkArc().trim()); SetArcModalOpen(false) }
  async function runBulkDelete() {
    const ids = SelectedIds()
    SetConfirmDeleteOpen(false)
    SetSelectedIds([])
    await DeleteChapters(ids)
  }
  const chapterNode = (child, depth) => (
    <button class={`node depth${depth}`} classList={{ sel: isChapter() && CurrentDoc.id === child.id, selected: isSelected(child.id) }}
      onClick={(e) => handleChapterClick(e, child)} onDblClick={() => OpenDocument(child, { smart: true })}
      onContextMenu={(e) => openChapterMenu(e, child)}>
      <span class="dot"></span>
      <span class="lbl">{chapterLabel(child.number, child.title)}</span>
    </button>
  )
  const arcRange = (band) => (band.from == null ? '' : band.to !== band.from ? `${band.from}–${band.to}` : String(band.from))

  // 6. JSX-helper builders
  // Only speaks up when something is happening: a write in flight, one that just
  // landed, or one that failed. Nothing while idle.
  const saveLabel = () => {
    const state = Status()
    if (state === 'saving') return 'Saving…'
    if (state === 'saved') return 'Saved'
    if (state === 'error') return 'Couldn’t save'
    return ''
  }
  const saveClass = () => ({ busy: Status() === 'saving', err: Status() === 'error' })
  const wordCount = () => {
    const matched = stripGeneratorMarkers(CurrentDoc.body || '').trim().match(/\S+/g)
    return matched ? matched.length : 0
  }
  const totalWords = () => TimelineChapters().reduce((sum, c) => sum + c.words, 0)
  const docTitle = () =>
    CurrentDoc.meta?.title || CurrentDoc.meta?.name || (CurrentDoc.kind === 'timeline' ? 'Series Timeline' : 'Untitled')
  const sectionLabel = () => {
    if (CurrentDoc.kind === 'chapter') return 'Manuscript'
    if (CurrentDoc.kind === 'timeline') return 'Plot'
    if (CurrentDoc.kind === 'bank') return 'Banks'
    if (CurrentDoc.kind === 'group') return 'Groups'
    return 'Cast'
  }
  const docMentionTotal = () => MentionsFor(CurrentDoc.id).reduce((sum, hit) => sum + hit.count, 0)
  const castMeta = (m) => {
    const parts = [m.type || 'Character']
    if (m.intro != null) parts.push(`intro Ch.${m.intro}`)
    if (m.lastSeen != null) parts.push(`last seen Ch.${m.lastSeen}`)
    return parts
  }

  return (
    <div class="app">
      <div class="topbar" data-tauri-drag-region>
        <div class="topleft" data-tauri-drag-region>
          <span class="brand">Authors&nbsp;Notes</span>
          <div class="menu">
            <div class="menuitem">
              <button classList={{ hot: Menu() === 'file' }} disabled={Busy()} onClick={() => toggleMenu('file')}>File</button>
              <Show when={Menu() === 'file'}>
                <div class="filemenu">
                  <button onClick={() => runMenu(OpenProject)}>Open project…</button>
                  <button onClick={() => runMenu(NewProject)}>New project…</button>
                  <button onClick={() => runMenu(() => SetRecentOpen(true))}>Open recent…</button>
                  <button onClick={() => runMenu(BeginImport)}>Import chapters…</button>
                  <div class="filemenu-sep"></div>
                  <button disabled={!HasProject()} onClick={() => runMenu(openExport)}>Export…</button>
                </div>
              </Show>
            </div>
            <button disabled>Edit</button>
            <button disabled>Story</button>
            <div class="menuitem">
              <button classList={{ hot: Menu() === 'view' }} disabled={!HasProject()} onClick={() => toggleMenu('view')}>View</button>
              <Show when={Menu() === 'view'}>
                <div class="filemenu">
                  <button class="menu-check" onClick={() => runMenu(() => SetPageView(true))}>
                    <span class="ck">{PageView() ? '✓' : ''}</span>Page view
                  </button>
                  <button class="menu-check" onClick={() => runMenu(() => SetPageView(false))}>
                    <span class="ck">{!PageView() ? '✓' : ''}</span>Scroll view
                  </button>
                  <div class="filemenu-sep"></div>
                  <div class="menu-stepper">
                    <span class="menu-stepper-lab">Page width</span>
                    <button class="menu-step" disabled={!PageView()} onClick={(e) => { e.stopPropagation(); adjustPageWidth(-20) }}><MinusIcon size={13} /></button>
                    <span class="menu-stepper-val">{PageWidth()}</span>
                    <button class="menu-step" disabled={!PageView()} onClick={(e) => { e.stopPropagation(); adjustPageWidth(20) }}><PlusIcon size={13} /></button>
                  </div>
                  <div class="filemenu-sep"></div>
                  <button class="menu-check" onClick={() => runMenu(openPreview)}><span class="ck"></span>Rendered preview…</button>
                </div>
              </Show>
            </div>
            <button disabled>Tools</button>
            <button disabled>Help</button>
          </div>
        </div>

        <div class="searchwrap" data-tauri-drag-region>
          <div class="search">
            <SearchIcon size={13} class="si" />
            <Show when={!SearchQuery()}>
              <div class="crumbs">
                <Show when={HasProject()} fallback={<span class="crumb">No project</span>}>
                  <span class="crumb">{Project.manifest?.name}</span>
                  <Show when={CurrentDoc.id}>
                    <span class="csep">›</span>
                    <span class="crumb">{sectionLabel()}</span>
                    <span class="csep">›</span>
                    <span class="crumb cur">{docTitle()}</span>
                  </Show>
                </Show>
              </div>
            </Show>
            <input
              placeholder="Search…"
              value={SearchQuery()}
              onInput={(e) => SetSearchQuery(e.currentTarget.value)}
              onFocus={() => SetSearchFocus(true)}
              onBlur={() => setTimeout(() => SetSearchFocus(false), 150)}
            />
          </div>
          <Show when={SearchFocus() && SearchQuery().trim() && HasProject()}>
            <div class="sresults show">
              <Show when={SearchProject(SearchQuery()).direct.length}>
                <div class="stier">Direct matches</div>
                <For each={SearchProject(SearchQuery()).direct}>
                  {(r) => (
                    <div class="sitem" onMouseDown={() => { r.open(); SetSearchQuery('') }}>
                      <span class="k">{r.kind}</span><span class="m">{r.label}</span>
                    </div>
                  )}
                </For>
              </Show>
              <Show when={SearchProject(SearchQuery()).content.length}>
                <div class="stier">In content</div>
                <For each={SearchProject(SearchQuery()).content}>
                  {(r) => (
                    <div class="sitem" onMouseDown={() => { r.open(); SetSearchQuery('') }}>
                      <span class="k">{r.kind}</span><span class="m">{r.sub}</span><span class="loc">{r.label}</span>
                    </div>
                  )}
                </For>
              </Show>
              <Show when={!SearchProject(SearchQuery()).direct.length && !SearchProject(SearchQuery()).content.length}>
                <div class="stier">No matches</div>
              </Show>
            </div>
          </Show>
        </div>

        <div class="right" data-tauri-drag-region>
          <Show when={isChapter()}>
            <div class="seg">
              <button classList={{ on: PageView() }} onClick={() => SetPageView(true)}><PageIcon size={13} /> Page</button>
              <button classList={{ on: !PageView() }} onClick={() => SetPageView(false)}><ScrollIcon size={13} /> Scroll</button>
            </div>
          </Show>
          <select class="theme-sel" value={ThemeName()} onChange={(e) => handleTheme(e.currentTarget.value)}>
            <option value="gray-dark">Gray · Dark</option>
            <option value="gray-light">Gray · Light</option>
            <option value="warm-dark">Warm · Dark</option>
            <option value="warm-light">Warm · Light</option>
          </select>
          <Show when={HasProject()}>
            <button class="paneltoggle" classList={{ on: DockOpen() }} title="Toggle right panel" onClick={() => SetDockOpen((v) => !v)}>
              <PanelRightIcon size={15} />
            </button>
          </Show>
          <div class="winctl">
            <button class="wc" onClick={handleMinimize} aria-label="Minimize"><svg width="11" height="11" viewBox="0 0 11 11"><rect x="1" y="5" width="9" height="1" fill="currentColor" /></svg></button>
            <button class="wc" onClick={handleToggleMaximize} aria-label="Maximize"><svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor"><rect x="1.5" y="1.5" width="8" height="8" /></svg></button>
            <button class="wc close" onClick={handleClose} aria-label="Close"><svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M1 1l9 9M10 1l-9 9" /></svg></button>
          </div>
        </div>
      </div>

      <Show when={Menu()}>
        <div class="menu-overlay" onClick={() => SetMenu(null)} />
      </Show>

      <div class="body" style={{ 'grid-template-columns': bodyCols() }}>
        <nav class="rail">
          <button class="ri" classList={{ on: LeftView() === 'explorer' && SidebarOpen() }} title="Explorer" onClick={() => selectView('explorer')}><FilesIcon /></button>
          <button class="ri" classList={{ on: LeftView() === 'cast' && SidebarOpen() }} title="Cast — characters & entities" onClick={() => selectView('cast')}><UsersIcon /></button>
          <button class="ri" classList={{ on: CurrentDoc.kind === 'timeline' }} title="Timeline & plot" onClick={OpenTimeline}><TimelineIcon /></button>
          <button class="ri" classList={{ on: LeftView() === 'banks' && SidebarOpen() }} title="Data banks" onClick={() => selectView('banks')}><DatabaseIcon /></button>
          <button class="ri" title="AI add-ons"><SparkleIcon /></button>
          <div class="spacer"></div>
          <button class="ri" title="Preferences"><SettingsIcon /></button>
        </nav>

        <div class="explorer" classList={{ collapsed: !SidebarOpen() }}>
          <Show when={HasProject()}>
            <Switch fallback={<CastBrowser />}>
              <Match when={LeftView() === 'banks'}><BanksBrowser /></Match>
              <Match when={LeftView() === 'explorer'}>
              <div class="exhead"><span>{Project.manifest?.name}</span><span class="dots">⋯</span></div>
              <div class="tree">
                <button class="node grp depth1" classList={{ sel: CurrentDoc.kind === 'timeline' }}
                  onClick={() => OpenTimeline()} onDblClick={() => OpenTimeline({ smart: true })}>
                  <span class="tw"></span>
                  <TimelineIcon size={15} class="ic" />
                  <span class="lbl">Series Timeline</span>
                </button>
                <button class="node grp depth1" onClick={() => SetManuscriptOpen((v) => !v)}>
                  <span class="tw">{ManuscriptOpen() ? <ChevronDownIcon size={15} /> : <ChevronRightIcon size={15} />}</span>
                  <BookIcon size={15} class="ic" />
                  <span class="lbl">Manuscript</span>
                  <Show when={SelectedIds().length} fallback={<span class="tag">{Chapters().length}</span>}>
                    <span class="selcount">{SelectedIds().length} selected</span>
                  </Show>
                  <span class="addbtn" title="New chapter" onClick={(e) => { e.stopPropagation(); openNewChapter() }}><PlusIcon size={14} /></span>
                </button>
                <Show when={ManuscriptOpen()}>
                  <For each={ArcBands()}>
                    {(band) => (
                      <Show when={band.arc} fallback={<For each={band.chapters}>{(child) => chapterNode(child, 2)}</For>}>
                        <button class="node arc depth2" onClick={() => toggleArc(band.arc)}>
                          <span class="tw">{arcOpen(band.arc) ? <ChevronDownIcon size={15} /> : <ChevronRightIcon size={15} />}</span>
                          <TimelineIcon size={14} class="ic" />
                          <span class="lbl arclbl">{band.arc}</span>
                          <Show when={arcRange(band)}><span class="tag">{arcRange(band)}</span></Show>
                        </button>
                        <Show when={arcOpen(band.arc)}>
                          <For each={band.chapters}>{(child) => chapterNode(child, 3)}</For>
                        </Show>
                      </Show>
                    )}
                  </For>
                </Show>

                <button class="node grp depth1" onClick={() => SetBibleOpen((v) => !v)}>
                  <span class="tw">{BibleOpen() ? <ChevronDownIcon size={15} /> : <ChevronRightIcon size={15} />}</span>
                  <UsersIcon size={15} class="ic" />
                  <span class="lbl">Story Bible</span>
                  <span class="tag">{Entities().length}</span>
                  <span class="addbtn" title="Connection graph" onClick={(e) => { e.stopPropagation(); OpenGraph() }}><GraphIcon size={14} /></span>
                  <span class="addbtn" title="New collection (for loose / one-off entries)" onClick={(e) => { e.stopPropagation(); CreateEntity('New collection', 'group') }}><UsersIcon size={14} /></span>
                  <span class="addbtn" title="New entry" onClick={(e) => { e.stopPropagation(); openNewEntity(null) }}><PlusIcon size={14} /></span>
                </button>
                <Show when={BibleOpen()}>
                  <BibleTree onNewMember={openNewEntity} />
                </Show>
              </div>
              </Match>
            </Switch>
          </Show>
        </div>

        <div class="editor">
          <Show
            when={HasProject()}
            fallback={
              <div class="blankstate">
                <div class="launch">
                  <button class="launch-item" onClick={OpenProject}>Open project</button>
                  <button class="launch-item" onClick={NewProject}>New project</button>
                  <button class="launch-item" onClick={() => SetRecentOpen(true)}>Open recent</button>
                </div>
              </div>
            }
          >
            <div class="splitwrap">
              <SplitContainer ref={handleContainerReady} onChange={HandleContainerChange} />
            </div>
          </Show>
        </div>

        <Show when={HasProject()}>
          <aside class="dock" classList={{ collapsed: !DockOpen() }}>
            <Show
              when={InspectedId() && EntityById(InspectedId())}
              fallback={
                <Switch fallback={<div class="dock-hint">Open a chapter to see its cast and plan.</div>}>
                  <Match when={displayedChapter()}>
                    {/* non-collapsible chapter header — controls both Cast and Plan below */}
                    <div class="dock-chapterhead">
                      <div class="dock-nav">
                        <button class="nav" title="Previous chapter" onClick={() => stepDock(-1)}><ChevronLeftIcon size={15} /></button>
                        <select class="dock-pick" value={displayedChapterId() ?? ''} onChange={(e) => pickDock(e.currentTarget.value)}>
                          <For each={TimelineChapters()}>{(c) => <option value={c.id}>{chapterLabel(c.number, c.title)}</option>}</For>
                        </select>
                        <button class="nav" title="Next chapter" onClick={() => stepDock(1)}><ChevronRightIcon size={15} /></button>
                        <button class="nav" title="Open this chapter" onClick={openDisplayedChapter}><OpenIcon size={14} /></button>
                        <Show when={DockPinnedId()}>
                          <button class="dock-lock" title="Pinned — click to follow the open chapter" onClick={() => SetDockPinnedId(null)}><LockIcon size={13} /></button>
                        </Show>
                      </div>
                      <div class="dock-headfields">
                        <div class="field2">
                          <div class="field fnum"><label>Chapter #</label>
                            <input class="fbox" type="number" step="0.1" value={displayedChapter()?.meta?.number ?? ''}
                              onInput={(e) => updatePlanMeta('number', e.currentTarget.value === '' ? null : Number(e.currentTarget.value))} />
                          </div>
                          <div class="field fgrow"><label>Title</label>
                            <input class="fbox" placeholder="Untitled" value={displayedChapter()?.meta?.title || ''}
                              onInput={(e) => updatePlanMeta('title', e.currentTarget.value)} />
                          </div>
                        </div>
                        <div class="field"><label>Arc</label>
                          <input class="fbox" placeholder="Unsorted" list="arc-names"
                            value={displayedChapter()?.meta?.arc || ''} onInput={(e) => updatePlanMeta('arc', e.currentTarget.value)} />
                          <datalist id="arc-names">
                            <For each={ArcBands().filter((b) => b.arc)}>{(b) => <option value={b.arc} />}</For>
                          </datalist>
                        </div>
                      </div>
                    </div>

                    <div class="pane cast" classList={{ collapsed: !CastOpen() }}>
                      <div class="pbar" onClick={() => SetCastOpen((v) => !v)}>
                        <span class="cx">{CastOpen() ? <ChevronDownIcon size={14} /> : <ChevronRightIcon size={14} />}</span>
                        <span class="t">Cast in chapter</span><span class="sub">recent · most used</span>
                      </div>
                      <div class="pbody">
                        <div class="clist">
                          <Show when={CastForChapter(displayedChapter()).length} fallback={<div class="dock-empty">No known characters here yet.</div>}>
                            <For each={CastForChapter(displayedChapter())}>
                              {(m) => (
                                <div class="card" classList={{ unused: m.unused }} onClick={() => SetInspectedId(m.id)}>
                                  <div class="av" style={{ background: avatarColor(m.id) }}>{avatarInitial(m.name)}</div>
                                  <div class="who">
                                    <div class="nm">{m.name}<Show when={m.unused}><span class="unused"> - unused</span></Show></div>
                                    <div class="meta">
                                      <For each={castMeta(m)}>{(part, i) => (<>{i() > 0 && <span class="sep"> · </span>}{part}</>)}</For>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </For>
                          </Show>
                        </div>
                      </div>
                    </div>

                    <div class="pane plan" classList={{ collapsed: !PlanOpen() }}>
                      <div class="pbar" onClick={() => SetPlanOpen((v) => !v)}>
                        <span class="cx">{PlanOpen() ? <ChevronDownIcon size={14} /> : <ChevronRightIcon size={14} />}</span>
                        <span class="t">Chapter plan</span>
                      </div>
                      <div class="pbody">
                        <div class="field"><label>Summary</label>
                          <textarea class="fbox" rows="4" placeholder="What happens in this chapter"
                            value={displayedChapter()?.meta?.summary || ''} onInput={(e) => updatePlanMeta('summary', e.currentTarget.value)} />
                        </div>
                        <div class="field"><label>Objective</label>
                          <textarea class="fbox" rows="3" placeholder="What it needs to accomplish"
                            value={displayedChapter()?.meta?.objective || ''} onInput={(e) => updatePlanMeta('objective', e.currentTarget.value)} />
                        </div>
                        <div class="field"><label>Timeline</label>
                          <textarea class="fbox" rows="3" placeholder="This chapter's timeline note (not the summary)"
                            value={displayedChapter()?.meta?.timeline || ''} onInput={(e) => updatePlanMeta('timeline', e.currentTarget.value)} />
                        </div>
                      </div>
                    </div>

                    <div class="pane plan" classList={{ collapsed: !TopicsOpen() }}>
                      <div class="pbar" onClick={() => SetTopicsOpen((v) => !v)}>
                        <span class="cx">{TopicsOpen() ? <ChevronDownIcon size={14} /> : <ChevronRightIcon size={14} />}</span>
                        <span class="t">Topics</span>
                        <button class="add" onClick={(e) => { e.stopPropagation(); addTopic() }}><PlusIcon size={12} /> Add</button>
                      </div>
                      <div class="pbody">
                        <div class="topics">
                          <For each={topics()} fallback={<div class="dock-empty">No topics yet.</div>}>
                            {(topic, i) => (
                              <div class="topic" classList={{ done: topic.done }}>
                                <div class="tc">
                                  <input class="topic-in tt-in" value={topic.title} onInput={(e) => updateTopic(i(), { title: e.currentTarget.value })} />
                                  <input class="topic-in td-in" placeholder="note" value={topic.note} onInput={(e) => updateTopic(i(), { note: e.currentTarget.value })} />
                                </div>
                                <button class="pin" classList={{ set: topic.done }} title="Mark done" onClick={() => updateTopic(i(), { done: !topic.done })}>{topic.done ? <CheckCircleIcon size={15} /> : <CircleIcon size={15} />}</button>
                              </div>
                            )}
                          </For>
                        </div>
                      </div>
                    </div>
                  </Match>

                  <Match when={CurrentDoc.kind === 'entity'}>
                    <div class="pane plan">
                      <div class="pbar"><span class="t">Mentions</span><span class="sub">{docMentionTotal()} across {MentionsFor(CurrentDoc.id).length}</span></div>
                      <div class="pbody">
                        <For each={MentionsFor(CurrentDoc.id)} fallback={<div class="dock-empty">Not mentioned in any chapter yet.</div>}>
                          {(hit) => (
                            <button class="dock-mrow" onClick={() => OpenChapterById(hit.chapterId)}>
                              <span class="dock-mtick"></span>
                              <span class="dock-msrc">{hit.title}</span>
                              <span class="dock-mct">{hit.count}×</span>
                            </button>
                          )}
                        </For>
                      </div>
                    </div>
                  </Match>
                  <Match when={CurrentDoc.kind === 'group'}>
                    <div class="pane plan">
                      <div class="pbar"><span class="t">Members</span><span class="sub">{(CurrentDoc.meta?.members || []).length}</span></div>
                      <div class="pbody">
                        <div class="clist">
                          <For each={CurrentDoc.meta?.members || []} fallback={<div class="dock-empty">No members yet.</div>}>
                            {(id) => (
                              <div class="card" onClick={() => OpenEntityById(id)}>
                                <div class="av" style={{ background: avatarColor(id) }}>{avatarInitial(EntityById(id)?.meta.name)}</div>
                                <div class="who"><div class="nm">{EntityById(id)?.meta.name || 'Unknown'}</div></div>
                              </div>
                            )}
                          </For>
                        </div>
                      </div>
                    </div>
                  </Match>
                </Switch>
              }
            >
              {(entity) => (
                <div class="pane plan">
                  <div class="pbar">
                    <button class="cx" title="Back" onClick={() => SetInspectedId(null)}><ChevronLeftIcon size={14} /></button>
                    <span class="t">{entity().meta.type || 'Entity'}</span>
                  </div>
                  <div class="pbody">
                    <div class="insp-head">
                      <span class="av" style={{ background: avatarColor(entity().meta.id) }}>{avatarInitial(entity().meta.name)}</span>
                      <div class="insp-headmain">
                        <div class="insp-name">{entity().meta.name}</div>
                        <Show when={(entity().meta.aliases || []).length}>
                          <div class="insp-alias">{(entity().meta.aliases || []).join(' · ')}</div>
                        </Show>
                      </div>
                    </div>
                    <Show when={entity().body}><div class="insp-notes">{entity().body}</div></Show>
                    <div class="insp-stat">{MentionsFor(entity().meta.id).reduce((s, h) => s + h.count, 0)} mentions</div>
                    <button class="insp-open" onClick={() => OpenEntityById(entity().meta.id)}>Open full page ›</button>
                  </div>
                </div>
              )}
            </Show>
          </aside>
        </Show>
      </div>

      <div class="status">
        <span class="s save" classList={saveClass()}>
          {saveLabel()}
          <Show when={Status() === 'error'}>
            <button class="s-retry" onClick={RetrySaves}>Retry</button>
          </Show>
        </span>
        <Show when={Notice()}>
          <span class="s err" title={Notice()}>{Notice()}</span>
        </Show>
        <Show when={isChapter() && CurrentDoc.meta?.pov}>
          <span class="s hl">POV: {CurrentDoc.meta.pov}</span>
        </Show>
        <span class="sp"></span>
        <Show when={CurrentDoc.id}>
          <span class="s mono">{wordCount().toLocaleString()} words</span>
        </Show>
        <Show when={HasProject()}>
          <span class="s mono">{totalWords().toLocaleString()} total</span>
        </Show>
        <Show when={isChapter()}>
          <span class="s">CommonMark + prose</span>
        </Show>
        <span class="s mono">{APP_VERSION}</span>
      </div>

      <Show when={RecentOpen()}>
        <div class="modal-overlay" onClick={() => SetRecentOpen(false)}>
          <div class="modal" onClick={(e) => e.stopPropagation()}>
            <div class="modal-head">Recent projects</div>
            <div class="modal-body">
              <Show when={RecentProjects().length} fallback={<div class="launch-empty">No recent projects</div>}>
                <For each={RecentProjects()}>
                  {(dir) => (
                    <button class="recent-row" title={dir} onClick={() => { SetRecentOpen(false); OpenProjectPath(dir) }}>
                      <span class="recent-name">{dir.split(/[\\/]/).pop().replace(/\.project$/i, '')}</span>
                      <span class="recent-path">{dir}</span>
                    </button>
                  )}
                </For>
              </Show>
            </div>
          </div>
        </div>
      </Show>

      <Show when={ExportOpen()}>
        <div class="modal-overlay" onClick={() => SetExportOpen(false)}>
          <div class="modal" onClick={(e) => e.stopPropagation()}>
            <div class="modal-head">Export</div>
            <div class="modal-body export-body">
              <div class="export-field">
                <label>Format</label>
                <select value={ExportProfile()} onChange={(e) => SetExportProfile(e.currentTarget.value)}>
                  <For each={Object.entries(EXPORT_PROFILES)}>{([key, spec]) => <option value={key}>{spec.label}</option>}</For>
                </select>
              </div>
              <div class="export-field">
                <label>Scope</label>
                <select value={ExportScope()} onChange={(e) => SetExportScope(e.currentTarget.value)}>
                  <option value="book">Whole book</option>
                  <option value="chapter" disabled={!isChapter()}>Current chapter</option>
                </select>
              </div>
              <label class="export-check">
                <input type="checkbox" checked={ExportHeadings()} onChange={(e) => SetExportHeadings(e.currentTarget.checked)} />
                Include chapter headings
              </label>
              <Show when={ExportResult()}>
                <div class="export-result" classList={{ bad: !ExportResult().ok }}>
                  {ExportResult().ok
                    ? `Exported to ${ExportResult().path}`
                    : `Export failed${ExportResult().message ? `: ${ExportResult().message}` : ' — see console.'}`}
                </div>
              </Show>
            </div>
            <div class="modal-foot">
              <button class="modal-cancel" onClick={() => SetExportOpen(false)}>Close</button>
              <button class="modal-go" disabled={ExportBusy()} onClick={runExport}>{ExportBusy() ? 'Exporting…' : 'Export'}</button>
            </div>
          </div>
        </div>
      </Show>

      <Show when={PreviewOpen()}>
        <div class="preview-overlay" onClick={() => SetPreviewOpen(false)}>
          <div class="preview-shell" onClick={(e) => e.stopPropagation()}>
            <div class="preview-bar">
              <span class="preview-title">Rendered preview</span>
              <button class="preview-close" onClick={() => SetPreviewOpen(false)}>Close</button>
            </div>
            <div class="preview-scroll">
              <Show
                when={PreviewHtml()}
                fallback={<div class="preview-status">{PreviewError() ? `Couldn't render: ${PreviewError()}` : 'Rendering…'}</div>}
              >
                <div class="preview-sheet" innerHTML={PreviewHtml()} />
              </Show>
            </div>
          </div>
        </div>
      </Show>

      <Show when={NewChapterOpen()}>
        <div class="modal-overlay" onClick={() => SetNewChapterOpen(false)}>
          <div class="modal" onClick={(e) => e.stopPropagation()}>
            <div class="modal-head">New chapter</div>
            <div class="export-body">
              <div class="export-field">
                <label>Number</label>
                <input type="number" step="0.1" value={NewChapterNumber()} onInput={(e) => SetNewChapterNumber(e.currentTarget.value)} />
              </div>
              <div class="export-field">
                <label>Title</label>
                <input value={NewChapterTitle()} placeholder="Untitled" onInput={(e) => SetNewChapterTitle(e.currentTarget.value)} />
              </div>
              <Show when={chapterNumberExists(NewChapterNumber())}>
                <div class="export-result bad">Chapter {NewChapterNumber()} already exists — this will duplicate it. Use a decimal (e.g. {NewChapterNumber()}.5) or a free number.</div>
              </Show>
            </div>
            <div class="modal-foot">
              <button class="modal-cancel" onClick={() => SetNewChapterOpen(false)}>Cancel</button>
              <button class="modal-go" onClick={runNewChapter}>Create</button>
            </div>
          </div>
        </div>
      </Show>

      <Show when={AssignOpen()}>
        <div class="modal-overlay" onClick={() => SetAssignOpen(false)}>
          <div class="modal" onClick={(e) => e.stopPropagation()}>
            <div class="modal-head">Assign “{AssignText()}” to a card</div>
            <div class="assign-body">
              <input class="assign-search" autofocus placeholder="Search cards…"
                value={AssignQuery()} onInput={(e) => SetAssignQuery(e.currentTarget.value)} />
              <div class="assign-list">
                <For each={assignMatches()} fallback={<div class="assign-empty">No matching cards.</div>}>
                  {(entity) => (
                    <button class="assign-row" onClick={() => assignToCard(entity.meta.id)}>
                      <span class="assign-av" style={{ background: avatarColor(entity.meta.id) }}>{avatarInitial(entity.meta.name)}</span>
                      <span class="assign-who">
                        <span class="assign-name">{entity.meta.name}</span>
                        <span class="assign-type">{entity.meta.type || 'Entity'}</span>
                      </span>
                    </button>
                  )}
                </For>
              </div>
              <div class="assign-create">
                <span class="assign-createlab">Create new</span>
                <button onClick={() => createFromAssign('Character')}>Character</button>
                <button onClick={() => createFromAssign('Location')}>Location</button>
                <button onClick={() => createFromAssign('Term')}>Term</button>
              </div>
            </div>
            <div class="modal-foot">
              <button class="modal-cancel" onClick={() => SetAssignOpen(false)}>Cancel</button>
            </div>
          </div>
        </div>
      </Show>

      <Show when={NewEntityOpen()}>
        <div class="modal-overlay" onClick={() => SetNewEntityOpen(false)}>
          <div class="modal" onClick={(e) => e.stopPropagation()}>
            <div class="modal-head">New entry{NewEntityColl() ? ` in ${EntityById(NewEntityColl())?.meta?.name}` : ''}</div>
            <div class="export-body">
              <div class="export-field">
                <label>Name</label>
                <input autofocus value={NewEntityName()} placeholder="Name"
                  onInput={(e) => SetNewEntityName(e.currentTarget.value)} onKeyDown={(e) => { if (e.key === 'Enter') runNewEntity() }} />
              </div>
              <div class="export-field">
                <label>Type</label>
                <input list="entity-types" value={NewEntityType()} placeholder="Character, Location, Item…"
                  onInput={(e) => SetNewEntityType(e.currentTarget.value)} />
                <datalist id="entity-types"><For each={entityTypes()}>{(t) => <option value={t} />}</For></datalist>
              </div>
              <Show when={NewEntityColl() && EntityById(NewEntityColl())?.meta?.memberRule?.key}>
                <div class="export-result">
                  Joins “{EntityById(NewEntityColl())?.meta?.name}” via {EntityById(NewEntityColl())?.meta?.memberRule?.key} = {EntityById(NewEntityColl())?.meta?.memberRule?.value}.
                </div>
              </Show>
            </div>
            <div class="modal-foot">
              <button class="modal-cancel" onClick={() => SetNewEntityOpen(false)}>Cancel</button>
              <button class="modal-go" onClick={runNewEntity}>Create</button>
            </div>
          </div>
        </div>
      </Show>

      <Show when={CtxMenu()}>
        <div class="ctx-overlay" onClick={() => SetCtxMenu(null)} onContextMenu={(e) => { e.preventDefault(); SetCtxMenu(null) }}>
          <div class="ctx-menu" style={{ left: `${CtxMenu().x}px`, top: `${CtxMenu().y}px` }} onClick={(e) => e.stopPropagation()}>
            <button onClick={() => { SetCtxMenu(null); SetBulkArc(''); SetArcModalOpen(true) }}>Set arc…</button>
            <button class="ctx-danger" onClick={() => { SetCtxMenu(null); SetConfirmDeleteOpen(true) }}>
              Delete{SelectedIds().length > 1 ? ` ${SelectedIds().length} chapters` : ''}…
            </button>
          </div>
        </div>
      </Show>

      <Show when={ArcModalOpen()}>
        <div class="modal-overlay" onClick={() => SetArcModalOpen(false)}>
          <div class="modal" onClick={(e) => e.stopPropagation()}>
            <div class="modal-head">Set arc · {SelectedIds().length} chapter{SelectedIds().length === 1 ? '' : 's'}</div>
            <div class="export-body">
              <div class="export-field">
                <label>Arc</label>
                <input list="bulk-arc-names" value={BulkArc()} placeholder="Arc name (leave blank for Unsorted)"
                  onInput={(e) => SetBulkArc(e.currentTarget.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') applyArc() }} />
                <datalist id="bulk-arc-names"><For each={ArcBands().filter((b) => b.arc)}>{(b) => <option value={b.arc} />}</For></datalist>
              </div>
            </div>
            <div class="modal-foot">
              <button class="modal-cancel" onClick={() => SetArcModalOpen(false)}>Cancel</button>
              <button class="modal-go" onClick={applyArc}>Apply</button>
            </div>
          </div>
        </div>
      </Show>

      <Show when={ConfirmDeleteOpen()}>
        <div class="modal-overlay" onClick={() => SetConfirmDeleteOpen(false)}>
          <div class="modal" onClick={(e) => e.stopPropagation()}>
            <div class="modal-head">Delete {SelectedIds().length} chapter{SelectedIds().length === 1 ? '' : 's'}?</div>
            <div class="modal-body">
              <div class="confirm-msg">This permanently removes the chapter file{SelectedIds().length === 1 ? '' : 's'} from disk. This can't be undone.</div>
            </div>
            <div class="modal-foot">
              <button class="modal-cancel" onClick={() => SetConfirmDeleteOpen(false)}>Cancel</button>
              <button class="modal-go danger" onClick={runBulkDelete}>Delete</button>
            </div>
          </div>
        </div>
      </Show>

      <Show when={Importing()}>
        <ImportWizard />
      </Show>
    </div>
  )
}
