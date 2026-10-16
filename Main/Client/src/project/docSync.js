// Local shared-document registry. One Y.Doc per open file, ref-counted and
// reused across panes — so two views of the same chapter bind to the SAME Y.Doc
// and stay in sync (see components/yjsBinding.js). No network: the doc lives in
// memory and is persisted to the .md via the `persist` callback (debounced), and
// flushed when the last view closes. Version-friendly: the Y.Doc keeps full edit
// history (UndoManager / snapshots) if we add local version history later.
import * as Y from 'yjs'

const registry = new Map() // key -> { ydoc, awareness, refs, timer, persist }
const PERSIST_DELAY_MS = 1000 // short: a crash loses at most ~1 s of typing

// A tiny local "awareness" channel shared by every view of one doc: a map of
// { viewId -> { anchor, head, color } } plus change notifications. No network —
// two panes on the same machine publish their caret/selection here so each can
// draw the other's. (Standard Y awareness keys by doc.clientID, which two views
// of one Y.Doc share — so we roll our own keyed by a per-view id.)
function makeAwareness() {
  const states = new Map()
  const subs = new Set()
  return {
    states,
    set(id, state) {
      if (state == null) states.delete(id)
      else states.set(id, state)
      subs.forEach((fn) => fn(id)) // subscribers skip their own id
    },
    subscribe(fn) {
      subs.add(fn)
      return () => subs.delete(fn)
    },
  }
}

// Acquire (or create) the shared Y.Doc for a file key. `initialText` seeds it on
// first open; `persist(text)` saves the body (debounced) after edits.
export function acquireDoc(key, initialText, persist) {
  let entry = registry.get(key)
  if (!entry) {
    const ydoc = new Y.Doc()
    const ytext = ydoc.getText('document')
    ytext.insert(0, initialText || '')
    entry = { ydoc, awareness: makeAwareness(), refs: 0, timer: null, persist }
    ytext.observe(() => {
      if (!entry.persist) return
      if (entry.timer) clearTimeout(entry.timer)
      entry.timer = setTimeout(() => { entry.timer = null; entry.persist(ytext.toString()) }, PERSIST_DELAY_MS)
    })
    registry.set(key, entry)
  } else if (persist && !entry.persist) {
    entry.persist = persist
  }
  entry.refs += 1
  return { ydoc: entry.ydoc, awareness: entry.awareness }
}

// Release one view. When the last one closes, flush a pending save and dispose.
export function releaseDoc(key) {
  const entry = registry.get(key)
  if (!entry) return
  entry.refs -= 1
  if (entry.refs <= 0) {
    if (entry.timer) {
      clearTimeout(entry.timer)
      entry.persist?.(entry.ydoc.getText('document').toString())
    }
    entry.ydoc.destroy()
    registry.delete(key)
  }
}

// Current text of an open shared doc (null if not open).
export function docString(key) {
  const entry = registry.get(key)
  return entry ? entry.ydoc.getText('document').toString() : null
}

// Replace the whole text of an open shared doc (restoring a draft). Every view
// bound to it updates, and the normal debounced save writes it. False if not open.
export function replaceText(key, text) {
  const entry = registry.get(key)
  if (!entry) return false
  const ytext = entry.ydoc.getText('document')
  entry.ydoc.transact(() => {
    ytext.delete(0, ytext.length)
    ytext.insert(0, text)
  })
  return true
}

// Force-flush any pending save for an open doc (e.g. before export).
export function flushDoc(key) {
  const entry = registry.get(key)
  if (entry?.timer) {
    clearTimeout(entry.timer)
    entry.timer = null
    entry.persist?.(entry.ydoc.getText('document').toString())
  }
}

// Flush every open doc's pending save (before export / preview / project close).
export function flushAll() {
  for (const [, entry] of registry) {
    if (entry.timer) {
      clearTimeout(entry.timer)
      entry.timer = null
      entry.persist?.(entry.ydoc.getText('document').toString())
    }
  }
}
