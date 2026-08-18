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

const SEMANTIC_LABEL = { enable: '门控', level: '电平' }
const LEVEL_LABEL = { active: '高', inactive: '低' }

export default function Inspector({ node, spec, applyOps, onClose, onInject, onCollapse }) {
  const [cfg, setCfg] = useState({})
  const [inputValue, setInputValue] = useState('')
  const [trigVals, setTrigVals] = useState({})  // 触发端口 → 输入文本(每端口独立)
  const [injecting, setInjecting] = useState(false)
  // 切换选中节点时重置各自编辑态:每个节点的输入栏/配置互不串联
  useEffect(() => {
    setCfg(node ? { ...node.config } : {})
    setInputValue('')
    setTrigVals({})
  }, [node?.node_id]) // eslint-disable-line

  // Input 宿主节点:手动触发事件(注入新值 → 输出事件向后传播)
  const isInputNode = node && spec && spec.name === 'Input'
  const doInject = async () => {
    setInjecting(true)
    try {
      await onInject(node.node_id, 'in', inputValue)
    } finally {
      setInjecting(false)
    }
  }
  // 触发输入(TriggerIn)泛化注入栏:注入数据事件 = 载荷 + 激活请求(内核 1.0)
  const triggerPorts = spec?.trigger_in || []
  const doTrigger = async (port) => {
    const raw = (trigVals[port] || '').trim()
    const value = raw === '' ? true : parseValue(raw)  // 空载荷 → true;输入按 JSON 解析
    setInjecting(true)
    try {
      await onInject(node.node_id, port, value)
    } finally {
      setInjecting(false)
    }
  }

  // 右侧面板 = 节点的属性编辑面板(游戏引擎对象编辑面板;说明书在下方「节点」窗口):
  // 收起/展开在面板头
  const head = (
    <div className="panel-head">
      <h3>{node ? `节点属性 · ${spec ? spec.name : node.type_name}` : '节点属性'}</h3>
      <div className="panel-head-btns">
        {node && <button className="close" onClick={onClose} title="取消选中">✕</button>}
        <button className="close" onClick={onCollapse} title="收起面板">▶</button>
      </div>
    </div>
  )

  if (!node) {
    return (
      <aside className="panel inspector">
        {head}
        <p className="dim">未选中节点(点击画布节点查看/编辑其属性)</p>
      </aside>
    )
  }
  if (!spec) {
    return (
      <aside className="panel inspector">
        {head}
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
      {head}
      <div className="inspector-id">
        {node.node_id}
        {spec.auto && <span className="gnode-badge gnode-badge-auto">自走</span>}
        {(spec.control_out || []).length > 0 && <span className="gnode-badge gnode-badge-signal">信号节点</span>}
      </div>

      <h4>端口</h4>
      <ul className="port-list">
        {(spec.data_in || []).map((p) => (
          <li key={p.name}>
            <span className="tag tag-data">data</span>in:{p.name}
            {p.const_set ? ` (默认 ${JSON.stringify(p.const)})` : ''}
            {p.global_read ? ` (全局读取 ${p.global_read})` : ''}
            {p.optional ? ' (可选,默认取配置)' : ''}
          </li>
        ))}
        {(spec.trigger_in || []).map((p) => (
          <li key={p.name}>
            <span className="tag tag-trigger">trigger</span>in:{p.name}
            <em> 数据线/信号线均可产生激活请求</em>
          </li>
        ))}
        {(spec.control_in || []).map((p) => (
          <li key={p.name}>
            <span className="tag tag-control">ctrl</span>in:{p.name}
            <em> {SEMANTIC_LABEL[p.semantic] || p.semantic}
              {p.default_level ? `·默认${LEVEL_LABEL[p.default_level]}` : ''}</em>
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
            <em> ·默认{LEVEL_LABEL[p.default_level] || p.default_level}</em>
          </li>
        ))}
      </ul>

      {((spec.groups || []).length > 0 || (spec.init_in || []).length > 0) && (
        <>
          <h4>输入组与初始化</h4>
          <ul className="port-list">
            {(spec.groups || []).map((g) => (
              <li key={g.name}>
                <span className="tag tag-group">{g.name}</span>
                {[...g.inputs, ...(g.triggers || [])].join(', ')} → {g.outputs.join(', ') || '∅'}
                <em> ·{g.policy || 'on_all_data_ready'}</em>
              </li>
            ))}
            {(spec.init_in || []).length > 0 && (
              <li>
                <span className="tag tag-group">init</span>
                {spec.init_in.join(', ')}
              </li>
            )}
          </ul>
        </>
      )}

      {triggerPorts.length > 0 && (
        <>
          <h4>触发注入(TriggerIn 端口)</h4>
          {triggerPorts.map((p) => (
            <div key={p.name} className="config-form">
              <label className="config-field">
                <span className="config-name port-trigger">{p.name}</span>
                <input
                  value={trigVals[p.name] ?? ''}
                  placeholder="载荷(可选,JSON 值)"
                  onChange={(e) => setTrigVals({ ...trigVals, [p.name]: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') doTrigger(p.name)
                  }}
                />
              </label>
              <button className="primary" onClick={() => doTrigger(p.name)} disabled={injecting}>
                {injecting ? '触发中…' : '触发'}
              </button>
            </div>
          ))}
          <p className="hint">注入一次激活请求:数据事件到达触发输入 = 载荷 + 激活(组按策略响应);空载荷注入 true,输入值按 JSON 解析(123 / true / "文本")</p>
        </>
      )}

      {isInputNode && (
        <>
          <h4>手动输入(触发事件)</h4>
          <div className="config-form">
            <label className="config-field">
              <input
                value={inputValue}
                placeholder="输入内容…"
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') doInject()
                }}
              />
            </label>
            <button className="primary" onClick={doInject} disabled={injecting}>
              {injecting ? '注入中…' : '输入'}
            </button>
          </div>
          <p className="hint">按下后产生输出事件,输入内容作为结果向后传递</p>
        </>
      )}

      {fields.length > 0 && (
        <>
          <h4>配置(编辑期,输入即应用)</h4>
          <div className="config-form">
            {fields.map((f) => (
              <label key={f.name} className="config-field">
                <span className="config-name">{f.name}</span>
                <input
                  value={cfg[f.name] === undefined || cfg[f.name] === null ? '' : String(cfg[f.name])}
                  placeholder={f.default === null ? 'null' : String(f.default)}
                  onChange={(e) => {
                    const v = e.target.value
                    setCfg((c) => ({ ...c, [f.name]: v }))
                    // 即时应用:set_config 增量合并,只提交本字段(无需点「应用」)
                    applyOps([{ op: 'set_config', node_id: node.node_id,
                               config: { [f.name]: parseValue(v) } }])
                  }}
                />
              </label>
            ))}
          </div>
          <p className="hint">修改即时生效(JSON 解析:数字/布尔/字符串/null);清空输入 = 设为空值</p>
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
