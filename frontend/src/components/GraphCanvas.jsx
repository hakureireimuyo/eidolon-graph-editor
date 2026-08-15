import React, { useCallback, useMemo } from 'react'
import ReactFlow, { Background, useReactFlow } from 'reactflow'
import 'reactflow/dist/style.css'
import GraphNode from './GraphNode.jsx'

const nodeTypes = { graph: GraphNode }

// 连线槽位模型:句柄 id = `{in|out}:{slot}:{端口名}`,slot ∈ {data, signal}
// - 数据槽:数据输出 → 数据输入(dst_slot='data')
// - 信号槽:信号源(控制输出 / 数据输出的信号端口)→ 控制输入或数据输入信号
//   (dst_slot='signal';数据输出信号电平由自动传导决定,拉线只是显式路由)
// - 唯一非法:数据槽 → 信号接收端(连接时拒绝,后端校验器同样把关)
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

  // 边按 dst_slot 定位两端句柄:data 线接数据句柄,signal 线接信号句柄
  const edges = useMemo(
    () =>
      graph.wires.map((w, i) => ({
        id: `e${i}`,
        source: w.src_node,
        target: w.dst_node,
        sourceHandle: `out:${w.dst_slot || 'data'}:${w.src_port}`,
        targetHandle: `in:${w.dst_slot || 'data'}:${w.dst_port}`,
        label: `${w.src_port} → ${w.dst_port}`,
        data: { wire: w },
      })),
    [graph.wires],
  )

  const onConnect = useCallback(
    (conn) => {
      const [, srcSlot, srcPort] = conn.sourceHandle.split(':')
      const [, dstSlot, dstPort] = conn.targetHandle.split(':')
      if (srcSlot === 'data' && dstSlot !== 'data') {
        onNotice('数据槽不能连信号接收端(信号线请从信号端口拉出)')
        return
      }
      // 数据槽 → 数据槽 ⇒ data;信号端口 → 任意信号接收端 ⇒ signal
      applyOps([
        {
          op: 'add_edge',
          wire: {
            src_node: conn.source, src_port: srcPort,
            dst_node: conn.target, dst_port: dstPort,
            dst_slot: dstSlot,
          },
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
      </ReactFlow>
    </main>
  )
}
