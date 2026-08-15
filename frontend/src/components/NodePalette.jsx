import React, { useState } from 'react'

// 调色板数据源 = 后端 /api/node-types(内核节点协议本身,前端不硬编码节点清单)。
// 分类规则(内核语义推导):信号运算 = 声明控制输出的信号节点;基础节点 = 其余。
// 分类支持点击标题展开/收起。
const CATEGORIES = [
  { key: 'signal', title: '信号运算', test: (s) => (s.control_out || []).length > 0 },
  { key: 'basic', title: '基础节点', test: (s) => !((s.control_out || []).length > 0) },
]

function PaletteItem({ spec, onAdd, locked }) {
  return (
    <div
      className={`palette-item${locked ? ' palette-item-locked' : ''}`}
      draggable={!locked}
      onDragStart={(e) => {
        e.dataTransfer.setData('application/ge-node-type', spec.name)
        e.dataTransfer.effectAllowed = 'move'
      }}
      onClick={() => onAdd(spec.name)}
      title={locked ? '运行中,图已锁定编辑' : (spec.description || spec.name)}
    >
      <span className="palette-name">
        {spec.name}
        {spec.auto && <span className="gnode-badge gnode-badge-auto">自走</span>}
        {(spec.control_out || []).length > 0 && (
          <span className="gnode-badge gnode-badge-signal">信号</span>
        )}
      </span>
      <span className="palette-ports">
        {[
          ...(spec.data_in || []).map(() => 'in'),
          ...(spec.data_out || []).map(() => 'out'),
          ...(spec.control_in || []).map(() => 'c-in'),
          ...(spec.control_out || []).map(() => 'c-out'),
          ...((spec.groups || []).length > 0 ? [`${spec.groups.length}组`] : []),
        ].join(' ')}
      </span>
    </div>
  )
}

export default function NodePalette({ specs, onAdd, locked }) {
  const [collapsed, setCollapsed] = useState({})
  const toggle = (key) => setCollapsed((c) => ({ ...c, [key]: !c[key] }))
  return (
    <aside className="palette">
      <h3>节点</h3>
      <p className="palette-hint">{locked ? '运行中:图已锁定编辑' : '点击添加 / 拖入画布'}</p>
      {CATEGORIES.map((cat) => {
        const items = specs.filter(cat.test)
        if (items.length === 0) return null
        const isCollapsed = collapsed[cat.key]
        return (
          <div key={cat.key} className="palette-category">
            <div
              className="palette-cat-title"
              onClick={() => toggle(cat.key)}
              title={isCollapsed ? '展开' : '收起'}
            >
              <span className="palette-cat-arrow">{isCollapsed ? '▸' : '▾'}</span>
              {cat.title}
            </div>
            {!isCollapsed && items.map((spec) => (
              <PaletteItem key={spec.name} spec={spec} onAdd={onAdd} locked={locked} />
            ))}
          </div>
        )
      })}
      {specs.length === 0 && <p className="palette-empty">后端未连接?</p>}
    </aside>
  )
}
