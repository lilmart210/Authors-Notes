import { onMount, onCleanup, Show } from 'solid-js'
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
 */
export default function Editor(props) {
  // 1. Refs
  let HostRef
  let EditorViewRef
  let YjsBindingRef

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
      EditorView.updateListener.of((update) => {
        if (!update.docChanged) return
        if (useYjs) props.onEdit?.()
        else props.onChange?.(update.state.doc.toString())
      }),
    ]

    const initialDoc = useYjs ? props.ydoc.getText('document').toString() : (props.doc ?? '')
    EditorViewRef = new EditorView({ state: EditorState.create({ doc: initialDoc, extensions }), parent: HostRef })
    props.ref?.(EditorViewRef)
  })

  onCleanup(() => {
    EditorViewRef?.destroy()
    YjsBindingRef?.destroy()
  })

  // 6. JSX-helper builders
  const hostClass = () => `an-editor-host ${props.pageView ? 'page' : 'scroll'}`

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
          <div class="cm-host" ref={HostRef} />
        </div>
      </div>
    </div>
  )
}
