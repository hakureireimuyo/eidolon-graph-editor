import React from 'react'
import { Handle, Position } from 'reactflow'

// 端口句柄 id 约定:`{in|out}:{slot}:{端口名}`,slot ∈ {data, signal}
// 每个数据端口自带成对的信号(内核:信号数量 = 数据端口数量):
// - 数据输入:数据槽 + 信号槽(信号槽可被显式信号线屏蔽/路由);
// - 数据输出:数据槽 + 信号端口(电平由自动传导决定,可显式拉线到任意信号接收端);
// - 控制端口本身就是信号端口;
// - 绑定端口(const 默认 / 全局读取)同样可接线:接线数据优先,绑定值兜底。
//
// 节点内部布局(组 = 一等公民,数学矩阵符号):
// - 一个节点默认一个矩阵框:左列全部输入(声明序)、右列全部输出;
//   输出与触发它的输入**同行对齐**(输出 j 的组 g → 行 = g 末输入行 + j;
//   未入组输出依次排下一个空行)——如 Buffer 的 items 与 flush 同行;
// - 多个"输入+输出"组(如 MultiGate 的 g1/g2)各自成框:互不相干的通道
//   分开表达,组内输出同样与组末输入同行;
// - 组外端口(控制端口/源输出)并入默认框;多框模式下落入虚线 stray 框。
//
// Handle 定位(关键):**不覆盖 React Flow 的任何定位样式**——每个句柄包一个
// 0×0 的 .port-handle-wrap 绝对定位点(wrapper 原点 = 句柄中心):
// - wrapper 位于端口行左/右缘、行中心 ±6px(信号上 / 数据下,配对近距离);
// - Handle 在 wrapper 内沿用 React Flow 默认几何(left/top/transform 居中),
//   React Flow 测量 handle bounds 用真实 DOM rect,与 wrapper 无关;
// - 覆盖 transform 会破坏 React Flow 的句柄几何,导致边无法渲染(禁止)。

const SEMANTIC_LABEL = { enable: '门控', level: '电平' }
const LEVEL_LABEL = { active: '高', inactive: '低' }

function boundLabel(p) {
  if (p.const_set) return `=默认 ${JSON.stringify(p.const)}`
  if (p.global_read) return `@全局 ${p.global_read}`
  return ''
}

function PortRow({ port, levels }) {
  const isIn = port.side === 'in'
  const hasData = port.kind === 'data'
  const isTrigger = hasData && port.trigger   // 事件端口:只认数据到达,无信号句柄
  // 信号句柄实时电平(绿=高,红=低;未运行不显示):世界运行后随 WS 快照更新
  const lvl = isIn ? levels?.in?.[port.name] : levels?.out?.[port.name]
  const lvlClass = lvl === 'active' ? ' lvl-active' : lvl === 'inactive' ? ' lvl-inactive' : ''
  const lvlSuffix = lvl === 'active' ? '·电平:高' : lvl === 'inactive' ? '·电平:低' : ''
  return (
    <div className="port-row">
      {isIn && port.slot && (
        <>
          {!isTrigger && (
            <div className="port-handle-wrap in signal">
              <Handle
                type="target"
                position={Position.Left}
                id={`in:signal:${port.name}`}
                className={`handle handle-signal${lvlClass}`}
                title={`信号槽:显式信号线(屏蔽/路由),不连线走默认传导${lvlSuffix}`}
              />
            </div>
          )}
          {hasData && (
            <div className="port-handle-wrap in data">
              <Handle
                type="target"
                position={Position.Left}
                id={`in:data:${port.name}`}
                className={`handle handle-data${isTrigger ? ' handle-trigger' : ''}`}
                title={isTrigger
                  ? '事件端口数据槽:上游数据到达即触发(载荷可用可忽略);不接受信号线'
                  : '数据槽:上游数据输出(接线优先,绑定值兜底)'}
              />
            </div>
          )}
        </>
      )}
      <span className="port-label">
        {port.name}
        {port.kind === 'control' && port.semantic !== undefined && (
          <em className="port-semantic">
            {SEMANTIC_LABEL[port.semantic] || port.semantic}
          </em>
        )}
        {port.kind === 'control' && port.default_level && (
          <em className="port-semantic">·默认{LEVEL_LABEL[port.default_level]}</em>
        )}
        {port.bound && <em className="port-bound">{boundLabel(port)}</em>}
      </span>
      {!isIn && port.slot && (
        <>
          {hasData && (
            <div className="port-handle-wrap out data">
              <Handle
                type="source"
                position={Position.Right}
                id={`out:data:${port.name}`}
                className="handle handle-data"
                title="数据槽:投递数据值"
              />
            </div>
          )}
          <div className="port-handle-wrap out signal">
            <Handle
              type="source"
              position={Position.Right}
              id={`out:signal:${port.name}`}
              className={`handle handle-signal${lvlClass}`}
              title={`信号端口:电平自动传导,可显式拉线到任意信号接收端${lvlSuffix}`}
            />
          </div>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// 矩阵框:grid 两列(输入 | 输出),行对齐由 outRows(行 → 输出端口)驱动
// ---------------------------------------------------------------------------

function BoxMatrix({ ins, outRows, levels, stray }) {
  const rowCount = Math.max(ins.length, ...(outRows.map((_, r) => r + 1)), 0)
  const cells = []
  for (let r = 0; r < rowCount; r++) {
    cells.push(ins[r]
      ? <PortRow key={`i${r}`} port={ins[r]} levels={levels} />
      : <div key={`ei${r}`} className="port-cell-empty" />)
    cells.push(outRows[r]
      ? <PortRow key={`o${r}`} port={outRows[r]} levels={levels} />
      : <div key={`eo${r}`} className="port-cell-empty" />)
  }
  return (
    <div className={`port-group${stray ? ' port-group-stray' : ''}`}>
      <div className="port-group-matrix">{cells}</div>
    </div>
  )
}

// 输出行规划:输出 j(组 g)→ 行 = g 末输入在全部输入中的索引 + j;
// 未入组输出 → 依次排下一个空行。
function planOutRows(groups, allIns, allOuts) {
  const rowOf = new Map()
  const used = new Set()
  for (const g of groups) {
    if (g.outputs.length === 0) continue
    const lastIn = g.inputs.length
      ? allIns.findIndex((p) => p.name === g.inputs[g.inputs.length - 1])
      : 0
    const base = lastIn < 0 ? 0 : lastIn
    g.outputs.forEach((p, j) => { rowOf.set(p.name, base + j); used.add(base + j) })
  }
  let next = 0
  for (const o of allOuts) {
    if (rowOf.has(o.name)) continue
    while (used.has(next)) next++
    rowOf.set(o.name, next)
    used.add(next)
    next++
  }
  const rows = []
  for (const o of allOuts) rows[rowOf.get(o.name)] = o
  return rows
}

export default function GraphNode({ id, data }) {
  const { label, spec, selected, levels } = data
  if (!spec) {
    return (
      <div className="gnode gnode-unknown">
        <div className="gnode-title">{label}</div>
        <div className="gnode-unknown-note">未知类型:{id}(实现未注册?)</div>
      </div>
    )
  }
  const isSignalNode = (spec.control_out || []).length > 0
  const dataIns = (spec.data_in || []).map((p) => ({
    ...p, kind: 'data', side: 'in', slot: 'data',
    bound: !!(p.const_set || p.global_read),
  }))
  const dataOuts = (spec.data_out || []).map((p) => ({ ...p, kind: 'data', side: 'out', slot: 'data' }))
  const ctrlIns = (spec.control_in || []).map((p) => ({ ...p, kind: 'control', side: 'in', slot: 'signal' }))
  const ctrlOuts = (spec.control_out || []).map((p) => ({ ...p, kind: 'control', side: 'out', slot: 'signal' }))
  const groups = (spec.groups || []).map((g) => ({
    ...g,
    inputs: g.inputs.map((n) => dataIns.find((p) => p.name === n)).filter(Boolean),
    outputs: g.outputs.map((n) => dataOuts.find((p) => p.name === n)).filter(Boolean),
  }))
  const outputGroups = groups.filter((g) => g.outputs.length > 0)
  // 组外端口(控制端口 + 未入组的数据端口):单框模式并入默认框;多框模式入 stray 框
  const inGroup = new Set(groups.flatMap((g) => g.inputs.map((p) => p.name)))
  const outGroup = new Set(groups.flatMap((g) => g.outputs.map((p) => p.name)))
  const strayIns = [...ctrlIns, ...dataIns.filter((p) => !inGroup.has(p.name))]
  const strayOuts = [...ctrlOuts, ...dataOuts.filter((p) => !outGroup.has(p.name))]

  let boxes
  if (outputGroups.length > 1) {
    // 多"输入+输出"组:各自成框(互不相干的通道分开表达)
    boxes = outputGroups.map((g) => ({
      ins: g.inputs,
      outRows: planOutRows([g], g.inputs, g.outputs),
    }))
    if (strayIns.length > 0 || strayOuts.length > 0) {
      boxes.push({
        ins: strayIns,
        outRows: planOutRows([], strayIns, strayOuts),
        stray: true,
      })
    }
  } else {
    // 默认单框:全部输入左列、全部输出右列,输出与触发它的输入同行
    const allIns = [...dataIns, ...ctrlIns]
    const allOuts = [...dataOuts, ...ctrlOuts]
    boxes = [{
      ins: allIns,
      outRows: planOutRows(groups, allIns, allOuts),
    }]
  }
  return (
    <div className={`gnode ${selected ? 'gnode-selected' : ''}`}>
      <div className="gnode-title">
        <span className="gnode-left">
          <span className="gnode-name">{label}</span>
          <span className="gnode-badges">
            {spec.auto && <span className="gnode-badge gnode-badge-auto">自走</span>}
            {isSignalNode && <span className="gnode-badge gnode-badge-signal">信号</span>}
          </span>
        </span>
        <span className="gnode-id">{id}</span>
      </div>
      <div className="gnode-body">
        {boxes.map((b, i) => (
          <BoxMatrix key={i} ins={b.ins} outRows={b.outRows} levels={levels} stray={b.stray} />
        ))}
      </div>
    </div>
  )
}
