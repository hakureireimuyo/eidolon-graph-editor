import React, { useMemo, useState } from 'react'
import {
  ConfigChip, CtrlInRow, CtrlOutRow, DomainBar, FaultMark, PortInRow, PortOutRow,
  StateChip, TriggerDot,
} from './NodeAtoms.jsx'
import { CATEGORY_TITLES, HOST_INTERACT, deriveNodeModel } from '../nodeModel.js'

// ===========================================================================
// L1 结构层:消费 L0 渲染模型 → JSX 骨架(头部 + 各带决策表)。
// 视觉语言全部由内核声明派生,零硬编码;运行时态(电平/脉冲/熔断)由
// L3(GraphCanvas 的 wire 索引 + 快照)驱动。
//
// 带决策表(由声明派生):
//   构造带  = init_in 非空(预埋,当前无节点使用)
//   组单元  = 每个 groups 条目各一个(组头 = 函数,组身 = 参数/输出两列)
//   信号栏  = control_in 或 control_out 非空(节点级,不与参数混排)
//   源产出带 = 存在未入组 data_out(≈ auto 节点)
//   运行读值带 = 运行时(state 非空)
//   配置带  = config 声明非空(选中/hover 显示;默认暗、覆盖亮)
// ===========================================================================

// 组单元:组头(触发点 + 函数名)+ 组身(参数列 / 输出列,连词符垂直居中)
function GroupUnit({ unit }) {
  return (
    <div className={`gunit${unit.pulse ? ' gunit-pulse' : ''}`}>
      <div className="gunit-head">
        {unit.triggers.map((t) => <TriggerDot key={t.key} dot={t} />)}
        <span className="gunit-name" title={`触发策略:${unit.policy}`}>{unit.name}</span>
      </div>
      <div className="gunit-body">
        <div className="gunit-col">
          {unit.inputs.map((p) => <PortInRow key={p.key} port={p} />)}
        </div>
        {unit.outputs.length > 0 && (
          <span className="gunit-glyph" title={`触发策略:${unit.policy}`}>{unit.glyph}</span>
        )}
        <div className="gunit-col gunit-col-out">
          {unit.outputs.map((p) => <PortOutRow key={p.key} port={p} />)}
        </div>
      </div>
    </div>
  )
}

// 信号栏:节点级控制端口(输入左 / 输出右,全部信号点)
function SignalBand({ band }) {
  return (
    <div className="band band-signal">
      <div className="band-col">
        {band.inputs.map((p) => <CtrlInRow key={p.key} port={p} />)}
      </div>
      <div className="band-col band-col-right">
        {band.outputs.map((p) => <CtrlOutRow key={p.key} port={p} />)}
      </div>
    </div>
  )
}

// 源产出带:auto 节点的未入组数据输出(自走 step 直接产出)
function SourceBand({ band }) {
  return (
    <div className="band band-source">
      <span className="band-label">自产</span>
      <div className="band-col band-col-right">
        {band.outputs.map((p) => <PortOutRow key={p.key} port={p} />)}
      </div>
    </div>
  )
}

// 构造带(init_in 预埋):__init__ 参数端口,头部下第一条
function InitBand({ band }) {
  return (
    <div className="band band-init">
      <span className="band-label">init</span>
      <div className="band-col">
        {band.inputs.map((p) => <PortInRow key={p.key} port={p} />)}
      </div>
    </div>
  )
}

export default function GraphNode({ id, data }) {
  const { label, spec, selected, levels, snapNode, config, onInject } = data
  const model = useMemo(
    () => deriveNodeModel(spec, { label, levels, snapNode, config, selected }),
    [spec, label, levels, snapNode, config, selected],
  )
  // 宿主注入栏(Input 节点,选中时浮现;宿主交互,替换侧栏注入)
  const [injectVal, setInjectVal] = useState('')
  const [injecting, setInjecting] = useState(false)

  if (model.unknown) {
    return (
      <div className="gnode gnode-unknown">
        <div className="gnode-title">
          <span className="gnode-name">{label}</span>
        </div>
        <div className="gnode-unknown-note">未知类型:{id}(实现未注册?)</div>
      </div>
    )
  }

  const showInject = HOST_INTERACT[spec.name] === 'inject' && selected

  const doInject = async () => {
    if (!onInject) return
    setInjecting(true)
    try { await onInject(id, 'in', injectVal) } finally { setInjecting(false) }
  }

  return (
    <div className={`gnode${selected ? ' gnode-selected' : ''}${model.faulted ? ' gnode-fault' : ''}`}>
      <DomainBar color={model.color} title={CATEGORY_TITLES[model.category]} />
      <div className="gnode-title" title={model.docSummary || undefined}>
        <span className="gnode-left">
          <span className="gnode-name">{model.name}</span>
          {model.faulted && <FaultMark count={model.faultCount} />}
        </span>
        {selected && <span className="gnode-id">{id}</span>}
      </div>
      <div className="gnode-body">
        {model.initBand && <InitBand band={model.initBand} />}
        {model.groups.map((g) => <GroupUnit key={g.key} unit={g} />)}
        {model.signalBand && <SignalBand band={model.signalBand} />}
        {model.sourceBand && <SourceBand band={model.sourceBand} />}
        {model.stateChips.length > 0 && (
          <div className="band band-state">
            {model.stateChips.map((c) => <StateChip key={c.key} chip={c} />)}
          </div>
        )}
        {model.configChips.length > 0 && (
          <div className="band band-config">
            {model.configChips.map((c) => <ConfigChip key={c.key} chip={c} />)}
          </div>
        )}
      </div>
      {showInject && (
        <div className="gnode-inject">
          <input
            value={injectVal}
            placeholder="输入内容…"
            onChange={(e) => setInjectVal(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') doInject() }}
          />
          <button className="primary" onClick={doInject} disabled={injecting}>
            {injecting ? '注入中…' : '输入'}
          </button>
        </div>
      )}
    </div>
  )
}
