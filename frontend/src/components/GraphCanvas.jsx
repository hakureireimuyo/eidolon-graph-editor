import React, { useCallback, useMemo } from 'react'
import ReactFlow, { Background, ConnectionMode, useReactFlow } from 'reactflow'
import 'reactflow/dist/style.css'
import GraphNode from './GraphNode.jsx'

const nodeTypes = { graph: GraphNode }

// 连线槽位模型:句柄 id = `{in|out}:{slot}:{端口名}`,slot ∈ {data, signal}
// - 数据槽:数据输出 → 数据输入(dst_slot='data')
// - 信号槽:信号源(控制输出 / 数据输出的信号端口)→ 控制输入或数据输入信号
//   (dst_slot='signal';数据输出信号电平由自动传导决定,拉线只是显式路由)
// - 唯一非法:数据槽 → 信号接收端(连接时拒绝,后端校验器同样把关)
//
// 连接手势(connectionMode=loose,方向由 onConnect 自行判定):
// - 从输出端拖动 = 新建连线;目标输入已有线 → 替换旧线(扇入唯一);
// - 从已有连线的输入端拖动 = 移动线的下游端(上游输出不变),拖到另一个
//   输入端上即可;拖到输出端 = 反向新建(等同输出端拖动);
// - 无连线的输入端拖动到输出端 = 反向新建。
const portOf = (handleId) => {
  const [side, slot, name] = (handleId || '').split(':')
  return { side, slot, name }
}

export default function GraphCanvas({
  graph, specs, layout, snap, onLayout, selected, onSelect, applyOps, onNotice,
}) {
  const { screenToFlowPosition } = useReactFlow()
  const specOf = useMemo(() => {
    const m = {}
    for (const s of specs) m[s.name] = s
    return m
  }, [specs])

  // 信号电平实时显示(世界运行时由 WS 快照驱动,green=高/red=低):
  // 输出侧电平来自快照(数据输出自动传导 / 控制输出显式写);
  // 数据输入电平按连线推导(显式信号线 → 上游输出电平;数据线 → 上游输出信号;
  // 无连线 → 默认高);控制输入电平来自快照(默认电平兜底)。
  const signalLevels = useMemo(() => {
    if (!snap?.nodes) return null
    const outLevelOf = (nid, port) => {
      const spec = specOf[graph.nodes.find((n) => n.node_id === nid)?.type_name]
      const ns = snap.nodes[nid]
      if (!spec || !ns) return 'active'
      if ((spec.data_out || []).some((p) => p.name === port)) {
        return ns.output_signals?.[port] ?? 'active'
      }
      if ((spec.control_out || []).some((p) => p.name === port)) {
        return ns.control_out_levels?.[port]
          ?? (spec.control_out.find((p) => p.name === port)?.default_level || 'inactive')
      }
      return 'active'
    }
    const m = {}
    for (const n of graph.nodes) {
      const spec = specOf[n.type_name]
      const ns = snap.nodes[n.node_id]
      if (!spec || !ns) continue
      const lv = { in: {}, out: {} }
      for (const p of spec.data_out || []) lv.out[p.name] = ns.output_signals?.[p.name] ?? 'active'
      for (const p of spec.control_out || []) {
        lv.out[p.name] = ns.control_out_levels?.[p.name] ?? (p.default_level || 'inactive')
      }
      for (const p of spec.control_in || []) {
        lv.in[p.name] = ns.control_in_levels?.[p.name] ?? (p.default_level || 'active')
      }
      for (const p of spec.data_in || []) {
        const sigWire = graph.wires.find((w) =>
          w.dst_node === n.node_id && w.dst_port === p.name && (w.dst_slot || 'data') === 'signal')
        const dataWire = graph.wires.find((w) =>
          w.dst_node === n.node_id && w.dst_port === p.name && (w.dst_slot || 'data') === 'data')
        const src = sigWire || dataWire
        lv.in[p.name] = src ? outLevelOf(src.src_node, src.src_port) : 'active'
      }
      m[n.node_id] = lv
    }
    return m
  }, [snap, graph.nodes, graph.wires, specOf])

  // 图资产(内核格式)不携带 UI 坐标:摆放位置存布局表(编辑器侧表现元数据)
  const nodes = useMemo(
    () =>
      graph.nodes.map((n, i) => ({
        id: n.node_id,
        type: 'graph',
        position: layout[n.node_id] || { x: 60 + (i % 4) * 260, y: 60 + Math.floor(i / 4) * 200 },
        data: {
          label: specOf[n.type_name]?.name || n.type_name,
          spec: specOf[n.type_name],
          selected: n.node_id === selected,
          levels: signalLevels?.[n.node_id] || null,
        },
      })),
    [graph.nodes, specOf, layout, selected, signalLevels],
  )

  // 边按 dst_slot 定位两端句柄:data 线接数据句柄,signal 线接信号句柄;
  // 信号线颜色随电平变化(淡红/淡绿),数据线保持默认
  const edges = useMemo(
    () =>
      graph.wires.map((w, i) => {
        const slot = w.dst_slot || 'data'
        const edge = {
          id: `e${i}`,
          source: w.src_node,
          target: w.dst_node,
          sourceHandle: `out:${slot}:${w.src_port}`,
          targetHandle: `in:${slot}:${w.dst_port}`,
          data: { wire: w },
        }
        if (slot === 'signal' && signalLevels) {
          const lvl = signalLevels[w.src_node]?.out?.[w.src_port]
          if (lvl === 'active') edge.style = { stroke: '#4f9e6f' }
          else if (lvl === 'inactive') edge.style = { stroke: '#b5655e' }
        }
        return edge
      }),
    [graph.wires, signalLevels],
  )

  // 拖动中位置实时跟随:layout 状态连续更新(保存时随工程落盘)
  const onNodesChange = useCallback(
    (changes) => {
      for (const c of changes) {
        if (c.type === 'position' && c.dragging && c.position) {
          onLayout(c.id, { x: c.position.x, y: c.position.y })
        }
      }
    },
    [onLayout],
  )

  // 连线合法性指示器:输出→输入(数据槽不连信号接收端);输入→输入 = 移动下游端
  const isValidConn = useCallback((conn) => {
    const src = portOf(conn.sourceHandle)
    const dst = portOf(conn.targetHandle)
    if (src.side === 'in' && dst.side === 'in') return true
    if (src.side !== 'out' || dst.side !== 'in') return false
    return !(src.slot === 'data' && dst.slot !== 'data')
  }, [])

  const onConnect = useCallback(
    (conn) => {
      const src = portOf(conn.sourceHandle)
      const dst = portOf(conn.targetHandle)

      // 1) 输入端拖动(两端都是输入):移动已有线的下游端,上游输出不变
      if (src.side === 'in' && dst.side === 'in') {
        const moved = graph.wires.find((w) =>
          w.dst_node === conn.target && w.dst_port === dst.name && (w.dst_slot || 'data') === dst.slot)
        if (!moved) {
          onNotice('该输入端口没有连线(从输出端拖动可新建连线)')
          return
        }
        applyOps([
          { op: 'remove_edge', wire: moved },
          { op: 'add_edge', wire: {
            src_node: moved.src_node, src_port: moved.src_port,
            dst_node: conn.source, dst_port: src.name, dst_slot: src.slot,
          } },
        ])
        return
      }

      // 2) 常规/反向新建:源输出 → 目标输入(数据槽不能连信号接收端)
      if (src.side !== 'out' || dst.side !== 'in') {
        onNotice('连线必须从输出端口到输入端口')
        return
      }
      if (src.slot === 'data' && dst.slot !== 'data') {
        onNotice('数据槽不能连信号接收端(信号线请从信号端口拉出)')
        return
      }
      const wire = {
        src_node: conn.source, src_port: src.name,
        dst_node: conn.target, dst_port: dst.name, dst_slot: dst.slot,
      }
      // 同一根线已存在:忽略(拖动后落回原位)
      const dup = graph.wires.find((w) =>
        w.src_node === wire.src_node && w.src_port === wire.src_port &&
        w.dst_node === wire.dst_node && w.dst_port === wire.dst_port &&
        (w.dst_slot || 'data') === wire.dst_slot)
      if (dup) return
      // 3) 目标输入已有线 → 替换(移除旧线 + 添加新线,同一批事务)
      const existing = graph.wires.find((w) =>
        w.dst_node === wire.dst_node && w.dst_port === wire.dst_port &&
        (w.dst_slot || 'data') === wire.dst_slot)
      applyOps(existing
        ? [{ op: 'remove_edge', wire: existing }, { op: 'add_edge', wire }]
        : [{ op: 'add_edge', wire }])
    },
    [graph.wires, applyOps, onNotice],
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
        connectionMode={ConnectionMode.Loose}
        isValidConnection={isValidConn}
        onConnect={onConnect}
        onNodesChange={onNodesChange}
        onNodeClick={(_, n) => onSelect(n.id)}
        onPaneClick={() => onSelect(null)}
        onNodeDragStop={(_, n) => onLayout(n.id, n.position)}
        onEdgeClick={(_, e) => applyOps([{ op: 'remove_edge', wire: e.data.wire }])}
        // 按住标题区拖动实时跟随;端口区域(nodrag)不触发拖动
        dragHandle=".gnode-title"
        nodeDragThreshold={0}
        // 禁用内置删除键处理(Delete 删除选中节点由 App 级快捷键统一接管,
        // 避免受控 nodes 与内部 store 双重删除不一致)
        deleteKeyCode={null}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={16} color="#2a2f3a" />
      </ReactFlow>
    </main>
  )
}
