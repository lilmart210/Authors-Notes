import { For, Show, createSignal } from 'solid-js'
import { useProject } from '../project/ProjectContext.jsx'
import { avatarColor, avatarInitial } from './avatar.js'
import { ChevronDownIcon, ChevronRightIcon } from './icons.jsx'
import './EntitySelect.css'

// A modern, searchable, TREE dropdown for picking a story-bible entity — the
// replacement for the flat <select> info-dumps. Shows the bible as a collapsible
// tree by default; typing filters to a flat match list. Pass `pool` (an array of
// entities) to restrict to a small explicit set (rendered flat) instead of the
// whole tree.
//
// props: value (id) · onSelect(id | '') · placeholder · clearLabel · allowClear
//        · only ('group' | 'nongroup') · exclude ([ids]) · pool ([entities])
export default function EntitySelect(props) {
  const { Entities, EntityById, Groups, MembersOf } = useProject()

  const [Open, SetOpen] = createSignal(false)
  const [Query, SetQuery] = createSignal('')
  const [Expand, SetExpand] = createSignal({})
  const isExp = (id) => Expand()[id] === true
  const toggleExp = (id) => SetExpand((m) => ({ ...m, [id]: !m[id] }))

  const selected = () => (props.value ? EntityById(props.value) : null)
  const excluded = () => new Set(props.exclude || [])
  const selectable = (e) => {
    if (!e || excluded().has(e.meta.id)) return false
    if (props.only === 'group') return e.meta.type === 'group'
    if (props.only === 'nongroup') return e.meta.type !== 'group'
    return true
  }

  const byOrderName = (a, b) => (a.meta.order ?? 1e9) - (b.meta.order ?? 1e9) || String(a.meta.name || '').localeCompare(String(b.meta.name || ''))
  const groupMemberIds = () => new Set(Groups().flatMap((g) => MembersOf(g.meta)))
  const documentChildren = (e) => (e.childIds || []).map((id) => EntityById(id)).filter(Boolean).sort(byOrderName)
  const memberCards = (e) => (e.meta.type === 'group' ? MembersOf(e.meta).map((id) => EntityById(id)).filter(Boolean).sort(byOrderName) : [])
  const childCardsOf = (e) => {
    const seen = new Set()
    const out = []
    for (const c of [...documentChildren(e), ...memberCards(e)]) if (c && !seen.has(c.meta.id)) { seen.add(c.meta.id); out.push(c) }
    return out
  }
  const topLevel = () => Entities().filter((e) => !e.parentId && !groupMemberIds().has(e.meta.id)).sort(byOrderName)

  const source = () => (props.pool ? props.pool : Entities())
  const matches = () => {
    const q = Query().trim().toLowerCase()
    if (!q) return []
    return source().filter((e) => selectable(e) && String(e.meta.name || '').toLowerCase().includes(q)).slice(0, 60)
  }

  const pick = (id) => { props.onSelect(id); SetOpen(false); SetQuery('') }
  const clear = () => { props.onSelect(''); SetOpen(false); SetQuery('') }

  function Row(rp) {
    const ent = () => rp.entity
    const isGroup = () => ent().meta.type === 'group'
    const kids = () => childCardsOf(ent())
    const hasKids = () => kids().length > 0
    const canPick = () => selectable(ent())
    return (
      <>
        <div class="es-row" style={{ 'padding-left': `${6 + rp.depth * 14}px` }}>
          <span class="es-tw" onClick={() => hasKids() && toggleExp(ent().meta.id)}>
            <Show when={hasKids()}>{isExp(ent().meta.id) ? <ChevronDownIcon size={13} /> : <ChevronRightIcon size={13} />}</Show>
          </span>
          <button class="es-pick" classList={{ dim: !canPick(), sel: props.value === ent().meta.id }} disabled={!canPick()}
            onClick={() => canPick() && pick(ent().meta.id)}>
            <span class="es-av" style={{ background: avatarColor(ent().meta.id) }}>{avatarInitial(ent().meta.name)}</span>
            <span class="es-name">{ent().meta.name}</span>
            <Show when={isGroup()}><span class="es-type">collection</span></Show>
          </button>
        </div>
        <Show when={hasKids() && isExp(ent().meta.id) && rp.depth < 8}>
          <For each={kids()}>{(m) => <Row entity={m} depth={rp.depth + 1} />}</For>
        </Show>
      </>
    )
  }

  const flatPool = () => (props.pool || []).filter(selectable).sort(byOrderName)

  return (
    <div class="es">
      <button class="es-btn" classList={{ open: Open() }} onClick={() => SetOpen((v) => !v)}>
        <Show when={selected()} fallback={<span class="es-ph">{props.placeholder || 'Select…'}</span>}>
          <span class="es-av sm" style={{ background: avatarColor(selected().meta.id) }}>{avatarInitial(selected().meta.name)}</span>
          <span class="es-btnname">{selected().meta.name}</span>
        </Show>
        <ChevronDownIcon size={13} class="es-caret" />
      </button>
      <Show when={Open()}>
        <div class="es-backdrop" onClick={() => SetOpen(false)} />
        <div class="es-pop">
          <input class="es-search" autofocus placeholder="Search…" value={Query()} onInput={(e) => SetQuery(e.currentTarget.value)} />
          <div class="es-list">
            <Show when={props.allowClear && !Query().trim()}>
              <button class="es-pick es-clear" onClick={clear}>{props.clearLabel || '— none —'}</button>
            </Show>
            <Show when={Query().trim()} fallback={
              props.pool
                ? <For each={flatPool()} fallback={<div class="es-empty">Nothing to pick.</div>}>{(e) => (
                    <button class="es-pick" classList={{ sel: props.value === e.meta.id }} onClick={() => pick(e.meta.id)}>
                      <span class="es-av" style={{ background: avatarColor(e.meta.id) }}>{avatarInitial(e.meta.name)}</span><span class="es-name">{e.meta.name}</span>
                    </button>)}</For>
                : <For each={topLevel()}>{(c) => <Row entity={c} depth={0} />}</For>
            }>
              <For each={matches()} fallback={<div class="es-empty">No matches.</div>}>
                {(e) => (
                  <button class="es-pick" classList={{ sel: props.value === e.meta.id }} onClick={() => pick(e.meta.id)}>
                    <span class="es-av" style={{ background: avatarColor(e.meta.id) }}>{avatarInitial(e.meta.name)}</span>
                    <span class="es-name">{e.meta.name}</span><span class="es-type">{e.meta.type}</span>
                  </button>
                )}
              </For>
            </Show>
          </div>
        </div>
      </Show>
    </div>
  )
}
