// Graph Editor 前端 API 客户端。
// 开发期(vite dev)直连后端 http://localhost:8000;
// 生产期(dist 由后端托管)使用同源相对路径。
const BASE = import.meta.env.DEV ? 'http://localhost:8000' : ''

async function req(method, path, body) {
  const opts = { method, headers: {} }
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json'
    opts.body = JSON.stringify(body)
  }
  const res = await fetch(BASE + path, opts)
  if (!res.ok) {
    let payload = null
    try {
      payload = await res.json()
    } catch (_) {}
    const detail = payload && payload.detail
    const err = new Error(typeof detail === 'string' ? detail : res.statusText)
    err.status = res.status
    err.body = payload // 422 时 detail.report 为校验报告
    throw err
  }
  return res.json()
}

export const api = {
  health: () => req('GET', '/api/health'),
  listNodeTypes: () => req('GET', '/api/node-types'),
  listGraphs: () => req('GET', '/api/graphs'),
  getGraph: (name) => req('GET', `/api/graphs/${encodeURIComponent(name)}`),
  // 保存 = 图资产 + 编辑器元数据(坐标/种子)随工程落盘
  saveGraph: (name, graph, editorState) =>
    req('PUT', `/api/graphs/${encodeURIComponent(name)}`, { graph, editor_state: editorState }),
  deleteGraph: (name) => req('DELETE', `/api/graphs/${encodeURIComponent(name)}`),
  applyOps: (name, graph, ops) =>
    req('POST', `/api/graphs/${encodeURIComponent(name)}/ops`, { graph, ops }),
  previewStart: (body) => req('POST', '/api/preview/start', body),
  previewStop: (sid) => req('DELETE', `/api/preview/sessions/${encodeURIComponent(sid)}`),
  // 注入宿主事件(手动触发):与节点产出数据向后传播同构
  previewInject: (sid, body) =>
    req('POST', `/api/preview/sessions/${encodeURIComponent(sid)}/inject`, body),
  previewPause: (sid) => req('POST', `/api/preview/sessions/${encodeURIComponent(sid)}/pause`),
  previewResume: (sid) => req('POST', `/api/preview/sessions/${encodeURIComponent(sid)}/resume`),
  // 运行中状态推送:世界自驱,前端只观察(不推进、不伪造事件)
  previewWs: (sid) =>
    new WebSocket(`${BASE.replace(/^http/, 'ws')}/api/preview/sessions/${encodeURIComponent(sid)}/ws`),
}
