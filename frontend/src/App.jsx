import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { ReactFlowProvider } from 'reactflow'
import { api } from './api.js'
import useRunSession from './useRunSession.js'
import TopMenu from './components/TopMenu.jsx'
import NodePalette from './components/NodePalette.jsx'
import GraphCanvas from './components/GraphCanvas.jsx'
import Inspector from './components/Inspector.jsx'
import RunPanel from './components/RunPanel.jsx'
import ConsolePanel from './components/ConsolePanel.jsx'

const NEW_GRAPH = () => ({ name: 'untitled', kernel_version: '0.1.0-0', nodes: [], wires: [] })
const randomSeed = () => Math.floor(Math.random() * 2 ** 31)

export default function App() {
  const [graphs, setGraphs] = useState([])
  const [name, setName] = useState('untitled')
  const [graph, setGraph] = useState(NEW_GRAPH)
  const [report, setReport] = useState({ errors: [], warnings: [] })
  const [specs, setSpecs] = useState([])
  const [selected, setSelected] = useState(null)
  const [notice, setNotice] = useState(null)
  const [consoleVisible, setConsoleVisible] = useState(true)
  const [consoleHeight, setConsoleHeight] = useState(180)  // 底部控制台高度(拖动上缘调整)
  // 随机种子:不需要手动设置,每张图新建/载入时自动随机
  const [seed, setSeed] = useState(randomSeed)

  // 节点摆放位置是编辑器侧表现元数据(图资产为内核纯格式),存 localStorage 按图名隔离
  const layoutKey = `ge-layout:${name}`
  const [layout, setLayout] = useState({})

  // 运行会话(世界自驱,事件源 = 节点)
  const run = useRunSession(graph, seed)

  useEffect(() => {
    api.listNodeTypes().then((r) => setSpecs(r.node_types)).catch((e) => setNotice(String(e.message)))
    refreshGraphs()
  }, [])

  useEffect(() => {
    try {
      setLayout(JSON.parse(localStorage.getItem(layoutKey) || '{}'))
    } catch (_) {
      setLayout({})
    }
  }, [layoutKey])

  const refreshGraphs = () =>
    api.listGraphs().then((r) => setGraphs(r.graphs)).catch(() => {})

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
        setReport(r.report)
        return r
      } catch (e) {
        flashNotice(String(e.message))
      }
    },
    [name, graph, flashNotice, run.status],
  )

  const onLayout = useCallback(
    (nodeId, pos) => {
      setLayout((prev) => {
        const next = { ...prev, [nodeId]: pos }
        try {
          localStorage.setItem(layoutKey, JSON.stringify(next))
        } catch (_) {}
        return next
      })
    },
    [layoutKey],
  )

  const loadGraph = async (n) => {
    const r = await api.getGraph(n)
    setName(r.name)
    setGraph(r.graph)
    setReport(r.report)
    setSelected(null)
    setSeed(randomSeed()) // 每张图自动随机种子
  }

  const newGraph = () => {
    setName('untitled')
    setGraph(NEW_GRAPH())
    setReport({ errors: [], warnings: [] })
    setSelected(null)
    setSeed(randomSeed())
  }

  const renameGraph = () => {
    const nn = window.prompt('新图名:', name)
    if (nn && nn.trim() && nn.trim() !== name) setName(nn.trim())
  }

  const save = async () => {
    try {
      const r = await api.saveGraph(name, graph)
      setReport(r.report)
      flashNotice(`已保存 ${name}`)
      refreshGraphs()
    } catch (e) {
      if (e.body?.detail?.report) setReport(e.body.detail.report)
      else flashNotice(String(e.message))
    }
  }

  const removeGraph = async () => {
    if (!window.confirm(`删除图 '${name}'?`)) return
    await api.deleteGraph(name)
    refreshGraphs()
    newGraph()
  }

  const addNode = useCallback(
    async (typeName, pos) => {
      const nodeId = `n${Math.random().toString(36).slice(2, 8)}`
      if (pos) onLayout(nodeId, pos)
      await applyOps([{ op: 'add_node', node: { node_id: nodeId, type_name: typeName, config: {} } }])
    },
    [applyOps, onLayout],
  )

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
      </header>

      {notice && <div className="notice">{notice}</div>}

      <div className="report-bar">
        <span className="report-errors">{report.errors.length} 个错误</span>
        <span className="report-warnings">{report.warnings.length} 个提示</span>
        {report.errors.map((e, i) => (
          <span key={`e${i}`} className="report-item err" title={e}>[E] {e}</span>
        ))}
        {report.warnings.map((w, i) => (
          <span key={`w${i}`} className="report-item warn" title={w}>[W] {w}</span>
        ))}
      </div>

      <div className="main">
        <NodePalette specs={specs} onAdd={(t) => addNode(t)} locked={run.status !== 'idle'} />
        <ReactFlowProvider>
          <GraphCanvas
            graph={graph}
            specs={specs}
            layout={layout}
            onLayout={onLayout}
            selected={selected}
            onSelect={setSelected}
            applyOps={applyOps}
            onNotice={flashNotice}
          />
        </ReactFlowProvider>
        <div className="side">
          <Inspector
            node={selectedNode}
            spec={selectedSpec}
            applyOps={applyOps}
            onClose={() => setSelected(null)}
            onInject={handleInject}
          />
          <RunPanel
            snap={run.snap}
            status={run.status}
            error={run.error}
          />
        </div>
      </div>

      {consoleVisible && (
        <ConsolePanel
          lines={run.consoleLines}
          height={consoleHeight}
          onHeightChange={setConsoleHeight}
        />
      )}
    </div>
  )
}
