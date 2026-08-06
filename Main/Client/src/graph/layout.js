// Deterministic graph layout via dagre (a real, maintained layout engine) — kept
// behind this thin adapter so the rest of the app only sees positions + routed
// edges. Crucially we hand dagre each edge's LABEL size so it reserves space and
// the labels don't stack on top of each other; dagre also returns routed edge
// waypoints so lines bend around nodes instead of cutting straight through.
import dagre from '@dagrejs/dagre'

const labelWidth = (label) => Math.max(8, String(label || '').length * 6)

// Lay a graph out top-to-bottom (hierarchical). Returns
//   { positions:{ [id]:{x,y} }, edges:[{from,to,label,points:[{x,y}],labelX,labelY}], width, height }.
export function layoutGraph(graph, opts = {}) {
  const { direction = 'TB', nodeWidth = 116, nodeHeight = 46, rankSep = 78, nodeSep = 52, edgeSep = 26 } = opts
  const positions = {}
  const edges = []
  if (!graph.nodes?.length) return { positions, edges, width: 0, height: 0 }

  const g = new dagre.graphlib.Graph({ multigraph: true })
  g.setGraph({ rankdir: direction, ranksep: rankSep, nodesep: nodeSep, edgesep: edgeSep, marginx: 32, marginy: 32 })
  g.setDefaultEdgeLabel(() => ({}))
  for (const node of graph.nodes) g.setNode(node.id, { width: nodeWidth, height: nodeHeight })
  graph.edges.forEach((edge, i) => {
    if (!g.hasNode(edge.from) || !g.hasNode(edge.to)) return
    g.setEdge(edge.from, edge.to, { label: edge.label || '', width: labelWidth(edge.label), height: 12, labelpos: 'c', labeloffset: 0 }, `e${i}`)
  })
  dagre.layout(g)

  for (const node of graph.nodes) {
    const laid = g.node(node.id)
    if (laid) positions[node.id] = { x: laid.x, y: laid.y }
  }
  graph.edges.forEach((edge, i) => {
    if (!g.hasEdge(edge.from, edge.to, `e${i}`)) return
    const laid = g.edge(edge.from, edge.to, `e${i}`)
    edges.push({
      from: edge.from,
      to: edge.to,
      label: edge.label || '',
      points: laid.points || [],
      labelX: laid.x,
      labelY: laid.y,
    })
  })
  const info = g.graph()
  return { positions, edges, width: info.width || 0, height: info.height || 0 }
}
