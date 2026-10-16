import { For, Index, Show, createMemo, createSignal } from 'solid-js'
import { useProject } from '../project/ProjectContext.jsx'
import { avatarColor } from './avatar.js'
import { draftState } from '../project/drafts.js'
import { OpenIcon, CheckCircleIcon, PlusIcon, CircleIcon, ArcIcon } from './icons.jsx'
import EntitySelect from './EntitySelect.jsx'
import { DraftChip } from './DraftsPane.jsx'
import './TimelineView.css'
import './Drafts.css'

// Plot › Outline: every chapter as a card, arc by arc, with its draft state, plan,
// topics and the entities it introduces. Click a card to edit its plan.
export default function TimelineView() {
  const {
    TimelineChapters, OpenChapterById, OpenEntityById, UpdateChapterMeta, DeleteChapters, MentionsFor,
    AddChapter, nextChapterNumber, AddIntroducesToChapter, RemoveIntroducesFromChapter, ChapterById, OpenArc,
  } = useProject()

  // 2. Signals
  const [EditingId, SetEditingId] = createSignal(null) // card in edit mode
  const [FilterEntity, SetFilterEntity] = createSignal('')
  const [AddIntroFor, SetAddIntroFor] = createSignal(null)
  const [ArcOpen, SetArcOpen] = createSignal({})
  const [ConfirmDeleteId, SetConfirmDeleteId] = createSignal(null)

  // Cards and bands are keyed by id (strings), so editing a chapter updates its
  // card in place instead of rebuilding it — typing keeps focus.
  const chaptersById = createMemo(() => new Map(TimelineChapters().map((chapter) => [chapter.id, chapter])))
  const bands = createMemo(() => {
    const ids = FilterEntity() ? new Set(MentionsFor(FilterEntity()).map((h) => h.chapterId)) : null
    const out = []
    const seen = {}
    for (const chapter of TimelineChapters()) {
      if (ids && !ids.has(chapter.id)) continue
      const arc = chapter.arc || null
      const last = out[out.length - 1]
      if (last && last.arc === arc) last.ids.push(chapter.id)
      else {
        seen[arc] = (seen[arc] || 0) + 1
        out.push({ key: `${arc ?? ''}#${seen[arc]}`, arc, ids: [chapter.id] })
      }
    }
    return out
  })
  const bandKeys = () => bands().map((band) => band.key)

  // 5. Handlers
  const toggleEdit = (id) => SetEditingId((current) => (current === id ? null : id))
  const toggleArc = (name) => SetArcOpen((open) => ({ ...open, [name]: !arcOpen(name) }))
  const addPlanned = (arc) => AddChapter({ number: nextChapterNumber(), title: '', open: false, ...(arc !== undefined ? { arc } : {}) })
  const stop = (e) => e.stopPropagation()
  const confirmDelete = () => { DeleteChapters([ConfirmDeleteId()]); SetConfirmDeleteId(null) }
  const setTopics = (chapter, topics) => UpdateChapterMeta(chapter.id, 'topics', topics)
  const addTopic = (chapter) => setTopics(chapter, [...chapter.topics, { title: 'New topic', note: '', done: false }])
  const editTopic = (chapter, index, patch) => setTopics(chapter, chapter.topics.map((topic, i) => (i === index ? { ...topic, ...patch } : topic)))
  const removeTopic = (chapter, index) => setTopics(chapter, chapter.topics.filter((_, i) => i !== index))

  // 6. JSX-helper builders
  const editing = (id) => EditingId() === id
  const arcOpen = (name) => ArcOpen()[name] !== false
  const formatNumber = (n) => Number(n || 0).toLocaleString()
  // A chapter's draft state (empty = planned, nothing written yet).
  const stateOf = (id) => {
    const doc = ChapterById(id)
    return doc ? draftState(doc.meta, doc.body) : 'empty'
  }
  const isPlanned = (id) => stateOf(id) === 'empty'
  const numberCounts = createMemo(() => {
    const counts = {}
    for (const chapter of TimelineChapters()) if (chapter.number != null) counts[chapter.number] = (counts[chapter.number] || 0) + 1
    return counts
  })
  const conflicted = (chapter) => chapter.number != null && numberCounts()[chapter.number] > 1
  const headCounts = () => {
    const all = TimelineChapters()
    const planned = all.filter((chapter) => isPlanned(chapter.id)).length
    const words = all.reduce((sum, chapter) => sum + chapter.words, 0)
    return `${all.length - planned} chapters${planned ? ` · ${planned} planned` : ''} · ${formatNumber(words)} words`
  }
  function bandLine(band) {
    const chapters = band.ids.map((id) => chaptersById().get(id)).filter(Boolean)
    const numbers = chapters.map((c) => c.number).filter((n) => n != null)
    const low = Math.min(...numbers), high = Math.max(...numbers)
    const range = !numbers.length ? '' : low === high ? `Ch. ${low}` : `Ch. ${low}–${high}`
    const words = chapters.reduce((sum, chapter) => sum + chapter.words, 0)
    return [range, `${formatNumber(words)} words`].filter(Boolean).join(' · ')
  }
  const introExclude = (chapter) => [...chapter.introduces, ...chapter.unseen].map((e) => e.id)

  function ChapterNode(nodeProps) {
    const id = nodeProps.id
    const chapter = () => chaptersById().get(id)
    return (
      <Show when={chapter()}>
        <div class="tl-node" classList={{ planned: isPlanned(id), sel: editing(id) }} onClick={() => toggleEdit(id)}>
          <div class={`tl-dot ${stateOf(id)}`}></div>
          <div class="tl-card">
            <div class="tl-chead">
              <span class="tl-ct">Ch.{chapter().number ?? '—'}</span>
              <span class="tl-tt">{chapter().title || 'Untitled'}</span>
              <Show when={!isPlanned(id)} fallback={<span class="counts">planned</span>}>
                <span class="tl-draft"><DraftChip meta={ChapterById(id)?.meta || {}} body={ChapterById(id)?.body || ''} /></span>
              </Show>
              <button class="tl-openbtn" title="Open chapter" onClick={(e) => { stop(e); OpenChapterById(id, { smart: true }) }}><OpenIcon size={14} /></button>
            </div>
            <div class="tl-meta">
              <Show when={chapter().pov}><span>POV: {chapter().pov}</span><span class="tl-dotsep">·</span></Show>
              <Show when={!isPlanned(id)}><span>{chapter().words.toLocaleString()} words</span></Show>
            </div>
            <Show when={conflicted(chapter())}><div class="tl-warn">⚠ chapter #{chapter().number} is used more than once</div></Show>

            {/* Plan — always visible; read-only until the card is clicked into edit mode. */}
            <Show
              when={editing(id)}
              fallback={
                <div class="tl-planread">
                  <Show when={chapter().summary}><div class="tl-syn">{chapter().summary}</div></Show>
                  <Show when={chapter().objective}><div class="tl-readfield"><span class="tl-readlab">Objective</span> {chapter().objective}</div></Show>
                  <Show when={chapter().timeline}><div class="tl-readfield"><span class="tl-readlab">Timeline</span> {chapter().timeline}</div></Show>
                  <Show when={chapter().topics.length}>
                    <div class="tl-topics">
                      <Index each={chapter().topics}>
                        {(topic) => <div class="tl-topic" classList={{ done: topic().done }}><span class="tl-topicdot"></span>{topic().title}<Show when={topic().note}><span class="tl-topicnote"> — {topic().note}</span></Show></div>}
                      </Index>
                    </div>
                  </Show>
                </div>
              }
            >
              <div class="tl-plan" onClick={stop}>
                <div class="tl-planrow">
                  <div class="tl-planfield tl-num"><label>Chapter #</label>
                    <input type="number" step="0.1" value={chapter().number ?? ''} onInput={(e) => UpdateChapterMeta(id, 'number', e.currentTarget.value === '' ? null : Number(e.currentTarget.value))} /></div>
                  <div class="tl-planfield tl-titlef"><label>Title</label>
                    <input value={chapter().title || ''} placeholder="Untitled" onInput={(e) => UpdateChapterMeta(id, 'title', e.currentTarget.value)} /></div>
                </div>
                <label>Summary</label>
                <textarea rows="2" value={chapter().summary} placeholder="What happens in this chapter" onInput={(e) => UpdateChapterMeta(id, 'summary', e.currentTarget.value)} />
                <label>Objective</label>
                <textarea rows="2" value={chapter().objective} placeholder="What it needs to accomplish" onInput={(e) => UpdateChapterMeta(id, 'objective', e.currentTarget.value)} />
                <label>Timeline note</label>
                <textarea rows="2" value={chapter().timeline} placeholder="This chapter's timeline note" onInput={(e) => UpdateChapterMeta(id, 'timeline', e.currentTarget.value)} />
                <div class="tl-toplabel"><label>Topics</label><button class="tl-topadd" onClick={() => addTopic(chapter())}><PlusIcon size={12} /> Add</button></div>
                <div class="tl-topics">
                  <Index each={chapter().topics}>
                    {(topic, index) => (
                      <div class="tl-topicedit" classList={{ done: topic().done }}>
                        <button class="tl-topicmark" title="Mark done" onClick={() => editTopic(chapter(), index, { done: !topic().done })}>{topic().done ? <CheckCircleIcon size={14} /> : <CircleIcon size={14} />}</button>
                        <input class="tl-topicin tt" value={topic().title} onInput={(e) => editTopic(chapter(), index, { title: e.currentTarget.value })} />
                        <input class="tl-topicin td" placeholder="note" value={topic().note} onInput={(e) => editTopic(chapter(), index, { note: e.currentTarget.value })} />
                        <button class="tl-topicx" title="Remove" onClick={() => removeTopic(chapter(), index)}>×</button>
                      </div>
                    )}
                  </Index>
                </div>
                <div class="tl-planfoot">
                  <button class="tl-opennote" onClick={() => OpenChapterById(id)}>Open chapter ›</button>
                  <button class="tl-delete" onClick={() => SetConfirmDeleteId(id)}>Delete chapter</button>
                </div>
              </div>
            </Show>

            {/* Introduces — always interactive. */}
            <div class="tl-intro">
              <span class="tl-introlab">introduces</span>
              <For each={chapter().introduces}>
                {(e) => <span class="tl-pill" title="Open" onClick={(ev) => { stop(ev); OpenEntityById(e.id) }}><span class="tl-pilldot" style={{ background: avatarColor(e.id) }}></span>{e.name}</span>}
              </For>
              <button class="tl-addintro" title="Add an entity this chapter introduces" onClick={(ev) => { stop(ev); SetAddIntroFor(AddIntroFor() === id ? null : id) }}>＋</button>
            </div>
            <Show when={AddIntroFor() === id}>
              <div class="tl-introsel" onClick={stop}>
                <EntitySelect value="" placeholder="Add entity…" only="nongroup" exclude={introExclude(chapter())}
                  onSelect={(entityId) => { if (entityId) { AddIntroducesToChapter(id, entityId); SetAddIntroFor(null) } }} />
              </div>
            </Show>
            <Show when={chapter().unseen.length}>
              <div class="tl-intro tl-unseen">
                <span class="tl-introlab">not yet seen</span>
                <For each={chapter().unseen}>
                  {(e) => <span class="tl-pill unseen" title="Declared but not written into the prose yet" onClick={(ev) => { stop(ev); OpenEntityById(e.id) }}>{e.name}<span class="tl-pillx" title="Remove" onClick={(ev) => { stop(ev); RemoveIntroducesFromChapter(id, e.id) }}>×</span></span>}
                </For>
              </div>
            </Show>
          </div>
        </div>
      </Show>
    )
  }

  // 7. JSX
  return (
    <div class="tl">
      <div class="tl-inner">
        <div class="tl-bar">
          <div class="tl-title">Outline</div>
          <span class="counts">{headCounts()}</span>
          <span class="tl-grow"></span>
          <EntitySelect value={FilterEntity()} onSelect={SetFilterEntity} only="nongroup" allowClear placeholder="All chapters" clearLabel="All chapters" />
          <button class="tl-addch" onClick={() => addPlanned()}>＋ Planned chapter</button>
        </div>

        <For each={bandKeys()} fallback={<div class="tl-empty">No chapters{FilterEntity() ? ' touch this entity' : ' yet'}.</div>}>
          {(key) => {
            const band = () => bands().find((b) => b.key === key) || { arc: null, ids: [] }
            return (
              <>
                <Show when={band().arc}>
                  <div class="tl-band tl-band-btn" onClick={() => toggleArc(band().arc)}>
                    <span class="tl-band-caret">{arcOpen(band().arc) ? '▾' : '▸'}</span>
                    <ArcIcon size={14} class="tl-band-ic" />
                    <a class="tl-band-nm" title="Open the arc page" onClick={(e) => { stop(e); OpenArc(band().arc) }}>{band().arc}</a>
                    <span class="tl-band-rg">{bandLine(band())}</span>
                    <span class="tl-band-ln"></span>
                    <span class="tl-band-ct">{band().ids.length}</span>
                  </div>
                </Show>
                <Show when={!band().arc || arcOpen(band().arc)}>
                  <div class="tl-spine">
                    <For each={band().ids}>{(id) => <ChapterNode id={id} />}</For>
                    <Show when={band().arc && !FilterEntity()}>
                      <button class="addrow tl-addinarc" onClick={() => addPlanned(band().arc)}><PlusIcon size={13} /> Planned chapter</button>
                    </Show>
                  </div>
                </Show>
              </>
            )
          }}
        </For>

        <Show when={TimelineChapters().length}>
          <button class="tl-addch tl-addbottom" onClick={() => addPlanned()}>＋ Add chapter</button>
        </Show>
      </div>

      <Show when={ConfirmDeleteId()}>
        <div class="modal-overlay" onClick={() => SetConfirmDeleteId(null)}>
          <div class="modal" onClick={stop}>
            <div class="modal-head">Delete this chapter?</div>
            <div class="modal-body"><div class="confirm-msg">This permanently removes the chapter file from disk. This can't be undone.</div></div>
            <div class="modal-foot">
              <button class="modal-cancel" onClick={() => SetConfirmDeleteId(null)}>Cancel</button>
              <button class="modal-go danger" onClick={confirmDelete}>Delete</button>
            </div>
          </div>
        </div>
      </Show>
    </div>
  )
}
