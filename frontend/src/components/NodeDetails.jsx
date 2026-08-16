import React, { useState } from 'react'

// 节点详情视图(控制台「节点」tab):查看选中节点的状态、输入缓冲、信号电平等
// 运行时数据——点击画布节点后切换到此 tab,世界自驱期间随 WS 快照实时更新。
//
// 可扩展:复杂节点类型可注册自定义视图重载默认呈现(registerNodeDetails)。
// 编辑器只做展示对接,节点语义仍全部归属内核(协议是唯一边界)。

const views = {}  // type_name → React 组件

export function registerNodeDetails(typeName, Component) {
  views[typeName] = Component
}

function fmt(v) {
  if (v === null) return 'None'
  if (v === undefined) return '—'
  const s = JSON.stringify(v)
  return s === undefined ? String(v) : s
}

// 数据呈现优化:对象/数组多行缩进展示,其余单行;空段整体隐藏,不占空间
function StateValue({ v }) {
  if (v !== null && typeof v === 'object') {
    return <pre className="state-obj">{JSON.stringify(v, null, 2)}</pre>
  }
  return <span className="state-val">{fmt(v)}</span>
}

function BufferTable({ buffers, fresh }) {
  const entries = Object.entries(buffers || {})
  if (entries.length === 0) return null
  return (
    <table className="held-table">
      <tbody>
        {entries.map(([port, v]) => {
          const isFresh = (fresh || []).includes(port)
          return (
            <tr key={port} className={isFresh ? 'snap-fresh' : ''}>
              <td className="port-cell">{port}</td>
              <td>
                {fmt(v)}
                {isFresh && <em className="fresh-mark">新</em>}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function LevelList({ levels, label }) {
  const entries = Object.entries(levels || {})
  if (entries.length === 0) return null
  return (
    <section className="detail-section">
      <h4>{label}</h4>
      <div className="snap-section">
        {entries.map(([k, v]) => (
          <span key={k} className={`kv level-${v}`}><em>{k}</em>={v}</span>
        ))}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// 说明书:内核 doc() 结构化纯文本(空行分段,'- ' 开头渲染为列表项)
// ---------------------------------------------------------------------------

function DocLines({ lines }) {
  const blocks = []
  let buf = []
  const flush = () => {
    if (buf.length) blocks.push({ type: 'p', text: buf.join(' ') })
    buf = []
  }
  for (const l of lines || []) {
    if (l === '') {
      flush()
      continue
    }
    if (l.startsWith('- ')) {
      flush()
      blocks.push({ type: 'li', text: l.slice(2) })
    } else {
      buf.push(l)
    }
  }
  flush()
  return (
    <>
      {blocks.map((b, i) =>
        b.type === 'li'
          ? <div key={i} className="doc-li">• {b.text}</div>
          : <p key={i} className="doc-p">{b.text}</p>)}
    </>
  )
}

function DocSection({ spec }) {
  const [open, setOpen] = useState(true)
  const doc = spec?.doc
  if (!doc || (!doc.summary && !(doc.sections || []).length)) return null
  return (
    <section className="detail-section doc-section">
      <h4 className="doc-toggle" onClick={() => setOpen((v) => !v)} title={open ? '收起说明书' : '展开说明书'}>
        <span className="palette-cat-arrow">{open ? '▾' : '▸'}</span>
        说明书
      </h4>
      {open && (
        <div className="doc-body">
          {doc.summary && <p className="doc-summary">{doc.summary}</p>}
          {(doc.sections || []).map((s, i) => (
            <div key={i} className="doc-sec">
              {s.title && <div className="doc-sec-title">{s.title}</div>}
              <DocLines lines={s.lines} />
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// 默认视图:概览 + 状态字段 + 输入缓冲 + 信号电平(全部节点通用)
// ---------------------------------------------------------------------------

export function DefaultNodeDetails({ node, spec, snapNode }) {
  if (!snapNode) {
    return (
      <div className="node-details">
        <div className="snap-node-head">
          <strong>{node.node_id}</strong>
          {spec && <span className="dim">{spec.name}</span>}
        </div>
        <span className="dim">尚未运行:点「运行」后这里展示节点的状态与缓存</span>
      </div>
    )
  }
  const stateEntries = Object.entries(snapNode.state || {})
  const bufferCount = Object.keys(snapNode.buffers || {}).length
  return (
    <div className="node-details">
      <div className="snap-node-head">
        <strong>{node.node_id}</strong>
        {spec && <span className="dim">{spec.name}</span>}
        {!snapNode.initialized && <span className="tag tag-control">未初始化</span>}
        {snapNode.circuit_open && <span className="tag tag-danger">熔断</span>}
        {snapNode.fault_count > 0 && <span className="tag tag-danger">故障×{snapNode.fault_count}</span>}
      </div>

      {stateEntries.length > 0 && (
        <section className="detail-section">
          <h4>状态字段</h4>
          {stateEntries.map(([k, v]) => (
            <div key={k} className="state-field">
              <span className="state-name">{k}</span>
              <StateValue v={v} />
            </div>
          ))}
        </section>
      )}

      {bufferCount > 0 && (
        <section className="detail-section">
          <h4>输入缓冲</h4>
          <BufferTable buffers={snapNode.buffers} fresh={snapNode.fresh} />
        </section>
      )}

      <LevelList levels={snapNode.control_in_levels} label="控制输入电平" />
      <LevelList levels={snapNode.output_signals} label="输出信号" />
      <LevelList levels={snapNode.control_out_levels} label="控制输出电平" />
    </div>
  )
}

// ---------------------------------------------------------------------------
// 特殊节点自定义视图(重载示例:读节点状态做适配呈现)
// ---------------------------------------------------------------------------

function OutputDetails({ node, snapNode }) {
  const lines = snapNode?.state?.lines || []
  return (
    <div className="node-details">
      <div className="snap-node-head">
        <strong>{node.node_id}</strong>
        <span className="dim">Output · 已输出 {lines.length} 行</span>
      </div>
      <div className="console-lines output-lines">
        {lines.length === 0 && <span className="dim">无输出</span>}
        {lines.map((l, i) => (
          <div key={i} className="console-line">{l}</div>
        ))}
      </div>
    </div>
  )
}

function InputDetails({ node, snapNode }) {
  const last = snapNode?.state?.last
  return (
    <div className="node-details">
      <div className="snap-node-head">
        <strong>{node.node_id}</strong>
        <span className="dim">Input · 手动触发</span>
      </div>
      <section className="detail-section">
        <h4>最近注入</h4>
        <StateValue v={last} />
      </section>
      <p className="hint">在右侧节点编辑器输入内容并点「输入」注入事件(每次点击都是新事件)</p>
    </div>
  )
}

registerNodeDetails('Output', OutputDetails)
registerNodeDetails('Input', InputDetails)

export default function NodeDetails({ node, spec, snapNode }) {
  if (!node) {
    return <div className="node-details"><span className="dim">未选中节点(点击画布节点查看其状态与缓存)</span></div>
  }
  if (!spec) {
    return (
      <div className="node-details">
        <div className="snap-node-head">
          <strong>{node.node_id}</strong>
        </div>
        <span className="warn">类型 '{node.type_name}' 未知:节点类型资产未注册</span>
      </div>
    )
  }
  const View = views[spec.name] || DefaultNodeDetails
  return (
    <div className="node-details">
      <DocSection spec={spec} />
      <View node={node} spec={spec} snapNode={snapNode} />
    </div>
  )
}
