import { For, Show, createSignal } from 'solid-js'
import { useProject } from '../project/ProjectContext.jsx'
import { ChevronDownIcon, ChevronRightIcon, OpenIcon, PlusIcon } from './icons.jsx'
import Reveal from './Reveal.jsx'

// The story-bible collection tree, shared by the Explorer and the Cast rail so
// both are organized the same way. Renders a fragment of `.node` rows (the caller
// provides the scroll container). Props: `onNewMember(collectionId)` (optional —
// falls back to a direct create), `depth` (starting indent depth, default 2).
export default function BibleTree(props) {
  const { Entities, EntityById, Groups, MembersOf, OpenEntity, CreateEntityInCollection, CurrentDoc } = useProject()
  const [Open, SetOpen] = createSignal({})
  const isOpen = (id) => Open()[id] === true
  const toggle = (id) => SetOpen((m) => ({ ...m, [id]: !m[id] }))

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
  const newMember = (id) => (props.onNewMember ? props.onNewMember(id) : CreateEntityInCollection('New entry', 'Character', id))

  function Node(np) {
    const ent = () => np.entity
    const isGroup = () => ent().meta.type === 'group'
    const kids = () => childCardsOf(ent())
    const hasKids = () => kids().length > 0
    const handleRow = () => (hasKids() ? toggle(ent().meta.id) : OpenEntity(ent()))
    return (
      <>
        <button class="node" classList={{ sel: CurrentDoc.id === ent().meta.id }} style={{ 'padding-left': `${10 + np.depth * 14}px` }}
          onClick={handleRow} onDblClick={() => OpenEntity(ent(), { smart: true })}>
          <span class="tw"><Show when={hasKids()}>{isOpen(ent().meta.id) ? <ChevronDownIcon size={15} /> : <ChevronRightIcon size={15} />}</Show></span>
          <span class="lbl">{ent().meta.name}</span>
          <Show when={hasKids()}><span class="tag">{kids().length}</span></Show>
          <span class="node-actions">
            <Show when={hasKids()}><button class="nodebtn" title="Open" onClick={(e) => { e.stopPropagation(); OpenEntity(ent()) }}><OpenIcon size={13} /></button></Show>
            <Show when={isGroup()}><button class="nodebtn" title="New member in this collection" onClick={(e) => { e.stopPropagation(); newMember(ent().meta.id) }}><PlusIcon size={14} /></button></Show>
          </span>
        </button>
        <Reveal when={hasKids() && isOpen(ent().meta.id) && np.depth < 8}>
          <For each={kids()}>{(m) => <Node entity={m} depth={np.depth + 1} />}</For>
        </Reveal>
      </>
    )
  }

  return <For each={topLevel()}>{(c) => <Node entity={c} depth={props.depth ?? 2} />}</For>
}
