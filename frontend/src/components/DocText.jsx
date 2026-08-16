import React from 'react'

// 节点说明书渲染(内核 doc() 结构化纯文本):空行分段、'- ' 开头的行渲染为
// 列表项。节点详情视图与节点面板悬浮窗共用,样式随宿主容器。

export function DocLines({ lines }) {
  const blocks = []
  let buf = []
  const flush = () => {
    if (buf.length) blocks.push({ type: 'p', text: buf.join(' ') })
    buf = []
  }
  for (const l of lines || []) {
    if (l === '') {
      flush()
      continue
    }
    if (l.startsWith('- ')) {
      flush()
      blocks.push({ type: 'li', text: l.slice(2) })
    } else {
      buf.push(l)
    }
  }
  flush()
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
