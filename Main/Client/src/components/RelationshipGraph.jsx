import { For, Show, createSignal, createMemo } from 'solid-js'
import { useProject } from '../project/ProjectContext.jsx'
import { avatarColor, avatarInitial } from './avatar.js'
import { buildFullGraph, scopeGraph, relationTypesIn } from '../graph/model.js'
import { layoutGraph } from '../graph/layout.js'
import EntitySelect from './EntitySelect.jsx'
import './GraphView.css'

// Scoped connection graph. Layout is done by dagre (deterministic, tested);
// rendering is our themed SVG. Default is the whole bible, but you'll usually
// Focus on one entity (ego, N hops) or a Collection, and filter by relation type.
export default function RelationshipGraph() {
  const { Entities, EntityById, MembersOf, OpenEntityById } = useProject()

  // 1. Refs (drag-to-pan the canvas)
  let CanvasRef
  let pan = null

  const [Mode, SetMode] = createSignal('all') // 'all' | 'ego' | 'collection'
  const [Center, SetCenter] = createSignal('')
  const [Hops, SetHops] = createSignal(1)
  const [Collection, SetCollection] = createSignal('')
  const [RelFilter, SetRelFilter] = createSignal([]) // [] = all relationship types
  const [ShowMembership, SetShowMembership] = createSignal(false) // membership edges fan across everything — off by default

  const fullGraph = createMemo(() =>
    buildFullGraph(
      Entities().map((e) => ({
        id: e.meta.id,
        name: e.meta.name,
        type: e.meta.type,
        relationships: e.meta.relationships || [],
        memberIds: e.meta.type === 'group' ? MembersOf(e.meta) : [],
      })),
      { includeMembership: ShowMembership() },
    ),
  )
  const scope = () => {
    if (Mode() === 'ego' && Center()) return { mode: 'ego', center: Center(), hops: Hops(), relTypes: RelFilter() }
    if (Mode() === 'collection' && Collection()) {
      const coll = EntityById(Collection())
      return { mode: 'nodes', ids: [Collection(), ...(coll ? MembersOf(coll.meta) : [])], relTypes: RelFilter() }
    }
    return { mode: 'all', relTypes: RelFilter() }
  }
  const scoped = createMemo(() => scopeGraph(fullGraph(), scope()))
  const laid = createMemo(() => layoutGraph(scoped()))
  const relTypes = () => relationTypesIn(fullGraph())
  const collections = () => Entities().filter((e) => e.meta.type === 'group')
  const people = () => Entities().filter((e) => e.meta.type !== 'group')

  const toggleRel = (t) => SetRelFilter((f) => (f.includes(t) ? f.filter((x) => x !== t) : [...f, t]))
  const posOf = (id) => laid().positions[id]
  const edgePath = (points) => (points && points.length ? `M${points.map((p) => `${p.x} ${p.y}`).join(' L')}` : '')
  const nameOf = (id) => EntityById(id)?.meta.name || id
  const handleNodeClick = (id) => (Mode() === 'ego' ? SetCenter(id) : OpenEntityById(id))
  const startPan = (e) => {
    if (e.target.closest('.gv-node')) return // let node clicks through
    pan = { x: e.clientX, y: e.clientY, left: CanvasRef.scrollLeft, top: CanvasRef.scrollTop }
    CanvasRef.classList.add('panning')
  }
  const movePan = (e) => {
    if (!pan) return
    CanvasRef.scrollLeft = pan.left - (e.clientX - pan.x)
    CanvasRef.scrollTop = pan.top - (e.clientY - pan.y)
  }
  const endPan = () => { pan = null; CanvasRef?.classList.remove('panning') }

  return (
    <div class="gv">
      <div class="gv-bar">
        <div class="seg gv-seg">
          <button classList={{ on: Mode() === 'all' }} onClick={() => SetMode('all')}>All</button>
          <button classList={{ on: Mode() === 'ego' }} onClick={() => SetMode('ego')}>Focus</button>
          <button classList={{ on: Mode() === 'collection' }} onClick={() => SetMode('collection')}>Collection</button>
        </div>
        <Show when={Mode() === 'ego'}>
          <EntitySelect value={Center()} onSelect={SetCenter} only="nongroup" placeholder="Pick an entity…" />
          <label class="gv-hops">Hops
            <input type="range" min="1" max="3" value={Hops()} onInput={(e) => SetHops(Number(e.currentTarget.value))} />
            <b>{Hops()}</b>
          </label>
        </Show>
        <Show when={Mode() === 'collection'}>
          <EntitySelect value={Collection()} onSelect={SetCollection} only="group" placeholder="Pick a collection…" />
        </Show>
        <div class="gv-relfilter">
          <For each={relTypes()}>
            {(t) => <button class="gv-chip" classList={{ on: RelFilter().includes(t) }} onClick={() => toggleRel(t)}>{t}</button>}
          </For>
        </div>
        <button class="gv-chip gv-memtoggle" classList={{ on: ShowMembership() }} onClick={() => SetShowMembership((v) => !v)}>membership</button>
        <span class="gv-count">{scoped().nodes.length} nodes · {scoped().edges.length} links</span>
      </div>

      <div class="gv-canvas" ref={CanvasRef} onPointerDown={startPan} onPointerMove={movePan} onPointerUp={endPan} onPointerLeave={endPan}>
        <Show
          when={scoped().nodes.length}
          fallback={<div class="gv-empty">{Mode() === 'ego' && !Center() ? 'Pick an entity to focus on.' : Mode() === 'collection' && !Collection() ? 'Pick a collection.' : 'Nothing to show for this scope.'}</div>}
        >
          <svg class="gv-svg" width={laid().width} height={laid().height} viewBox={`0 0 ${laid().width} ${laid().height}`}>
            <defs>
              <marker id="gv-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M0 0L10 5L0 10z" fill="var(--faint)" />
              </marker>
            </defs>
            <For each={laid().edges}>
              {(edge) => (
                <>
                  <path class="gv-edge" classList={{ member: edge.label === 'member' }} d={edgePath(edge.points)} fill="none" marker-end="url(#gv-arrow)" />
                  <Show when={edge.label && edge.label !== 'member'}>
                    <text x={edge.labelX} y={edge.labelY} class="gv-elabel" text-anchor="middle" dy="3">{edge.label}</text>
                  </Show>
                </>
              )}
            </For>
            <For each={scoped().nodes}>
              {(node) => {
                const p = posOf(node.id)
                return (
                  <Show when={p}>
                    <g class="gv-node" classList={{ center: Mode() === 'ego' && Center() === node.id }} transform={`translate(${p.x}, ${p.y})`}
                      onClick={() => handleNodeClick(node.id)} onDblClick={() => OpenEntityById(node.id)}>
                      <circle class="gv-nodecircle" r="17" style={{ fill: avatarColor(node.id) }} />
                      <text class="gv-avtext" text-anchor="middle" dy="4">{avatarInitial(node.name)}</text>
                      <text class="gv-nodename" text-anchor="middle" y="31">{node.name}</text>
                    </g>
                  </Show>
                )
              }}
            </For>
          </svg>
        </Show>
      </div>
      <Show when={Mode() === 'ego' && Center()}>
        <div class="gv-hint">Click a node to re-center · double-click to open · showing {Hops()} hop{Hops() === 1 ? '' : 's'} from <b>{nameOf(Center())}</b></div>
      </Show>
    </div>
  )
}
