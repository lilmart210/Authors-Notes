// The "marking pack": CodeMirror decorations that give the prose its story-aware
// chrome — known names LINK to their card (hover to preview, Ctrl/Cmd-click to
// open), same-name clashes underline light-yellow (click to resolve), faint
// italic `%` comment lines, `***` scene breaks rendered as a centered dinkus,
// and resolved `/bank` generator tokens shown as a faint box (click to reroll).
// Plus a selection toolbar (assign the selection to a card, or create one).
import { ViewPlugin, Decoration, WidgetType, EditorView, showTooltip, hoverTooltip } from '@codemirror/view'
import { RangeSetBuilder, StateField, StateEffect } from '@codemirror/state'
import { buildMentionMatcher, resolveMention } from '../project/mentions.js'
import { GENERATOR_TOKEN_RE, generatorToken } from '../project/format.js'

const COMMENT_LINE = Decoration.line({ class: 'cm-comment-line' })
const DINKUS_LINE = Decoration.line({ class: 'cm-dinkus-line' })

class DinkusWidget extends WidgetType {
  eq() {
    return true
  }
  toDOM() {
    const el = document.createElement('span')
    el.className = 'cm-dinkus'
    el.textContent = '✳'
    return el
  }
  ignoreEvent() {
    return false
  }
}
const DINKUS_REPLACE = Decoration.replace({ widget: new DinkusWidget() })

// A resolved generator token — renders just the value in a faint box.
class ResolvedWidget extends WidgetType {
  constructor(bank, value) {
    super()
    this.bank = bank
    this.value = value
  }
  eq(other) {
    return other.bank === this.bank && other.value === this.value
  }
  toDOM() {
    const el = document.createElement('span')
    el.className = 'cm-resolved'
    el.textContent = this.value
    el.setAttribute('data-bank', this.bank)
    el.title = 'Click to reroll'
    return el
  }
  ignoreEvent() {
    return true
  }
}

const isComment = (text) => /^\s*%/.test(text)
const isDinkus = (text) => text.trim() === '***'

// Per-editor manual resolutions (lower-form -> card id) for same-name clashes.
// Seeded from the chapter's saved `resolve` map, updated live when the author
// picks a card from the ambiguity popover (and persisted by the host callback).
const setResolution = StateEffect.define()
function resolutionsField(initial) {
  return StateField.define({
    create() {
      return new Map(Object.entries(initial || {}))
    },
    update(value, tr) {
      let next = value
      for (const effect of tr.effects) {
        if (effect.is(setResolution)) {
          next = new Map(next)
          next.set(effect.value.form, effect.value.id)
        }
      }
      return next
    },
  })
}

function buildDecorations(view, matcher, chapterNumber, resolutions) {
  const builder = new RangeSetBuilder()
  const doc = view.state.doc
  const sel = view.state.selection.main
  const entityRegex = matcher ? new RegExp(matcher.source, 'giu') : null
  const tokenRegex = new RegExp(GENERATOR_TOKEN_RE.source, 'g')
  const resolveMap = Object.fromEntries(resolutions || [])

  for (let i = 1; i <= doc.lines; i += 1) {
    const line = doc.line(i)
    const text = line.text

    if (isDinkus(text)) {
      builder.add(line.from, line.from, DINKUS_LINE)
      const cursorOnLine = sel.from <= line.to && sel.to >= line.from
      if (!cursorOnLine) builder.add(line.from, line.to, DINKUS_REPLACE)
      continue
    }

    if (isComment(text)) builder.add(line.from, line.from, COMMENT_LINE)

    // Inline decorations get collected then sorted, so entity links and
    // resolved tokens are handed to the builder in strict position order.
    const inline = []
    const tokenRanges = []

    for (const match of text.matchAll(tokenRegex)) {
      const from = line.from + match.index
      const to = from + match[0].length
      tokenRanges.push([from, to])
      const editingInside = sel.from < to && sel.to > from
      inline.push({
        from,
        to,
        deco: editingInside
          ? Decoration.mark({ class: 'cm-resolved-raw' })
          : Decoration.replace({ widget: new ResolvedWidget(match[1], match[2]) }),
      })
    }

    if (entityRegex) {
      for (const match of text.matchAll(entityRegex)) {
        const from = line.from + match.index
        const to = from + match[0].length
        if (tokenRanges.some(([a, b]) => from < b && to > a)) continue // inside a token
        const res = resolveMention(matcher.candidates, match[0], chapterNumber, resolveMap)
        if (!res) continue
        if (res.id) {
          inline.push({ from, to, deco: Decoration.mark({ class: 'cm-ent', attributes: { 'data-entity': res.id } }) })
        } else {
          inline.push({ from, to, deco: Decoration.mark({ class: 'cm-ent cm-ent-ambiguous', attributes: { 'data-form': res.form } }) })
        }
      }
    }

    inline.sort((a, b) => a.from - b.from || a.to - b.to)
    for (const item of inline) builder.add(item.from, item.to, item.deco)
  }
  return builder.finish()
}

// Find the generator token covering a document position, if any.
function tokenAt(view, pos) {
  const line = view.state.doc.lineAt(pos)
  const regex = new RegExp(GENERATOR_TOKEN_RE.source, 'g')
  for (const match of line.text.matchAll(regex)) {
    const from = line.from + match.index
    const to = from + match[0].length
    if (pos >= from && pos <= to) return { from, to, bank: match[1], value: match[2] }
  }
  return null
}

// The entity mention covering a document position, resolved for the chapter.
function mentionAt(view, pos, matcher, chapterNumber, resolutions) {
  if (!matcher) return null
  const line = view.state.doc.lineAt(pos)
  const regex = new RegExp(matcher.source, 'giu')
  const resolveMap = Object.fromEntries(resolutions || [])
  for (const match of line.text.matchAll(regex)) {
    const from = line.from + match.index
    const to = from + match[0].length
    if (pos < from || pos > to) continue
    const res = resolveMention(matcher.candidates, match[0], chapterNumber, resolveMap)
    if (!res) return null
    return { from, to, ...res }
  }
  return null
}

// A random entry from the bank, avoiding the current value when possible.
function pickEntry(bank, avoid) {
  let value = bank.entries[Math.floor(Math.random() * bank.entries.length)]
  let guard = 0
  while (bank.entries.length > 1 && value === avoid && guard < 8) {
    value = bank.entries[Math.floor(Math.random() * bank.entries.length)]
    guard += 1
  }
  return value
}

// options: { entitiesAccessor, banksAccessor, onOpenEntity, chapterNumberAccessor,
//            resolveMapAccessor, onResolveMention, previewFor }
export function proseMarkings(options) {
  const {
    entitiesAccessor, banksAccessor, onOpenEntity,
    chapterNumberAccessor, resolveMapAccessor, onResolveMention, previewFor,
  } = options
  const matcher = buildMentionMatcher(entitiesAccessor?.() || [])
  const chapterNumber = () => chapterNumberAccessor?.() ?? null
  const resolveField = resolutionsField(resolveMapAccessor?.() || {})
  const getResolutions = (view) => view.state.field(resolveField, false) || new Map()

  const plugin = ViewPlugin.fromClass(
    class {
      constructor(view) {
        this.decorations = buildDecorations(view, matcher, chapterNumber(), getResolutions(view))
      }
      update(update) {
        const resolved = update.transactions.some((t) => t.effects.some((e) => e.is(setResolution)))
        if (update.docChanged || update.viewportChanged || update.selectionSet || resolved) {
          this.decorations = buildDecorations(update.view, matcher, chapterNumber(), getResolutions(update.view))
        }
      }
    },
    { decorations: (v) => v.decorations },
  )

  // ----- Hover preview: a peek at the linked card -----
  const preview = hoverTooltip((view, pos) => {
    const hit = mentionAt(view, pos, matcher, chapterNumber(), getResolutions(view))
    if (!hit || !hit.id) return null
    const info = previewFor?.(hit.id)
    if (!info) return null
    return {
      pos: hit.from,
      end: hit.to,
      above: true,
      create() {
        const dom = document.createElement('div')
        dom.className = 'cm-entpreview'
        const head = document.createElement('div')
        head.className = 'cm-entpreview-head'
        const name = document.createElement('span')
        name.className = 'cm-entpreview-name'
        name.textContent = info.name || 'Untitled'
        head.append(name)
        if (info.type) {
          const type = document.createElement('span')
          type.className = 'cm-entpreview-type'
          type.textContent = info.type
          head.append(type)
        }
        dom.append(head)
        if (info.subtitle) {
          const sub = document.createElement('div')
          sub.className = 'cm-entpreview-sub'
          sub.textContent = info.subtitle
          dom.append(sub)
        }
        const open = document.createElement('button')
        open.className = 'cm-entpreview-open'
        open.textContent = 'Open ›'
        open.addEventListener('mousedown', (event) => {
          event.preventDefault()
          onOpenEntity?.(hit.id)
        })
        dom.append(open)
        return { dom }
      },
    }
  }, { hoverTime: 250 })

  // ----- Ambiguity popover: pick which card a shared name means here -----
  const openMention = StateEffect.define()
  const chooseMention = (view, form, id) => {
    view.dispatch({ effects: [setResolution.of({ form, id }), openMention.of(null)] })
    onResolveMention?.(form, id)
  }
  function mentionTooltip(state) {
    return {
      pos: state.pos,
      above: true,
      arrow: false,
      create(view) {
        const dom = document.createElement('div')
        dom.className = 'cm-resolve cm-mention-resolve'
        const head = document.createElement('div')
        head.className = 'cm-resolve-head'
        const label = document.createElement('span')
        label.className = 'cm-resolve-bank'
        label.textContent = `Who is "${state.label}"?`
        head.append(label)
        const list = document.createElement('div')
        list.className = 'cm-resolve-list'
        for (const id of state.ids) {
          const info = previewFor?.(id)
          const item = document.createElement('button')
          item.className = 'cm-resolve-item'
          item.textContent = info?.subtitle ? `${info.name} — ${info.subtitle}` : (info?.name || id)
          item.addEventListener('mousedown', (event) => {
            event.preventDefault()
            chooseMention(view, state.form, id)
          })
          list.append(item)
        }
        dom.append(head, list)
        return { dom }
      },
    }
  }
  const mentionField = StateField.define({
    create() {
      return null
    },
    update(value, tr) {
      for (const effect of tr.effects) if (effect.is(openMention)) return effect.value
      if (tr.docChanged || tr.selection) return null
      return value
    },
    provide: (f) => showTooltip.from(f, (state) => (state ? mentionTooltip(state) : null)),
  })

  // ----- Resolve popover: click a /bank token to shuffle or pick an entry -----
  const openResolve = StateEffect.define()
  const findBank = (name) => (banksAccessor?.() || []).find((b) => b.name.toLowerCase() === name.toLowerCase())

  const selectEntry = (view, token, value) => {
    const insert = generatorToken(token.bank, value)
    view.dispatch({ changes: { from: token.from, to: token.to, insert }, effects: openResolve.of(null) })
  }
  const shuffleEntry = (view, token) => {
    const bank = findBank(token.bank)
    if (!bank || !bank.entries.length) return
    const value = pickEntry(bank, token.value)
    const insert = generatorToken(token.bank, value)
    view.dispatch({
      changes: { from: token.from, to: token.to, insert },
      effects: openResolve.of({ from: token.from, to: token.from + insert.length, bank: token.bank, value }),
    })
  }

  function resolveTooltip(token) {
    return {
      pos: token.from,
      above: true,
      arrow: false,
      create(view) {
        const dom = document.createElement('div')
        dom.className = 'cm-resolve'

        const head = document.createElement('div')
        head.className = 'cm-resolve-head'
        const label = document.createElement('span')
        label.className = 'cm-resolve-bank'
        label.textContent = `/${token.bank}`
        const shuffle = document.createElement('button')
        shuffle.className = 'cm-resolve-shuffle'
        shuffle.textContent = '⟳ Shuffle'
        shuffle.addEventListener('mousedown', (event) => {
          event.preventDefault()
          shuffleEntry(view, token)
        })
        head.append(label, shuffle)

        const list = document.createElement('div')
        list.className = 'cm-resolve-list'
        const entries = findBank(token.bank)?.entries || []
        if (entries.length) {
          for (const entry of entries) {
            const item = document.createElement('button')
            item.className = 'cm-resolve-item'
            if (entry === token.value) item.classList.add('on')
            item.textContent = entry
            item.addEventListener('mousedown', (event) => {
              event.preventDefault()
              selectEntry(view, token, entry)
            })
            list.append(item)
          }
        } else {
          const empty = document.createElement('div')
          empty.className = 'cm-resolve-empty'
          empty.textContent = 'This bank is empty.'
          list.append(empty)
        }

        dom.append(head, list)
        return { dom }
      },
    }
  }

  const bankResolveField = StateField.define({
    create() {
      return null
    },
    update(value, tr) {
      for (const effect of tr.effects) if (effect.is(openResolve)) return effect.value
      if (tr.docChanged || tr.selection) return null // any edit/move closes it
      return value
    },
    provide: (f) => showTooltip.from(f, (token) => (token ? resolveTooltip(token) : null)),
  })

  const clicks = EditorView.domEventHandlers({
    mousedown(event, view) {
      const target = event.target instanceof Element ? event.target : null
      if (!target) return false

      // Click a resolved /bank token to open its shuffle/select popover.
      const box = target.closest('.cm-resolved')
      if (box) {
        event.preventDefault()
        const token = tokenAt(view, view.posAtDOM(box))
        if (token) view.dispatch({ effects: openResolve.of(token) })
        return true
      }

      // Click an ambiguous (same-name) mention to pick which card it means.
      const amb = target.closest('.cm-ent-ambiguous')
      if (amb) {
        event.preventDefault()
        const form = amb.getAttribute('data-form')
        const hit = mentionAt(view, view.posAtDOM(amb), matcher, chapterNumber(), getResolutions(view))
        if (form && hit?.ids) {
          view.dispatch({ effects: openMention.of({ pos: hit.from, label: view.state.sliceDoc(hit.from, hit.to), form, ids: hit.ids }) })
        }
        return true
      }

      // Ctrl/Cmd-click a linked name to open its card — plain clicks still edit.
      if (!(event.metaKey || event.ctrlKey)) return false
      const id = target.closest('.cm-ent')?.getAttribute('data-entity')
      if (!id) return false
      event.preventDefault()
      onOpenEntity?.(id)
      return true
    },
  })

  return [plugin, resolveField, clicks, preview, mentionField, bankResolveField]
}

// handlers: { onSaveAs: (type, text) => void, onAssign: (text) => void,
//             onLookup: (text) => void }
export function selectionToolbar(handlers) {
  return StateField.define({
    create() {
      return null
    },
    update(_value, tr) {
      const sel = tr.state.selection.main
      if (sel.empty) return null
      const text = tr.state.sliceDoc(sel.from, sel.to)
      if (!text.trim()) return null
      return {
        pos: sel.from,
        above: true,
        arrow: false,
        create() {
          const dom = document.createElement('div')
          dom.className = 'cm-seltb'
          const addButton = (label, onClick, plus) => {
            const button = document.createElement('button')
            if (plus) {
              const b = document.createElement('b')
              b.textContent = '＋'
              button.append(b, document.createTextNode(` ${label}`))
            } else {
              button.textContent = label
            }
            // mousedown + preventDefault so the selection isn't cleared first.
            button.addEventListener('mousedown', (event) => {
              event.preventDefault()
              onClick()
            })
            return button
          }
          // Primary: assign the selection to an existing card (searchable) or
          // create a new one — the host opens the picker with this text.
          const assign = addButton('Assign to card…', () => handlers.onAssign?.(text), false)
          assign.classList.add('cm-seltb-primary')
          dom.append(assign)
          const divider = document.createElement('span')
          divider.className = 'cm-seltb-div'
          dom.append(
            divider,
            addButton('Character', () => handlers.onSaveAs?.('Character', text), true),
            addButton('Location', () => handlers.onSaveAs?.('Location', text), true),
            addButton('Term', () => handlers.onSaveAs?.('Term', text), true),
          )
          const divider2 = document.createElement('span')
          divider2.className = 'cm-seltb-div'
          dom.append(divider2, addButton('Look up', () => handlers.onLookup?.(text), false))
          return { dom }
        },
      }
    },
    provide: (f) => showTooltip.from(f),
  })
}
