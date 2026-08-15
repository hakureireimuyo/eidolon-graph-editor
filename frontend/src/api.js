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
  saveGraph: (name, graph) => req('PUT', `/api/graphs/${encodeURIComponent(name)}`, { graph }),
  deleteGraph: (name) => req('DELETE', `/api/graphs/${encodeURIComponent(name)}`),
  applyOps: (name, graph, ops) =>
    req('POST', `/api/graphs/${encodeURIComponent(name)}/ops`, { graph, ops }),
  preview: (body) => req('POST', '/api/preview', body),
}
