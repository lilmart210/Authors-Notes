import { For, Show, Switch, Match, ErrorBoundary, createSignal, createEffect, onMount, onCleanup } from 'solid-js'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { SplitContainer, useTab } from '@curruptnation/split-container'
import '@curruptnation/split-container/styles.css'
import { useProject } from '../project/ProjectContext.jsx'
import Editor from './Editor.jsx'
import PageDocument, { PageDock } from './PageView.jsx' // (PageView is the page/scroll signal below)
import CastBrowser from './CastBrowser.jsx'
import BanksBrowser from './BanksBrowser.jsx'
import BankPage from './BankPage.jsx'
import TimelineView from './TimelineView.jsx'
import RelationshipGraph from './RelationshipGraph.jsx'
import ImportWizard from './ImportWizard.jsx'
import Explorer from './Explorer.jsx'
import DraftsPane from './DraftsPane.jsx'
import DiffView from './DiffView.jsx'
import ToastHost from './Toast.jsx'
import ScrapsView from './ScrapsView.jsx'
import { revealScrap } from './scrapsExtension.js'
import { OverviewPage, BookTextPage, PublishingPage, ArcPageView, BookGlance } from './BookPages.jsx'
import { avatarColor, avatarInitial } from './avatar.js'
import { stripGeneratorMarkers, chapterLabel, SECTION_ROOT } from '../project/format.js'
import ExportDialog from './ExportDialog.jsx'
import {
  FilesIcon, SearchIcon, UsersIcon, DatabaseIcon, SparkleIcon, SettingsIcon, PageIcon, ScrollIcon,
  ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, CircleIcon, CheckCircleIcon,
  PlusIcon, MinusIcon, PanelRightIcon, LockIcon, OpenIcon,
} from './icons.jsx'

const appWindow = getCurrentWindow()
const APP_VERSION = 'v0.1.0'
const BOOK_PAGE_NAMES = { overview: 'Overview', blurb: 'Blurb', synopsis: 'Synopsis', publishing: 'Publishing' }
const SECTION_OF_ROOT = Object.fromEntries(Object.entries(SECTION_ROOT).map(([section, root]) => [root, section]))
const SECTION_NAMES = { world: 'World', plot: 'Plot', notes: 'Notes', front: 'Manuscript', back: 'Manuscript' }

export default function Shell() {
  const {
    Project, CurrentDoc, Status, Notice, RetrySaves, FlushEverything, Busy, HasProject, Entities, Banks,
    LeftView, SetLeftView, NewProject, OpenProject, OpenProjectPath, RecentProjects, BeginImport, Importing,
    OpenChapterById, OpenEntityById, EntityById, MentionsFor,
    CastForChapter, ChapterById, UpdateChapterMeta, SearchProject, TimelineChapters, CreateEntity,
    AddAliasToEntity, ResolveMention, PreviewFor, Book, ArcNames, PendingScrapFocus, ClearScrapFocus,
    acquireChapterDoc, releaseChapterDoc, PromoteDocTab,
    RenderPreview, SetContainerApi, HandleContainerChange,
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
    const [View, SetView] = createSignal(null)
    onMount(() => SetHandle(acquireChapterDoc(props.file, props.docId)))
    onCleanup(() => releaseChapterDoc(props.file))
    // "Show" on the scraps review page: select that scrap once this editor exists.
    createEffect(() => {
      const pending = PendingScrapFocus()
      const view = View()
      if (!pending || !view || pending.chapterId !== props.docId) return
      ClearScrapFocus()
      queueMicrotask(() => revealScrap(view, pending.scrapId))
    })
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
          scraps={info()?.meta?.scraps || []}
          onScrapsChange={(list) => UpdateChapterMeta(props.docId, 'scraps', list)}
          ref={SetView}
        />
      </Show>
    )
  }

  // A page that throws while rendering shows the error instead of a blank panel.
  function PanelError(err) {
    console.error(err)
    return <div class="panel-error">This page couldn’t be shown: {String(err?.message || err)}</div>
  }

  // Rendered once PER TAB (each tab's own Panel), so panes are independent.
  function DocPanel() {
    const { Tab } = useTab()
    return (
      <ErrorBoundary fallback={PanelError}>
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
                <Match when={CurrentDoc.kind === 'entity' || CurrentDoc.kind === 'group'}><PageDocument /></Match>
                <Match when={CurrentDoc.kind === 'bank'}><BankPage /></Match>
                <Match when={CurrentDoc.kind === 'timeline'}><TimelineView /></Match>
                <Match when={CurrentDoc.kind === 'graph'}><RelationshipGraph /></Match>
                <Match when={CurrentDoc.kind === 'book' && CurrentDoc.id === 'overview'}><OverviewPage /></Match>
                <Match when={CurrentDoc.kind === 'book' && (CurrentDoc.id === 'blurb' || CurrentDoc.id === 'synopsis')}><BookTextPage page={CurrentDoc.id} /></Match>
                <Match when={CurrentDoc.kind === 'book' && CurrentDoc.id === 'publishing'}><PublishingPage onExport={openExport} /></Match>
                <Match when={CurrentDoc.kind === 'arc'}><ArcPageView /></Match>
                <Match when={CurrentDoc.kind === 'diff'}><DiffView /></Match>
                <Match when={CurrentDoc.kind === 'scraps'}><ScrapsView /></Match>
              </Switch>
            )}
          </Show>
        </Match>
      </Switch>
      </ErrorBoundary>
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
  const [PreviewOpen, SetPreviewOpen] = createSignal(false)
  const [PreviewHtml, SetPreviewHtml] = createSignal('')
  const [PreviewError, SetPreviewError] = createSignal(null)
  const [AssignOpen, SetAssignOpen] = createSignal(false)
  const [AssignText, SetAssignText] = createSignal('')
  const [AssignQuery, SetAssignQuery] = createSignal('')
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
  const [CastOpen, SetCastOpen] = createSignal(true)
  const [PlanOpen, SetPlanOpen] = createSignal(true)

  // apply initial theme
  document.documentElement.setAttribute('data-theme', ThemeName())

  // 3. onMount
  // Closing the window writes every pending edit first (chapter text otherwise waits
  // a moment after the last keystroke). If a write fails the window stays open
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
  function openExport() {
    SetExportOpen(true)
  }
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
    const side = SidebarOpen() ? '300px' : '0px'
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
  const addTopic = () => updatePlanMeta('topics', [...topics(), { title: '', note: '', done: false }])
  const updateTopic = (i, patch) => updatePlanMeta('topics', topics().map((t, idx) => (idx === i ? { ...t, ...patch } : t)))
  const removeTopic = (i) => updatePlanMeta('topics', topics().filter((_, idx) => idx !== i))

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
  function docTitle() {
    if (CurrentDoc.kind === 'book') return CurrentDoc.id === 'overview' ? Book.overview.meta.title || 'Overview' : BOOK_PAGE_NAMES[CurrentDoc.id]
    if (CurrentDoc.kind === 'arc') return CurrentDoc.id || 'Arc'
    if (CurrentDoc.kind === 'diff') return 'Drafts'
    if (CurrentDoc.kind === 'scraps') return 'Scrapped text'
    if (CurrentDoc.kind === 'timeline') return 'Outline'
    return CurrentDoc.meta?.title || CurrentDoc.meta?.name || 'Untitled'
  }
  function sectionLabel() {
    const kind = CurrentDoc.kind
    if (kind === 'chapter' || kind === 'arc') return 'Manuscript'
    if (kind === 'book') return 'Book'
    if (kind === 'diff') return CurrentDoc.id === 'blurb' || CurrentDoc.id === 'synopsis' ? 'Book' : 'Manuscript'
    if (kind === 'timeline') return 'Plot'
    if (kind === 'scraps') return 'Notes'
    if (kind === 'bank') return 'Banks'
    return SECTION_NAMES[SECTION_OF_ROOT[CurrentDoc.root]] || 'World'
  }
  const docMentionTotal = () => MentionsFor(CurrentDoc.id).reduce((sum, hit) => sum + hit.count, 0)
  const castMeta = (m) => {
    const parts = [m.type || 'Character']
    if (m.intro != null) parts.push(`intro Ch.${m.intro}`)
    if (m.lastSeen != null) parts.push(`last seen Ch.${m.lastSeen}`)
    return parts
  }
  const isBookText = () => CurrentDoc.kind === 'book' && (CurrentDoc.id === 'blurb' || CurrentDoc.id === 'synopsis')
  const showsBookGlance = () => (CurrentDoc.kind === 'book' && !isBookText()) || CurrentDoc.kind === 'arc' || CurrentDoc.kind === 'timeline'

  // 7. JSX
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
                  <span class="crumb">{Book.overview.meta.title || Project.manifest?.name}</span>
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
          <button class="ri" classList={{ on: LeftView() === 'banks' && SidebarOpen() }} title="Data banks" onClick={() => selectView('banks')}><DatabaseIcon /></button>
          <button class="ri" title="AI add-ons"><SparkleIcon /></button>
          <div class="spacer"></div>
          <button class="ri" title="Preferences"><SettingsIcon /></button>
        </nav>

        <div class="explorer" classList={{ collapsed: !SidebarOpen() }}>
          <Show when={HasProject()}>
            <Switch fallback={<CastBrowser />}>
              <Match when={LeftView() === 'banks'}><BanksBrowser /></Match>
              <Match when={LeftView() === 'explorer'}><Explorer /></Match>
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
                    {/* non-collapsible chapter header — controls everything below */}
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
                      <DraftsPane owner={displayedChapterId()} />
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
                          <input class="fbox" placeholder="No arc" list="arc-names"
                            value={displayedChapter()?.meta?.arc || ''} onInput={(e) => updatePlanMeta('arc', e.currentTarget.value)} />
                          <datalist id="arc-names">
                            <For each={ArcNames()}>{(name) => <option value={name} />}</For>
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
                                  <input class="topic-in tt-in" value={topic.title} placeholder="Topic" onInput={(e) => updateTopic(i(), { title: e.currentTarget.value })} />
                                  <input class="topic-in td-in" placeholder="note" value={topic.note} onInput={(e) => updateTopic(i(), { note: e.currentTarget.value })} />
                                </div>
                                <button class="pin" classList={{ set: topic.done }} title="Mark done" onClick={() => updateTopic(i(), { done: !topic.done })}>{topic.done ? <CheckCircleIcon size={15} /> : <CircleIcon size={15} />}</button>
                                <button class="topic-del" title="Remove topic" onClick={() => removeTopic(i())}>×</button>
                              </div>
                            )}
                          </For>
                        </div>
                      </div>
                    </div>
                  </Match>

                  <Match when={isBookText()}>
                    <DraftsPane owner={CurrentDoc.id} />
                  </Match>
                  <Match when={CurrentDoc.kind === 'diff'}>
                    <DraftsPane owner={CurrentDoc.id} />
                  </Match>
                  <Match when={showsBookGlance()}>
                    <BookGlance />
                  </Match>

                  <Match when={CurrentDoc.kind === 'entity' || CurrentDoc.kind === 'group'}>
                    <PageDock />
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
        <Show when={CurrentDoc.id && isChapter()}>
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
        <ExportDialog onClose={() => SetExportOpen(false)} />
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

      <Show when={Importing()}>
        <ImportWizard />
      </Show>
      <ToastHost />
    </div>
  )
}
