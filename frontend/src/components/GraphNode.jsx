import React from 'react'
import { Handle, Position } from 'reactflow'

// 端口句柄 id 约定:`{in|out}:{slot}:{端口名}`,slot ∈ {data, signal}
// 每个数据端口自带成对的信号(内核:信号数量 = 数据端口数量):
// - 数据输入:数据槽 + 信号槽(信号槽可被显式信号线屏蔽/路由);
// - 数据输出:数据槽 + 信号端口(电平由自动传导决定,可显式拉线到任意信号接收端);
// - 控制端口本身就是信号端口;
// - 绑定端口(const 默认 / 全局读取)同样可接线:接线数据优先,绑定值兜底
//   (端口被信号禁用时即使有连线数据也回退配置)。
// 视觉:数据端口信号在上、数据在下垂直并列,端点间虚线表示成对绑定关系。

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
  const dual = hasData && port.slot  // 数据端口:信号/数据双句柄成对
  // 信号句柄实时电平(绿=高,红=低;未运行不显示):世界运行后随 WS 快照更新
  const lvl = isIn ? levels?.in?.[port.name] : levels?.out?.[port.name]
  const lvlClass = lvl === 'active' ? ' lvl-active' : lvl === 'inactive' ? ' lvl-inactive' : ''
  const lvlSuffix = lvl === 'active' ? '·电平:高' : lvl === 'inactive' ? '·电平:低' : ''
  return (
    <div className={`port-row${dual ? ' dual' : ''}`}>
      {dual && <span className="port-bind" />}
      {isIn && port.slot && (
        <>
          <Handle
            type="target"
            position={Position.Left}
            id={`in:signal:${port.name}`}
            className={`handle handle-signal${lvlClass}`}
            title={`信号槽:显式信号线(屏蔽/路由),不连线走默认传导${lvlSuffix}`}
          />
          {hasData && (
            <Handle
              type="target"
              position={Position.Left}
              id={`in:data:${port.name}`}
              className="handle handle-data"
              title="数据槽:上游数据输出(接线优先,绑定值兜底)"
            />
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
            <Handle
              type="source"
              position={Position.Right}
              id={`out:data:${port.name}`}
              className="handle handle-data"
              title="数据槽:投递数据值"
            />
          )}
          <Handle
            type="source"
            position={Position.Right}
            id={`out:signal:${port.name}`}
            className={`handle handle-signal${lvlClass}`}
            title={`信号端口:电平自动传导,可显式拉线到任意信号接收端${lvlSuffix}`}
          />
        </>
      )}
    </div>
  )
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
  const ins = [
    // 绑定端口同样可接线(接线优先,绑定兜底)——统一渲染双句柄
    ...(spec.data_in || []).map((p) => ({
      ...p, kind: 'data', side: 'in', slot: 'data',
      bound: !!(p.const_set || p.global_read),
    })),
    ...(spec.control_in || []).map((p) => ({ ...p, kind: 'control', side: 'in', slot: 'signal' })),
  ]
  const outs = [
    ...(spec.data_out || []).map((p) => ({ ...p, kind: 'data', side: 'out', slot: 'data' })),
    ...(spec.control_out || []).map((p) => ({ ...p, kind: 'control', side: 'out', slot: 'signal' })),
  ]
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
        <div className="gnode-column">
          {ins.map((p) => (
            <PortRow key={`in-${p.name}`} port={p} levels={levels} />
          ))}
        </div>
        <div className="gnode-column right">
          {outs.map((p) => (
            <PortRow key={`out-${p.name}`} port={p} levels={levels} />
          ))}
        </div>
      </div>
    </div>
  )
}
