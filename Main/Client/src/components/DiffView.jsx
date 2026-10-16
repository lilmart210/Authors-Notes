import { For, Show, createEffect } from 'solid-js'
import { useProject } from '../project/ProjectContext.jsx'
import { diffWords, diffStats, displayDate, workingDraftNumber } from '../project/drafts.js'
import { RestoreIcon } from './icons.jsx'
import './Drafts.css'

// Compare any two drafts of a chapter / the blurb / the synopsis, word by word.
// CurrentDoc.id is the owner; CurrentDoc.meta.{from,to} are draft numbers or 'now'.
export default function DiffView() {
  const { CurrentDoc, DraftDoc, DraftList, LoadDrafts, OpenDiff, RestoreDraft, OpenChapterById, OpenBookPage } = useProject()

  // 4. Effects
  createEffect(() => { if (CurrentDoc.id) LoadDrafts(CurrentDoc.id) })

  // 5. Handlers
  const owner = () => CurrentDoc.id
  const isBookOwner = () => owner() === 'blurb' || owner() === 'synopsis'
  const order = () => [...DraftList(owner()).map((d) => d.n), 'now']
  function compare(from, to) {
    if (from === to) return
    const [a, b] = order().indexOf(from) <= order().indexOf(to) ? [from, to] : [to, from]
    OpenDiff(owner(), a, b)
  }
  const parseVersion = (value) => (value === 'now' ? 'now' : Number(value))
  function handleChip(event, n) {
    if (event.shiftKey) compare(from(), n)
    else compare(n, to())
  }
  function openOwner() {
    if (isBookOwner()) OpenBookPage(owner())
    else OpenChapterById(owner())
  }

  // 6. JSX-helper builders
  const doc = () => DraftDoc(owner())
  const from = () => CurrentDoc.meta?.from
  const to = () => CurrentDoc.meta?.to ?? 'now'
  const textOf = (version) => (version === 'now' ? doc()?.body ?? '' : DraftList(owner()).find((d) => d.n === version)?.text ?? '')
  const versionLabel = (version) => (version === 'now' ? `Draft ${workingDraftNumber(doc()?.meta)} (working)` : `Draft ${version}`)
  const ops = () => diffWords(textOf(from()), textOf(to()))
  const stats = () => diffStats(ops())
  const options = () => [
    ...DraftList(owner()).map((d) => ({ value: d.n, label: `Draft ${d.n} · ${displayDate(d.date)}${d.note ? ` · ${d.note}` : ''}` })),
    { value: 'now', label: versionLabel('now') },
  ]
  const chipIndex = (n) => order().indexOf(n)
  function chipClass(n) {
    const names = ['dchip']
    if (n === from()) names.push('from')
    if (n === to()) names.push('to')
    if (chipIndex(n) > chipIndex(from()) && chipIndex(n) < chipIndex(to())) names.push('mid')
    return names.join(' ')
  }
  const canRestore = () => from() !== 'now' && textOf(from()) !== (doc()?.body ?? '')

  // 7. JSX
  return (
    <Show when={doc()}>
      <div class="docscroll">
        <div class="docwrap">
          <div class="crumbline"><a onClick={openOwner}>{doc().label}</a><span>›</span><span>Drafts</span></div>
          <div class="diffbar">
            <select class="fbox diffsel" value={String(from())} onChange={(e) => compare(parseVersion(e.currentTarget.value), to())} aria-label="Compare from">
              <For each={options()}>{(option) => <option value={String(option.value)}>{option.label}</option>}</For>
            </select>
            <span class="counts">→</span>
            <select class="fbox diffsel" value={String(to())} onChange={(e) => compare(from(), parseVersion(e.currentTarget.value))} aria-label="Compare to">
              <For each={options()}>{(option) => <option value={String(option.value)}>{option.label}</option>}</For>
            </select>
            <span class="dstat"><ins>+{stats().added.toLocaleString()}</ins> <del>−{stats().removed.toLocaleString()}</del> words</span>
            <span class="spacer" />
            <Show when={from() !== 'now'}>
              <button class="btn" disabled={!canRestore()} onClick={() => RestoreDraft(owner(), from())}><RestoreIcon size={13} /> Restore draft {from()}</button>
            </Show>
          </div>
          <div class="dstrip">
            <For each={order()}>
              {(n) => (
                <button class={chipClass(n)} title={`${versionLabel(n)} — click: compare from · shift-click: compare to`} onClick={(e) => handleChip(e, n)}>
                  {n === 'now' ? 'Now' : n}
                </button>
              )}
            </For>
          </div>
          <div class="diffsheet">
            <For each={ops()}>
              {([op, text]) => (op === '+' ? <ins>{text}</ins> : op === '-' ? <del>{text}</del> : <span>{text}</span>)}
            </For>
          </div>
        </div>
      </div>
    </Show>
  )
}
