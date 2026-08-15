import React, { useState } from 'react'
import { api } from '../api.js'

// headless 预览:后端用内核 World 确定性运行(同步轮次 + RNG seed)——编辑器是调试器。
function fmt(v) {
  if (v === null) return 'None'
  return JSON.stringify(v)
}

function HeldTable({ held }) {
  const entries = Object.entries(held || {})
  if (entries.length === 0) return <span className="dim">无</span>
  return (
    <table className="held-table">
      <tbody>
        {entries.map(([port, v]) => (
          <tr key={port}>
            <td className="port-cell">{port}</td>
            <td>{v == null ? '未收到(冷)' : `${fmt(v.payload)} @t${v.tick}`}</td>
          </tr>
        ))}
      </tbody>
    </table>
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
              {ns.circuit_open && <span className="tag tag-danger">熔断</span>}
            </div>
            <div className="snap-section">状态:{' '}
              {Object.entries(ns.state || {}).map(([k, v]) => (
                <span key={k} className="kv"><em>{k}</em>={fmt(v)}</span>
              ))}
            </div>
            <div className="snap-section">数据输入(held):</div>
            <HeldTable held={ns.data_in_held} />
            <div className="snap-section">控制电平:
              {Object.entries(ns.control_in_held || {}).length === 0 && <span className="dim"> 无</span>}
              {Object.entries(ns.control_in_held || {}).map(([k, v]) => (
                <span key={k} className={`kv level-${v}`}><em>{k}</em>={v}</span>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function PreviewPanel({ graph }) {
  const [ticks, setTicks] = useState(5)
  const [seed, setSeed] = useState(42)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState(null)
  const [idx, setIdx] = useState(0)

  const run = async () => {
    setRunning(true)
    try {
      const r = await api.preview({ graph, ticks: Number(ticks) || 0, seed: Number(seed) || 0, trace: true })
      setResult(r)
      setIdx(Math.max(0, (r.traces?.length || 1) - 1))
    } catch (e) {
      setResult({ ok: false, report: { errors: [String(e.message)], warnings: [] } })
    } finally {
      setRunning(false)
    }
  }

  const traces = result?.traces || []
  const snap = traces[idx] ?? result?.final

  return (
    <aside className="panel preview">
      <h3>预览(确定性运行)</h3>
      <div className="preview-controls">
        <label>拍数
          <input type="number" min="0" max="10000" value={ticks}
                 onChange={(e) => setTicks(e.target.value)} />
        </label>
        <label>seed
          <input type="number" value={seed} onChange={(e) => setSeed(e.target.value)} />
        </label>
        <button className="primary" onClick={run} disabled={running}>
          {running ? '运行中…' : '运行'}
        </button>
      </div>
      <p className="hint">同图同 seed 结果恒等;每次运行从第 0 轮开始(会话步进为后续路线)</p>

      {result && !result.ok && (
        <div className="errors">
          {(result.report?.errors || []).map((e, i) => <div key={i}>[E] {e}</div>)}
        </div>
      )}

      {result && result.ok && snap && (
        <>
          {traces.length > 1 && (
            <div className="tick-slider">
              <label>查看第
                <input type="range" min="0" max={traces.length - 1} value={idx}
                       onChange={(e) => setIdx(Number(e.target.value))} />
                {idx} 拍(共 {traces.length} 拍)
              </label>
            </div>
          )}
          <div className="snap-meta">
            tick={snap.tick} · rng={JSON.stringify(snap.rng)}
          </div>
          {Object.keys(snap.globals || {}).length > 0 && (
            <div className="snap-section">全局变量:
              {Object.entries(snap.globals).map(([k, v]) => (
                <span key={k} className="kv"><em>{k}</em>={fmt(v)}</span>
              ))}
            </div>
          )}
          <NodeSnapshotView snap={snap} />
          {result.log?.length > 0 && (
            <div className="snap-section">日志:
              {result.log.map((e, i) => (
                <div key={i} className="log-line">t{e.tick} [{e.node}] {e.level}: {e.message}</div>
              ))}
            </div>
          )}
        </>
      )}
    </aside>
  )
}
