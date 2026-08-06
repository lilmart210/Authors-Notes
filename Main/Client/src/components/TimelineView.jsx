import { For, Show, createSignal } from 'solid-js'
import { useProject } from '../project/ProjectContext.jsx'
import { avatarColor } from './avatar.js'
import { OpenIcon, CheckCircleIcon, PlusIcon, CircleIcon } from './icons.jsx'
import EntitySelect from './EntitySelect.jsx'
import './TimelineView.css'

const STATUSES = ['draft', 'reviewing', 'final', 'planned']

export default function TimelineView() {
  const {
    TimelineChapters, OpenChapterById, OpenEntityById, UpdateChapterMeta, DeleteChapters, MentionsFor,
    AddChapter, nextChapterNumber, AddIntroducesToChapter, RemoveIntroducesFromChapter,
  } = useProject()

  // 2. Signals
  const [EditingId, SetEditingId] = createSignal(null) // card in edit mode
  const [FilterEntity, SetFilterEntity] = createSignal('')
  const [AddIntroFor, SetAddIntroFor] = createSignal(null)
  const [ArcOpen, SetArcOpen] = createSignal({})
  const [ConfirmDeleteId, SetConfirmDeleteId] = createSignal(null)

  const editing = (id) => EditingId() === id
  const toggleEdit = (id) => SetEditingId((cur) => (cur === id ? null : id))
  const arcOpen = (name) => ArcOpen()[name] !== false
  const toggleArc = (name) => SetArcOpen((m) => ({ ...m, [name]: !arcOpen(name) }))
  const isFinal = (s) => s === 'final' || s === 'finished' || s === 'revised' || s === 'written'
  const isPlanned = (s) => s === 'planned' || s === 'new'

  const numberCounts = () => {
    const counts = {}
    for (const chapter of TimelineChapters()) if (chapter.number != null) counts[chapter.number] = (counts[chapter.number] || 0) + 1
    return counts
  }
  const conflicted = (chapter) => chapter.number != null && numberCounts()[chapter.number] > 1

  const filterIds = () => (FilterEntity() ? new Set(MentionsFor(FilterEntity()).map((h) => h.chapterId)) : null)
  const bands = () => {
    const ids = filterIds()
    const out = []
    for (const chapter of TimelineChapters()) {
      if (ids && !ids.has(chapter.id)) continue
      const arc = chapter.arc || null
      const last = out[out.length - 1]
      if (last && last.arc === arc) last.chapters.push(chapter)
      else out.push({ arc, chapters: [chapter] })
    }
    for (const band of out) {
      const nums = band.chapters.map((c) => c.number).filter((n) => n != null)
      band.from = nums.length ? Math.min(...nums) : null
      band.to = nums.length ? Math.max(...nums) : null
    }
    return out
  }
  const bandRange = (band) => (band.from == null ? '' : band.to !== band.from ? `Ch. ${band.from}–${band.to}` : `Ch. ${band.from}`)
  const addPlanned = () => AddChapter({ number: nextChapterNumber(), title: '', status: 'planned', open: false })
  const stop = (e) => e.stopPropagation()
  const confirmDelete = () => { DeleteChapters([ConfirmDeleteId()]); SetConfirmDeleteId(null) }

  // topic editing
  const setTopics = (ch, topics) => UpdateChapterMeta(ch.id, 'topics', topics)
  const addTopic = (ch) => setTopics(ch, [...ch.topics, { title: 'New topic', note: '', done: false }])
  const editTopic = (ch, i, patch) => setTopics(ch, ch.topics.map((t, idx) => (idx === i ? { ...t, ...patch } : t)))
  const removeTopic = (ch, i) => setTopics(ch, ch.topics.filter((_, idx) => idx !== i))

  const introExclude = (chapter) => [...chapter.introduces, ...chapter.unseen].map((e) => e.id)

  return (
    <div class="tl">
      <div class="tl-inner">
        <div class="tl-bar">
          <div class="tl-title">Series Timeline</div>
          <EntitySelect value={FilterEntity()} onSelect={SetFilterEntity} only="nongroup" allowClear placeholder="All chapters" clearLabel="All chapters" />
          <button class="tl-addch" onClick={addPlanned}>＋ Planned chapter</button>
        </div>

        <For each={bands()} fallback={<div class="tl-empty">No chapters{FilterEntity() ? ' touch this entity' : ' yet'}.</div>}>
          {(band) => (
            <>
              <Show when={band.arc}>
                <div class="tl-band tl-band-btn" onClick={() => toggleArc(band.arc)}>
                  <span class="tl-band-caret">{arcOpen(band.arc) ? '▾' : '▸'}</span>
                  <span class="tl-band-nm">{band.arc}</span>
                  <span class="tl-band-rg">{bandRange(band)}</span>
                  <span class="tl-band-ln"></span>
                  <span class="tl-band-ct">{band.chapters.length}</span>
                </div>
              </Show>
              <Show when={!band.arc || arcOpen(band.arc)}>
                <div class="tl-spine">
                  <For each={band.chapters}>
                    {(chapter) => (
                      <div class="tl-node" classList={{ planned: isPlanned(chapter.status), sel: editing(chapter.id) }} onClick={() => toggleEdit(chapter.id)}>
                        <div class="tl-dot" classList={{ done: isFinal(chapter.status), planned: isPlanned(chapter.status) }}></div>
                        <div class="tl-card">
                          <div class="tl-chead">
                            <span class="tl-ct">Ch.{chapter.number ?? '—'}</span>
                            <span class="tl-tt">{chapter.title || 'Untitled'}</span>
                            <Show when={chapter.words > 0}><span class="tl-exists" title="Written"><CheckCircleIcon size={14} /></span></Show>
                            <button class="tl-openbtn" title="Open chapter" onClick={(e) => { stop(e); OpenChapterById(chapter.id, { smart: true }) }}><OpenIcon size={14} /></button>
                          </div>
                          <div class="tl-meta">
                            <Show when={chapter.pov}><span>POV: {chapter.pov}</span><span class="tl-dotsep">·</span></Show>
                            <span>{chapter.words.toLocaleString()} words</span>
                          </div>
                          <Show when={conflicted(chapter)}><div class="tl-warn">⚠ chapter #{chapter.number} is used more than once</div></Show>

                          {/* Plan — always visible; read-only until the card is clicked into edit mode. */}
                          <Show
                            when={editing(chapter.id)}
                            fallback={
                              <div class="tl-planread">
                                <Show when={chapter.summary}><div class="tl-syn">{chapter.summary}</div></Show>
                                <Show when={chapter.objective}><div class="tl-readfield"><span class="tl-readlab">Objective</span> {chapter.objective}</div></Show>
                                <Show when={chapter.timeline}><div class="tl-readfield"><span class="tl-readlab">Timeline</span> {chapter.timeline}</div></Show>
                                <Show when={chapter.topics.length}>
                                  <div class="tl-topics">
                                    <For each={chapter.topics}>{(t) => <div class="tl-topic" classList={{ done: t.done }}><span class="tl-topicdot"></span>{t.title}<Show when={t.note}><span class="tl-topicnote"> — {t.note}</span></Show></div>}</For>
                                  </div>
                                </Show>
                              </div>
                            }
                          >
                            <div class="tl-plan" onClick={stop}>
                              <div class="tl-planrow">
                                <div class="tl-planfield tl-num"><label>Chapter #</label>
                                  <input type="number" step="0.1" value={chapter.number ?? ''} onInput={(e) => UpdateChapterMeta(chapter.id, 'number', e.currentTarget.value === '' ? null : Number(e.currentTarget.value))} /></div>
                                <div class="tl-planfield tl-titlef"><label>Title</label>
                                  <input value={chapter.title || ''} placeholder="Untitled" onInput={(e) => UpdateChapterMeta(chapter.id, 'title', e.currentTarget.value)} /></div>
                                <div class="tl-planfield tl-statusf"><label>Status</label>
                                  <select value={STATUSES.includes(chapter.status) ? chapter.status : 'draft'} onChange={(e) => UpdateChapterMeta(chapter.id, 'status', e.currentTarget.value)}>
                                    <For each={STATUSES}>{(s) => <option value={s}>{s[0].toUpperCase() + s.slice(1)}</option>}</For>
                                  </select></div>
                              </div>
                              <label>Summary</label>
                              <textarea rows="2" value={chapter.summary} placeholder="What happens in this chapter" onInput={(e) => UpdateChapterMeta(chapter.id, 'summary', e.currentTarget.value)} />
                              <label>Objective</label>
                              <textarea rows="2" value={chapter.objective} placeholder="What it needs to accomplish" onInput={(e) => UpdateChapterMeta(chapter.id, 'objective', e.currentTarget.value)} />
                              <label>Timeline note</label>
                              <textarea rows="2" value={chapter.timeline} placeholder="This chapter's timeline note" onInput={(e) => UpdateChapterMeta(chapter.id, 'timeline', e.currentTarget.value)} />
                              <div class="tl-toplabel"><label>Topics</label><button class="tl-topadd" onClick={() => addTopic(chapter)}><PlusIcon size={12} /> Add</button></div>
                              <div class="tl-topics">
                                <For each={chapter.topics}>
                                  {(t, i) => (
                                    <div class="tl-topicedit" classList={{ done: t.done }}>
                                      <button class="tl-topicmark" title="Mark done" onClick={() => editTopic(chapter, i(), { done: !t.done })}>{t.done ? <CheckCircleIcon size={14} /> : <CircleIcon size={14} />}</button>
                                      <input class="tl-topicin tt" value={t.title} onInput={(e) => editTopic(chapter, i(), { title: e.currentTarget.value })} />
                                      <input class="tl-topicin td" placeholder="note" value={t.note} onInput={(e) => editTopic(chapter, i(), { note: e.currentTarget.value })} />
                                      <button class="tl-topicx" title="Remove" onClick={() => removeTopic(chapter, i())}>×</button>
                                    </div>
                                  )}
                                </For>
                              </div>
                              <div class="tl-planfoot">
                                <button class="tl-opennote" onClick={() => OpenChapterById(chapter.id)}>Open chapter ›</button>
                                <button class="tl-delete" onClick={() => SetConfirmDeleteId(chapter.id)}>Delete chapter</button>
                              </div>
                            </div>
                          </Show>

                          {/* Introduces — always interactive. */}
                          <div class="tl-intro">
                            <span class="tl-introlab">introduces</span>
                            <For each={chapter.introduces}>
                              {(e) => <span class="tl-pill" title="Open" onClick={(ev) => { stop(ev); OpenEntityById(e.id) }}><span class="tl-pilldot" style={{ background: avatarColor(e.id) }}></span>{e.name}</span>}
                            </For>
                            <button class="tl-addintro" title="Add an entity this chapter introduces" onClick={(ev) => { stop(ev); SetAddIntroFor(AddIntroFor() === chapter.id ? null : chapter.id) }}>＋</button>
                          </div>
                          <Show when={AddIntroFor() === chapter.id}>
                            <div class="tl-introsel" onClick={stop}>
                              <EntitySelect value="" placeholder="Add entity…" only="nongroup" exclude={introExclude(chapter)}
                                onSelect={(id) => { if (id) { AddIntroducesToChapter(chapter.id, id); SetAddIntroFor(null) } }} />
                            </div>
                          </Show>
                          <Show when={chapter.unseen.length}>
                            <div class="tl-intro tl-unseen">
                              <span class="tl-introlab">not yet seen</span>
                              <For each={chapter.unseen}>
                                {(e) => <span class="tl-pill unseen" title="Declared but not written into the prose yet" onClick={(ev) => { stop(ev); OpenEntityById(e.id) }}>{e.name}<span class="tl-pillx" title="Remove" onClick={(ev) => { stop(ev); RemoveIntroducesFromChapter(chapter.id, e.id) }}>×</span></span>}
                              </For>
                            </div>
                          </Show>
                        </div>
                      </div>
                    )}
                  </For>
                </div>
              </Show>
            </>
          )}
        </For>

        <Show when={TimelineChapters().length}>
          <button class="tl-addch tl-addbottom" onClick={addPlanned}>＋ Add chapter</button>
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
