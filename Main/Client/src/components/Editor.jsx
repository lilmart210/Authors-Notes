import { onMount, onCleanup, Show, For, createSignal, createEffect } from 'solid-js'
import { EditorState } from '@codemirror/state'
import {
  EditorView,
  keymap,
  drawSelection,
  dropCursor,
  highlightActiveLine,
} from '@codemirror/view'
import {
  history,
  historyKeymap,
  defaultKeymap,
  indentWithTab,
} from '@codemirror/commands'
import { autocompletion, completionKeymap } from '@codemirror/autocomplete'
import { proseMarkings, selectionToolbar } from './marking.js'
import { createYjsBinding } from './yjsBinding.js'
import { scrapsExtension, restoreScrap, dismissScrap, revealScrap, addScrapBack } from './scrapsExtension.js'
import { scrapContext, serializeScraps } from '../project/scraps.js'
import { displayDate } from '../project/drafts.js'
import { ScissorsIcon } from './icons.jsx'
import { showToast } from './Toast.jsx'
import { generatorToken } from '../project/format.js'
import './Editor.css'

// Generator: typing "/bankname" offers a random pick from that bank, plus its
// individual entries (select). Picking replaces the "/token" with the value.
function makeBankCompletion(banksAccessor) {
  return (context) => {
    const before = context.matchBefore(/\/[\p{L}\p{N}_-]*/u)
    if (!before || (before.from === before.to && !context.explicit)) return null
    const query = before.text.slice(1).toLowerCase()
    const banks = banksAccessor ? banksAccessor() : []
    const options = []
    for (const bank of banks) {
      if (!bank.entries.length) continue
      if (query && !bank.name.toLowerCase().includes(query)) continue
      options.push({
        label: `/${bank.name}`,
        detail: 'random',
        apply: (view, _completion, from, to) => {
          const entry = bank.entries[Math.floor(Math.random() * bank.entries.length)]
          view.dispatch({ changes: { from, to, insert: generatorToken(bank.name, entry) } })
        },
      })
    }
    const exact = banks.find((b) => b.name.toLowerCase() === query)
    if (exact)
      for (const entry of exact.entries.slice(0, 40))
        options.push({
          label: entry,
          detail: exact.name,
          type: 'text',
          apply: (view, _completion, from, to) => {
            view.dispatch({ changes: { from, to, insert: generatorToken(exact.name, entry) } })
          },
        })
    return options.length ? { from: before.from, options } : null
  }
}

// Prose typography. Page/scroll LAYOUT lives in Editor.css so it can switch.
// Height is `auto` so the surrounding sheet scroller owns the scrolling — the
// prose then sits *on* the page sheet (with its chapter header) instead of in a
// separate CM scrollbox.
const PROSE_THEME = EditorView.theme({
  '&': { height: 'auto', fontSize: '17px', color: 'var(--an-ink)', backgroundColor: 'transparent' },
  '.cm-scroller': {
    fontFamily: 'Iowan Old Style, Palatino Linotype, Georgia, Cambria, serif',
    lineHeight: '1.72',
    overflow: 'visible',
  },
  '.cm-content': { caretColor: 'var(--an-accent)', padding: '0' },
  '.cm-line': { padding: '0' },
  '&.cm-focused': { outline: 'none' },
  '.cm-cursor': { borderLeftColor: 'var(--an-accent)' },
  // Theme BOTH the focused and unfocused selection (the toolbar steals focus, so
  // the unfocused colour must also stay a translucent tint or the text washes out).
  // These override CM's built-in light/dark defaults so it's correct in every theme.
  '.cm-selectionBackground': { backgroundColor: 'var(--sel)' },
  '&.cm-focused .cm-selectionBackground': { backgroundColor: 'var(--sel)' },
  '.cm-selectionLayer .cm-selectionBackground': { backgroundColor: 'var(--sel)' },
  '::selection': { backgroundColor: 'var(--sel)' },
  '.cm-activeLine': { backgroundColor: 'transparent' },
  // Popups (selection toolbar, resolve popover, /bank autocomplete) — themed here
  // so they never fall back to CM's light default box.
  '.cm-tooltip': {
    backgroundColor: 'var(--chrome)',
    border: '1px solid var(--border)',
    borderRadius: '9px',
    color: 'var(--ink)',
    boxShadow: 'var(--shadow)',
  },
  '.cm-tooltip.cm-tooltip-autocomplete > ul > li': { color: 'var(--ink)' },
  '.cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]': {
    backgroundColor: 'var(--accent-soft)',
    color: 'var(--ink)',
  },
})

/**
 * Thin SolidJS wrapper around a CodeMirror 6 EditorView.
 *
 * @param {object} props
 * @param {string} [props.doc]                      initial document text
 * @param {(value: string) => void} [props.onChange] fires on every edit
 * @param {boolean} [props.pageView]                 render as a page sheet vs scroll
 * @param {string} [props.title]                     chapter title, shown on the sheet
 * @param {number} [props.chapterNumber]             chapter number, shown on the sheet
 * @param {() => object[]} [props.entities]          entities to underline in the prose
 * @param {(id: string) => void} [props.onOpenEntity] open an entity (Ctrl/Cmd-click)
 * @param {(type: string, text: string) => void} [props.onSaveAs] save selection as an entity
 * @param {(text: string) => void} [props.onLookup]  look up the selection
 * @param {number} [props.pageWidth]                 page-sheet width in px (Page view)
 * @param {object[]} [props.scraps]                 chapter scraps — enables Scrap/Rewrite and the margin cards
 * @param {(list: object[]) => void} [props.onScrapsChange] save the scraps (debounced)
 * @param {string} [props.focusScrapId]              select a scrap's text once the editor opens
 */
export default function Editor(props) {
  // 1. Refs
  let HostRef
  let EditorViewRef
  let YjsBindingRef
  let ScrapMarginRef
  let ScrapSaveTimer
  let PendingScraps = null

  // 2. Signals
  const [Scraps, SetScraps] = createSignal(props.scraps || [])
  const [ScrapTops, SetScrapTops] = createSignal({}) // scrap id → line top (px, document-relative)
  const [DocTick, SetDocTick] = createSignal(0) // bumps on edits so card context stays current
  const [OpenScrapId, SetOpenScrapId] = createSignal(null) // narrow layout: which marker is expanded
  const hasScraps = () => props.scraps !== undefined

  // 3. onMount
  onMount(() => {
    // With a shared Y.Doc, edits flow through the binding (Yjs owns undo); the
    // content is the Y.Text. Without one, it's a plain doc string + onChange.
    const useYjs = !!props.ydoc
    YjsBindingRef = useYjs ? createYjsBinding(props.ydoc, props.awareness) : null

    const keys = [...defaultKeymap, ...completionKeymap, indentWithTab]
    if (!useYjs) keys.push(...historyKeymap)

    const extensions = [
      ...(useYjs ? [] : [history()]),
      drawSelection(),
      dropCursor(),
      highlightActiveLine(),
      EditorView.lineWrapping,
      autocompletion({ override: [makeBankCompletion(props.banks)] }),
      ...proseMarkings({
        entitiesAccessor: props.entities,
        banksAccessor: props.banks,
        onOpenEntity: props.onOpenEntity,
        chapterNumberAccessor: () => props.chapterNumber,
        resolveMapAccessor: () => props.resolveMap,
        onResolveMention: props.onResolveMention,
        previewFor: props.previewFor,
      }),
      selectionToolbar({ onSaveAs: props.onSaveAs, onAssign: props.onAssign, onLookup: props.onLookup }),
      keymap.of(keys),
      PROSE_THEME,
      ...(YjsBindingRef ? YjsBindingRef.extensions : []),
      ...(hasScraps() ? scrapsExtension({ initial: props.scraps, onChange: handleScrapsChange, onLayout: handleScrapLayout }) : []),
      EditorView.updateListener.of((update) => {
        if (!update.docChanged) return
        if (Scraps().length) SetDocTick((tick) => tick + 1)
        if (useYjs) props.onEdit?.()
        else props.onChange?.(update.state.doc.toString())
      }),
    ]

    const initialDoc = useYjs ? props.ydoc.getText('document').toString() : (props.doc ?? '')
    EditorViewRef = new EditorView({ state: EditorState.create({ doc: initialDoc, extensions }), parent: HostRef })
    props.ref?.(EditorViewRef)
    if (props.focusScrapId) queueMicrotask(() => revealScrap(EditorViewRef, props.focusScrapId))
  })

  onCleanup(() => {
    flushScraps()
    EditorViewRef?.destroy()
    YjsBindingRef?.destroy()
  })

  // 4. Effects — stack margin cards so close scraps don't overlap (reads card
  // heights after render; positions come from CodeMirror's line tops).
  createEffect(() => {
    const tops = ScrapTops()
    Scraps()
    DocTick()
    if (!ScrapMarginRef) return
    queueMicrotask(() => {
      let bottom = -Infinity
      const cards = [...ScrapMarginRef.querySelectorAll('.scrap')].sort((a, b) => (tops[a.dataset.scrap] ?? 0) - (tops[b.dataset.scrap] ?? 0))
      for (const card of cards) {
        const top = Math.max(tops[card.dataset.scrap] ?? 0, bottom + 8)
        card.style.top = `${top}px`
        bottom = top + card.offsetHeight
      }
    })
  })

  // 5. Handlers
  function handleScrapsChange(list) {
    SetScraps(list)
    PendingScraps = list
    clearTimeout(ScrapSaveTimer)
    ScrapSaveTimer = setTimeout(flushScraps, 400)
  }
  function flushScraps() {
    clearTimeout(ScrapSaveTimer)
    if (PendingScraps) props.onScrapsChange?.(serializeScraps(PendingScraps))
    PendingScraps = null
  }
  const handleScrapLayout = (layout) => SetScrapTops(Object.fromEntries(layout.map((entry) => [entry.id, entry.top])))
  function handleDismiss(scrap) {
    dismissScrap(EditorViewRef, scrap.id)
    showToast('Scrap dismissed', () => addScrapBack(EditorViewRef, scrap))
  }
  const toggleMarker = (id) => SetOpenScrapId((current) => (current === id ? null : id))

  // 6. JSX-helper builders
  const hostClass = () => `an-editor-host ${props.pageView ? 'page' : 'scroll'} ${hasScraps() ? 'with-margin' : ''}`
  function contextOf(scrap) {
    DocTick()
    return scrapContext(EditorViewRef ? EditorViewRef.state.doc.toString() : '', scrap)
  }
  const awaitingRewrite = (scrap) => scrap.rewrite && !scrap.sealed && scrap.from === scrap.to
  const scrapLabel = (scrap) => (scrap.rewrite ? 'Rewritten' : 'Scrapped')

  // 7. return JSX
  return (
    <div class={hostClass()} style={{ '--sheet-width': `${props.pageWidth ?? 620}px` }}>
      <div class="editor-scroll">
        <div class="sheet serif">
          <Show when={props.chapterNumber != null || props.title}>
            <div class="sheet-head">
              <Show when={props.chapterNumber != null}>
                <div class="chapline mono">Chapter : {props.chapterNumber}</div>
              </Show>
              <Show when={props.title}>
                <div class="chaptitle">{props.title}</div>
              </Show>
            </div>
          </Show>
          <div class="cm-margin-host">
            <div class="cm-host" ref={HostRef} />
            <Show when={hasScraps()}>
              <div class="scrap-margin" ref={ScrapMarginRef}>
                <For each={Scraps()}>
                  {(scrap) => (
                    <div class="scrap" classList={{ rw: scrap.rewrite, open: OpenScrapId() === scrap.id }} data-scrap={scrap.id}
                      title="Show where it was" onClick={() => revealScrap(EditorViewRef, scrap.id)}>
                      <button class="scrap-marker" title={`${scrapLabel(scrap)} text`} onClick={(e) => { e.stopPropagation(); toggleMarker(scrap.id) }}><ScissorsIcon size={13} /></button>
                      <div class="scrap-body">
                        <div class="scrap-h"><ScissorsIcon size={12} /><span>{scrapLabel(scrap)}</span><span class="scrap-date">{displayDate(scrap.date)}</span></div>
                        <div class="scrap-flow">
                          <span class="ctx">{contextOf(scrap).before}</span>
                          <del>{scrap.text}</del>
                          <Show when={contextOf(scrap).now} fallback={<Show when={awaitingRewrite(scrap)} fallback={' '}><span class="caretmark" title="Type the new version here" /></Show>}>
                            <ins>{contextOf(scrap).now}</ins>
                          </Show>
                          <span class="ctx">{contextOf(scrap).after}</span>
                        </div>
                        <div class="scrap-a">
                          <button class="scrap-btn" onClick={(e) => { e.stopPropagation(); restoreScrap(EditorViewRef, scrap.id) }}>Put back</button>
                          <button class="scrap-btn dim" onClick={(e) => { e.stopPropagation(); handleDismiss(scrap) }}>Dismiss</button>
                        </div>
                      </div>
                    </div>
                  )}
                </For>
              </div>
            </Show>
          </div>
        </div>
      </div>
    </div>
  )
}
