import { For, Show, createSignal } from 'solid-js'
import { useProject } from '../project/ProjectContext.jsx'
import { avatarColor, avatarInitial } from './avatar.js'
import { PlusIcon } from './icons.jsx'
import Editor from './Editor.jsx'
import EntitySelect from './EntitySelect.jsx'
import './EntityPage.css'

export default function EntityPage() {
  const { CurrentDoc, UpdateBody, UpdateMeta, MentionsFor, EntityIndex, OpenDocument, OpenEntityById, Chapters, Entities, EntityById,
    AddEntityMedia, RemoveEntityMedia, SetPortrait, EntityMediaUrl, AddSubPage, PreviewFor, Banks } = useProject()

  // 2. Signals — local text for aliases so typing commas doesn't fight the array.
  const [AliasText, SetAliasText] = createSignal((CurrentDoc.meta?.aliases || []).join(', '))

  // 5. Handlers
  function handleAliases(value) {
    SetAliasText(value)
    UpdateMeta('aliases', value.split(',').map((part) => part.trim()).filter(Boolean))
  }
  function openChapter(chapterId) {
    const child = Chapters().find((candidate) => candidate.id === chapterId)
    if (child) OpenDocument(child)
  }

  const sections = () => CurrentDoc.meta?.sections || []
  const addSection = () => UpdateMeta('sections', [...sections(), { title: 'New section', body: '' }])
  const updateSection = (i, patch) => UpdateMeta('sections', sections().map((s, idx) => (idx === i ? { ...s, ...patch } : s)))
  const removeSection = (i) => UpdateMeta('sections', sections().filter((_, idx) => idx !== i))

  const rels = () => CurrentDoc.meta?.relationships || []
  const addRel = () => UpdateMeta('relationships', [...rels(), { label: '', to: '' }])
  const updateRel = (i, patch) => UpdateMeta('relationships', rels().map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  const removeRel = (i) => UpdateMeta('relationships', rels().filter((_, idx) => idx !== i))

  // 6. JSX-helper builders
  const hits = () => MentionsFor(CurrentDoc.id)
  const mentionTotal = () => hits().reduce((sum, h) => sum + h.count, 0)
  const firstSeen = () => EntityIndex().firstSeen[CurrentDoc.id]
  const others = () => Entities().filter((e) => e.meta.id !== CurrentDoc.id)
  const self = () => EntityById(CurrentDoc.id)
  const subPages = () => (self()?.childIds || []).map((id) => EntityById(id)).filter(Boolean)
  const addPage = () => AddSubPage(CurrentDoc.id, 'New page', 'Lore')

  return (
    <div class="ep">
      <div class="ep-page">
        <div class="ep-head">
          <Show
            when={CurrentDoc.meta?.portrait}
            fallback={<span class="ep-av" style={{ background: avatarColor(CurrentDoc.id) }}>{avatarInitial(CurrentDoc.meta?.name)}</span>}
          >
            <img class="ep-av ep-avimg" src={EntityMediaUrl(CurrentDoc.meta.portrait)} alt={CurrentDoc.meta?.name} />
          </Show>
          <div class="ep-headmain">
            <input class="ep-name" value={CurrentDoc.meta?.name || ''} placeholder="Name"
              onInput={(e) => UpdateMeta('name', e.currentTarget.value)} />
            <div class="ep-typebar">
              <input class="ep-type" value={CurrentDoc.meta?.type || ''} placeholder="Type"
                onInput={(e) => UpdateMeta('type', e.currentTarget.value)} />
              <input class="ep-status" value={CurrentDoc.meta?.status || ''} placeholder="status"
                onInput={(e) => UpdateMeta('status', e.currentTarget.value)} />
            </div>
            <div class="ep-aliases">
              <span class="ep-akey">Also known as</span>
              <input class="ep-aliasin" value={AliasText()} placeholder="comma, separated, aliases"
                onInput={(e) => handleAliases(e.currentTarget.value)} />
            </div>
          </div>
        </div>

        <div class="ep-infobox">
          <div class="ep-irow"><span class="ep-ik">Type</span><span class="ep-iv">{CurrentDoc.meta?.type || '—'}</span></div>
          <div class="ep-irow"><span class="ep-ik">Status</span><span class="ep-iv">{CurrentDoc.meta?.status || '—'}</span></div>
          <div class="ep-irow"><span class="ep-ik">First seen</span><span class="ep-iv">{firstSeen() != null ? `Ch.${firstSeen()}` : '—'}</span></div>
          <div class="ep-irow"><span class="ep-ik">Mentions</span><span class="ep-iv">{mentionTotal()} across {hits().length} chapters</span></div>
        </div>

        <div class="ep-sec">
          <div class="ep-seclab">Notes</div>
          <div class="ep-bodyeditor">
            <Editor doc={CurrentDoc.body} onChange={(text) => UpdateBody(text)} pageView={false}
              entities={Entities} onOpenEntity={OpenEntityById} previewFor={PreviewFor} banks={Banks} />
          </div>
        </div>

        <div class="ep-sec">
          <div class="ep-seclab">Pages<button class="ep-secadd" onClick={addPage}><PlusIcon size={12} /> add</button></div>
          <Show when={subPages().length} fallback={<div class="ep-empty">No sub-pages. Add one for a topic too big for the notes above.</div>}>
            <div class="ep-pages">
              <For each={subPages()}>
                {(page) => (
                  <button class="ep-page-row" onClick={() => OpenEntityById(page.meta.id)}>
                    <span class="ep-page-name">{page.meta.name}</span>
                    <span class="ep-page-type">{page.meta.type || 'Page'}</span>
                  </button>
                )}
              </For>
            </div>
          </Show>
        </div>

        <div class="ep-sec">
          <div class="ep-seclab">Media<button class="ep-secadd" onClick={AddEntityMedia}><PlusIcon size={12} /> add</button></div>
          <Show when={(CurrentDoc.meta?.media || []).length} fallback={<div class="ep-empty">No media yet. Attach reference art, maps, mood boards…</div>}>
            <div class="ep-gallery">
              <For each={CurrentDoc.meta.media}>
                {(item) => (
                  <div class="ep-media" classList={{ portrait: CurrentDoc.meta.portrait === item.file }}>
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
            <For each={rels()} fallback={<div class="ep-empty">No relationships yet.</div>}>
              {(rel, i) => (
                <div class="ep-rel">
                  <input class="ep-relk" value={rel.label} placeholder="relation" onInput={(e) => updateRel(i(), { label: e.currentTarget.value })} />
                  <span class="ep-relarrow">→</span>
                  <EntitySelect value={rel.to} onSelect={(id) => updateRel(i(), { to: id })} exclude={[CurrentDoc.id]} allowClear placeholder="— entity —" clearLabel="— entity —" />
                  <Show when={rel.to && EntityById(rel.to)}>
                    <button class="ep-relopen" title="Open" onClick={() => OpenEntityById(rel.to)}>›</button>
                  </Show>
                  <button class="ep-secdel" title="Remove" onClick={() => removeRel(i())}>×</button>
                </div>
              )}
            </For>
          </div>
        </div>

      </div>
    </div>
  )
}
