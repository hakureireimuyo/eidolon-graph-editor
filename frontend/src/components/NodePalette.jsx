import React, { useEffect, useRef, useState } from 'react'
import { DocBody } from './DocText.jsx'

// 调色板数据源 = 后端 /api/node-types(内核节点协议本身,前端不硬编码节点清单)。
// 分类规则(内核语义推导):信号运算 = 声明控制输出的信号节点;基础节点 = 其余。
// 分类支持点击标题展开/收起。
// 交互约定:点击节点 = 弹出悬浮窗显示说明书;拖入画布 = 添加节点。
const CATEGORIES = [
  { key: 'signal', title: '信号运算', test: (s) => (s.control_out || []).length > 0 },
  { key: 'basic', title: '基础节点', test: (s) => !((s.control_out || []).length > 0) },
]

function PaletteItem({ spec, locked, onShowDoc }) {
  return (
    <div
      className={`palette-item${locked ? ' palette-item-locked' : ''}`}
      draggable={!locked}
      onDragStart={(e) => {
        e.dataTransfer.setData('application/ge-node-type', spec.name)
        e.dataTransfer.effectAllowed = 'move'
      }}
      onClick={(e) => onShowDoc(spec, e)}
      title={locked ? '运行中,图已锁定编辑' : `${spec.doc?.summary || spec.name}(点击查看说明书,拖入画布添加)`}
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

// 说明书悬浮窗:锚定点击位置,点击别处 / Esc / ✕ 关闭
function NodeDocPopup({ spec, x, y, onClose }) {
  const ref = useRef(null)
  useEffect(() => {
    const down = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    const esc = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', down)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', down)
      document.removeEventListener('keydown', esc)
    }
  }, [onClose])
  return (
    <div
      className="node-doc-popup"
      ref={ref}
      style={{
        left: Math.min(x, window.innerWidth - 320),
        top: Math.min(y, window.innerHeight - 300),
      }}
    >
      <div className="popup-head">
        <strong>{spec.name}</strong>
        <span className="popup-hint">拖入画布添加</span>
        <button type="button" className="close" onClick={onClose} title="关闭">✕</button>
      </div>
      {spec.doc?.summary || (spec.doc?.sections || []).length
        ? <DocBody doc={spec.doc} />
        : <p className="doc-p">暂无说明</p>}
    </div>
  )
}

export default function NodePalette({ specs, locked, onCollapse }) {
  const [collapsed, setCollapsed] = useState({})
  const [popup, setPopup] = useState(null)
  const toggle = (key) => setCollapsed((c) => ({ ...c, [key]: !c[key] }))
  const showDoc = (spec, e) => setPopup({ spec, x: e.clientX + 12, y: e.clientY + 12 })
  return (
    <aside className="palette">
      <div className="palette-head">
        <h3>节点</h3>
        <button type="button" className="palette-toggle" onClick={onCollapse} title="收起节点面板">◀</button>
      </div>
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
              <PaletteItem key={spec.name} spec={spec} locked={locked} onShowDoc={showDoc} />
            ))}
          </div>
        )
      })}
      {specs.length === 0 && <p className="palette-empty">后端未连接?</p>}
      {popup && (
        <NodeDocPopup
          spec={popup.spec}
          x={popup.x}
          y={popup.y}
          onClose={() => setPopup(null)}
        />
      )}
    </aside>
  )
}
