import React from 'react'
import { Handle, Position } from 'reactflow'

// 端口句柄 id 约定:`{in|out}:{slot}:{端口名}`,slot ∈ {data, signal}
// 每个数据端口自带成对的信号(内核:信号数量 = 数据端口数量):
// - 数据输入:数据槽 + 信号槽(信号槽可被显式信号线屏蔽/路由);
// - 数据输出:数据槽 + 信号端口(电平由自动传导决定,可显式拉线到任意信号接收端);
// - 控制端口本身就是信号端口;
// - 触发输入(TriggerIn,函数调用级):数据槽 + 信号槽双句柄——数据线
//   (载荷 + 激活)与信号线(电平双沿变化)都可产生激活请求,均以黄色标注;
// - 绑定端口(const 默认 / 全局读取)同样可接线:接线数据优先,绑定值兜底。
//
// 节点内部布局(组 = 一等公民,数学矩阵符号):
// - 一个节点默认一个矩阵框:左列全部输入(声明序:数据 → 触发 → 控制)、
//   右列全部输出;输出与触发它的输入**同行对齐**(输出 j 的组 g → 行 =
//   g 末输入行 + j;未入组输出依次排下一个空行)——如 Buffer 的 items
//   与 flush 同行;
// - 多个"输入+输出"组(如 MultiGate 的 g1/g2)各自成框:互不相干的通道
//   分开表达,组内输出同样与组末输入同行;
// - 组外端口(控制端口/源输出)并入默认框;多框模式下落入虚线 stray 框;
// - 声明了触发输入或非默认触发策略的组,框顶显示标题 `组名 · 策略`。
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
  const isTrigger = port.kind === 'trigger'   // 触发输入(TriggerIn):函数调用级激活入口
  // 信号句柄实时电平(绿=高,红=低;未运行不显示):世界运行后随 WS 快照更新
  const lvl = isIn ? levels?.in?.[port.name] : levels?.out?.[port.name]
  const lvlClass = lvl === 'active' ? ' lvl-active' : lvl === 'inactive' ? ' lvl-inactive' : ''
  const lvlSuffix = lvl === 'active' ? '·电平:高' : lvl === 'inactive' ? '·电平:低' : ''
  return (
    <div className="port-row">
      {isIn && port.slot && (
        <>
          {isTrigger ? (
            // 触发输入:数据槽 + 信号槽双句柄(数据线载荷+激活 / 信号线电平双沿)
            <>
              <div className="port-handle-wrap in signal">
                <Handle
                  type="target"
                  position={Position.Left}
                  id={`in:signal:${port.name}`}
                  className={`handle handle-signal handle-trigger${lvlClass}`}
                  title={`触发信号槽:电平变化(双沿)即产生一次激活请求${lvlSuffix}`}
                />
              </div>
              <div className="port-handle-wrap in data">
                <Handle
                  type="target"
                  position={Position.Left}
                  id={`in:data:${port.name}`}
                  className="handle handle-data handle-trigger"
                  title="触发数据槽:数据到达即产生一次激活请求(载荷可用可忽略)"
                />
              </div>
            </>
          ) : (
            <>
              <div className="port-handle-wrap in signal">
                <Handle
                  type="target"
                  position={Position.Left}
                  id={`in:signal:${port.name}`}
                  className={`handle handle-signal${lvlClass}`}
                  title={`信号槽:显式信号线(屏蔽/路由),不连线走默认传导${lvlSuffix}`}
                />
              </div>
              {hasData && (
                <div className="port-handle-wrap in data">
                  <Handle
                    type="target"
                    position={Position.Left}
                    id={`in:data:${port.name}`}
                    className="handle handle-data"
                    title="数据槽:上游数据输出(接线优先,绑定值兜底)"
                  />
                </div>
              )}
            </>
          )}
        </>
      )}
      <span className={`port-label${isTrigger ? ' port-label-trigger' : ''}`}>
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

function BoxMatrix({ title, ins, outRows, levels, stray }) {
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
      {title && <div className="port-group-title">{title}</div>}
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
      ? allIns.findIndex((p) => p.name === g.inputs[g.inputs.length - 1].name)
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
  const triggerIns = (spec.trigger_in || []).map((p) => ({
    ...p, kind: 'trigger', side: 'in', slot: 'data',  // slot 仅占位:触发端口渲染双句柄
  }))
  const dataOuts = (spec.data_out || []).map((p) => ({ ...p, kind: 'data', side: 'out', slot: 'data' }))
  const ctrlIns = (spec.control_in || []).map((p) => ({ ...p, kind: 'control', side: 'in', slot: 'signal' }))
  const ctrlOuts = (spec.control_out || []).map((p) => ({ ...p, kind: 'control', side: 'out', slot: 'signal' }))
  // 组内输入 = 数据输入 + 触发输入(声明序:数据先、触发后);原始 triggers 名
  // 保留在 g.triggers(字符串数组,供标题判断),inputs 已是端口对象数组
  const groups = (spec.groups || []).map((g) => ({
    ...g,
    inputs: [
      ...g.inputs.map((n) => dataIns.find((p) => p.name === n)).filter(Boolean),
      ...(g.triggers || []).map((n) => triggerIns.find((p) => p.name === n)).filter(Boolean),
    ],
    outputs: g.outputs.map((n) => dataOuts.find((p) => p.name === n)).filter(Boolean),
  }))
  // 组框标题:仅当组声明了触发输入或策略非默认(on_all_data_ready)时显示
  const groupTitle = (g) =>
    (g.triggers || []).length > 0 || g.policy !== 'on_all_data_ready'
      ? `${g.name} · ${g.policy}`
      : null
  const outputGroups = groups.filter((g) => g.outputs.length > 0)
  // 组外端口(控制端口 + 未入组的数据/触发端口):单框模式并入默认框;多框模式入 stray 框
  const inGroup = new Set(groups.flatMap((g) => g.inputs.map((p) => p.name)))
  const outGroup = new Set(groups.flatMap((g) => g.outputs.map((p) => p.name)))
  const strayIns = [...ctrlIns,
                    ...dataIns.filter((p) => !inGroup.has(p.name)),
                    ...triggerIns.filter((p) => !inGroup.has(p.name))]
  const strayOuts = [...ctrlOuts, ...dataOuts.filter((p) => !outGroup.has(p.name))]

  let boxes
  if (outputGroups.length > 1) {
    // 多"输入+输出"组:各自成框(互不相干的通道分开表达)
    boxes = outputGroups.map((g) => ({
      title: groupTitle(g),
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
    // 默认单框:全部输入左列(数据 → 触发 → 控制)、全部输出右列,
    // 输出与触发它的输入同行;多组共框时标题并列
    const allIns = [...dataIns, ...triggerIns, ...ctrlIns]
    const allOuts = [...dataOuts, ...ctrlOuts]
    boxes = [{
      title: groups.map(groupTitle).filter(Boolean).join('　'),
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
          <BoxMatrix key={i} title={b.title} ins={b.ins} outRows={b.outRows} levels={levels} stray={b.stray} />
        ))}
      </div>
    </div>
  )
}
