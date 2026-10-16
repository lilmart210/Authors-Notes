import { For, Show, createEffect } from 'solid-js'
import { useProject } from '../project/ProjectContext.jsx'
import { draftState, stateLine, workingDraftNumber, canPublish, displayDate } from '../project/drafts.js'
import { SendIcon } from './icons.jsx'
import './Drafts.css'

const wordCount = (text) => (String(text || '').match(/\S+/g) || []).length
const signedWords = (delta) => `${delta >= 0 ? '+' : '−'}${Math.abs(delta).toLocaleString()} w`

// The chip-style "Publish draft N" button. Stays visible; greyed out only when
// there's nothing new since the last draft.
export function PublishButton(props) {
  const { DraftDoc, PublishDraft } = useProject()
  const doc = () => DraftDoc(props.owner)
  const enabled = () => Boolean(doc()) && canPublish(doc().meta, doc().body)
  function reason() {
    if (!doc()) return ''
    if (enabled()) return `Stamp the current text as draft ${workingDraftNumber(doc().meta)}`
    return draftState(doc().meta, doc().body) === 'empty' ? 'Nothing written yet' : `No changes since draft ${doc().meta.lastDraft.n}`
  }
  const buttonClass = () => `pubbtn ${props.wide ? 'wide' : ''}`
  return (
    <button class={buttonClass()} disabled={!enabled()} title={reason()} onClick={() => PublishDraft(props.owner)}>
      <SendIcon size={12} /> Publish draft {doc() ? workingDraftNumber(doc().meta) : 1}
    </button>
  )
}

// "Draft 4" with its state colour, plus a note when there are unpublished changes.
export function DraftChip(props) {
  const state = () => draftState(props.meta, props.body)
  return (
    <>
      <span class={`stagechip ${state()}`}>Draft {workingDraftNumber(props.meta)}</span>
      <Show when={state() === 'changed'}><span class="edtag">changes</span></Show>
      <Show when={state() === 'new'}><span class="edtag dim">unpublished</span></Show>
    </>
  )
}

// Right-panel draft history for a chapter, the blurb or the synopsis: the working
// draft, Publish, and every published draft newest first (a git-style log that
// stays usable at 20+ drafts). Clicking a draft shows what changed in it.
export default function DraftsPane(props) {
  const { DraftDoc, DraftList, LoadDrafts, OpenDiff, CurrentDoc } = useProject()

  // 4. Effects — the history loads the first time a document's panel is shown.
  createEffect(() => { if (props.owner) LoadDrafts(props.owner) })

  // 6. JSX-helper builders
  const doc = () => DraftDoc(props.owner)
  const state = () => (doc() ? draftState(doc().meta, doc().body) : 'empty')
  const history = () => [...DraftList(props.owner)].reverse()
  const latest = () => DraftList(props.owner).at(-1)
  const showWorking = () => state() === 'changed' || state() === 'new'
  // which row the open compare view points at (highlighted)
  const selectedTo = () => (CurrentDoc.kind === 'diff' && CurrentDoc.id === props.owner ? CurrentDoc.meta?.to : null)
  const previousOf = (n) => DraftList(props.owner).filter((d) => d.n < n).at(-1)
  function openDraft(draft) {
    const previous = previousOf(draft.n)
    if (previous) OpenDiff(props.owner, previous.n, draft.n)
    else OpenDiff(props.owner, draft.n, 'now')
  }
  const draftDelta = (draft) => {
    const previous = previousOf(draft.n)
    return previous ? signedWords(wordCount(draft.text) - wordCount(previous.text)) : `${wordCount(draft.text).toLocaleString()} w`
  }
  const workingDelta = () => (latest() ? signedWords(wordCount(doc()?.body) - wordCount(latest().text)) : `${wordCount(doc()?.body).toLocaleString()} w`)
  const draftDetail = (draft) => [displayDate(draft.date), draft.note].filter(Boolean).join(' · ')

  // 7. JSX
  return (
    <Show when={doc()}>
      <div class="stagebox">
        <div class="draftline">
          <DraftChip meta={doc().meta} body={doc().body} />
          <span class="counts">{stateLine(doc().meta, doc().body)}</span>
        </div>
        <PublishButton owner={props.owner} wide />
      </div>
      <Show when={showWorking() || history().length}>
        <div class="pane plan">
          <div class="pbar"><span class="t">Drafts</span><Show when={history().length}><span class="sub">{history().length} published</span></Show></div>
          <div class="pbody">
            <div class="gitlog">
              <Show when={showWorking()}>
                <button class="gitrow now" classList={{ on: selectedTo() === 'now' }} disabled={!latest()}
                  title={latest() ? `What changed since draft ${latest().n}` : 'Not published yet'}
                  onClick={() => latest() && OpenDiff(props.owner, latest().n, 'now')}>
                  <i /><span class="gn">Draft {workingDraftNumber(doc().meta)}</span><span class="gd">working</span><span class="gw">{workingDelta()}</span>
                </button>
              </Show>
              <For each={history()}>
                {(draft) => (
                  <button class="gitrow" classList={{ on: selectedTo() === draft.n }} title={previousOf(draft.n) ? `What changed in draft ${draft.n}` : `Draft ${draft.n} compared with now`}
                    onClick={() => openDraft(draft)}>
                    <i /><span class="gn">Draft {draft.n}</span><span class="gd">{draftDetail(draft)}</span><span class="gw">{draftDelta(draft)}</span>
                  </button>
                )}
              </For>
            </div>
          </div>
        </div>
      </Show>
    </Show>
  )
}
