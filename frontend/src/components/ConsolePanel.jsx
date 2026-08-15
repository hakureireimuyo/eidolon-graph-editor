import React, { useEffect, useRef } from 'react'

// 底部控制台(VS Code 式):拖动上缘调整高度,鼠标滚轮上下滚动。
// 内容 = Output 节点输出与引擎日志(只读展示,非交互终端)。
export default function ConsolePanel({ lines, height, onHeightChange }) {
  const boxRef = useRef(null)
  const draggingRef = useRef(false)

  useEffect(() => {
    boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight })
  }, [lines])

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

  return (
    <aside className="panel console console-bottom" style={{ height }}>
      <div className="console-resizer" onMouseDown={startDrag} title="拖动调整高度" />
      <h3>
        控制台
        <span className="hint console-hint">Output 节点输出与引擎日志 · 滚轮滚动 · 拖动上缘调整高度</span>
      </h3>
      <div className="console-lines" ref={boxRef}>
        {lines.length === 0 && <span className="dim">无输出</span>}
        {lines.map((l, i) => (
          <div key={i} className="console-line">{l}</div>
        ))}
      </div>
    </aside>
  )
}
