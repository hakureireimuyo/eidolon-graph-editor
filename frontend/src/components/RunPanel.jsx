import React from 'react'

// 运行面板(纯展示):世界在后端自驱(事件源 = 节点自身),前端只观察。
// 控制按钮在顶栏右侧;本面板展示实时快照与状态(控制台在底部面板)。
function fmt(v) {
  if (v === null) return 'None'
  return JSON.stringify(v)
}

function BufferTable({ buffers, fresh }) {
  const entries = Object.entries(buffers || {})
  if (entries.length === 0) return <span className="dim">无</span>
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
    <div className="snap-section">{label}:
      {entries.map(([k, v]) => (
        <span key={k} className={`kv level-${v}`}><em>{k}</em>={v}</span>
      ))}
    </div>
  )
}

function NodeSnapshotView({ snap }) {
  const ids = Object.keys(snap.nodes || {})
  return (
    <div className="snap-nodes">
      {ids.map((id) => {
        const ns = snap.nodes[id]
        return (
          <div key={id} className="snap-node">
            <div className="snap-node-head">
              <strong>{id}</strong>
              {!ns.initialized && <span className="tag tag-control">未初始化</span>}
              {ns.circuit_open && <span className="tag tag-danger">熔断</span>}
              {ns.fault_count > 0 && <span className="tag tag-danger">故障×{ns.fault_count}</span>}
            </div>
            <div className="snap-section">状态:{' '}
              {Object.entries(ns.state || {}).map(([k, v]) => (
                <span key={k} className="kv"><em>{k}</em>={fmt(v)}</span>
              ))}
            </div>
            <div className="snap-section">数据缓冲(buffers):</div>
            <BufferTable buffers={ns.buffers} fresh={ns.fresh} />
            <LevelList levels={ns.control_in_levels} label="控制输入电平" />
            <LevelList levels={ns.output_signals} label="输出信号" />
            <LevelList levels={ns.control_out_levels} label="控制输出电平" />
          </div>
        )
      })}
    </div>
  )
}

export default function RunPanel({ snap, status, error }) {
  return (
    <aside className="panel preview">
      <h3>运行</h3>
      <p className="hint">
        {status === 'running' && '运行中:源节点按自身规则发出事件(Clock 默认每秒一次),沿连线向后传递'}
        {status === 'paused' && '已暂停:节点内部照常运行,输出结果停住不向后传播;继续后补全传递'}
        {status === 'idle' && '编辑完点顶栏右侧「运行」,图才真正跑起来'}
      </p>

      {error && (
        <div className="errors">
          {String(error).split(';').map((e, i) => <div key={i}>[E] {e}</div>)}
        </div>
      )}

      {snap && (
        <>
          <div className="snap-meta">
            run_no={snap.run_no} · seed={snap.seed}
            {status === 'running' && <span className="running-dot">● 运行中</span>}
            {status === 'paused' && <span className="paused-dot">⏸ 已暂停</span>}
          </div>
          {Object.keys(snap.globals || {}).length > 0 && (
            <div className="snap-section">全局变量:
              {Object.entries(snap.globals).map(([k, v]) => (
                <span key={k} className="kv"><em>{k}</em>={fmt(v)}</span>
              ))}
            </div>
          )}
          <NodeSnapshotView snap={snap} />
        </>
      )}
    </aside>
  )
}
