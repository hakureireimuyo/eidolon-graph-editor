import React, { useEffect, useRef } from 'react'

// 设置浮窗(顶栏「⚙ 设置」按钮弹出):目前只有控制台输出格式一个配置字段。
// 格式模板 tokens:{time} 时间(时:分:秒.毫秒)/ {name} 节点类型名 /
// {node} 节点编号 / {line} 输出内容。修改即时生效并持久化到 localStorage。
const TOKENS = [
  { token: '{time}', desc: '时间(时:分:秒.毫秒)' },
  { token: '{name}', desc: '节点类型名(如 Output)' },
  { token: '{node}', desc: '节点编号' },
  { token: '{line}', desc: '输出内容' },
]

const fmtTimeMs = (d) =>
  `${d.toLocaleTimeString('zh-CN', { hour12: false })}.${String(d.getMilliseconds()).padStart(3, '0')}`

export function renderConsoleLine(entry, format) {
  if (entry.log) return entry.log  // 引擎日志行:沿用自身格式,不受模板影响
  return format
    .split('{time}').join(fmtTimeMs(entry.t))
    .split('{name}').join(entry.name)
    .split('{node}').join(entry.node)
    .split('{line}').join(entry.line)
}

export default function SettingsPopup({ format, onFormatChange, onReset, onClose }) {
  const ref = useRef(null)
  useEffect(() => {
    const down = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    const esc = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', down)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', down)
      document.removeEventListener('keydown', esc)
    }
  }, [onClose])

  const preview = renderConsoleLine(
    { t: new Date(), name: 'Output', node: 'n1a2b3c4', line: '42' },
    format,
  )

  return (
    <div className="settings-popup" ref={ref}>
      <div className="popup-head">
        <strong>设置</strong>
        <button type="button" className="close" onClick={onClose} title="关闭">✕</button>
      </div>
      <label className="config-field">
        <span className="config-name">控制台输出格式</span>
        <input value={format} onChange={(e) => onFormatChange(e.target.value)} spellCheck={false} />
      </label>
      <div className="settings-tokens">
        {TOKENS.map((t) => (
          <div key={t.token} className="token-item">
            <code>{t.token}</code> {t.desc}
          </div>
        ))}
      </div>
      <div className="settings-preview">
        预览:<span className="dim">{preview}</span>
      </div>
      <button type="button" onClick={onReset}>恢复默认</button>
    </div>
  )
}
