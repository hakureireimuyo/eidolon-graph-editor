import React, { useCallback, useEffect, useMemo, useState } from 'react'
import ReactFlow, { BaseEdge, ConnectionMode, applyNodeChanges, getBezierPath, useReactFlow } from 'reactflow'
import 'reactflow/dist/style.css'
import GraphNode from './GraphNode.jsx'

const nodeTypes = { graph: GraphNode }

// 连到触发端口(事件端口)的边:数据端口蓝 → 触发端口橙 的渐变,一眼看出
// "这条线驱动一次事件"。渐变 id 按边 id 唯一,defs 随边进入 React Flow 的
// SVG 层(同一 svg 文档内引用生效)。
const TRIGGER_SRC = '#7fb0f7'   // 数据输出端口色(--data)
const TRIGGER_DST = '#f97316'   // 触发端口色(--trigger,橙)
function TriggerGradientEdge({ id, sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition, markerEnd }) {
  const [path] = getBezierPath({ sourceX, sourceY, targetX, targetY,
    sourcePosition, targetPosition })
  const gradId = `trig-grad-${id}`
  return (
    <>
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={TRIGGER_SRC} />
          <stop offset="100%" stopColor={TRIGGER_DST} />
        </linearGradient>
      </defs>
      <BaseEdge id={id} path={path} markerEnd={markerEnd}
        style={{ stroke: `url(#${gradId})`, strokeWidth: 2 }} />
    </>
  )
}

const edgeTypes = { triggerGrad: TriggerGradientEdge }

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
  graph, specs, layout, snap, onLayout, selected, onSelect, applyOps, onNotice, background, onInject,
}) {
  const { screenToFlowPosition } = useReactFlow()
  const specOf = useMemo(() => {
    const m = {}
    for (const s of specs) m[s.name] = s
    return m
  }, [specs])

  // 连线索引(性能):dst_node|dst_port|slot → wire。signalLevels 按端口查线
  // 从 O(端口×连线) 降为 O(端口);快照高频刷新时这是每帧热路径。
  const wireIndex = useMemo(() => {
    const m = new Map()
    for (const w of graph.wires) {
      m.set(`${w.dst_node}|${w.dst_port}|${w.dst_slot || 'data'}`, w)
    }
    return m
  }, [graph.wires])

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
        const sigWire = wireIndex.get(`${n.node_id}|${p.name}|signal`)
        const dataWire = wireIndex.get(`${n.node_id}|${p.name}|data`)
        const src = sigWire || dataWire
        lv.in[p.name] = src ? outLevelOf(src.src_node, src.src_port) : 'active'
      }
      m[n.node_id] = lv
    }
    return m
  }, [snap, graph.nodes, wireIndex, specOf])

  // 受控节点状态(React Flow 内部状态 holder):拖动/尺寸/选中由
  // applyNodeChanges 维护——整体重建 nodes 数组会丢失内部状态,
  // 导致拖动中断/位置跳变/节点消失(React Flow 11 受控模式已知坑)。
  const [rfNodes, setRfNodes] = useState([])

  // 图/规格/选中/电平变化 → 仅同步 data 字段,保留既有 position/尺寸
  // (位置由拖动(applyNodeChanges)与加载(layout)驱动,layout 不在此依赖
  // ——拖动中 layout 每帧变化,若依赖会反复重建)
  useEffect(() => {
    setRfNodes((prev) => {
      const byId = new Map(prev.map((n) => [n.id, n]))
      return graph.nodes.map((n, i) => {
        const old = byId.get(n.node_id)
        return {
          ...old,
          id: n.node_id,
          type: 'graph',
          position: old?.position || layout[n.node_id]
            || { x: 60 + (i % 4) * 260, y: 60 + Math.floor(i / 4) * 200 },
          data: {
            label: specOf[n.type_name]?.name || n.type_name,
            spec: specOf[n.type_name],
            selected: n.node_id === selected,
            levels: signalLevels?.[n.node_id] || null,
            snapNode: snap?.nodes?.[n.node_id] || null,
            config: n.config,
            onInject,
          },
        }
      })
    })
  }, [graph.nodes, specOf, selected, signalLevels, snap, onInject])  // eslint-disable-line react-hooks/exhaustive-deps

  // 边按目标端口定位句柄:普通输入按 dst_slot(data 槽 / 信号槽);
  // 触发入口统一句柄 in:trigger:{名}(数据线/信号线都汇聚到组名上的入口)
  const edges = useMemo(
    () =>
      graph.wires.map((w, i) => {
        const slot = w.dst_slot || 'data'
        const dstSpec = specOf[graph.nodes.find((n) => n.node_id === w.dst_node)?.type_name]
        const dstIsTrigger = !!dstSpec
          && (dstSpec.trigger_in || []).some((p) => p.name === w.dst_port)
        const edge = {
          id: `e${i}`,
          source: w.src_node,
          target: w.dst_node,
          sourceHandle: `out:${slot}:${w.src_port}`,
          targetHandle: dstIsTrigger ? `in:trigger:${w.dst_port}` : `in:${slot}:${w.dst_port}`,
          data: { wire: w },
        }
        // 目标为触发入口:数据线 → 渐变边(数据蓝 → 触发橙);
        // 信号线 → 触发橙描边(电平变化触发,电平色无意义)
        if (dstIsTrigger) {
          if (slot === 'data') edge.type = 'triggerGrad'
          else edge.style = { stroke: '#f97316' }
        } else if (slot === 'signal' && signalLevels) {
          const lvl = signalLevels[w.src_node]?.out?.[w.src_port]
          if (lvl === 'active') edge.style = { stroke: '#4f9e6f' }
          else if (lvl === 'inactive') edge.style = { stroke: '#b5655e' }
        }
        return edge
      }),
    [graph.wires, graph.nodes, specOf, signalLevels],
  )

  // 受控模式官方写法:applyNodeChanges 全量应用(含 dimension/select/reset——
  // 漏掉 dimension 会让节点消失);position 变化同步写 layout(保存随工程落盘;
  // 拖动中每帧同步更新,异步延迟会让 delta 应用到过期位置导致节点跳变)
  const onNodesChange = useCallback(
    (changes) => {
      for (const c of changes) {
        if (c.type === 'position' && c.position) {
          onLayout(c.id, { x: c.position.x, y: c.position.y })
        }
      }
      setRfNodes((nds) => applyNodeChanges(changes, nds))
    },
    [onLayout],
  )

  // 连线合法性指示器:输出→输入(数据槽不连信号接收端);输入→输入 = 移动下游端;
  // 触发入口(统一句柄)接受数据线与信号线(数据输出 / 控制输出都合法)
  const isValidConn = useCallback((conn) => {
    const src = portOf(conn.sourceHandle)
    const dst = portOf(conn.targetHandle)
    if (src.side === 'in' && dst.side === 'in') return true
    if (src.side !== 'out' || dst.side !== 'in') return false
    if (dst.slot === 'trigger') return true
    return !(src.slot === 'data' && dst.slot !== 'data')
  }, [])

  const onConnect = useCallback(
    (conn) => {
      const src = portOf(conn.sourceHandle)
      const dst = portOf(conn.targetHandle)
      const dstIsTrigger = dst.slot === 'trigger'

      // 1) 输入端拖动(两端都是输入):移动已有线的下游端,上游输出不变
      if (src.side === 'in' && dst.side === 'in') {
        // 触发入口的连线 slot 由源类型决定,按 (节点, 端口) 匹配任意槽
        const moved = graph.wires.find((w) =>
          w.dst_node === conn.target && w.dst_port === dst.name
          && (dstIsTrigger || (w.dst_slot || 'data') === dst.slot))
        if (!moved) {
          onNotice('该输入端口没有连线(从输出端拖动可新建连线)')
          return
        }
        applyOps([
          { op: 'remove_edge', wire: moved },
          { op: 'add_edge', wire: {
            src_node: moved.src_node, src_port: moved.src_port,
            dst_node: conn.source, dst_port: src.name,
            dst_slot: src.slot === 'trigger' ? 'data' : src.slot,
          } },
        ])
        return
      }

      // 2) 常规/反向新建:源输出 → 目标输入(数据槽不能连信号接收端;
      //    触发入口例外:数据线/信号线都可触发)
      if (src.side !== 'out' || dst.side !== 'in') {
        onNotice('连线必须从输出端口到输入端口')
        return
      }
      if (src.slot === 'data' && dst.slot !== 'data' && !dstIsTrigger) {
        onNotice('数据槽不能连信号接收端(信号线请从信号端口拉出)')
        return
      }
      // 触发入口的 dst_slot 由源决定:数据输出 → data(载荷+激活),
      // 控制/信号输出 → signal(电平变化触发)
      const wire = {
        src_node: conn.source, src_port: src.name,
        dst_node: conn.target, dst_port: dst.name,
        dst_slot: dstIsTrigger ? src.slot : dst.slot,
      }
      // 同一根线已存在:忽略(拖动后落回原位)
      const dup = graph.wires.find((w) =>
        w.src_node === wire.src_node && w.src_port === wire.src_port &&
        w.dst_node === wire.dst_node && w.dst_port === wire.dst_port &&
        (w.dst_slot || 'data') === wire.dst_slot)
      if (dup) return
      // 3) 目标输入已有线 → 替换(移除旧线 + 添加新线,同一批事务);
      //    触发入口扇入唯一:新线替换旧线不分槽(数据线/信号线二选一)
      const existing = graph.wires.find((w) =>
        w.dst_node === wire.dst_node && w.dst_port === wire.dst_port
        && (dstIsTrigger || (w.dst_slot || 'data') === wire.dst_slot))
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
    // 画布背景 = CSS 静态背景(不随画布平移/缩放,样式由设置面板选择):
    // dots 原点矩阵 / lines 网格线,尺寸颜色在 styles.css .canvas-bg-* 控制
    <main className={`canvas canvas-bg-${background || 'dots'}`} onDrop={onDrop} onDragOver={(e) => e.preventDefault()}>
      <ReactFlow
        nodes={rfNodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
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
      />
    </main>
  )
}
