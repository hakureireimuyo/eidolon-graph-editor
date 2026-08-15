import React, { useEffect, useState } from 'react'

// 配置值编解码:内核配置值是 JSON 原生类型(数字/布尔/字符串)
function parseValue(s) {
  const t = s.trim()
  if (t === 'null') return null
  if (t === 'true') return true
  if (t === 'false') return false
  if (t !== '' && !isNaN(Number(t)) && /^-?\d+(\.\d+)?$/.test(t)) return Number(t)
  return s
}

const SEMANTIC_LABEL = { enable: '门控', mask: '屏蔽', level: '电平' }

export default function Inspector({ node, spec, applyOps, onClose }) {
  const [cfg, setCfg] = useState({})
  useEffect(() => setCfg(node ? { ...node.config } : {}), [node?.node_id]) // eslint-disable-line

  if (!node) return <aside className="panel inspector empty">未选中节点(点击画布节点)</aside>
  if (!spec) {
    return (
      <aside className="panel inspector">
        <h3>{node.node_id}</h3>
        <p className="warn">类型 '{node.type_name}' 未知:节点类型资产未注册</p>
        <button className="danger" onClick={() => applyOps([{ op: 'remove_node', node_id: node.node_id }])}>
          删除节点
        </button>
      </aside>
    )
  }

  const fields = spec.config || []
  return (
    <aside className="panel inspector">
      <div className="panel-head">
        <h3>{spec.name}</h3>
        <button className="close" onClick={onClose} title="取消选中">✕</button>
      </div>
      <div className="inspector-id">{node.node_id}</div>

      <h4>端口</h4>
      <ul className="port-list">
        {(spec.data_in || []).map((p) => (
          <li key={p.name}>
            <span className="tag tag-data">data</span>in:{p.name}
            {p.const_set ? ' (默认)' : ''}
            {p.global_read ? ` (全局读取 ${p.global_read})` : ''}
          </li>
        ))}
        {(spec.control_in || []).map((p) => (
          <li key={p.name}>
            <span className="tag tag-control">ctrl</span>in:{p.name}
            <em> {SEMANTIC_LABEL[p.semantic] || p.semantic}{p.target ? `:${p.target}` : ''}</em>
          </li>
        ))}
        {(spec.data_out || []).map((p) => (
          <li key={p.name}>
            <span className="tag tag-data">data</span>out:{p.name}
            {p.global_write ? ` (全局写入 ${p.global_write})` : ''}
          </li>
        ))}
        {(spec.control_out || []).map((p) => (
          <li key={p.name}>
            <span className="tag tag-control">ctrl</span>out:{p.name}
          </li>
        ))}
      </ul>

      {fields.length > 0 && (
        <>
          <h4>配置(编辑期)</h4>
          <div className="config-form">
            {fields.map((f) => (
              <label key={f.name} className="config-field">
                <span className="config-name">{f.name}</span>
                <input
                  value={cfg[f.name] === undefined || cfg[f.name] === null ? '' : String(cfg[f.name])}
                  placeholder={f.default === null ? 'null' : String(f.default)}
                  onChange={(e) => setCfg({ ...cfg, [f.name]: e.target.value })}
                />
              </label>
            ))}
            <button
              className="primary"
              onClick={() => {
                const parsed = {}
                for (const f of fields) parsed[f.name] = parseValue(cfg[f.name] ?? '')
                applyOps([{ op: 'set_config', node_id: node.node_id, config: parsed }])
              }}
            >
              应用配置
            </button>
          </div>
        </>
      )}
      {((spec.state || []).length > 0) && (
        <>
          <h4>状态字段(世界事实)</h4>
          <ul className="port-list">
            {(spec.state || []).map((f) => (
              <li key={f.name}>{f.name}(默认 {JSON.stringify(f.default)})</li>
            ))}
          </ul>
        </>
      )}

      <button className="danger" onClick={() => applyOps([{ op: 'remove_node', node_id: node.node_id }])}>
        删除节点
      </button>
    </aside>
  )
}
