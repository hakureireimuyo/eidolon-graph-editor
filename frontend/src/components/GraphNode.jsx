import React from 'react'
import { Handle, Position } from 'reactflow'

// 端口句柄 id 约定:`{in|out}:{data|control}:{端口名}` —— 连线 kind 校验的依据
// (数据/控制严格分离:交叉连线在连接时即被拒绝,后端校验器同样把关)。

const SEMANTIC_LABEL = { enable: 'gate', mask: 'mask', level: 'level' }

function PortRow({ port, kind, side }) {
  const isIn = side === 'in'
  return (
    <div className="port-row">
      {isIn && (
        <Handle
          type="target"
          position={Position.Left}
          id={`in:${kind}:${port.name}`}
          className={`handle handle-${kind}`}
        />
      )}
      <span className="port-label">
        {port.name}
        {kind === 'control' && (
          <em className="port-semantic">
            {port.semantic}
            {port.target ? `:${port.target}` : ''}
          </em>
        )}
      </span>
      {!isIn && (
        <Handle
          type="source"
          position={Position.Right}
          id={`out:${kind}:${port.name}`}
          className={`handle handle-${kind}`}
        />
      )}
    </div>
  )
}

export default function GraphNode({ id, data }) {
  const { label, spec, selected } = data
  if (!spec) {
    return (
      <div className="gnode gnode-unknown">
        <div className="gnode-title">{label}</div>
        <div className="gnode-unknown-note">未知类型:{id}(实现未注册?)</div>
      </div>
    )
  }
  const ins = [
    ...(spec.data_in || []).map((p) => ({ ...p, kind: 'data' })),
    ...(spec.control_in || []).map((p) => ({ ...p, kind: 'control' })),
  ]
  const outs = [
    ...(spec.data_out || []).map((p) => ({ ...p, kind: 'data' })),
    ...(spec.control_out || []).map((p) => ({ ...p, kind: 'control' })),
  ]
  return (
    <div className={`gnode ${selected ? 'gnode-selected' : ''}`}>
      <div className="gnode-title">
        <span className="gnode-name">{label}</span>
        <span className="gnode-id">{id}</span>
      </div>
      <div className="gnode-body">
        <div className="gnode-column">
          {ins.map((p) => (
            <PortRow key={p.name} port={p} kind={p.kind} side="in" />
          ))}
        </div>
        <div className="gnode-column right">
          {outs.map((p) => (
            <PortRow key={p.name} port={p} kind={p.kind} side="out" />
          ))}
        </div>
      </div>
    </div>
  )
}
