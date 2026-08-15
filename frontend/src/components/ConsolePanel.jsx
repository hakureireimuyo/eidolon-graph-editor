import React, { useEffect, useRef } from 'react'
import NodeDetails from './NodeDetails.jsx'

// 底部控制台(VS Code 式):拖动上缘调整高度,tap 选项卡切换内容。
// 三个 tab:控制台输出(Output 节点输出与引擎日志)/ 问题(编译检查结果,
// 只在点「运行」时检查一次)/ 节点(选中节点的状态与缓存,点击画布节点查看)。
// 右上角按钮收起/展开整个控制台。
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
  lines, problems, error, tab, onTabChange,
  node, spec, snapNode, runStatus, runNo, seed,
  height, onHeightChange, onToggle,
}) {
  const boxRef = useRef(null)
  const draggingRef = useRef(false)

  useEffect(() => {
    boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight })
  }, [lines, tab])

  useEffect(() => {
    const move = (e) => {
      if (!draggingRef.current) return
      onHeightChange(Math.max(80, Math.min(600, window.innerHeight - e.clientY)))
    }
    const up = () => {
      draggingRef.current = false
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

  const startDrag = () => {
    draggingRef.current = true
    document.body.style.cursor = 'ns-resize'
    document.body.style.userSelect = 'none'
  }

  const problemCount = (problems?.errors?.length || 0) + (error ? 1 : 0)

  return (
    <aside className="panel console console-bottom" style={{ height }}>
      <div className="console-resizer" onMouseDown={startDrag} title="拖动调整高度" />
      <div className="console-head">
        <div className="console-tabs">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              className={`tab-btn${tab === t.key ? ' active' : ''}`}
              onClick={() => onTabChange(t.key)}
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

      {tab === 'console' && (
        <div className="console-lines" ref={boxRef}>
          {lines.length === 0 && <span className="dim">无输出</span>}
          {lines.map((l, i) => (
            <div key={i} className="console-line">{l}</div>
          ))}
        </div>
      )}
      {tab === 'problems' && <ProblemsView problems={problems} error={error} />}
      {tab === 'node' && <NodeDetails node={node} spec={spec} snapNode={snapNode} />}
    </aside>
  )
}
