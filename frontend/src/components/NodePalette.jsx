import React, { useEffect, useRef, useState } from 'react'
import { DocBody } from './DocText.jsx'
import { CATEGORY_ORDER, CATEGORY_TITLES, paletteInfoOf } from '../nodeModel.js'

// 调色板数据源 = 后端 /api/node-types(内核节点协议本身,前端不硬编码节点清单)。
// 分组 = 内核 category 六值枚举(声明序),组标题与条目带域色点;分类支持
// 点击标题展开/收起。交互约定:点击节点 = 弹出悬浮窗显示说明书;
// 拖入画布 = 添加节点。

function PaletteItem({ spec, info, locked, onShowDoc }) {
  return (
    <div
      className={`palette-item${locked ? ' palette-item-locked' : ''}`}
      draggable={!locked}
      onDragStart={(e) => {
        e.dataTransfer.setData('application/ge-node-type', spec.name)
        e.dataTransfer.effectAllowed = 'move'
      }}
      onClick={(e) => onShowDoc(spec, e)}
      title={locked ? '运行中,图已锁定编辑' : `${info.docSummary || spec.name}(点击查看说明书,拖入画布添加)`}
    >
      <span className="palette-name">
        <span className="palette-domain" style={{ background: info.color }} />
        {info.name}
      </span>
      <span className="palette-ports">{info.ports}</span>
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
  // 按内核枚举声明序分组;未知分类兜底进「其他」
  const byCat = {}
  for (const s of specs) {
    const cat = s.category && CATEGORY_TITLES[s.category] ? s.category : 'other'
    ;(byCat[cat] ||= []).push(s)
  }
  const cats = [...CATEGORY_ORDER.filter((c) => byCat[c]), ...(byCat.other ? ['other'] : [])]
  return (
    <aside className="palette">
      <div className="palette-head">
        <h3>节点</h3>
        <button type="button" className="palette-toggle" onClick={onCollapse} title="收起节点面板">◀</button>
      </div>
      {cats.map((cat) => {
        const items = byCat[cat]
        if (!items || items.length === 0) return null
        const isCollapsed = collapsed[cat]
        const info = paletteInfoOf(items[0])
        return (
          <div key={cat} className="palette-category">
            <div
              className="palette-cat-title"
              onClick={() => toggle(cat)}
              title={isCollapsed ? '展开' : '收起'}
            >
              <span className="palette-cat-arrow">{isCollapsed ? '▸' : '▾'}</span>
              <span className="palette-domain" style={{ background: info.color }} />
              {CATEGORY_TITLES[cat] || '其他'}
            </div>
            {!isCollapsed && items.map((spec) => (
              <PaletteItem key={spec.name} spec={spec} info={paletteInfoOf(spec)}
                locked={locked} onShowDoc={showDoc} />
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
