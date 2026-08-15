import React, { useCallback, useMemo } from 'react'
import ReactFlow, { Background, Controls, MiniMap, useReactFlow } from 'reactflow'
import 'reactflow/dist/style.css'
import GraphNode from './GraphNode.jsx'

const nodeTypes = { graph: GraphNode }

// 数据/控制端口的种类推导:连线 kind 由两端端口声明决定(内核校验的 HTTP 层预检)
function portKind(spec, port) {
  if (!spec) return null
  if ((spec.data_out || []).some((p) => p.name === port)) return 'data'
  if ((spec.control_out || []).some((p) => p.name === port)) return 'control'
  if ((spec.data_in || []).some((p) => p.name === port)) return 'data'
  if ((spec.control_in || []).some((p) => p.name === port)) return 'control'
  return null
}

export default function GraphCanvas({
  graph, specs, layout, onLayout, selected, onSelect, applyOps, onNotice,
}) {
  const { screenToFlowPosition } = useReactFlow()
  const specOf = useMemo(() => {
    const m = {}
    for (const s of specs) m[s.name] = s
    return m
  }, [specs])

  // 图资产(内核格式)不携带 UI 坐标:摆放位置存布局表(编辑器侧表现元数据)
  const nodes = useMemo(
    () =>
      graph.nodes.map((n, i) => ({
        id: n.node_id,
        type: 'graph',
        position: layout[n.node_id] || { x: 60 + (i % 4) * 260, y: 60 + Math.floor(i / 4) * 200 },
        data: { label: specOf[n.type_name]?.name || n.type_name, spec: specOf[n.type_name], selected: n.node_id === selected },
      })),
    [graph.nodes, specOf, layout, selected],
  )

  const edges = useMemo(
    () =>
      graph.wires.map((w, i) => {
        const kind = portKind(specOf[graph.nodes.find((n) => n.node_id === w.src_node)?.type_name], w.src_port)
        return {
          id: `e${i}`,
          source: w.src_node,
          target: w.dst_node,
          sourceHandle: `out:${kind}:${w.src_port}`,
          targetHandle: `in:${kind}:${w.dst_port}`,
          label: `${w.src_port} → ${w.dst_port}`,
          data: { wire: w },
        }
      }),
    [graph.wires, graph.nodes, specOf],
  )

  const onConnect = useCallback(
    (conn) => {
      const [, srcKind, srcPort] = conn.sourceHandle.split(':')
      const [, dstKind, dstPort] = conn.targetHandle.split(':')
      if (srcKind !== dstKind) {
        onNotice(`端口种类不匹配:${srcKind} 不能连 ${dstKind}(数据/控制严格分离)`)
        return
      }
      applyOps([
        {
          op: 'add_edge',
          wire: { src_node: conn.source, src_port: srcPort, dst_node: conn.target, dst_port: dstPort },
        },
      ])
    },
    [applyOps, onNotice],
  )

  const onDrop = useCallback(
    (e) => {
      e.preventDefault()
      const typeName = e.dataTransfer.getData('application/ge-node-type')
      if (!typeName) return
      const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY })
      const nodeId = `n${Math.random().toString(36).slice(2, 8)}`
      onLayout(nodeId, { x: pos.x, y: pos.y })
      applyOps([{ op: 'add_node', node: { node_id: nodeId, type_name: typeName, config: {} } }])
    },
    [screenToFlowPosition, applyOps, onLayout],
  )

  return (
    <main className="canvas" onDrop={onDrop} onDragOver={(e) => e.preventDefault()}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onConnect={onConnect}
        onNodeClick={(_, n) => onSelect(n.id)}
        onPaneClick={() => onSelect(null)}
        onNodeDragStop={(_, n) => onLayout(n.id, n.position)}
        onEdgeClick={(_, e) => applyOps([{ op: 'remove_edge', wire: e.data.wire }])}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={16} color="#2a2f3a" />
        <MiniMap pannable zoomable />
        <Controls />
      </ReactFlow>
    </main>
  )
}
