import React, { useEffect, useRef, useState } from 'react'

// 设置面板(顶栏「⚙ 设置」按钮弹出):居中弹窗,左侧选项列表、右侧设置内容。
// 选项:
// - 控制台格式:输出格式模板 tokens:{time} 时间 / {name} 节点类型名 /
//   {node} 节点编号 / {line} 输出内容;修改即时生效并持久化;
// - 画布背景:静态背景样式(原点矩阵 / 网格线)。
const TOKENS = [
  { token: '{time}', desc: '时间(时:分:秒.毫秒)' },
  { token: '{name}', desc: '节点类型名(如 Output)' },
  { token: '{node}', desc: '节点编号' },
  { token: '{line}', desc: '输出内容' },
]

export const BACKGROUNDS = [
  { key: 'dots', label: '原点矩阵(点阵)' },
  { key: 'lines', label: '网格线' },
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

export default function SettingsPopup({ format, onFormatChange, onReset, background, onBackgroundChange, onClose }) {
  const [tab, setTab] = useState('console')
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
    <div className="settings-modal-overlay">
      <div className="settings-modal" ref={ref}>
        <div className="settings-modal-head">
          <h3>设置</h3>
          <button type="button" className="close" onClick={onClose} title="关闭">✕</button>
        </div>
        <div className="settings-modal-body">
          <div className="settings-nav">
            <button type="button" className={tab === 'console' ? 'active' : ''} onClick={() => setTab('console')}>
              控制台格式
            </button>
            <button type="button" className={tab === 'background' ? 'active' : ''} onClick={() => setTab('background')}>
              画布背景
            </button>
          </div>
          <div className="settings-content">
            {tab === 'console' && (
              <>
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
              </>
            )}
            {tab === 'background' && (
              <>
                <span className="config-name">画布背景样式</span>
                <div className="config-form">
                  {BACKGROUNDS.map((b) => (
                    <label key={b.key} className="config-field settings-radio">
                      <input
                        type="radio"
                        name="background"
                        checked={background === b.key}
                        onChange={() => onBackgroundChange(b.key)}
                      />
                      <span>{b.label}</span>
                    </label>
                  ))}
                </div>
                <p className="hint">静态背景:原点矩阵(点阵)或网格线;修改即时生效并持久化</p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
