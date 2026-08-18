import React from 'react'
import { Handle, Position } from 'reactflow'

// ===========================================================================
// L2 元素层:节点视觉语言的原子词汇——三色圆点端口(无任何形状符号)、
// 域色条、熔断异常符号(唯一符号)、运行 chip。
//
// 端口语言(v3):全部实心圆点,仅颜色区分——
//   数据 = 蓝(恒定)/ 信号 = 绿(高)/ 红(低)/ 灰(未运行)/ 触发 = 橙。
// 每个数据端口恒有一对竖直堆叠的点(信号上、数据下),句柄原点都在节点边界。
// ===========================================================================

// 信号点电平类:未运行不填色(灰),运行中绿高/红低
function lvlClass(lvl) {
  return lvl === 'active' ? ' lvl-active' : lvl === 'inactive' ? ' lvl-inactive' : ''
}

// ---- 数据输入端口行:左边界竖直堆叠 [信号点 上 / 数据点 下] + 标签 ----
export function PortInRow({ port }) {
  return (
    <div className="port port-in">
      <div className="port-handle-wrap in signal">
        <Handle
          type="target"
          position={Position.Left}
          id={`in:signal:${port.name}`}
          className={`handle handle-signal${lvlClass(port.lvl)}`}
          title={port.title}
        />
      </div>
      <div className="port-handle-wrap in data">
        <Handle
          type="target"
          position={Position.Left}
          id={`in:data:${port.name}`}
          className="handle handle-data"
          title={port.title}
        />
      </div>
      <span className={`port-label${port.dim ? ' port-label-dim' : ''}${port.optional ? ' port-optional' : ''}`}>
        {port.label}
      </span>
    </div>
  )
}

// ---- 数据输出端口行:标签 + 右边界竖直堆叠 [信号点 上 / 数据点 下] ----
export function PortOutRow({ port }) {
  return (
    <div className="port port-out">
      <span className="port-label">{port.label}</span>
      <div className="port-handle-wrap out signal">
        <Handle
          type="source"
          position={Position.Right}
          id={`out:signal:${port.name}`}
          className={`handle handle-signal${lvlClass(port.lvl)}`}
          title={port.title}
        />
      </div>
      <div className="port-handle-wrap out data">
        <Handle
          type="source"
          position={Position.Right}
          id={`out:data:${port.name}`}
          className="handle handle-data"
          title={port.title}
        />
      </div>
    </div>
  )
}

// ---- 控制端口行(节点级门控/电平/信号输出):单信号点贴边界 ----
export function CtrlInRow({ port }) {
  return (
    <div className="port port-in">
      <div className="port-handle-wrap in ctrl">
        <Handle
          type="target"
          position={Position.Left}
          id={`in:signal:${port.name}`}
          className={`handle handle-signal${lvlClass(port.lvl)}`}
          title={port.title}
        />
      </div>
      <span className="port-label">{port.name}</span>
    </div>
  )
}

export function CtrlOutRow({ port }) {
  return (
    <div className="port port-out">
      <span className="port-label">{port.name}</span>
      <div className="port-handle-wrap out ctrl">
        <Handle
          type="source"
          position={Position.Right}
          id={`out:signal:${port.name}`}
          className={`handle handle-signal${lvlClass(port.lvl)}`}
          title={port.title}
        />
      </div>
    </div>
  )
}

// ---- 触发点(组头):橙色圆点贴左边界;下划线开头端口名隐藏 ----
export function TriggerDot({ dot }) {
  return (
    <span className="port port-trigger">
      <div className="port-handle-wrap in trigger">
        <Handle
          type="target"
          position={Position.Left}
          id={`in:trigger:${dot.name}`}
          className="handle handle-trigger"
          title={dot.title}
        />
      </div>
      {dot.visibleName && <span className="trigger-name">{dot.visibleName}</span>}
    </span>
  )
}

// ---- 域色条:节点左缘 3px,域分类的唯一颜色载体 ----
export function DomainBar({ color, title }) {
  return <div className="gnode-colorbar" style={{ background: color }} title={title} />
}

// ---- 熔断异常符号:红三角+叹号(SVG,节点上唯一符号,仅异常时出现) ----
export function FaultMark({ count }) {
  return (
    <svg
      className="gnode-fault-mark"
      viewBox="0 0 16 16"
      width="14"
      height="14"
      role="img"
    >
      <title>{`已故障 ${count} 次,熔断中(circuit open)`}</title>
      <path d="M8 1.5 L15 13.5 H1 Z" fill="#f87171" stroke="#7f1d1d" strokeWidth="1" />
      <rect x="7.2" y="6" width="1.6" height="4.4" rx="0.6" fill="#450a0a" />
      <circle cx="8" cy="12" r="0.9" fill="#450a0a" />
    </svg>
  )
}

// ---- 运行 chip:状态读值(标量)/ 配置覆盖 ----
export function StateChip({ chip }) {
  return (
    <span className="state-chip">
      <em>{chip.name}</em>={chip.value}
    </span>
  )
}

export function ConfigChip({ chip }) {
  return (
    <span className={`cfg-chip${chip.overridden ? ' cfg-chip-override' : ''}`}>
      {chip.name}={chip.value}
    </span>
  )
}
