import { For, Show, createSignal } from 'solid-js'
import { useProject } from '../project/ProjectContext.jsx'
import { chapterLabel, stripGeneratorMarkers, SECTION_ROOT } from '../project/format.js'
import { draftState, stateLine, workingDraftNumber, canPublish } from '../project/drafts.js'
import { showToast } from './Toast.jsx'
import {
  ChevronDownIcon, ChevronRightIcon, PlusIcon, MoreIcon, FolderIcon, FileTextIcon, ArcIcon, QuoteIcon,
  LinesIcon, GlobeIcon, TimelineIcon, ScissorsIcon, GraphIcon, OpenIcon, PencilIcon, CopyIcon, TrashIcon, SendIcon, CompareIcon,
} from './icons.jsx'
import './Explorer.css'

// The left side of the app, organized as the parts of a book:
// Book · Plot · Manuscript · World · Notes (see Architecture Maps/Binder Redesign.md).
// Everything outside the Manuscript is a page; a folder is a page that holds pages.

const SECTION_TITLES = { book: 'Book', plot: 'Plot', ms: 'Manuscript', world: 'World', notes: 'Notes' }
const INDENT_PX = 14
const wordsIn = (text) => (stripGeneratorMarkers(text || '').match(/\S+/g) || []).length
const formatNumber = (n) => Number(n || 0).toLocaleString()

export default function Explorer() {
  const {
    CurrentDoc, Project, Cards, Groups, MembersOf, EntityById, OpenEntity, OpenGraph, OpenTimeline,
    OpenDocument, ChapterById, AddChapter, nextChapterNumber, chapterNumberExists, UpdateChapterMeta,
    SetArcForChapters, DeleteChapters,
    Book, BookCoverUrl, OpenBookPage, PlanSummary,
    ArcNames, ArcChapters, OpenArc, CreateArc, RenameArc, DeleteArc,
    PagesIn, CreatePage, RenamePage, DeletePage, DuplicatePage, MovePage,
    PublishDraft, OpenDiff, LoadDrafts, DraftList, AllScraps, OpenScraps,
  } = useProject()

  // 2. Signals
  const [Expanded, SetExpanded] = createSignal({})
  const [Creating, SetCreating] = createSignal(null) // { section, parentId, kind: 'page'|'folder'|'arc' }
  const [Renaming, SetRenaming] = createSignal(null) // row key being renamed
  const [Menu, SetMenu] = createSignal(null) // { x, y, items }
  const [Dragging, SetDragging] = createSignal(null) // { kind: 'page'|'chapter', id }
  const [DropMark, SetDropMark] = createSignal(null) // { key, position: 'before'|'in'|'after' }
  const [SelectedChapters, SetSelectedChapters] = createSignal([])
  const [NewChapter, SetNewChapter] = createSignal(null) // { number, title, arc }
  const [ArcPrompt, SetArcPrompt] = createSignal(null) // { value } for "Set arc…" on selected chapters
  const [ConfirmDelete, SetConfirmDelete] = createSignal(false)
  let SelectAnchor = null

  // 5. Functions / handlers
  // --- expand / collapse ---
  // Sections start open; arcs and folders start closed.
  const isExpanded = (key, fallback = false) => Expanded()[key] ?? fallback
  const toggle = (key, fallback = false) => SetExpanded((map) => ({ ...map, [key]: !(map[key] ?? fallback) }))
  const expand = (key) => SetExpanded((map) => ({ ...map, [key]: true }))

  // --- page tree (World keeps old collections' members visible under them) ---
  const worldRoot = SECTION_ROOT.world
  const memberIds = () => new Set(Groups().flatMap((group) => MembersOf(group.meta)))
  function topPages(root) {
    const pages = PagesIn(root, null)
    return root === worldRoot ? pages.filter((page) => !memberIds().has(page.meta.id)) : pages
  }
  function childPages(card) {
    const children = PagesIn(card.root, card.meta.id)
    if (card.root !== worldRoot || card.meta.type !== 'group') return children
    const seen = new Set(children.map((c) => c.meta.id))
    const members = MembersOf(card.meta).map((id) => EntityById(id)).filter((m) => m && !seen.has(m.meta.id))
    return [...children, ...members.sort((a, b) => String(a.meta.name).localeCompare(String(b.meta.name)))]
  }
  const isFolder = (card) => card.meta.type === 'folder' || card.meta.type === 'group' || card.isContainer

  // --- chapters ---
  const chapterRows = (arc) => ArcChapters(arc)
  const chapterOrder = () => [...ArcNames().flatMap((name) => chapterRows(name)), ...chapterRows('')]
  const chapterText = (chapter) => chapter.body || ''
  const chapterTitle = (chapter) => chapterLabel(chapter.number, chapter.meta?.title ?? chapter.title)
  const arcRange = (name) => {
    const numbers = chapterRows(name).filter((c) => chapterText(c).trim() || c.meta?.lastDraft).map((c) => c.number).filter((n) => n != null)
    if (!numbers.length) return ''
    const low = Math.min(...numbers), high = Math.max(...numbers)
    return low === high ? String(low) : `${low}–${high}`
  }
  const totalWords = () => chapterOrder().reduce((sum, c) => sum + wordsIn(chapterText(c)), 0)

  function handleChapterClick(event, chapter) {
    if (event.metaKey || event.ctrlKey) {
      SelectAnchor = chapter.id
      SetSelectedChapters((ids) => (ids.includes(chapter.id) ? ids.filter((id) => id !== chapter.id) : [...ids, chapter.id]))
      return
    }
    if (event.shiftKey && (SelectedChapters().length || SelectAnchor)) {
      const order = chapterOrder().map((c) => c.id)
      const from = order.indexOf(SelectAnchor ?? chapter.id), to = order.indexOf(chapter.id)
      const [low, high] = from < to ? [from, to] : [to, from]
      SetSelectedChapters(order.slice(low, high + 1))
      return
    }
    SelectAnchor = chapter.id
    SetSelectedChapters([])
    OpenDocument({ id: chapter.id, file: chapter.file, title: chapter.title })
  }

  function openNewChapter(arc) {
    SetNewChapter({ number: String(nextChapterNumber()), title: '', arc: arc ?? undefined })
  }
  async function runNewChapter() {
    const draft = NewChapter()
    SetNewChapter(null)
    if (draft.arc) expand(`arc:${draft.arc}`)
    await AddChapter({ number: draft.number, title: draft.title.trim(), arc: draft.arc })
  }
  function applyArcToSelected() {
    SetArcForChapters(SelectedChapters(), ArcPrompt().value.trim())
    SetArcPrompt(null)
  }
  async function runDeleteChapters() {
    const ids = SelectedChapters()
    SetConfirmDelete(false)
    SetSelectedChapters([])
    await DeleteChapters(ids)
  }

  // --- inline create / rename ---
  function startCreate(section, parentId, kind) {
    SetMenu(null)
    SetRenaming(null)
    SetExpanded((map) => ({ ...map, [`sec:${section}`]: true, ...(parentId ? { [`pg:${parentId}`]: true } : {}) }))
    SetCreating({ section, parentId, kind })
  }
  async function commitCreate(value, openAfter) {
    const pending = Creating()
    SetCreating(null)
    const name = value.trim()
    if (!pending || !name) return
    if (pending.kind === 'arc') { await CreateArc(name); return }
    await CreatePage(pending.section, pending.parentId, name, { folder: pending.kind === 'folder', open: openAfter })
  }
  function startRename(key) {
    SetMenu(null)
    SetCreating(null)
    SetRenaming(key)
  }
  async function commitRename(key, value) {
    SetRenaming(null)
    const [kind, ...rest] = key.split(':')
    const id = rest.join(':')
    if (kind === 'pg') await RenamePage(id, value)
    else if (kind === 'arc') await RenameArc(id, value)
    else if (kind === 'ch') UpdateChapterMeta(id, 'title', value.trim())
  }
  function handleInlineKey(event, commit) {
    if (event.key === 'Enter') { event.preventDefault(); commit(event.currentTarget.value, true) }
    if (event.key === 'Escape') { event.preventDefault(); SetCreating(null); SetRenaming(null) }
  }
  const focusInline = (element) => queueMicrotask(() => { element.focus(); element.select() })

  // --- menus ---
  const openMenu = (event, items) => {
    event.preventDefault()
    event.stopPropagation()
    SetMenu({ x: event.clientX, y: event.clientY, items })
  }
  function runMenuItem(item) {
    SetMenu(null)
    item.run()
  }
  function sectionItems(section) {
    if (section === 'ms') {
      return [
        { label: 'New chapter', icon: FileTextIcon, run: () => openNewChapter(ArcNames().at(-1)) },
        { label: 'New arc', icon: ArcIcon, run: () => startCreate('ms', null, 'arc') },
      ]
    }
    return [
      { label: 'New page', icon: FileTextIcon, run: () => startCreate(section, null, 'page') },
      { label: 'New folder', icon: FolderIcon, run: () => startCreate(section, null, 'folder') },
    ]
  }
  async function deletePageWithUndo(card) {
    const undo = await DeletePage(card.meta.id)
    if (undo) showToast(`Deleted “${card.meta.name || 'Untitled'}”`, undo)
  }
  function pageItems(card, section) {
    return [
      { label: 'Open', icon: OpenIcon, run: () => OpenEntity(card) },
      { label: 'Rename', icon: PencilIcon, run: () => startRename(`pg:${card.meta.id}`) },
      { sep: true },
      { label: 'New page inside', icon: FileTextIcon, run: () => startCreate(section, card.meta.id, 'page') },
      { label: 'New folder inside', icon: FolderIcon, run: () => startCreate(section, card.meta.id, 'folder') },
      { label: 'Duplicate', icon: CopyIcon, run: () => DuplicatePage(card.meta.id) },
      { sep: true },
      { label: 'Delete', icon: TrashIcon, danger: true, run: () => deletePageWithUndo(card) },
    ]
  }
  async function compareChapter(chapter) {
    await LoadDrafts(chapter.id)
    const list = DraftList(chapter.id)
    if (!list.length) return
    const last = list[list.length - 1]
    if (draftState(chapter.meta, chapterText(chapter)) === 'changed' || list.length === 1) OpenDiff(chapter.id, last.n, 'now')
    else OpenDiff(chapter.id, list[list.length - 2].n, last.n)
  }
  function chapterItems(chapter) {
    if (!SelectedChapters().includes(chapter.id)) { SelectAnchor = chapter.id; SetSelectedChapters([chapter.id]) }
    const many = SelectedChapters().length > 1
    const items = [
      { label: 'Open', icon: OpenIcon, run: () => OpenDocument({ id: chapter.id, file: chapter.file, title: chapter.title }) },
      { label: 'Rename', icon: PencilIcon, run: () => startRename(`ch:${chapter.id}`) },
      { sep: true },
    ]
    if (!many && canPublish(chapter.meta, chapterText(chapter))) items.push({ label: `Publish draft ${workingDraftNumber(chapter.meta)}`, icon: SendIcon, run: () => PublishDraft(chapter.id) })
    if (!many && chapter.meta?.lastDraft) items.push({ label: 'Compare drafts', icon: CompareIcon, run: () => compareChapter(chapter) })
    items.push(
      { label: many ? `Set arc for ${SelectedChapters().length} chapters…` : 'Set arc…', icon: ArcIcon, run: () => SetArcPrompt({ value: '' }) },
      { sep: true },
      { label: many ? `Delete ${SelectedChapters().length} chapters…` : 'Delete…', icon: TrashIcon, danger: true, run: () => SetConfirmDelete(true) },
    )
    return items
  }
  function arcItems(name) {
    return [
      { label: 'Open', icon: OpenIcon, run: () => OpenArc(name) },
      { label: 'Rename', icon: PencilIcon, run: () => startRename(`arc:${name}`) },
      { label: 'New chapter in this arc', icon: FileTextIcon, run: () => openNewChapter(name) },
      { sep: true },
      { label: 'Delete arc', icon: TrashIcon, danger: true, run: async () => { const undo = await DeleteArc(name); showToast(`Deleted arc “${name}” — its chapters stay`, undo) } },
    ]
  }

  // --- drag and drop ---
  // Pages move into / around pages and onto section tops; chapters move between arcs.
  function dropPosition(event, allowInside) {
    const box = event.currentTarget.getBoundingClientRect() // hit-testing only, never positioning
    const ratio = (event.clientY - box.top) / box.height
    if (!allowInside) return 'in'
    return ratio < 0.28 ? 'before' : ratio > 0.72 ? 'after' : 'in'
  }
  function startDrag(event, kind, id) {
    SetDragging({ kind, id })
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', id)
  }
  const endDrag = () => { SetDragging(null); SetDropMark(null) }
  function overPage(event, card) {
    const drag = Dragging()
    if (drag?.kind !== 'page' || drag.id === card.meta.id) return
    event.preventDefault()
    SetDropMark({ key: `pg:${card.meta.id}`, position: dropPosition(event, true) })
  }
  async function dropOnPage(event, card) {
    event.preventDefault()
    const drag = Dragging(), mark = DropMark()
    endDrag()
    if (drag?.kind !== 'page' || !mark) return
    if (mark.position === 'in') { expand(`pg:${card.meta.id}`); await MovePage(drag.id, { parentId: card.meta.id }) }
    else await MovePage(drag.id, { parentId: card.parentId ?? null, section: sectionOfRoot(card.root), [mark.position === 'before' ? 'beforeId' : 'afterId']: card.meta.id })
  }
  function overTop(event, key) {
    if (Dragging()?.kind !== 'page') return
    event.preventDefault()
    SetDropMark({ key, position: 'in' })
  }
  async function dropOnTop(event, section) {
    event.preventDefault()
    const drag = Dragging()
    endDrag()
    if (drag?.kind === 'page') await MovePage(drag.id, { section, parentId: null })
  }
  function overArc(event, key) {
    if (Dragging()?.kind !== 'chapter') return
    event.preventDefault()
    SetDropMark({ key, position: 'in' })
  }
  function dropChapterOnArc(event, arc) {
    event.preventDefault()
    const drag = Dragging()
    endDrag()
    if (drag?.kind !== 'chapter') return
    const ids = SelectedChapters().includes(drag.id) ? SelectedChapters() : [drag.id]
    SetArcForChapters(ids, arc)
    if (arc) expand(`arc:${arc}`)
  }
  const sectionOfRoot = (root) => Object.keys(SECTION_ROOT).find((key) => SECTION_ROOT[key] === root)

  // --- keyboard on a focused row ---
  function handleRowKey(event, { open, renameKey, remove }) {
    if (event.target !== event.currentTarget) return
    if (event.key === 'Enter') { event.preventDefault(); open() }
    else if (event.key === 'F2' && renameKey) { event.preventDefault(); startRename(renameKey) }
    else if (event.key === 'Delete' && remove) { event.preventDefault(); remove() }
  }

  // 6. JSX-helper builders
  const isSelectedDoc = (kind, id) => CurrentDoc.kind === kind && CurrentDoc.id === id
  const pageSelected = (card) => (CurrentDoc.kind === 'entity' || CurrentDoc.kind === 'group') && CurrentDoc.id === card.meta.id
  const indent = (depth) => ({ 'padding-left': `${12 + depth * INDENT_PX}px` })
  function dropClass(key) {
    const mark = DropMark()
    return mark && mark.key === key ? `drop-${mark.position}` : ''
  }
  const plan = () => PlanSummary()
  const writtenChapters = () => chapterOrder().filter((c) => chapterText(c).trim() || c.meta?.lastDraft).length
  function bookMeta() {
    const words = `${formatNumber(totalWords())}${plan().words ? ` / ${formatNumber(plan().words)}` : ''} words`
    const chapters = `${writtenChapters()}${plan().chapters ? ` / ${plan().chapters}` : ''} ch`
    return `${words} · ${chapters}`
  }
  const bookProgress = () => (plan().words ? `${Math.min(100, Math.round((totalWords() / plan().words) * 100))}%` : '0%')
  const coverInitial = () => (Book.overview.meta.title || Project.manifest?.name || '?').trim().charAt(0).toUpperCase()
  const worldEntries = () => Cards().filter((c) => c.root === worldRoot && !isFolder(c)).length

  // --- row components (defined inside so they share the explorer's state) ---
  function InlineInput(props) {
    return (
      <input class="inl" value={props.value ?? ''} placeholder={props.placeholder} ref={focusInline}
        onKeyDown={(event) => handleInlineKey(event, props.commit)}
        onBlur={(event) => props.commit(event.currentTarget.value, false)}
        onClick={(event) => event.stopPropagation()} />
    )
  }

  function CreatingRow(props) {
    const kindIcon = () => (Creating()?.kind === 'folder' ? <FolderIcon size={15} class="ic" /> : Creating()?.kind === 'arc' ? <ArcIcon size={15} class="ic arcic" /> : <FileTextIcon size={15} class="ic" />)
    const placeholder = () => ({ page: 'Page name', folder: 'Folder name', arc: 'Arc name' })[Creating()?.kind]
    return (
      <div class="node creating" style={indent(props.depth)}>
        <span class="tw" />
        {kindIcon()}
        <InlineInput placeholder={placeholder()} commit={commitCreate} />
      </div>
    )
  }
  const creatingIn = (section, parentId) => {
    const pending = Creating()
    return pending && pending.kind !== 'arc' && pending.section === section && (pending.parentId ?? null) === (parentId ?? null)
  }

  function PageRow(props) {
    const card = () => props.card
    const key = () => `pg:${card().meta.id}`
    const kids = () => childPages(card())
    const creatingHere = () => creatingIn(props.section, card().meta.id)
    const hasKids = () => kids().length > 0 || creatingHere()
    const open = () => isExpanded(key()) || creatingHere()
    function handleClick() {
      if (hasKids() && pageSelected(card())) { toggle(key()); return }
      if (hasKids()) expand(key())
      OpenEntity(card())
    }
    const rowClass = () => `node ${pageSelected(card()) ? 'sel' : ''} ${dropClass(key())} ${Dragging()?.id === card().meta.id ? 'dragging' : ''}`
    return (
      <>
        <div class={rowClass()} style={indent(props.depth)} role="treeitem" tabindex="0" title={card().meta.summary || ''}
          draggable="true" onDragStart={(e) => startDrag(e, 'page', card().meta.id)} onDragEnd={endDrag}
          onDragOver={(e) => overPage(e, card())} onDragLeave={() => SetDropMark(null)} onDrop={(e) => dropOnPage(e, card())}
          onClick={handleClick} onDblClick={() => startRename(key())}
          onContextMenu={(e) => openMenu(e, pageItems(card(), props.section))}
          onKeyDown={(e) => handleRowKey(e, { open: () => OpenEntity(card()), renameKey: key(), remove: () => deletePageWithUndo(card()) })}>
          <span class="tw" onClick={(e) => { if (hasKids()) { e.stopPropagation(); toggle(key()) } }}>
            <Show when={hasKids()}>{open() ? <ChevronDownIcon size={14} /> : <ChevronRightIcon size={14} />}</Show>
          </span>
          {isFolder(card()) ? <FolderIcon size={15} class="ic" /> : <FileTextIcon size={15} class="ic" />}
          <Show when={Renaming() === key()} fallback={<span class="lbl">{card().meta.name || 'Untitled'}</span>}>
            <InlineInput value={card().meta.name} placeholder="Name" commit={(value) => commitRename(key(), value)} />
          </Show>
          <Show when={kids().length}><span class="tag">{kids().length}</span></Show>
          <span class="node-actions">
            <Show when={isFolder(card())}>
              <button class="nodebtn" title="New page inside" onClick={(e) => { e.stopPropagation(); startCreate(props.section, card().meta.id, 'page') }}><PlusIcon size={14} /></button>
            </Show>
            <button class="nodebtn" title="More" onClick={(e) => openMenu(e, pageItems(card(), props.section))}><MoreIcon size={14} /></button>
          </span>
        </div>
        <Show when={hasKids() && open() && props.depth < 10}>
          <For each={kids()}>{(child) => <PageRow card={child} depth={props.depth + 1} section={props.section} />}</For>
          <Show when={creatingHere()}><CreatingRow depth={props.depth + 1} /></Show>
        </Show>
      </>
    )
  }

  function PageTree(props) {
    return (
      <>
        <For each={topPages(SECTION_ROOT[props.section])}>{(card) => <PageRow card={card} depth={props.depth ?? 1} section={props.section} />}</For>
        <Show when={creatingIn(props.section, null)}><CreatingRow depth={props.depth ?? 1} /></Show>
      </>
    )
  }

  function ChapterRow(props) {
    const chapter = () => props.chapter
    const key = () => `ch:${chapter().id}`
    const state = () => draftState(chapter().meta, chapterText(chapter()))
    const words = () => wordsIn(chapterText(chapter()))
    const rowClass = () => `node ${isSelectedDoc('chapter', chapter().id) ? 'sel' : ''} ${SelectedChapters().includes(chapter().id) ? 'selected' : ''} ${Dragging()?.id === chapter().id ? 'dragging' : ''}`
    const tooltip = () => `Draft ${workingDraftNumber(chapter().meta)} · ${stateLine(chapter().meta, chapterText(chapter()))} · ${formatNumber(words())} words`
    return (
      <div class={rowClass()} style={indent(props.depth)} role="treeitem" tabindex="0" title={tooltip()}
        draggable="true" onDragStart={(e) => startDrag(e, 'chapter', chapter().id)} onDragEnd={endDrag}
        onDragOver={(e) => overArc(e, `arc:${chapter().meta?.arc || ''}`)} onDrop={(e) => dropChapterOnArc(e, chapter().meta?.arc || '')}
        onClick={(e) => handleChapterClick(e, chapter())} onDblClick={() => startRename(key())}
        onContextMenu={(e) => openMenu(e, chapterItems(chapter()))}
        onKeyDown={(e) => handleRowKey(e, { open: () => OpenDocument({ id: chapter().id, file: chapter().file }), renameKey: key() })}>
        <span class="tw" />
        <span class={`sd ${state()}`} />
        <Show when={Renaming() === key()} fallback={<span class="lbl" classList={{ planned: state() === 'empty' }}>{chapterTitle(chapter())}</span>}>
          <InlineInput value={chapter().meta?.title ?? chapter().title} placeholder="Untitled" commit={(value) => commitRename(key(), value)} />
        </Show>
        <Show when={state() !== 'empty'}><span class="tag">{formatNumber(words())}</span></Show>
        <span class="node-actions">
          <button class="nodebtn" title="More" onClick={(e) => openMenu(e, chapterItems(chapter()))}><MoreIcon size={14} /></button>
        </span>
      </div>
    )
  }

  function ArcRow(props) {
    const key = () => `arc:${props.name}`
    const open = () => isExpanded(key())
    function handleClick() {
      if (isSelectedDoc('arc', props.name)) { toggle(key()); return }
      expand(key())
      OpenArc(props.name)
    }
    const rowClass = () => `node arc ${isSelectedDoc('arc', props.name) ? 'sel' : ''} ${dropClass(key())}`
    return (
      <>
        <div class={rowClass()} style={indent(1)} role="treeitem" tabindex="0"
          onDragOver={(e) => overArc(e, key())} onDragLeave={() => SetDropMark(null)} onDrop={(e) => dropChapterOnArc(e, props.name)}
          onClick={handleClick} onDblClick={() => startRename(key())} onContextMenu={(e) => openMenu(e, arcItems(props.name))}
          onKeyDown={(e) => handleRowKey(e, { open: () => OpenArc(props.name), renameKey: key() })}>
          <span class="tw" onClick={(e) => { e.stopPropagation(); toggle(key()) }}>{open() ? <ChevronDownIcon size={14} /> : <ChevronRightIcon size={14} />}</span>
          <ArcIcon size={15} class="ic arcic" />
          <Show when={Renaming() === key()} fallback={<span class="lbl">{props.name}</span>}>
            <InlineInput value={props.name} placeholder="Arc name" commit={(value) => commitRename(key(), value)} />
          </Show>
          <Show when={arcRange(props.name)}><span class="tag">{arcRange(props.name)}</span></Show>
          <span class="node-actions">
            <button class="nodebtn" title="New chapter in this arc" onClick={(e) => { e.stopPropagation(); openNewChapter(props.name) }}><PlusIcon size={14} /></button>
            <button class="nodebtn" title="More" onClick={(e) => openMenu(e, arcItems(props.name))}><MoreIcon size={14} /></button>
          </span>
        </div>
        <Show when={open()}>
          <For each={chapterRows(props.name)}>{(chapter) => <ChapterRow chapter={chapter} depth={2} />}</For>
        </Show>
      </>
    )
  }

  // Front / back matter: a group row over the top of its own page tree.
  function MatterGroup(props) {
    const key = () => `grp:${props.section}`
    const pages = () => topPages(SECTION_ROOT[props.section])
    const hasKids = () => pages().length > 0 || creatingIn(props.section, null)
    const open = () => isExpanded(key()) || creatingIn(props.section, null)
    return (
      <>
        <div class={`node ${dropClass(key())}`} style={indent(1)} role="treeitem" tabindex="0"
          onDragOver={(e) => overTop(e, key())} onDragLeave={() => SetDropMark(null)} onDrop={(e) => dropOnTop(e, props.section)}
          onClick={() => toggle(key())}>
          <span class="tw"><Show when={hasKids()}>{open() ? <ChevronDownIcon size={14} /> : <ChevronRightIcon size={14} />}</Show></span>
          <FolderIcon size={15} class="ic" />
          <span class="lbl">{props.label}</span>
          <Show when={pages().length}><span class="tag">{pages().length}</span></Show>
          <span class="node-actions">
            <button class="nodebtn" title={`New ${props.label.toLowerCase()} page`} onClick={(e) => { e.stopPropagation(); expand(key()); startCreate(props.section, null, 'page') }}><PlusIcon size={14} /></button>
          </span>
        </div>
        <Show when={open()}>
          <PageTree section={props.section} depth={2} />
        </Show>
      </>
    )
  }

  function Section(props) {
    const key = () => `sec:${props.id}`
    const open = () => isExpanded(key(), true)
    const headClass = () => `sechead ${dropClass(key())}`
    function handleDragOver(event) {
      if (props.id === 'ms') overArc(event, key())
      else if (props.pages) overTop(event, key())
    }
    function handleDrop(event) {
      if (props.id === 'ms') dropChapterOnArc(event, '')
      else if (props.pages) dropOnTop(event, props.id)
    }
    return (
      <div class="sec">
        <div class={headClass()} onClick={() => toggle(key(), true)} onDragOver={handleDragOver} onDragLeave={() => SetDropMark(null)} onDrop={handleDrop}
          onContextMenu={(e) => props.addable && openMenu(e, sectionItems(props.id))}>
          <span class="tw">{open() ? <ChevronDownIcon size={13} /> : <ChevronRightIcon size={13} />}</span>
          <span>{SECTION_TITLES[props.id]}</span>
          <span class="ss">{props.sub}</span>
          <span class="node-actions">
            {props.actions}
            <Show when={props.addable}>
              <button class="nodebtn" title="New…" onClick={(e) => openMenu(e, sectionItems(props.id))}><PlusIcon size={14} /></button>
            </Show>
          </span>
        </div>
        <Show when={open()}><div class="secbody">{props.children}</div></Show>
      </div>
    )
  }

  function BookRow() {
    const coverUrl = () => BookCoverUrl()
    return (
      <div class="bookrow" classList={{ sel: isSelectedDoc('book', 'overview') }} role="treeitem" tabindex="0"
        onClick={() => OpenBookPage('overview')} onKeyDown={(e) => e.key === 'Enter' && OpenBookPage('overview')}>
        <div class="bookthumb">
          <Show when={coverUrl()} fallback={<div class="tcover thumb"><div class="ct">{coverInitial()}</div></div>}>
            <img class="cover-img" src={coverUrl()} alt="Cover" />
          </Show>
        </div>
        <div class="bookinfo">
          <div class="booktitle">{Book.overview.meta.title || Project.manifest?.name || 'Untitled book'}</div>
          <div class="bookmeta">{bookMeta()}</div>
          <Show when={plan().words}><div class="bar"><i style={{ width: bookProgress() }} /></div></Show>
        </div>
      </div>
    )
  }

  function BookPageRow(props) {
    return (
      <div class="node" classList={{ sel: isSelectedDoc('book', props.page) }} style={indent(1)} role="treeitem" tabindex="0"
        onClick={() => OpenBookPage(props.page)} onKeyDown={(e) => e.key === 'Enter' && OpenBookPage(props.page)}>
        <span class="tw" />
        {props.icon}
        <span class="lbl">{props.label}</span>
        <Show when={props.tag}><span class="tag">{props.tag}</span></Show>
      </div>
    )
  }

  const textWords = (page) => (wordsIn(Book[page].body) ? `${formatNumber(wordsIn(Book[page].body))} w` : '')
  const graphButton = () => (
    <button class="nodebtn" title="Relationships" onClick={(e) => { e.stopPropagation(); OpenGraph() }}><GraphIcon size={14} /></button>
  )
  const menuStyle = () => ({ left: `${Math.min(Menu().x, window.innerWidth - 220)}px`, top: `${Math.min(Menu().y, window.innerHeight - 40 - Menu().items.length * 30)}px` })

  // 7. JSX
  return (
    <div class="binder" role="tree">
      <Section id="book">
        <BookRow />
        <BookPageRow page="blurb" label="Blurb" icon={<QuoteIcon size={15} class="ic" />} tag={textWords('blurb')} />
        <BookPageRow page="synopsis" label="Synopsis" icon={<LinesIcon size={15} class="ic" />} tag={textWords('synopsis')} />
        <BookPageRow page="publishing" label="Publishing" icon={<GlobeIcon size={15} class="ic" />} />
      </Section>

      <Section id="plot" addable pages>
        <div class="node" classList={{ sel: CurrentDoc.kind === 'timeline' }} style={indent(1)} role="treeitem" tabindex="0"
          onClick={() => OpenTimeline()} onKeyDown={(e) => e.key === 'Enter' && OpenTimeline()}>
          <span class="tw" />
          <TimelineIcon size={15} class="ic" />
          <span class="lbl">Outline</span>
          <span class="tag">{chapterOrder().length} ch</span>
        </div>
        <PageTree section="plot" />
      </Section>

      <Section id="ms" addable sub={`${formatNumber(totalWords())} words`}>
        <MatterGroup section="front" label="Front matter" />
        <For each={ArcNames()}>{(name) => <ArcRow name={name} />}</For>
        <Show when={Creating()?.kind === 'arc'}><CreatingRow depth={1} /></Show>
        <For each={chapterRows('')}>{(chapter) => <ChapterRow chapter={chapter} depth={1} />}</For>
        <MatterGroup section="back" label="Back matter" />
      </Section>

      <Section id="world" addable pages sub={`${worldEntries()} entries`} actions={graphButton()}>
        <PageTree section="world" />
      </Section>

      <Section id="notes" addable pages>
        <div class="node" classList={{ sel: CurrentDoc.kind === 'scraps' }} style={indent(1)} role="treeitem" tabindex="0"
          onClick={() => OpenScraps()} onKeyDown={(e) => e.key === 'Enter' && OpenScraps()}>
          <span class="tw" />
          <ScissorsIcon size={15} class="ic" />
          <span class="lbl">Scrapped text</span>
          <Show when={AllScraps().length}><span class="tag">{AllScraps().length}</span></Show>
        </div>
        <PageTree section="notes" />
      </Section>

      <Show when={Menu()}>
        <div class="ctx-overlay" onClick={() => SetMenu(null)} onContextMenu={(e) => { e.preventDefault(); SetMenu(null) }}>
          <div class="ctx-menu binder-menu" style={menuStyle()} onClick={(e) => e.stopPropagation()}>
            <For each={Menu().items}>
              {(item) => (
                <Show when={!item.sep} fallback={<div class="ctx-sep" />}>
                  <button classList={{ 'ctx-danger': item.danger }} onClick={() => runMenuItem(item)}>
                    {item.icon ? <item.icon size={14} /> : null}{item.label}
                  </button>
                </Show>
              )}
            </For>
          </div>
        </div>
      </Show>

      <Show when={NewChapter()}>
        <div class="modal-overlay" onClick={() => SetNewChapter(null)}>
          <div class="modal" onClick={(e) => e.stopPropagation()}>
            <div class="modal-head">New chapter{NewChapter().arc ? ` in ${NewChapter().arc}` : ''}</div>
            <div class="export-body">
              <div class="export-field">
                <label>Number</label>
                <input type="number" step="0.1" value={NewChapter().number} onInput={(e) => SetNewChapter({ ...NewChapter(), number: e.currentTarget.value })} />
              </div>
              <div class="export-field">
                <label>Title</label>
                <input value={NewChapter().title} placeholder="Untitled" ref={focusInline}
                  onInput={(e) => SetNewChapter({ ...NewChapter(), title: e.currentTarget.value })}
                  onKeyDown={(e) => e.key === 'Enter' && runNewChapter()} />
              </div>
              <Show when={chapterNumberExists(NewChapter().number)}>
                <div class="export-result bad">Chapter {NewChapter().number} already exists. Use a decimal (e.g. {NewChapter().number}.5) or a free number.</div>
              </Show>
            </div>
            <div class="modal-foot">
              <button class="modal-cancel" onClick={() => SetNewChapter(null)}>Cancel</button>
              <button class="modal-go" onClick={runNewChapter}>Create</button>
            </div>
          </div>
        </div>
      </Show>

      <Show when={ArcPrompt()}>
        <div class="modal-overlay" onClick={() => SetArcPrompt(null)}>
          <div class="modal" onClick={(e) => e.stopPropagation()}>
            <div class="modal-head">Set arc · {SelectedChapters().length} chapter{SelectedChapters().length === 1 ? '' : 's'}</div>
            <div class="export-body">
              <div class="export-field">
                <label>Arc</label>
                <input list="binder-arc-names" value={ArcPrompt().value} placeholder="Arc name (blank = no arc)" ref={focusInline}
                  onInput={(e) => SetArcPrompt({ value: e.currentTarget.value })} onKeyDown={(e) => e.key === 'Enter' && applyArcToSelected()} />
                <datalist id="binder-arc-names"><For each={ArcNames()}>{(name) => <option value={name} />}</For></datalist>
              </div>
            </div>
            <div class="modal-foot">
              <button class="modal-cancel" onClick={() => SetArcPrompt(null)}>Cancel</button>
              <button class="modal-go" onClick={applyArcToSelected}>Apply</button>
            </div>
          </div>
        </div>
      </Show>

      <Show when={ConfirmDelete()}>
        <div class="modal-overlay" onClick={() => SetConfirmDelete(false)}>
          <div class="modal" onClick={(e) => e.stopPropagation()}>
            <div class="modal-head">Delete {SelectedChapters().length} chapter{SelectedChapters().length === 1 ? '' : 's'}?</div>
            <div class="modal-body"><div class="confirm-msg">This permanently removes the chapter file{SelectedChapters().length === 1 ? '' : 's'} from disk. This can't be undone.</div></div>
            <div class="modal-foot">
              <button class="modal-cancel" onClick={() => SetConfirmDelete(false)}>Cancel</button>
              <button class="modal-go danger" onClick={runDeleteChapters}>Delete</button>
            </div>
          </div>
        </div>
      </Show>
    </div>
  )
}
