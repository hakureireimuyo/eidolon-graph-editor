import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { ReactFlowProvider } from 'reactflow'
import { api } from './api.js'
import useRunSession from './useRunSession.js'
import TopMenu from './components/TopMenu.jsx'
import NodePalette from './components/NodePalette.jsx'
import GraphCanvas from './components/GraphCanvas.jsx'
import Inspector from './components/Inspector.jsx'
import ConsolePanel from './components/ConsolePanel.jsx'
import SettingsPopup, { renderConsoleLine } from './components/SettingsPopup.jsx'

const NEW_GRAPH = () => ({ name: 'untitled', kernel_version: '0.1.0-0', nodes: [], wires: [] })
const randomSeed = () => Math.floor(Math.random() * 2 ** 31)
const DEFAULT_CONSOLE_FORMAT = '[{time} {name} {node}] {line}'
// 编辑器元数据版本(与 eidolon-graph-project 规范一致:条目级独立版本)
const EDITOR_STATE_VERSION = 1

export default function App() {
  const [graphs, setGraphs] = useState([])
  const [name, setName] = useState('untitled')
  const [graph, setGraph] = useState(NEW_GRAPH)
  const [specs, setSpecs] = useState([])
  const [selected, setSelected] = useState(null)
  const [notice, setNotice] = useState(null)
  // 底部控制台:tab(控制台输出 / 问题 / 节点)+ 收起展开 + 高度(拖动上缘调整)
  const [consoleTab, setConsoleTab] = useState('console')
  const [consoleVisible, setConsoleVisible] = useState(true)
  const [consoleHeight, setConsoleHeight] = useState(180)
  // 左右面板收起展开:节点面板可向左侧收起,右侧节点编辑器同理
  const [paletteCollapsed, setPaletteCollapsed] = useState(false)
  const [sideCollapsed, setSideCollapsed] = useState(false)
  // 随机种子:不需要手动设置,每张图新建/载入时自动随机
  const [seed, setSeed] = useState(randomSeed)
  // 设置:控制台输出格式模板(设置浮窗编辑,localStorage 持久化)
  const [consoleFormat, setConsoleFormat] = useState(() => {
    try {
      return localStorage.getItem('ge-console-format') || DEFAULT_CONSOLE_FORMAT
    } catch (_) {
      return DEFAULT_CONSOLE_FORMAT
    }
  })
  const [settingsOpen, setSettingsOpen] = useState(false)

  // 节点摆放位置是编辑器侧表现元数据,随工程保存(editor_state.positions);
  // 不再存 localStorage 按图名隔离——旧方案改名/新建即丢失,坐标无家可归
  const [layout, setLayout] = useState({})

  // 运行会话(世界自驱,事件源 = 节点)
  const run = useRunSession(graph, seed)

  useEffect(() => {
    api.listNodeTypes().then((r) => setSpecs(r.node_types)).catch((e) => setNotice(String(e.message)))
    refreshGraphs()
  }, [])

  // 点「运行」编译检查不通过:错误进「问题」tab(清空旧错误、输出新错误)
  useEffect(() => {
    if (run.problems) {
      setConsoleTab('problems')
      setConsoleVisible(true)
    }
  }, [run.problems])

  const refreshGraphs = () =>
    api.listGraphs().then((r) => setGraphs(r.graphs)).catch(() => {})

  const onConsoleFormatChange = useCallback((v) => {
    setConsoleFormat(v)
    try {
      localStorage.setItem('ge-console-format', v)
    } catch (_) {}
  }, [])

  // 控制台行渲染:条目结构化存储,模板在渲染期应用(改格式即时重渲染全部行)
  const formatConsoleLine = useCallback(
    (entry) => renderConsoleLine(entry, consoleFormat),
    [consoleFormat],
  )

  const flashNotice = useCallback((msg) => {
    setNotice(msg)
    setTimeout(() => setNotice(null), 4000)
  }, [])

  const applyOps = useCallback(
    async (ops) => {
      // 运行时图锁定编辑:世界按运行时的图自驱,编辑操作在运行期间被拒绝
      // (先「结束」再编辑;宿主注入 Input 等运行时交互不受影响)
      if (run.status !== 'idle') {
        flashNotice('运行中,图已锁定编辑(请先点「结束」)')
        return null
      }
      try {
        const r = await api.applyOps(name, graph, ops)
        setGraph(r.graph)
        return r
      } catch (e) {
        flashNotice(String(e.message))
      }
    },
    [name, graph, flashNotice, run.status],
  )

  // Delete 键删除选中节点(输入框聚焦时不触发;运行中图锁定)
  // 注意:声明在 applyOps/flashNotice 之后——deps 数组渲染期求值,前置会 TDZ 崩溃
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Delete') return
      const t = e.target
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (!selected) return
      if (run.status !== 'idle') {
        flashNotice('运行中,图已锁定编辑(请先点「结束」)')
        return
      }
      applyOps([{ op: 'remove_node', node_id: selected }]).then((r) => {
        if (r) setSelected(null)
      })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected, run.status, applyOps, flashNotice])

  // 位置实时跟随鼠标:layout 状态连续更新,保存时随工程落盘(editor_state.positions)
  const onLayout = useCallback((nodeId, pos) => {
    setLayout((prev) => ({ ...prev, [nodeId]: pos }))
  }, [])

  // 点击画布节点:选中并切到「节点」tab 查看其状态与缓存(控制台自动展开)
  const handleSelect = useCallback((id) => {
    setSelected(id)
    if (id) {
      setConsoleTab('node')
      setConsoleVisible(true)
    }
  }, [])

  const loadGraph = async (n) => {
    const r = await api.getGraph(n)
    setName(r.name)
    setGraph(r.graph)
    setSelected(null)
    // 编辑器元数据随工程:坐标与种子恢复(读档续跑确定性可复现)
    const es = r.editor_state || {}
    setLayout(es.positions || {})
    setSeed(es.seed ?? randomSeed())
  }

  const newGraph = () => {
    setName('untitled')
    setGraph(NEW_GRAPH())
    setSelected(null)
    setLayout({})
    setSeed(randomSeed())
  }

  const renameGraph = () => {
    const nn = window.prompt('新图名:', name)
    if (nn && nn.trim() && nn.trim() !== name) setName(nn.trim())
  }

  const save = async () => {
    try {
      // 编辑器元数据(坐标/种子)随工程保存,与图资产一起落盘
      await api.saveGraph(name, graph, { version: EDITOR_STATE_VERSION, seed, positions: layout })
      flashNotice(`已保存 ${name}`)
      refreshGraphs()
    } catch (e) {
      flashNotice(String(e.message))
    }
  }

  const removeGraph = async () => {
    if (!window.confirm(`删除图 '${name}'?`)) return
    await api.deleteGraph(name)
    refreshGraphs()
    newGraph()
  }

  const handleInject = useCallback(
    async (nodeId, port, value) => {
      const r = await run.inject(nodeId, port, value)
      if (!r.ok) flashNotice(r.message)
      return r
    },
    [run.inject, flashNotice],
  )

  const selectedNode = useMemo(
    () => graph.nodes.find((n) => n.node_id === selected) || null,
    [graph.nodes, selected],
  )
  const selectedSpec = useMemo(
    () => (selectedNode ? specs.find((s) => s.name === selectedNode.type_name) : null),
    [selectedNode, specs],
  )
  // 选中节点的运行时数据(WS 快照驱动,世界自驱期间实时更新)
  const selectedSnapNode = run.snap?.nodes?.[selected] || null

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">Eidolon Graph Editor</span>
        <TopMenu
          graphs={graphs}
          name={name}
          runStatus={run.status}
          consoleVisible={consoleVisible}
          locked={run.status !== 'idle'}
          actions={{
            onNew: newGraph,
            onLoad: loadGraph,
            onRename: renameGraph,
            onSave: save,
            onDelete: removeGraph,
            onRun: run.start,
            onPause: run.pause,
            onResume: run.resume,
            onEnd: run.end,
            onToggleConsole: () => setConsoleVisible((v) => !v),
          }}
        />
        <button
          type="button"
          className={`menu-btn${settingsOpen ? ' menu-btn-open' : ''}`}
          onClick={() => setSettingsOpen((v) => !v)}
          title="设置"
        >
          ⚙ 设置
        </button>
        {settingsOpen && (
          <SettingsPopup
            format={consoleFormat}
            onFormatChange={onConsoleFormatChange}
            onReset={() => onConsoleFormatChange(DEFAULT_CONSOLE_FORMAT)}
            onClose={() => setSettingsOpen(false)}
          />
        )}
      </header>

      {notice && <div className="notice">{notice}</div>}

      <div className="main">
        {paletteCollapsed ? (
          <aside className="palette palette-collapsed">
            <button type="button" className="palette-toggle" onClick={() => setPaletteCollapsed(false)} title="展开节点面板">▶</button>
            <span className="palette-collapsed-title">节点</span>
          </aside>
        ) : (
          <NodePalette
            specs={specs}
            locked={run.status !== 'idle'}
            onCollapse={() => setPaletteCollapsed(true)}
          />
        )}
        <ReactFlowProvider>
          <GraphCanvas
            graph={graph}
            specs={specs}
            layout={layout}
            snap={run.snap}
            onLayout={onLayout}
            selected={selected}
            onSelect={handleSelect}
            applyOps={applyOps}
            onNotice={flashNotice}
          />
        </ReactFlowProvider>
        <div className={`side${sideCollapsed ? ' side-collapsed' : ''}`}>
          {sideCollapsed ? (
            <>
              <button type="button" className="side-toggle" onClick={() => setSideCollapsed(false)} title="展开节点编辑器">◀</button>
              <span className="side-toggle-label">节点</span>
            </>
          ) : (
            <Inspector
              node={selectedNode}
              spec={selectedSpec}
              applyOps={applyOps}
              onClose={() => setSelected(null)}
              onInject={handleInject}
              onCollapse={() => setSideCollapsed(true)}
            />
          )}
        </div>
      </div>

      {consoleVisible ? (
        <ConsolePanel
          lines={run.consoleLines}
          formatLine={formatConsoleLine}
          problems={run.problems}
          error={run.error}
          tab={consoleTab}
          onTabChange={setConsoleTab}
          node={selectedNode}
          spec={selectedSpec}
          snapNode={selectedSnapNode}
          runStatus={run.status}
          runNo={run.snap?.run_no}
          seed={run.snap?.seed}
          height={consoleHeight}
          onHeightChange={setConsoleHeight}
          onToggle={() => setConsoleVisible(false)}
        />
      ) : (
        <div className="console-collapsed">
          <button type="button" className="console-toggle" onClick={() => setConsoleVisible(true)}>▲ 控制台</button>
        </div>
      )}
    </div>
  )
}
