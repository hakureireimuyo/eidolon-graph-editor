import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from './api.js'

// 运行会话:世界在后端自驱(事件源 = 节点自身),前端只观察(WS 推送)。
// 状态机:idle(未运行)→ running(运行中)⇄ paused(传播闸门:内部照常运行,
// 输出结果停住不向后传播,恢复后补全传递)→ idle(结束)。
export default function useRunSession(graph, seed) {
  const [status, setStatus] = useState('idle')
  const [snap, setSnap] = useState(null)
  const [error, setError] = useState(null)
  // 编译检查结果:只在点「运行」时检查一次——运行前清空,校验不通过时输出新错误
  const [problems, setProblems] = useState(null)  // {errors: [], warnings: []} | null
  const [consoleLines, setConsoleLines] = useState([])
  const wsRef = useRef(null)
  const sidRef = useRef(null)
  const seenRef = useRef({ console: 0, log: 0 })

  const applyView = useCallback((v) => {
    setSnap(v.snapshot)
    // console / log 均为追加式累积表(后端只追加、前端只取尾部增量):
    // console 存结构化条目 {t: 接收时刻, name, node, line},展示格式由
    // 设置面板模板在渲染期决定(改格式即时重渲染全部行);
    // log 行沿用自身格式(r{run} [node] level: message)
    const seen = seenRef.current
    const fresh = []
    for (let i = seen.console; i < (v.console || []).length; i++) {
      const e = v.console[i]
      fresh.push({ t: new Date(), name: e.name, node: e.node, line: e.line })
    }
    for (let i = seen.log; i < (v.log || []).length; i++) {
      const e = v.log[i]
      fresh.push({ log: `r${e.run} [${e.node || '-'}] ${e.level}: ${e.message}` })
    }
    seen.console = (v.console || []).length
    seen.log = (v.log || []).length
    if (fresh.length) setConsoleLines((prev) => [...prev, ...fresh])
  }, [])

  const start = useCallback(async () => {
    setError(null)
    setProblems(null) // 清空上一轮错误:每次点「运行」只输出本轮检查结果
    try {
      const r = await api.previewStart({ graph, seed })
      sidRef.current = r.session
      seenRef.current = { console: 0, log: 0 }
      setSnap(null)
      setConsoleLines([])
      const ws = api.previewWs(r.session)
      ws.onmessage = (ev) => {
        try {
          applyView(JSON.parse(ev.data))
        } catch (_) { /* 忽略坏消息 */ }
      }
      ws.onclose = () => {
        if (sidRef.current) {
          setStatus('idle')
          setError('运行会话已断开')
        }
      }
      wsRef.current = ws
      setStatus('running')
    } catch (e) {
      // 编译检查不通过:不运行,错误进「问题」tab(检查只发生在这里)
      if (e.body?.detail?.report) {
        const rep = e.body.detail.report
        setProblems({ errors: rep.errors || [], warnings: rep.warnings || [] })
      } else {
        setProblems({ errors: [String(e.message)], warnings: [] })
      }
    }
  }, [graph, seed, applyView])

  const pause = useCallback(async () => {
    if (!sidRef.current) return
    try {
      await api.previewPause(sidRef.current)
      setStatus('paused')
    } catch (e) {
      setError(String(e.message))
    }
  }, [])

  const resume = useCallback(async () => {
    if (!sidRef.current) return
    try {
      await api.previewResume(sidRef.current)
      setStatus('running')
    } catch (e) {
      setError(String(e.message))
    }
  }, [])

  const end = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.onclose = null
      wsRef.current.close()
      wsRef.current = null
    }
    if (sidRef.current) {
      api.previewStop(sidRef.current).catch(() => {})
      sidRef.current = null
    }
    setStatus('idle')
  }, [])

  const inject = useCallback(async (node, port, value) => {
    if (!sidRef.current) return { ok: false, message: '请先运行图(运行菜单 → 运行)' }
    try {
      await api.previewInject(sidRef.current, { node, port, value })
      return { ok: true }
    } catch (e) {
      return { ok: false, message: String(e.message) }
    }
  }, [])

  // 卸载时结束会话
  useEffect(() => end, [end]) // eslint-disable-line

  return { status, snap, consoleLines, problems, error, start, pause, resume, end, inject }
}
