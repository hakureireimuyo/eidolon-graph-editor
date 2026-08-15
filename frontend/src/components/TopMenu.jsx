import React, { useEffect, useRef, useState } from 'react'

// 顶部菜单:文件 / 终端 两类下拉 + 右侧平铺的运行控制。
// 文件:新建、载入(子菜单)、重命名、保存、删除(运行中锁定编辑:除保存外禁用);
// 终端:控制台(右下输出面板)收起/展开;
// 运行控制平铺:空闲只显示「运行」;运行中显示「暂停」「结束」;
// 暂停中显示「继续」「结束」;点「结束」回到只显示「运行」。

function useOpen() {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const h = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])
  return { open, setOpen, ref }
}

function Item({ children, disabled, danger, onClick }) {
  return (
    <button
      type="button"
      className={`menu-item${danger ? ' menu-item-danger' : ''}`}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

export default function TopMenu({
  graphs, name, runStatus, consoleVisible, locked, actions,
}) {
  const file = useOpen()
  const term = useOpen()
  const closeAll = () => {
    file.setOpen(false)
    term.setOpen(false)
  }
  const doIt = (fn) => () => {
    closeAll()
    fn()
  }

  return (
    <>
      <div className="topbar-menus">
        {/* 文件 */}
        <div className="menu" ref={file.ref}>
          <button type="button" className="menu-btn" onClick={() => { file.setOpen(!file.open); term.setOpen(false) }}>
            文件 ▾
          </button>
          {file.open && (
            <div className="menu-dropdown">
              <Item disabled={locked} onClick={doIt(actions.onNew)}>新建</Item>
              <div className="menu-submenu">
                <span className={`menu-item menu-item-label${locked ? ' menu-item-locked' : ''}`}>载入 ▸</span>
                <div className="menu-dropdown submenu-dropdown">
                  {graphs.length === 0 && <Item disabled>无已保存图</Item>}
                  {graphs.map((g) => (
                    <Item key={g} disabled={locked} onClick={doIt(() => actions.onLoad(g))}>{g}</Item>
                  ))}
                </div>
              </div>
              <Item disabled={locked} onClick={doIt(actions.onRename)}>重命名</Item>
              <Item onClick={doIt(actions.onSave)}>保存</Item>
              <div className="menu-sep" />
              <Item danger disabled={locked} onClick={doIt(actions.onDelete)}>删除</Item>
            </div>
          )}
        </div>

        {/* 终端 */}
        <div className="menu" ref={term.ref}>
          <button type="button" className="menu-btn" onClick={() => { term.setOpen(!term.open); file.setOpen(false) }}>
            终端 ▾
          </button>
          {term.open && (
            <div className="menu-dropdown">
              <Item onClick={doIt(actions.onToggleConsole)}>
                {consoleVisible ? '收起控制台' : '展开控制台'}
              </Item>
            </div>
          )}
        </div>

        <span className="topbar-graph-name">图名:{name}</span>
      </div>

      {/* 运行控制:平铺在顶栏右侧 */}
      <div className="topbar-run">
        {runStatus === 'idle' && (
          <button type="button" className="primary" onClick={actions.onRun}>运行</button>
        )}
        {runStatus === 'running' && (
          <>
            <button type="button" onClick={actions.onPause}>暂停</button>
            <button type="button" className="danger" onClick={actions.onEnd}>结束</button>
          </>
        )}
        {runStatus === 'paused' && (
          <>
            <button type="button" className="primary" onClick={actions.onResume}>继续</button>
            <button type="button" className="danger" onClick={actions.onEnd}>结束</button>
          </>
        )}
      </div>
    </>
  )
}
