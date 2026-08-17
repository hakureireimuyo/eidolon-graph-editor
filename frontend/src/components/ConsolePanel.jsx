import React, { useEffect, useRef, useState } from 'react'
import NodeDetails from './NodeDetails.jsx'

// 底部面板:多窗口并列(VS Code 式)——三窗口(控制台输出/问题/节点)默认
// 同时显示、水平分列,列间分割条拖拽调宽;tab 按钮 = 窗口显隐开关
// (不再来回切换,需要哪个开哪个);上缘拖动调整整体高度。
const TABS = [
  { key: 'console', label: '控制台输出' },
  { key: 'problems', label: '问题' },
  { key: 'node', label: '节点' },
]

function ProblemsView({ problems, error }) {
  const hasProblems = problems && ((problems.errors || []).length > 0 || (problems.warnings || []).length > 0)
  return (
    <div className="console-lines problems">
      {error && <div className="problem-item err">[运行] {error}</div>}
      {!hasProblems && !error && (
        <span className="dim">无问题(点「运行」时检查一次:校验不通过不运行,错误显示在这里)</span>
      )}
      {(problems?.errors || []).map((e, i) => (
        <div key={`e${i}`} className="problem-item err">[错误] {e}</div>
      ))}
      {(problems?.warnings || []).map((w, i) => (
        <div key={`w${i}`} className="problem-item warn">[提示] {w}</div>
      ))}
    </div>
  )
}

export default function ConsolePanel({
  lines, formatLine, problems, error, tab, node, spec, snapNode,
  runStatus, runNo, seed, height, onHeightChange, onToggle,
}) {
  const boxRef = useRef(null)
  const draggingRef = useRef(false)   // 高度拖拽(上缘)
  const colDragRef = useRef(null)     // 列宽拖拽(分割条)
  // 窗口显隐:默认全开;外部请求的 tab(点节点看详情/出错看问题)确保显示
  const [vis, setVis] = useState({ console: true, problems: true, node: true })
  // 列宽(px):拖过的列存像素,未拖的列均分剩余;localStorage 持久化
  const [colWidths, setColWidths] = useState(() => {
    try { return JSON.parse(localStorage.getItem('ge-bottom-widths')) || {} } catch { return {} }
  })

  useEffect(() => {
    if (tab) setVis((v) => ({ ...v, [tab]: true }))
  }, [tab])

  useEffect(() => {
    boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight })
  }, [lines, tab])

  useEffect(() => {
    const move = (e) => {
      if (draggingRef.current) onHeightChange(Math.max(80, Math.min(600, window.innerHeight - e.clientY)))
      const d = colDragRef.current
      if (d) {
        const w = Math.max(120, Math.min(900, d.startW + (e.clientX - d.startX)))
        setColWidths((prev) => ({ ...prev, [d.col]: w }))
      }
    }
    const up = () => {
      draggingRef.current = false
      colDragRef.current = null
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    return () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
  }, [onHeightChange])

  // 列宽持久化(布局记忆:重启编辑器保持上次分割)
  useEffect(() => {
    try { localStorage.setItem('ge-bottom-widths', JSON.stringify(colWidths)) } catch (_) {}
  }, [colWidths])

  const startHeightDrag = () => {
    draggingRef.current = true
    document.body.style.cursor = 'ns-resize'
    document.body.style.userSelect = 'none'
  }
  const startColDrag = (col, e) => {
    colDragRef.current = { col, startX: e.clientX, startW: colWidths[col] || 400 }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  const problemCount = (problems?.errors?.length || 0) + (error ? 1 : 0)
  const visibleCols = TABS.filter((t) => vis[t.key])

  return (
    <aside className="panel console console-bottom" style={{ height }}>
      <div className="console-resizer" onMouseDown={startHeightDrag} title="拖动调整高度" />
      <div className="console-head">
        <div className="console-tabs">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              className={`tab-btn${vis[t.key] ? ' active' : ''}`}
              onClick={() => setVis((v) => ({ ...v, [t.key]: !v[t.key] }))}
              title={vis[t.key] ? `隐藏${t.label}窗口` : `显示${t.label}窗口`}
            >
              {t.label}
              {t.key === 'problems' && problemCount > 0 && (
                <span className="tab-badge">{problemCount}</span>
              )}
            </button>
          ))}
        </div>
        <div className="console-head-right">
          {runStatus !== 'idle' && (
            <span className={`console-run-meta${runStatus === 'running' ? ' running-dot' : ' paused-dot'}`}>
              {runStatus === 'running' ? '●' : '⏸'} r{runNo ?? 0} · seed {seed ?? '—'}
            </span>
          )}
          <button type="button" className="console-toggle" onClick={onToggle} title="收起控制台">▾ 收起</button>
        </div>
      </div>

      <div className="console-columns">
        {visibleCols.map((t, i) => (
          <React.Fragment key={t.key}>
            <div
              className="console-col"
              style={colWidths[t.key] ? { flex: `0 0 ${colWidths[t.key]}px` } : { flex: 1 }}
            >
              {t.key === 'console' && (
                <div className="console-lines" ref={boxRef}>
                  {lines.length === 0 && <span className="dim">无输出</span>}
                  {lines.map((l, i) => (
                    <div key={i} className="console-line">{formatLine(l)}</div>
                  ))}
                </div>
              )}
              {t.key === 'problems' && <ProblemsView problems={problems} error={error} />}
              {t.key === 'node' && <NodeDetails node={node} spec={spec} snapNode={snapNode} />}
            </div>
            {i < visibleCols.length - 1 && (
              <div className="col-resizer" onMouseDown={(e) => startColDrag(t.key, e)} title="拖动调整列宽" />
            )}
          </React.Fragment>
        ))}
      </div>
    </aside>
  )
}
