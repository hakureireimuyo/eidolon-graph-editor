import React from 'react'

// 调色板数据源 = 后端 /api/node-types(内核节点协议本身,前端不硬编码节点清单)。
export default function NodePalette({ specs, onAdd }) {
  return (
    <aside className="palette">
      <h3>节点</h3>
      <p className="palette-hint">点击添加 / 拖入画布</p>
      {specs.map((spec) => (
        <div
          key={spec.name}
          className="palette-item"
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData('application/ge-node-type', spec.name)
            e.dataTransfer.effectAllowed = 'move'
          }}
          onClick={() => onAdd(spec.name)}
          title={spec.description || spec.name}
        >
          <span className="palette-name">{spec.name}</span>
          <span className="palette-ports">
            {[
              ...(spec.data_in || []).map(() => 'in'),
              ...(spec.data_out || []).map(() => 'out'),
              ...(spec.control_in || []).map(() => 'c-in'),
              ...(spec.control_out || []).map(() => 'c-out'),
            ].join(' ')}
          </span>
        </div>
      ))}
      {specs.length === 0 && <p className="palette-empty">后端未连接?</p>}
    </aside>
  )
}
