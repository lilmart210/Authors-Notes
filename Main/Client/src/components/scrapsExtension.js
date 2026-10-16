// CodeMirror side of scraps: a state field holding the chapter's scraps, moved
// through every edit by CodeMirror's own change mapping, plus the commands the
// selection menu and the margin cards call. See project/scraps.js for the model.
import { StateField, StateEffect } from '@codemirror/state'
import { ViewPlugin } from '@codemirror/view'
import { newScrap, mapScrap } from '../project/scraps.js'

const addScrap = StateEffect.define()
const removeScrap = StateEffect.define()

export const scrapField = StateField.define({
  create: () => [],
  update(scraps, tr) {
    let next = scraps
    if (tr.docChanged && next.length) {
      const touched = []
      tr.changes.iterChangedRanges((fromA, toA) => touched.push([fromA, toA]))
      const mapPos = (pos, assoc) => tr.changes.mapPos(pos, assoc)
      next = next.map((scrap) => mapScrap(scrap, mapPos, touched))
      if (next.every((scrap, i) => scrap === scraps[i])) next = scraps
    }
    // effects carry positions in the new document — applied after mapping
    for (const effect of tr.effects) {
      if (effect.is(addScrap)) next = [...next, effect.value]
      else if (effect.is(removeScrap)) next = next.filter((scrap) => scrap.id !== effect.value)
    }
    return next
  },
})

const findScrap = (view, id) => view.state.field(scrapField).find((scrap) => scrap.id === id)

// Cut the selection out and keep it as a margin scrap. A Rewrite scrap also
// collects whatever is typed in its place next.
export function scrapSelection(view, { rewrite = false } = {}) {
  const { from, to } = view.state.selection.main
  const text = view.state.sliceDoc(from, to)
  if (!text.trim()) return false
  view.dispatch({
    changes: { from, to, insert: '' },
    effects: addScrap.of(newScrap(text, from, { rewrite })),
    selection: { anchor: from },
    userEvent: 'delete.cut',
    scrollIntoView: true,
  })
  view.focus()
  return true
}

// Put the scrapped text back in place of whatever replaced it.
export function restoreScrap(view, id) {
  const scrap = findScrap(view, id)
  if (!scrap) return
  view.dispatch({ changes: { from: scrap.from, to: scrap.to, insert: scrap.text }, effects: removeScrap.of(id), userEvent: 'input' })
}

export const dismissScrap = (view, id) => view.dispatch({ effects: removeScrap.of(id) })

// Select what now stands where the scrap was cut.
export function revealScrap(view, id) {
  const scrap = findScrap(view, id)
  if (!scrap) return
  view.dispatch({ selection: { anchor: scrap.from, head: scrap.to }, scrollIntoView: true })
  view.focus()
}

// Bridge to the host: start from the saved scraps, report changes (to save)
// and each scrap's line top (to place its margin card). Callbacks run after
// CodeMirror's update, never inside it.
export function scrapsExtension({ initial, onChange, onLayout }) {
  const plugin = ViewPlugin.fromClass(
    class {
      constructor(view) {
        this.view = view
        this.last = view.state.field(scrapField)
        this.measure()
      }
      update(update) {
        const now = update.state.field(scrapField)
        if (now !== this.last) {
          this.last = now
          queueMicrotask(() => onChange?.(now))
        }
        if (now.length || update.startState.field(scrapField).length) {
          if (update.docChanged || update.geometryChanged || update.heightChanged || now !== update.startState.field(scrapField)) this.measure()
        }
      }
      measure() {
        this.view.requestMeasure({
          read: (view) => view.state.field(scrapField).map((scrap) => ({ id: scrap.id, top: view.lineBlockAt(Math.min(scrap.from, view.state.doc.length)).top })),
          write: (layout) => onLayout?.(layout),
        })
      }
    },
  )
  return [scrapField.init(() => initial || []), plugin]
}

// Bring back a dismissed scrap (Undo).
export const addScrapBack = (view, scrap) => view.dispatch({ effects: addScrap.of(scrap) })
