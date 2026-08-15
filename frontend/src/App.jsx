import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { ReactFlowProvider } from 'reactflow'
import { api } from './api.js'
import NodePalette from './components/NodePalette.jsx'
import GraphCanvas from './components/GraphCanvas.jsx'
import Inspector from './components/Inspector.jsx'
import PreviewPanel from './components/PreviewPanel.jsx'

const NEW_GRAPH = () => ({ name: 'untitled', kernel_version: '0.1.0-0', nodes: [], wires: [] })

export default function App() {
  const [graphs, setGraphs] = useState([])
  const [name, setName] = useState('untitled')
  const [graph, setGraph] = useState(NEW_GRAPH)
  const [report, setReport] = useState({ errors: [], warnings: [] })
  const [specs, setSpecs] = useState([])
  const [selected, setSelected] = useState(null)
  const [notice, setNotice] = useState(null)

  // 节点摆放位置是编辑器侧表现元数据(图资产为内核纯格式),存 localStorage 按图名隔离
  const layoutKey = `ge-layout:${name}`
  const [layout, setLayout] = useState({})

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
      try {
        const r = await api.applyOps(name, graph, ops)
        setGraph(r.graph)
        setReport(r.report)
        return r
      } catch (e) {
        flashNotice(String(e.message))
      }
    },
    [name, graph, flashNotice],
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
  }

  const newGraph = () => {
    setName('untitled')
    setGraph(NEW_GRAPH())
    setReport({ errors: [], warnings: [] })
    setSelected(null)
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
        <label>图名
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <select value={name} onChange={(e) => loadGraph(e.target.value)}>
          <option value={name} disabled>— 载入已保存 —</option>
          {graphs.map((g) => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>
        <button onClick={newGraph}>新建</button>
        <button className="primary" onClick={save}>保存</button>
        <button className="danger" onClick={removeGraph}>删除</button>
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
        <NodePalette specs={specs} onAdd={(t) => addNode(t)} />
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
          <Inspector node={selectedNode} spec={selectedSpec} applyOps={applyOps} onClose={() => setSelected(null)} />
          <PreviewPanel graph={graph} />
        </div>
      </div>
    </div>
  )
}
