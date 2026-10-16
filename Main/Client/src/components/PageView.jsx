import { For, Show, createSignal } from 'solid-js'
import { open as openUrl } from '@tauri-apps/plugin-shell'
import { useProject } from '../project/ProjectContext.jsx'
import { SECTION_ROOT } from '../project/format.js'
import { pageFields, parseEntryList } from '../project/pages.js'
import Editor from './Editor.jsx'
import EntitySelect from './EntitySelect.jsx'
import { showToast } from './Toast.jsx'
import { PlusIcon, OpenIcon, XIcon, FolderIcon, FileTextIcon, SparkleIcon } from './icons.jsx'
import './BookPages.css'
import './EntityPage.css'
import './PageView.css'

const SECTION_OF_ROOT = Object.fromEntries(Object.entries(SECTION_ROOT).map(([section, root]) => [root, section]))
const SECTION_NAMES = { world: 'World', plot: 'Plot', notes: 'Notes', front: 'Front matter', back: 'Back matter' }
const isUrl = (text) => /^https?:\/\/\S+$/i.test(String(text || '').trim())
const aliasForm = (alias) => (typeof alias === 'object' ? alias?.form : alias)

// A page in the World, Plot or Notes (or front/back matter): name, one-line
// description, fields that link to other pages, a long-form body. A folder shows
// its pages as a table with columns and a quick-add line.
export default function PageView() {
  const {
    CurrentDoc, UpdateMeta, UpdateBody, EntityById, OpenEntityById, Entities, PreviewFor, Banks, EntityIndex,
    PageChildren, ColumnsOf, PageNamed, RetitlePageTabs, UpdatePageMeta, AddPagesTo, CanGenerate, GeneratePageIn,
    AddEntityMedia, RemoveEntityMedia, SetPortrait, EntityMediaUrl,
  } = useProject()

  // 2. Signals
  const [AddingField, SetAddingField] = createSignal(false)
  const [AddingColumn, SetAddingColumn] = createSignal(false)

  // 5. Handlers
  const card = () => EntityById(CurrentDoc.id)
  const meta = () => CurrentDoc.meta || {}
  const isWorld = () => CurrentDoc.root === SECTION_ROOT.world
  const isFolder = () => meta().type === 'folder' || meta().type === 'group' || Boolean(card()?.isContainer && !CurrentDoc.body)
  const children = () => PageChildren(CurrentDoc.id)
  const columns = () => (Array.isArray(meta().columns) ? meta().columns : ColumnsOf(card() || { meta: meta() }))
  const showTable = () => meta().type === 'folder' || meta().type === 'group' || (children().length > 0 && columns().length > 0 && !CurrentDoc.body)

  function addField(event) {
    if (event.key === 'Escape') { SetAddingField(false); return }
    if (event.key !== 'Enter') return
    const key = event.currentTarget.value.replace(/:/g, '').trim()
    SetAddingField(false)
    if (key && meta()[key] === undefined) UpdateMeta(key, '')
  }
  function addColumn(event) {
    if (event.key === 'Escape') { SetAddingColumn(false); return }
    if (event.key !== 'Enter') return
    const name = event.currentTarget.value.replace(/:/g, '').trim()
    SetAddingColumn(false)
    if (name && !columns().includes(name)) UpdateMeta('columns', [...columns(), name])
  }
  function removeColumn(name) {
    UpdateMeta('columns', columns().filter((c) => c !== name))
    showToast(`Removed column “${name}” — the values stay on each page`)
  }
  async function quickAdd(text, input) {
    const firstSeen = columns().find((c) => /first/i.test(c))
    const entries = parseEntryList(text).map((e) => ({ name: e.name, summary: e.summary, fields: e.chapter && firstSeen ? { [firstSeen]: e.chapter } : {} }))
    if (!entries.length) return
    input.value = ''
    const added = await AddPagesTo(CurrentDoc.id, entries)
    if (added > 1) showToast(`Added ${added} pages`)
    input.focus()
  }
  function handleQuickKey(event) {
    if (event.key === 'Enter') { event.preventDefault(); quickAdd(event.currentTarget.value, event.currentTarget) }
  }
  function handleQuickPaste(event) {
    const text = event.clipboardData?.getData('text') || ''
    if (!text.includes('\n')) return
    event.preventDefault()
    quickAdd(text, event.currentTarget)
  }
  function addAlias(event) {
    if (event.key !== 'Enter') return
    const value = event.currentTarget.value.trim()
    event.currentTarget.value = ''
    const aliases = meta().aliases || []
    if (value && !aliases.some((a) => aliasForm(a) === value)) UpdateMeta('aliases', [...aliases, value])
  }
  const removeAlias = (index) => UpdateMeta('aliases', (meta().aliases || []).filter((_, i) => i !== index))
  async function openLink(url) {
    try { await openUrl(url) } catch { showToast('Couldn’t open the link') }
  }

  // relationships (World pages)
  const rels = () => meta().relationships || []
  const addRel = () => UpdateMeta('relationships', [...rels(), { label: '', to: '' }])
  const updateRel = (i, patch) => UpdateMeta('relationships', rels().map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  const removeRel = (i) => UpdateMeta('relationships', rels().filter((_, idx) => idx !== i))

  // 6. JSX-helper builders
  const fields = () => pageFields(meta())
  const ancestors = () => {
    const out = []
    let current = card()
    while (current?.parentId) { current = EntityById(current.parentId); if (current) out.unshift(current) }
    return out
  }
  const sectionName = () => SECTION_NAMES[SECTION_OF_ROOT[CurrentDoc.root]] || 'World'
  const firstSeen = (id) => (EntityIndex().firstSeen[id] != null ? `Ch. ${EntityIndex().firstSeen[id]}` : '')
  const cellPlaceholder = (child, column) => (/first/i.test(column) ? firstSeen(child.meta.id) || '—' : '—')
  const wrapClass = () => `docwrap ${showTable() ? 'wide' : ''}`
  const rule = () => meta().memberRule

  // 7. JSX
  return (
    <div class="docscroll">
      <div class={wrapClass()}>
        <div class="crumbline">
          <span>{sectionName()}</span>
          <For each={ancestors()}>{(a) => (<><span>›</span><a onClick={() => OpenEntityById(a.meta.id)}>{a.meta.name}</a></>)}</For>
        </div>
        <input class="ptitle" value={meta().name || ''} placeholder="Untitled" aria-label="Name"
          onInput={(e) => UpdateMeta('name', e.currentTarget.value)} onChange={(e) => RetitlePageTabs(CurrentDoc.id, e.currentTarget.value)} />
        <input class="psummary" value={meta().summary || ''} placeholder="One-line description" aria-label="Description"
          onInput={(e) => UpdateMeta('summary', e.currentTarget.value)} />

        <Show when={isWorld() && !isFolder()}>
          <div class="aliasrow">
            <span class="flabel">Also called</span>
            <For each={meta().aliases || []}>
              {(alias, i) => <span class="chip">{aliasForm(alias)}<button class="cx" aria-label="Remove" onClick={() => removeAlias(i())}>×</button></span>}
            </For>
            <input class="chipin" placeholder="Add a name" aria-label="Alias" onKeyDown={addAlias} />
          </div>
        </Show>

        <Show when={!isFolder() || fields().length}>
          <div class="props">
            <For each={fields()}>
              {([key, value]) => (
                <div class="prop">
                  <span class="prop-k" title={key}>{key}</span>
                  <input class="prop-v" value={String(value)} placeholder={/first/i.test(key) ? firstSeen(CurrentDoc.id) || 'Empty' : 'Empty'}
                    onInput={(e) => UpdateMeta(key, e.currentTarget.value)} />
                  <span class="prop-slot">
                    <Show when={isUrl(value)} fallback={
                      <Show when={PageNamed(value)}>
                        {(target) => <button title={`Open ${target().meta.name}`} onClick={() => OpenEntityById(target().meta.id)}><OpenIcon size={13} /></button>}
                      </Show>
                    }>
                      <button title="Open link" onClick={() => openLink(String(value).trim())}><OpenIcon size={13} /></button>
                    </Show>
                  </span>
                  <span class="prop-slot"><button class="prop-x" title="Remove field" onClick={() => UpdateMeta(key, undefined)}><XIcon size={13} /></button></span>
                </div>
              )}
            </For>
            <div class="prop-add">
              <Show when={AddingField()} fallback={<button class="linkbtn" onClick={() => SetAddingField(true)}>+ Add field</button>}>
                <input placeholder="Field name, e.g. Age" ref={(el) => queueMicrotask(() => el.focus())} onKeyDown={addField} onBlur={() => SetAddingField(false)} />
              </Show>
            </div>
          </div>
        </Show>

        <Show when={rule()?.key}>
          <div class="counts rule-line">Also lists every page whose {rule().key} is {rule().value}</div>
        </Show>

        <Show when={showTable()}>
          <div class="tblwrap">
            <table class="tbl">
              <thead>
                <tr>
                  <th>Name</th><th>Description</th>
                  <For each={columns()}>{(column) => <th>{column}<button class="thx" title="Remove column" onClick={() => removeColumn(column)}>×</button></th>}</For>
                  <th class="thadd">
                    <Show when={AddingColumn()} fallback={<button class="thx show" title="Add column" onClick={() => SetAddingColumn(true)}><PlusIcon size={13} /></button>}>
                      <input placeholder="Column name" ref={(el) => queueMicrotask(() => el.focus())} onKeyDown={addColumn} onBlur={() => SetAddingColumn(false)} />
                    </Show>
                  </th>
                </tr>
              </thead>
              <tbody>
                <For each={children()} fallback={<tr><td colspan={columns().length + 3} class="tnum left">Empty</td></tr>}>
                  {(child) => (
                    <tr>
                      <td><div class="tname" onClick={() => OpenEntityById(child.meta.id)}>{child.meta.type === 'folder' || child.meta.type === 'group' || child.isContainer ? <FolderIcon size={14} /> : <FileTextIcon size={14} />}<span>{child.meta.name || 'Untitled'}</span></div></td>
                      <td><input value={child.meta.summary || ''} placeholder="—" onInput={(e) => UpdatePageMeta(child.meta.id, 'summary', e.currentTarget.value)} /></td>
                      <For each={columns()}>
                        {(column) => <td><input value={child.meta[column] == null || typeof child.meta[column] === 'object' ? '' : String(child.meta[column])} placeholder={cellPlaceholder(child, column)} onInput={(e) => UpdatePageMeta(child.meta.id, column, e.currentTarget.value)} /></td>}
                      </For>
                      <td />
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
          <div class="quickrow">
            <input class="quickadd" placeholder="Add: Name - description   (paste a list to add several)" onKeyDown={handleQuickKey} onPaste={handleQuickPaste} />
            <Show when={CanGenerate()}>
              <button class="btn" title="A new page named from your name banks, columns filled from banks of the same name" onClick={() => GeneratePageIn(CurrentDoc.id)}><SparkleIcon size={13} /> Generate</button>
            </Show>
          </div>
          <div class="subhead"><span class="flabel">Notes</span></div>
        </Show>

        <div class="page-body">
          <Editor doc={CurrentDoc.body} onChange={(text) => UpdateBody(text)} pageView={false}
            entities={Entities} onOpenEntity={OpenEntityById} previewFor={PreviewFor} banks={Banks} />
        </div>

        <Show when={!showTable()}>
          <div class="subhead"><span class="flabel">Pages inside</span><Show when={children().length}><span class="counts">{children().length}</span></Show></div>
          <Show when={children().length}>
            <div class="tblwrap">
              <table class="tbl">
                <tbody>
                  <For each={children()}>
                    {(child) => (
                      <tr>
                        <td><div class="tname" onClick={() => OpenEntityById(child.meta.id)}><FileTextIcon size={14} /><span>{child.meta.name || 'Untitled'}</span></div></td>
                        <td class="tnum left subtext">{child.meta.summary || ''}</td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </div>
          </Show>
          <input class="quickadd" placeholder="Add a page inside" onKeyDown={handleQuickKey} onPaste={handleQuickPaste} />
        </Show>

        <Show when={isWorld()}>
          <div class="ep-sec">
            <div class="ep-seclab">Media<button class="ep-secadd" onClick={AddEntityMedia}><PlusIcon size={12} /> add</button></div>
            <Show when={(meta().media || []).length}>
              <div class="ep-gallery">
                <For each={meta().media}>
                  {(item) => (
                    <div class="ep-media" classList={{ portrait: meta().portrait === item.file }}>
                      <img src={EntityMediaUrl(item.file)} alt={item.name} />
                      <div class="ep-mediabar">
                        <button title="Set as portrait" onClick={() => SetPortrait(item.file)}>★</button>
                        <button title="Remove" onClick={() => RemoveEntityMedia(item.file)}>×</button>
                      </div>
                    </div>
                  )}
                </For>
              </div>
            </Show>
          </div>
          <div class="ep-sec">
            <div class="ep-seclab">Relationships<button class="ep-secadd" onClick={addRel}><PlusIcon size={12} /> add</button></div>
            <div class="ep-rels">
              <For each={rels()}>
                {(rel, i) => (
                  <div class="ep-rel">
                    <input class="ep-relk" value={rel.label} placeholder="relation" onInput={(e) => updateRel(i(), { label: e.currentTarget.value })} />
                    <span class="ep-relarrow">→</span>
                    <EntitySelect value={rel.to} onSelect={(id) => updateRel(i(), { to: id })} exclude={[CurrentDoc.id]} allowClear placeholder="— page —" clearLabel="— page —" />
                    <Show when={rel.to && EntityById(rel.to)}>
                      <button class="ep-relopen" title="Open" onClick={() => OpenEntityById(rel.to)}>›</button>
                    </Show>
                    <button class="ep-secdel" title="Remove" onClick={() => removeRel(i())}>×</button>
                  </div>
                )}
              </For>
            </div>
          </div>
        </Show>
      </div>
    </div>
  )
}

// Right panel for a page: where the World page is named in chapters, and which
// pages point at it (a field naming it, or a mention).
export function PageDock() {
  const { CurrentDoc, MentionsFor, LinkedFrom, OpenChapterById, OpenEntityById } = useProject()
  const isWorld = () => CurrentDoc.root === SECTION_ROOT.world
  const hits = () => MentionsFor(CurrentDoc.id)
  const total = () => hits().reduce((sum, h) => sum + h.count, 0)
  const links = () => LinkedFrom(CurrentDoc.id)
  return (
    <>
      <Show when={isWorld()}>
        <div class="pane plan">
          <div class="pbar"><span class="t">Appears in</span><Show when={hits().length}><span class="sub">{total()} across {hits().length} ch</span></Show></div>
          <div class="pbody">
            <For each={hits()} fallback={<div class="dock-empty">Not named in any chapter yet.</div>}>
              {(hit) => (
                <button class="dock-mrow" onClick={() => OpenChapterById(hit.chapterId)}>
                  <span class="dock-mtick" /><span class="dock-msrc">{hit.title}</span><span class="dock-mct">{hit.count}×</span>
                </button>
              )}
            </For>
          </div>
        </div>
      </Show>
      <div class="pane plan">
        <div class="pbar"><span class="t">Linked from</span><Show when={links().length}><span class="sub">{links().length}</span></Show></div>
        <div class="pbody">
          <For each={links()} fallback={<div class="dock-empty">No other page points here.</div>}>
            {(link) => (
              <button class="dock-mrow" onClick={() => OpenEntityById(link.card.meta.id)}>
                <span class="dock-mtick" /><span class="dock-msrc">{link.card.meta.name}</span><span class="dock-mct">{link.via}</span>
              </button>
            )}
          </For>
        </div>
      </div>
    </>
  )
}
