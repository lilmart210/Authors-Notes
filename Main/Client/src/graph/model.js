// Pure graph model — building a full relationship graph from entities, and
// SCOPING/filtering it. No layout, no rendering, no framework: just data → data,
// so it's unit-testable. A graph is { nodes:[{id,name,type}], edges:[{from,to,label}] }.

// Build the full graph from a normalized entity list.
//   entities: [{ id, name, type, relationships:[{to,label} | {from,to,label}], memberIds:[] }]
// Per-entity relationships are outgoing (from = the entity); a group's
// relationships carry explicit from/to. Membership (collection → member) is added
// as a `member` edge unless disabled. Dangling/self/duplicate edges are dropped.
export function buildFullGraph(entities, { includeMembership = true } = {}) {
  const nodes = (entities || []).map((e) => ({ id: e.id, name: e.name, type: e.type }))
  const ids = new Set(nodes.map((n) => n.id))
  const edges = []
  const seen = new Set()
  const add = (from, to, label) => {
    if (!ids.has(from) || !ids.has(to) || from === to) return
    const key = `${from}|${to}|${label ?? ''}`
    if (seen.has(key)) return
    seen.add(key)
    edges.push({ from, to, label: label ?? '' })
  }
  for (const e of entities || []) {
    for (const rel of e.relationships || []) {
      if (rel.from && rel.to) add(rel.from, rel.to, rel.label) // group member-to-member
      else if (rel.to) add(e.id, rel.to, rel.label) // per-entity outgoing
    }
    if (includeMembership) for (const memberId of e.memberIds || []) add(e.id, memberId, 'member')
  }
  // Collapse reciprocal same-label edges (A→B "father" and B→A "father" describe
  // one bond — the seed often declares it on both the person AND the group).
  const kept = []
  const pairSeen = new Set()
  for (const e of edges) {
    const label = String(e.label || '').toLowerCase()
    const key = e.from < e.to ? `${e.from}|${e.to}|${label}` : `${e.to}|${e.from}|${label}`
    if (pairSeen.has(key)) continue
    pairSeen.add(key)
    kept.push(e)
  }
  return { nodes, edges: kept }
}

// Undirected neighbors of a node (edges reach both ways for scoping).
export function neighbors(edges, id) {
  const out = new Set()
  for (const edge of edges) {
    if (edge.from === id) out.add(edge.to)
    if (edge.to === id) out.add(edge.from)
  }
  return out
}

// The set of node ids within `hops` of `center` (breadth-first).
export function egoIds(edges, center, hops = 1) {
  const seen = new Set([center])
  let frontier = [center]
  for (let h = 0; h < hops; h++) {
    const next = []
    for (const id of frontier) {
      for (const n of neighbors(edges, id)) {
        if (!seen.has(n)) { seen.add(n); next.push(n) }
      }
    }
    frontier = next
  }
  return seen
}

// Scope a full graph.
//   scope: { mode:'all' }
//        | { mode:'ego', center, hops }
//        | { mode:'nodes', ids:[…] }     (e.g. a collection's members)
//   scope.relTypes: optional [labels] — keep only edges of those relationship types.
export function scopeGraph(graph, scope = { mode: 'all' }) {
  const { nodes, edges } = graph
  let keepIds
  if (scope.mode === 'ego' && scope.center) keepIds = egoIds(edges, scope.center, scope.hops ?? 1)
  else if (scope.mode === 'nodes') keepIds = new Set(scope.ids || [])
  else keepIds = new Set(nodes.map((n) => n.id))

  let keptEdges = edges.filter((e) => keepIds.has(e.from) && keepIds.has(e.to))
  if (scope.relTypes?.length) {
    const wanted = new Set(scope.relTypes.map((t) => String(t).toLowerCase()))
    keptEdges = keptEdges.filter((e) => wanted.has(String(e.label || '').toLowerCase()))
  }
  return { nodes: nodes.filter((n) => keepIds.has(n.id)), edges: keptEdges }
}

// Distinct relationship-type labels present in a graph (for filter chips).
export function relationTypesIn(graph) {
  return [...new Set((graph.edges || []).map((e) => e.label).filter(Boolean))].sort()
}
