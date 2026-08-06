// Headless tests for the graph subsystem — the model (scoping/filtering) and the
// dagre layout adapter. Run:  node scripts/graph-test.mjs

import { buildFullGraph, scopeGraph, egoIds, relationTypesIn } from '../src/graph/model.js'
import { layoutGraph } from '../src/graph/layout.js'

let failures = 0
const ok = (cond, msg) => { console.log(`${cond ? '  ✓' : '  ✗'} ${msg}`); if (!cond) failures++ }

// A small Jin-family-ish graph.
const entities = [
  { id: 'hai', name: 'Jin Hai', type: 'Character', relationships: [{ to: 'guangli', label: 'father' }, { to: 'meixiu', label: 'mother' }, { to: 'dandan', label: 'sister' }] },
  { id: 'guangli', name: 'Jin Guangli', type: 'Character', relationships: [{ to: 'meixiu', label: 'wife' }] },
  { id: 'meixiu', name: 'Jin Meixiu', type: 'Character', relationships: [] },
  { id: 'dandan', name: 'Jin Dandan', type: 'Character', relationships: [{ to: 'meilin', label: 'previous body' }] },
  { id: 'meilin', name: 'Mei Lin', type: 'Character', relationships: [] },
  { id: 'qin', name: 'Qin Peizhi', type: 'Character', relationships: [] }, // unconnected
  { id: 'jinfam', name: 'Jin Family', type: 'group', relationships: [], memberIds: ['hai', 'guangli', 'meixiu', 'dandan'] },
  { id: 'ghost', name: 'Ghost', type: 'Character', relationships: [{ to: 'nope', label: 'x' }] }, // dangling edge
]

console.log('\n== graph model ==')
const full = buildFullGraph(entities)
ok(full.nodes.length === 8, 'all nodes kept')
ok(!full.edges.some((e) => e.to === 'nope'), 'dangling edge (to a missing node) dropped')
ok(full.edges.some((e) => e.from === 'jinfam' && e.to === 'hai' && e.label === 'member'), 'membership edge added for a collection')

const noMembers = buildFullGraph(entities, { includeMembership: false })
ok(!noMembers.edges.some((e) => e.label === 'member'), 'membership can be excluded')

// Ego: Jin Hai, 1 hop → himself + father/mother/sister (+ jin family via membership edge).
const ego1 = egoIds(full.edges, 'hai', 1)
ok(ego1.has('guangli') && ego1.has('meixiu') && ego1.has('dandan'), 'ego(1) reaches direct relations')
ok(!ego1.has('meilin'), 'ego(1) does NOT reach a 2-hop node (Mei Lin)')
const ego2 = egoIds(full.edges, 'hai', 2)
ok(ego2.has('meilin'), 'ego(2) reaches Mei Lin (Hai→Dandan→Mei Lin)')

const egoScoped = scopeGraph(full, { mode: 'ego', center: 'hai', hops: 1 })
ok(!egoScoped.nodes.some((n) => n.id === 'qin'), 'ego scope excludes the unconnected Qin')
ok(egoScoped.edges.every((e) => egoScoped.nodes.some((n) => n.id === e.from) && egoScoped.nodes.some((n) => n.id === e.to)), 'every edge connects nodes present in the scope')

const collScoped = scopeGraph(full, { mode: 'nodes', ids: ['hai', 'guangli', 'meixiu', 'dandan'] })
ok(collScoped.nodes.length === 4 && !collScoped.nodes.some((n) => n.id === 'meilin'), 'collection scope = just its members')

const kinship = scopeGraph(full, { mode: 'all', relTypes: ['father', 'mother', 'sister', 'wife'] })
ok(kinship.edges.length > 0 && kinship.edges.every((e) => ['father', 'mother', 'sister', 'wife'].includes(e.label)), 'relationship-type filter keeps only kinship edges')
ok(relationTypesIn(full).includes('member') && relationTypesIn(full).includes('father'), 'relationTypesIn lists the labels')

console.log('\n== dagre layout ==')
const laid = layoutGraph(egoScoped)
ok(Object.keys(laid.positions).length === egoScoped.nodes.length, 'every node gets a position')
ok(egoScoped.nodes.every((n) => laid.positions[n.id]), 'no node is missing a position')
const coords = egoScoped.nodes.map((n) => `${laid.positions[n.id].x},${laid.positions[n.id].y}`)
ok(new Set(coords).size === coords.length, 'no two nodes share the exact same position')
ok(laid.width > 0 && laid.height > 0, 'layout reports a positive canvas size')
// TB direction: an edge's source sits above its target (real hierarchy, not a grid).
// Our edge is Hai —father→ Guangli, so Hai (source) is above Guangli (target).
ok(laid.positions.hai.y < laid.positions.guangli.y, 'hierarchical layout ranks an edge source above its target')
ok(Object.keys(layoutGraph({ nodes: [], edges: [] }).positions).length === 0, 'empty graph lays out to nothing (no crash)')

console.log(failures ? `\n  ${failures} FAILED\n` : '\n  all passed\n')
if (failures) process.exitCode = 1
