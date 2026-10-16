// Autocomplete as you write: after a short pause at the end of a line, ask the
// autocomplete model how the sentence goes on and show it as faded text at the
// cursor. Tab takes it; Esc, typing or moving the cursor drops it.

import { Prec, StateEffect, StateField } from '@codemirror/state'
import { Decoration, EditorView, ViewPlugin, WidgetType, keymap } from '@codemirror/view'
import { tidySuggestion } from '../ai/prose.js'

const PAUSE_MS = 650
const CONTEXT_CHARS = 2500

const setGhost = StateEffect.define() // { pos, text } | null

class GhostWidget extends WidgetType {
  constructor(text) {
    super()
    this.text = text
  }
  eq(other) {
    return other.text === this.text
  }
  toDOM() {
    const span = document.createElement('span')
    span.className = 'cm-ghost'
    span.textContent = this.text
    return span
  }
  ignoreEvent() {
    return true
  }
}

const ghostField = StateField.define({
  create: () => null,
  update(ghost, tr) {
    for (const effect of tr.effects) if (effect.is(setGhost)) return effect.value
    return ghost && !tr.docChanged && !tr.selection ? ghost : null
  },
  provide: (field) =>
    EditorView.decorations.from(field, (ghost) =>
      ghost ? Decoration.set([Decoration.widget({ widget: new GhostWidget(ghost.text), side: 1 }).range(ghost.pos)]) : Decoration.none),
})

export const ghostAt = (state) => state.field(ghostField, false) || null

function acceptGhost(view) {
  const ghost = ghostAt(view.state)
  if (!ghost) return false
  view.dispatch({ changes: { from: ghost.pos, insert: ghost.text }, selection: { anchor: ghost.pos + ghost.text.length }, userEvent: 'input.complete' })
  return true
}

function dismissGhost(view) {
  if (!ghostAt(view.state)) return false
  view.dispatch({ effects: setGhost.of(null) })
  return true
}

//   suggest(before, { signal }) → Promise<string>  the raw continuation
//   isEnabled() → boolean                          false when autocomplete is off
//   warmUp() → void                                start loading the model early
//   onError(err) → void
export function ghostText({ suggest, isEnabled, warmUp = () => {}, onError = () => {} }) {
  const plugin = ViewPlugin.fromClass(class {
    constructor(view) {
      this.view = view
      this.timer = null
      this.controller = null
      if (isEnabled()) warmUp()
    }
    update(update) {
      if (!update.docChanged && !update.selectionSet) return
      this.cancel()
      if (!isEnabled() || !update.transactions.some((tr) => tr.isUserEvent('input.type'))) return
      this.timer = setTimeout(() => this.request(), PAUSE_MS)
    }
    request() {
      const { state } = this.view
      const head = state.selection.main.head
      const line = state.doc.lineAt(head)
      if (!state.selection.main.empty || head !== line.to || !line.text.trim()) return
      const before = state.sliceDoc(Math.max(0, head - CONTEXT_CHARS), head)
      const controller = new AbortController()
      this.controller = controller
      const doc = state.doc
      suggest(before, { signal: controller.signal }).then((raw) => {
        const now = this.view.state
        if (controller.signal.aborted || now.doc !== doc || now.selection.main.head !== head) return
        const text = tidySuggestion(raw, before)
        if (text) this.view.dispatch({ effects: setGhost.of({ pos: head, text }) })
      }, (err) => {
        if (!controller.signal.aborted) onError(err)
      })
    }
    cancel() {
      clearTimeout(this.timer)
      this.controller?.abort()
      this.controller = null
    }
    destroy() {
      this.cancel()
    }
  })
  return [ghostField, plugin, Prec.highest(keymap.of([{ key: 'Tab', run: acceptGhost }, { key: 'Escape', run: dismissGhost }]))]
}
