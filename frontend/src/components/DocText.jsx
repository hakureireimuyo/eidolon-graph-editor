import React from 'react'

// 节点说明书渲染(内核 doc() 结构化纯文本):空行分段、'- ' 开头的行渲染为
// 列表项。节点详情视图与节点面板悬浮窗共用,样式随宿主容器。

export function DocLines({ lines }) {
  // 逐行渲染(内核 doc() 约定):lines 数组一行 = 一段,空行分段,
  // '- ' 开头 = 列表项——行间不做合并,保留行结构(空行分段由 CSS 间距承担)
  const blocks = []
  for (const l of lines || []) {
    if (l === '') continue
    blocks.push(l.startsWith('- ')
      ? { type: 'li', text: l.slice(2) }
      : { type: 'p', text: l })
  }
  return (
    <>
      {blocks.map((b, i) =>
        b.type === 'li'
          ? <div key={i} className="doc-li">• {b.text}</div>
          : <p key={i} className="doc-p">{b.text}</p>)}
    </>
  )
}

export function DocBody({ doc }) {
  if (!doc || (!doc.summary && !(doc.sections || []).length)) return null
  return (
    <div className="doc-body">
      {doc.summary && <p className="doc-summary">{doc.summary}</p>}
      {(doc.sections || []).map((s, i) => (
        <div key={i} className="doc-sec">
          {s.title && <div className="doc-sec-title">{s.title}</div>}
          <DocLines lines={s.lines} />
        </div>
      ))}
    </div>
  )
}
