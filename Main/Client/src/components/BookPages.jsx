import { For, Show, createSignal } from 'solid-js'
import { useProject } from '../project/ProjectContext.jsx'
import { chapterLabel, stripGeneratorMarkers } from '../project/format.js'
import { draftState, displayDate, canPublish } from '../project/drafts.js'
import Editor from './Editor.jsx'
import { DraftChip, PublishButton } from './DraftsPane.jsx'
import { showToast } from './Toast.jsx'
import { CopyIcon, StarIcon, PlusIcon, SendIcon, CompareIcon, DownloadIcon } from './icons.jsx'
import './BookPages.css'

const wordsIn = (text) => (stripGeneratorMarkers(text || '').match(/\S+/g) || []).length
const formatNumber = (n) => Number(n || 0).toLocaleString()
const countLine = (text) => `${formatNumber(wordsIn(text))} words · ${formatNumber(String(text || '').length)} characters`

// Copy text for pasting into a store or site form.
export function CopyButton(props) {
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(props.text() || '')
      showToast(`Copied ${props.what}`)
    } catch {
      showToast('Couldn’t reach the clipboard — select the text and press Ctrl+C')
    }
  }
  return <button class="copybtn" title={`Copy ${props.what}`} onClick={handleCopy}><CopyIcon size={12} /> Copy</button>
}

// A row of removable chips plus an input that adds one on Enter.
function ChipList(props) {
  function handleKey(event) {
    if (event.key !== 'Enter') return
    const value = event.currentTarget.value.trim()
    event.currentTarget.value = ''
    if (value && !props.items.includes(value)) props.onChange([...props.items, value])
  }
  return (
    <div class="chips">
      <For each={props.items}>
        {(item, index) => (
          <span class="chip" classList={{ pick: !!props.onPick, on: props.active === item }} onClick={() => props.onPick?.(item)}>
            <Show when={props.active === item}><StarIcon size={12} /></Show>
            {item}
            <button class="cx" aria-label="Remove" onClick={(e) => { e.stopPropagation(); props.onChange(props.items.filter((_, i) => i !== index())) }}>×</button>
          </span>
        )}
      </For>
      <input class="chipin" placeholder={props.placeholder} aria-label={props.placeholder} onKeyDown={handleKey} />
    </div>
  )
}

// ---------------------------------------------------------------- Overview
export function OverviewPage() {
  const { Book, UpdateBookMeta, PickBookCover, ClearBookCover, BookCoverUrl, OpenBookPage, PlanSummary, ArcNames, ArcPage, ArcChapters, UpdateArc, OpenArc, TimelineChapters } = useProject()

  // 5. Handlers
  const meta = () => Book.overview.meta
  const setMeta = (key, value) => UpdateBookMeta('overview', key, value)
  const setPlan = (key, value) => setMeta('plan', { ...meta().plan, [key]: value === '' ? '' : Math.max(0, Number(value) || 0) })
  const setArcPlan = (name, value) => UpdateArc(name, 'plan', value === '' ? '' : Math.max(0, Number(value) || 0))

  // 6. JSX-helper builders
  const plan = () => PlanSummary()
  const totalWords = () => TimelineChapters().reduce((sum, c) => sum + c.words, 0)
  const writtenCount = () => TimelineChapters().filter((c) => c.words > 0).length
  const average = () => (writtenCount() ? Math.round(totalWords() / writtenCount()) : 0)
  const percent = (part, whole) => `${whole ? Math.min(100, Math.round((part / whole) * 100)) : 0}%`
  const projection = () => (average() && plan().chapters ? ` · ${formatNumber(plan().chapters)} chapters at that rate ≈ ${formatNumber(Math.round((average() * plan().chapters) / 100) * 100)} words` : '')
  const arcRow = (name) => plan().arcs.find((a) => a.name === name)
  const coverUrl = () => BookCoverUrl()

  // 7. JSX
  return (
    <div class="docscroll">
      <div class="docwrap wide">
        <div class="ov">
          <div>
            <div class="cover" role="button" tabindex="0" title={coverUrl() ? 'Replace cover' : 'Add a cover image'} onClick={PickBookCover}
              onKeyDown={(e) => e.key === 'Enter' && PickBookCover()}>
              <Show when={coverUrl()} fallback={<div class="tcover"><div class="ct">{meta().title || 'Untitled'}</div><div class="ca">{meta().author}</div></div>}>
                <img class="cover-img" src={coverUrl()} alt="Cover" />
              </Show>
              <div class="covact">
                <button onClick={(e) => { e.stopPropagation(); PickBookCover() }}>{coverUrl() ? 'Replace' : 'Add cover'}</button>
                <Show when={coverUrl()}><button onClick={(e) => { e.stopPropagation(); ClearBookCover() }}>Remove</button></Show>
              </div>
            </div>
          </div>
          <div>
            <input class="bigtitle" value={meta().title} placeholder="Title" aria-label="Title" onInput={(e) => setMeta('title', e.currentTarget.value)} />
            <input class="subtitle" value={meta().subtitle} placeholder="Subtitle" aria-label="Subtitle" onInput={(e) => setMeta('subtitle', e.currentTarget.value)} />
            <div class="grid3">
              <div class="bfield"><label>Series</label><input class="fbox" value={meta().series} placeholder="Standalone" onInput={(e) => setMeta('series', e.currentTarget.value)} /></div>
              <div class="bfield"><label>Book #</label><input class="fbox" value={meta().seriesNo} placeholder="—" onInput={(e) => setMeta('seriesNo', e.currentTarget.value)} /></div>
              <div class="bfield"><label>Author</label><input class="fbox" value={meta().author} placeholder="Pen name" onInput={(e) => setMeta('author', e.currentTarget.value)} /></div>
            </div>
            <div class="bfield"><label>Title ideas</label>
              <ChipList items={meta().titles || []} active={meta().title} placeholder="Add a title idea" onPick={(title) => setMeta('title', title)} onChange={(titles) => setMeta('titles', titles)} />
            </div>
            <div class="bfield">
              <div class="labrow"><label>Logline</label><CopyButton what="logline" text={() => meta().logline} /></div>
              <textarea class="fbox autogrow" rows="2" value={meta().logline} placeholder="The book in one or two sentences" onInput={(e) => setMeta('logline', e.currentTarget.value)} />
            </div>
            <div class="bfield">
              <div class="labrow"><label>Genre &amp; tags</label><CopyButton what="tags" text={() => (meta().tags || []).join(', ')} /></div>
              <ChipList items={meta().tags || []} placeholder="Add a tag" onChange={(tags) => setMeta('tags', tags)} />
            </div>
          </div>
        </div>

        <div class="plancard">
          <div class="subhead"><span class="flabel">Planned length</span></div>
          <div class="planrow">
            <label class="pnum"><span>Arcs</span><input type="number" min="0" value={meta().plan.arcs} placeholder="—" onInput={(e) => setPlan('arcs', e.currentTarget.value)} /></label>
            <span class="op">×</span>
            <label class="pnum"><span>Chapters per arc</span><input type="number" min="0" value={meta().plan.perArc} placeholder="—" onInput={(e) => setPlan('perArc', e.currentTarget.value)} /></label>
            <span class="op">×</span>
            <label class="pnum"><span>Words per chapter</span><input type="number" min="0" step="100" value={meta().plan.words} placeholder="—" onInput={(e) => setPlan('words', e.currentTarget.value)} /></label>
            <span class="op">=</span>
            <div class="planres"><b>{plan().chapters ? `${formatNumber(plan().chapters)} chapters` : '—'}</b><span>{plan().words ? `${formatNumber(plan().words)} words` : ''}</span></div>
          </div>
          <div class="planprog">
            <div><div class="prow"><span>Chapters</span><b>{writtenCount()}{plan().chapters ? ` / ${formatNumber(plan().chapters)}` : ''}</b></div><div class="bar big"><i style={{ width: percent(writtenCount(), plan().chapters) }} /></div></div>
            <div><div class="prow"><span>Words</span><b>{formatNumber(totalWords())}{plan().words ? ` / ${formatNumber(plan().words)}` : ''}</b></div><div class="bar big"><i style={{ width: percent(totalWords(), plan().words) }} /></div></div>
          </div>
          <Show when={average()}><div class="counts">Averaging {formatNumber(average())} words a chapter{projection()}</div></Show>
          <Show when={ArcNames().length || plan().extraArcs}>
            <div class="arcplan">
              <For each={ArcNames()}>
                {(name) => (
                  <div class="arow">
                    <a onClick={() => OpenArc(name)}>{name}</a>
                    <div class="bar"><i style={{ width: percent(arcRow(name)?.written ?? 0, arcRow(name)?.planned ?? 0) }} /></div>
                    <span class="counts">{arcRow(name)?.written ?? ArcChapters(name).length} of</span>
                    <input type="number" min="0" value={ArcPage(name).meta.plan ?? ''} placeholder={plan().perArc || '—'} aria-label={`Planned chapters for ${name}`}
                      onInput={(e) => setArcPlan(name, e.currentTarget.value)} />
                    <span class="counts">ch</span>
                  </div>
                )}
              </For>
              <Show when={plan().extraArcs}>
                <div class="arow muted"><span>{plan().extraArcs} more arc{plan().extraArcs === 1 ? '' : 's'} planned</span><div class="bar"><i style={{ width: '0%' }} /></div><span class="counts">0 of {plan().extraArcs * plan().perArc} ch</span></div>
              </Show>
            </div>
          </Show>
        </div>

        <div class="blurbcard">
          <div class="subhead">
            <span class="flabel">Blurb</span>
            <DraftChip meta={Book.blurb.meta} body={Book.blurb.body} />
            <span class="spacer" />
            <CopyButton what="blurb" text={() => Book.blurb.body} />
            <button class="linkbtn" onClick={() => OpenBookPage('blurb')}>Edit</button>
          </div>
          <Show when={Book.blurb.body} fallback={<div class="counts">No blurb yet</div>}>
            <div class="blurbprev">{Book.blurb.body}</div>
          </Show>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------- Blurb / Synopsis text
// One document each; drafts, Publish and compare live in the right panel like a chapter's.
export function BookTextPage(props) {
  const { Book, BookRevision, UpdateBookBody, Entities, OpenEntityById, PreviewFor, Banks } = useProject()
  const title = () => (props.page === 'blurb' ? 'Blurb' : 'Synopsis')
  const editorKey = () => `${props.page}:${BookRevision()}`
  return (
    <div class="bookdoc">
      <div class="bookdoc-head">
        <h1 class="h1">{title()}</h1>
        <span class="counts">{countLine(Book[props.page].body)}</span>
        <span class="spacer" />
        <CopyButton what={title().toLowerCase()} text={() => Book[props.page].body} />
      </div>
      <div class="bookdoc-editor">
        <Show when={editorKey()} keyed>
          {() => (
            <Editor doc={Book[props.page].body} onChange={(text) => UpdateBookBody(props.page, text)} pageView pageWidth={640} entities={Entities} onOpenEntity={OpenEntityById} previewFor={PreviewFor} banks={Banks} />
          )}
        </Show>
      </div>
    </div>
  )
}

// --------------------------------------------------------------- Publishing
export function PublishingPage(props) {
  const { Book, UpdateBookMeta, TimelineChapters, ChapterById, OpenChapterById, PublishDraft, OpenDiff, LoadDrafts, DraftList } = useProject()

  // 2. Signals
  const [Busy, SetBusy] = createSignal(false)

  // 5. Handlers
  const meta = () => Book.publishing.meta
  const setMeta = (key, value) => UpdateBookMeta('publishing', key, value)
  const setPlatform = (index, key, value) => setMeta('platforms', meta().platforms.map((p, i) => (i === index ? { ...p, [key]: value } : p)))
  const addPlatform = () => setMeta('platforms', [...meta().platforms, { name: '', url: '', note: '' }])
  const removePlatform = (index) => setMeta('platforms', meta().platforms.filter((_, i) => i !== index))
  async function publishAll() {
    SetBusy(true)
    let count = 0
    for (const row of pending()) if (await PublishDraft(row.id)) count++
    SetBusy(false)
    showToast(`Published ${count} draft${count === 1 ? '' : 's'}`)
  }
  async function compare(row) {
    await LoadDrafts(row.id)
    const list = DraftList(row.id)
    if (!list.length) return
    const last = list.at(-1)
    if (row.state === 'changed' || list.length === 1) OpenDiff(row.id, last.n, 'now')
    else OpenDiff(row.id, list.at(-2).n, last.n)
  }

  // 6. JSX-helper builders
  const rows = () => TimelineChapters().map((c) => {
    const chapter = ChapterById(c.id)
    return { ...c, meta: chapter?.meta || {}, body: chapter?.body || '', state: draftState(chapter?.meta, chapter?.body) }
  }).filter((row) => row.state !== 'empty')
  const published = () => rows().filter((r) => r.meta.lastDraft)
  const changed = () => rows().filter((r) => r.state === 'changed')
  const fresh = () => rows().filter((r) => r.state === 'new')
  const pending = () => rows().filter((r) => canPublish(r.meta, r.body))
  const lastPublished = (row) => (row.meta.lastDraft ? `Draft ${row.meta.lastDraft.n} · ${displayDate(row.meta.lastDraft.date)}` : '—')

  // 7. JSX
  return (
    <div class="docscroll">
      <div class="docwrap wide">
        <div class="dochead">
          <h1 class="h1">Publishing</h1>
          <span class="spacer" />
          <button class="btn" onClick={() => props.onExport?.()}><DownloadIcon size={13} /> Export book…</button>
        </div>
        <div class="stats">
          <div class="stat"><div class="sv">{published().length}</div><div class="sk">Chapters published</div></div>
          <div class="stat" classList={{ warn: changed().length > 0 }}><div class="sv">{changed().length}</div><div class="sk">Changed since last draft</div></div>
          <div class="stat"><div class="sv">{fresh().length}</div><div class="sk">Never published</div></div>
        </div>
        <div class="subhead">
          <span class="flabel">Chapters</span>
          <span class="spacer" />
          <Show when={pending().length}>
            <button class="pubbtn" disabled={Busy()} onClick={publishAll}><SendIcon size={12} /> Publish all changes ({pending().length})</button>
          </Show>
        </div>
        <div class="tblwrap">
          <table class="tbl">
            <thead><tr><th>#</th><th>Title</th><th>Draft</th><th class="num">Words</th><th>Last published</th><th /></tr></thead>
            <tbody>
              <For each={rows()}>
                {(row) => (
                  <tr>
                    <td class="tnum left">{row.number ?? '—'}</td>
                    <td><div class="tname" onClick={() => OpenChapterById(row.id)}><span>{row.title || chapterLabel(row.number, '')}</span></div></td>
                    <td class="nowrap"><DraftChip meta={row.meta} body={row.body} /></td>
                    <td class="tnum">{formatNumber(row.words)}</td>
                    <td class="tnum left">{lastPublished(row)}</td>
                    <td class="tact">
                      <Show when={row.meta.lastDraft}><button class="pubbtn ghost" title="Compare drafts" onClick={() => compare(row)}><CompareIcon size={12} /></button></Show>
                      <PublishButton owner={row.id} />
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>

        <div class="bfield spaced"><label>Platforms</label>
          <div class="tblwrap">
            <table class="tbl">
              <thead><tr><th>Platform</th><th>Link</th><th>Notes</th><th /></tr></thead>
              <tbody>
                <For each={meta().platforms} fallback={<tr><td colspan="4" class="tnum left">No platforms yet</td></tr>}>
                  {(platform, index) => (
                    <tr>
                      <td><input value={platform.name} placeholder="Name" onInput={(e) => setPlatform(index(), 'name', e.currentTarget.value)} /></td>
                      <td><input value={platform.url} placeholder="https://" onInput={(e) => setPlatform(index(), 'url', e.currentTarget.value)} /></td>
                      <td><input value={platform.note} onInput={(e) => setPlatform(index(), 'note', e.currentTarget.value)} /></td>
                      <td class="tdel"><button aria-label="Remove" onClick={() => removePlatform(index())}>×</button></td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
          <button class="addrow" onClick={addPlatform}><PlusIcon size={13} /> Add platform</button>
        </div>
        <div class="grid2">
          <div class="bfield"><label>Language</label><input class="fbox" value={meta().language} onInput={(e) => setMeta('language', e.currentTarget.value)} /></div>
          <div class="bfield"><label>Content rating</label><input class="fbox" value={meta().rating} placeholder="e.g. Violence, gore" onInput={(e) => setMeta('rating', e.currentTarget.value)} /></div>
          <div class="bfield"><label>Copyright line</label><input class="fbox" value={meta().copyright} placeholder={`© ${new Date().getFullYear()} ${Book.overview.meta.author || ''}`.trim()} onInput={(e) => setMeta('copyright', e.currentTarget.value)} /></div>
          <div class="bfield"><label>ISBN · ebook</label><input class="fbox" value={meta().isbnE} placeholder="Optional" onInput={(e) => setMeta('isbnE', e.currentTarget.value)} /></div>
          <div class="bfield"><label>ISBN · paperback</label><input class="fbox" value={meta().isbnP} placeholder="Optional" onInput={(e) => setMeta('isbnP', e.currentTarget.value)} /></div>
        </div>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ Arc page
export function ArcPageView() {
  const { CurrentDoc, ArcPage, ArcChapters, UpdateArc, RenameArc, Book, OpenChapterById, UpdateChapterMeta, AddChapter, nextChapterNumber } = useProject()

  // 5. Handlers
  const name = () => CurrentDoc.id
  async function handleRename(event) {
    const value = event.currentTarget.value.trim()
    if (value && value !== name() && !(await RenameArc(name(), value))) event.currentTarget.value = name()
  }

  // 6. JSX-helper builders
  const page = () => ArcPage(name())
  const chapters = () => ArcChapters(name())
  const words = () => chapters().reduce((sum, c) => sum + wordsIn(c.body), 0)
  const range = () => {
    const numbers = chapters().map((c) => c.number).filter((n) => n != null)
    return numbers.length ? `Chapters ${Math.min(...numbers)}–${Math.max(...numbers)} · ` : ''
  }
  const planned = () => (page().meta.plan === '' || page().meta.plan == null ? Book.overview.meta.plan.perArc : page().meta.plan)

  // 7. JSX
  return (
    <div class="docscroll">
      <div class="docwrap">
        <div class="crumbline"><span>Manuscript</span><span>›</span><span>Arc</span></div>
        <input class="ptitle" value={name()} placeholder="Arc name" aria-label="Arc name" onChange={handleRename}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
        <div class="counts arc-counts">{range()}{formatNumber(words())} words{planned() ? ` · ${chapters().length} of ${planned()} planned chapters` : ''}</div>
        <div class="bfield"><label>What this arc does</label>
          <textarea class="fbox autogrow" rows="3" value={page().body} placeholder="Setup, turn, and where it leaves things" onInput={(e) => UpdateArc(name(), 'body', e.currentTarget.value)} />
        </div>
        <div class="bfield"><label>Planned chapters</label>
          <input class="fbox narrow" type="number" min="0" value={page().meta.plan ?? ''} placeholder={Book.overview.meta.plan.perArc ? `${Book.overview.meta.plan.perArc} (book default)` : '—'}
            onInput={(e) => UpdateArc(name(), 'plan', e.currentTarget.value === '' ? '' : Math.max(0, Number(e.currentTarget.value) || 0))} />
        </div>
        <div class="tblwrap">
          <table class="tbl">
            <thead><tr><th class="w60">#</th><th>Title</th><th>Summary</th><th class="num w70">Words</th></tr></thead>
            <tbody>
              <For each={chapters()} fallback={<tr><td colspan="4" class="tnum left">No chapters yet</td></tr>}>
                {(chapter) => (
                  <tr>
                    <td class="tnum left">{chapter.number ?? '—'}</td>
                    <td><div class="tname" onClick={() => OpenChapterById(chapter.id)}><span>{chapter.meta?.title || chapter.title || 'Untitled'}</span></div></td>
                    <td><input value={chapter.meta?.summary || ''} placeholder="What happens" onInput={(e) => UpdateChapterMeta(chapter.id, 'summary', e.currentTarget.value)} /></td>
                    <td class="tnum">{formatNumber(wordsIn(chapter.body))}</td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
        <button class="addrow" onClick={() => AddChapter({ number: nextChapterNumber(), arc: name() })}><PlusIcon size={13} /> New chapter</button>
      </div>
    </div>
  )
}

// -------------------------------------------- right panel for the Book pages
export function BookGlance() {
  const { Book, PlanSummary, TimelineChapters, ChapterById } = useProject()
  const plan = () => PlanSummary()
  const total = () => TimelineChapters().reduce((sum, c) => sum + c.words, 0)
  const states = () => TimelineChapters().map((c) => draftState(ChapterById(c.id)?.meta, ChapterById(c.id)?.body))
  const count = (state) => states().filter((s) => s === state).length
  const progress = () => `${plan().words ? Math.min(100, Math.round((total() / plan().words) * 100)) : 0}%`
  return (
    <div class="pane plan">
      <div class="pbar"><span class="t">Book</span></div>
      <div class="pbody">
        <div class="glance">
          <div class="grow"><span>Words</span><b>{formatNumber(total())}{plan().words ? ` / ${formatNumber(plan().words)}` : ''}</b></div>
          <Show when={plan().words}><div class="bar big"><i style={{ width: progress() }} /></div></Show>
          <div class="grow"><span>Chapters</span><b>{states().filter((s) => s !== 'empty').length}{plan().chapters ? ` / ${plan().chapters}` : ''}</b></div>
          <div class="grow"><span>Published</span><b>{count('pub') + count('changed')}</b></div>
          <div class="grow"><span>Changed since last draft</span><b>{count('changed')}</b></div>
          <div class="grow"><span>Never published</span><b>{count('new')}</b></div>
          <div class="grow"><span>Blurb</span><b>{formatNumber(wordsIn(Book.blurb.body))} w</b></div>
        </div>
      </div>
    </div>
  )
}
