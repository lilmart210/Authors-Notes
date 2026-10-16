// Local CodeMirror <-> Y.Doc binding. Adapted from the S1 project's yjsBinding,
// but LOCAL-ONLY: no network client, no server. Multiple CodeMirror editors bound
// to the SAME Y.Doc stay in sync in-memory (each binding ignores its own origin
// and applies the other's delta). A shared local `awareness` channel carries each
// view's caret/selection so the panes draw one another's cursor. The host persists
// the shared Y.Text to the .md file.
import { Annotation } from '@codemirror/state'
import { ViewPlugin, Decoration, WidgetType, keymap } from '@codemirror/view'
import * as Y from 'yjs'

/** Marks CM dispatches that come from a Y.Text delta (not user typing). */
const SyncAnnotation = Annotation.define()

let colorSeed = 0
function nextColor() {
  const hue = (colorSeed++ * 137) % 360 // golden-angle spread
  return `hsl(${hue} 68% 55%)`
}

/** A peer view's caret, a thin coloured marker. */
class RemoteCursorWidget extends WidgetType {
  constructor(color) {
    super()
    this.color = color
  }
  eq(other) {
    return other.color === this.color
  }
  toDOM() {
    const span = document.createElement('span')
    span.className = 'cm-remote-cursor'
    span.style.setProperty('--rc', this.color)
    return span
  }
}

/**
 * Bind a CodeMirror view to a shared `Y.Text('document')`, with optional local
 * awareness (caret/selection sharing between views of the same doc).
 * @param {Y.Doc} ydoc
 * @param {{ states: Map, set: Function, subscribe: Function }} [awareness]
 * @returns {{ extensions: import('@codemirror/state').Extension[], destroy: () => void }}
 */
export function createYjsBinding(ydoc, awareness) {
  const ytext = ydoc.getText('document')
  const localOrigin = Symbol('local')
  const undoManager = new Y.UndoManager(ytext, { trackedOrigins: new Set([localOrigin]) })
  const selfId = `${Date.now().toString(36)}-${(colorSeed + 1).toString(36)}`
  const selfColor = nextColor()

  const plugin = ViewPlugin.fromClass(
    class {
      constructor(view) {
        this.view = view
        this.decorations = Decoration.none
        this.observe = this.observe.bind(this)
        this.onAware = this.onAware.bind(this)
        ytext.observe(this.observe)
        this.unsubAware = awareness ? awareness.subscribe(this.onAware) : null
      }

      // Apply a remote/undo Y.Text delta to CodeMirror (skip our own edits).
      observe(event, transaction) {
        if (transaction.origin === localOrigin) return
        const changes = []
        let index = 0
        for (const d of event.delta) {
          if (d.retain !== undefined) index += d.retain
          else if (d.delete !== undefined) { changes.push({ from: index, to: index + d.delete, insert: '' }); index += d.delete }
          else if (d.insert !== undefined) changes.push({ from: index, to: index, insert: d.insert })
        }
        if (changes.length) this.view.dispatch({ changes, annotations: [SyncAnnotation.of(localOrigin)] })
        else this.view.dispatch({}) // refresh remote decorations after a peer edit
      }

      // A peer moved its cursor — redraw its marker. Our own selection updates arrive
      // here too, from inside update(); dispatching then makes CodeMirror throw and
      // shut this plugin off, which silently stopped every edit reaching the Y.Doc.
      // So: ignore our own id, and redraw for peers after the current update finishes.
      onAware(changedId) {
        if (changedId === selfId || this.redrawQueued) return
        this.redrawQueued = true
        queueMicrotask(() => {
          this.redrawQueued = false
          if (!this.destroyed) this.view.dispatch({})
        })
      }

      update(vu) {
        // Publish this view's selection to the shared awareness.
        if (awareness && (vu.selectionSet || vu.docChanged || vu.focusChanged)) {
          const sel = this.view.state.selection.main
          awareness.set(selfId, {
            anchor: Y.createRelativePositionFromTypeIndex(ytext, sel.anchor),
            head: Y.createRelativePositionFromTypeIndex(ytext, sel.head),
            color: selfColor,
          })
        }
        // Mirror local CodeMirror edits into Y.Text.
        const fromSync = vu.transactions.some((t) => t.annotation(SyncAnnotation) === localOrigin)
        if (vu.docChanged && !fromSync) {
          let adjust = 0
          ydoc.transact(() => {
            vu.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
              const text = inserted.sliceString(0, inserted.length, '\n')
              const delLen = toA - fromA
              const pos = fromA + adjust
              if (delLen > 0) ytext.delete(pos, delLen)
              if (text.length > 0) ytext.insert(pos, text)
              adjust += text.length - delLen
            })
          }, localOrigin)
        }
        this.decorations = this.buildRemote()
      }

      buildRemote() {
        if (!awareness) return Decoration.none
        const decos = []
        for (const [id, state] of awareness.states) {
          if (id === selfId || !state?.anchor || !state?.head) continue
          const a = Y.createAbsolutePositionFromRelativePosition(state.anchor, ydoc)
          const h = Y.createAbsolutePositionFromRelativePosition(state.head, ydoc)
          if (!a || !h) continue
          const start = Math.min(a.index, h.index)
          const end = Math.max(a.index, h.index)
          if (start !== end) {
            decos.push(Decoration.mark({ class: 'cm-remote-selection', attributes: { style: `--rc:${state.color}` } }).range(start, end))
          }
          decos.push(Decoration.widget({ widget: new RemoteCursorWidget(state.color), side: 1 }).range(h.index))
        }
        decos.sort((x, y) => x.from - y.from || x.value.startSide - y.value.startSide)
        return Decoration.set(decos)
      }

      destroy() {
        this.destroyed = true
        ytext.unobserve(this.observe)
        if (this.unsubAware) this.unsubAware()
        awareness?.set(selfId, null)
      }
    },
    { decorations: (v) => v.decorations },
  )

  const extensions = [
    plugin,
    keymap.of([
      { key: 'Mod-z', run: () => { undoManager.undo(); return true } },
      { key: 'Mod-y', run: () => { undoManager.redo(); return true } },
      { key: 'Mod-Shift-z', run: () => { undoManager.redo(); return true } },
    ]),
  ]

  return {
    extensions,
    destroy() {
      undoManager.destroy()
      awareness?.set(selfId, null)
    },
  }
}
