// Kahn's topological sort for FK graph
// FK: r.from.table (child) depends on r.to.table (parent)
// INSERT order: parents first; DELETE order: reverse (children first)
export function topoSort(tableNames, relationships) {
  const inDegree = {}
  const adj = {}      // parent -> [children]
  tableNames.forEach(t => { inDegree[t] = 0; adj[t] = [] })

  relationships.forEach(r => {
    const parent = r.to.table
    const child  = r.from.table
    if (parent === child) return
    if (!(parent in inDegree) || !(child in inDegree)) return
    // avoid duplicate edges
    if (!adj[parent].includes(child)) {
      adj[parent].push(child)
      inDegree[child]++
    }
  })

  const queue = tableNames.filter(t => inDegree[t] === 0).sort()
  const sorted = []
  while (queue.length) {
    const t = queue.shift()
    sorted.push(t)
    adj[t].slice().sort().forEach(child => {
      if (--inDegree[child] === 0) queue.push(child)
    })
  }

  // Cycle detected — return original order unchanged
  if (sorted.length < tableNames.length) return [...tableNames]
  return sorted
}
