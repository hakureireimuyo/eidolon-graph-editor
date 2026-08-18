// ===========================================================================
// L0 派生层:内核声明(spec + 快照)→ 纯数据渲染模型。零 JSX、零 React,
// 可单测;GraphNode(画布)与 NodePalette(调色板)共用同一派生函数,
// 视觉语言唯一出处。布局由声明派生、零硬编码——新节点类型自动获得正确形态。
//
// 节点解剖学(v3,见 docs/node-visual-design-v3.md):
//   头部:域色条 + 类型名 + 节点 id(选中)+ 熔断异常符号(唯一符号)
//   组单元:组头(触发点 + 函数名)+ 组身(参数列 / 输出列,连词符居中)
//   信号栏:节点级控制端口(信号点,绿高/红低)
//   源产出带 / 构造带(init_in 预埋)/ 运行读值带 / 配置带
// ===========================================================================

// 域分类 → 域色(编辑端展示关切;六值严格枚举由内核保证,兜底灰色)
export const CATEGORY_COLORS = {
  signal: '#f59e0b',          // 橙(信号域,延续 --control 身份色)
  data: '#3b82f6',            // 蓝(延续 --data)
  source: '#22c55e',          // 绿
  encapsulation: '#a78bfa',   // 紫
  host: '#22d3ee',            // 青
  custom: '#94a3b8',          // 灰(中性,不抢眼)
  test: '#eab308',            // 黄(测试节点:验证用,非基础)
}

export const CATEGORY_TITLES = {
  signal: '信号运算',
  data: '数据节点',
  source: '源节点',
  encapsulation: '封装节点',
  host: '宿主交互',
  custom: '自定义',
  test: '测试节点',
}

// 调色板分组顺序 = 内核枚举声明序(test 垫底,验证用节点不占常规视线)
export const CATEGORY_ORDER = ['signal', 'data', 'source', 'encapsulation', 'host', 'custom', 'test']

// 组触发策略连词符(纯箭头,⚡ 被禁;触发驱动两种策略共用 ⇒,完整策略名进 tooltip):
//   on_all_data_ready → '→'(齐到)/ on_any_data → '↝'(任一)/ 其余 → '⇒'(触发驱动)
export const POLICY_GLYPH = {
  on_all_data_ready: '→',
  on_any_data: '↝',
  on_trigger: '⇒',
  on_data_and_trigger: '⇒',
}

// 触发端口名显示规则:下划线开头(如 _result)= 实现细节 → 隐藏名字
export function visibleTriggerName(name) {
  return name.startsWith('_') ? '' : name
}

// 类型注解:去掉 builtins. 前缀供展示("builtins.int" → "int")
export function typeLabel(t) {
  if (!t) return ''
  return t.replace(/^builtins\./, '')
}

// 端口 tooltip:类型 + 绑定/可选语义,一眼看出"这端口怎么用"
export function dataInTitle(p) {
  const parts = []
  if (p.type) parts.push(`类型:${typeLabel(p.type)}`)
  if (p.const_set) parts.push(`默认=${JSON.stringify(p.const)}(不参与触发)`)
  if (p.global_read) parts.push(`全局读取:${p.global_read}(不参与触发)`)
  if (p.optional) parts.push('可选:不连线回退默认值')
  parts.push('信号点:该端口是否启用(高=带电)')
  return parts.join(' · ')
}

export function dataOutTitle(p) {
  const parts = []
  if (p.type) parts.push(`类型:${typeLabel(p.type)}`)
  if (p.global_write) parts.push(`全局写入:${p.global_write}`)
  parts.push('信号点:电平自动传导,可显式拉线')
  return parts.join(' · ')
}

export function ctrlTitle(p) {
  if (p.semantic === 'enable') return '门控:低电平 = 节点不执行、输出信号关闭并传导'
  return '电平输入:纯电平组合线(信号节点内部逻辑)'
}

// 状态值占位:标量上脸;对象/数组显示占位符(不截断长文本撑宽节点)
export function statePlaceholder(v) {
  if (v === null) return 'null'
  if (typeof v === 'string') {
    return v.length > 24 ? `${v.slice(0, 23)}…` : v
  }
  if (Array.isArray(v)) return `[${v.length} 项]`
  if (typeof v === 'object') return '{…}'
  return String(v)
}

// ---------------------------------------------------------------------------
// 形态派生(内核语义的编辑端镜像):
//   信号节点 = 声明控制输出端口;源节点 = auto(每轮自动执行)
// ---------------------------------------------------------------------------
export const isSignalNode = (spec) => (spec.control_out || []).length > 0
export const isSourceNode = (spec) => !!spec.auto

// 宿主对接映射(编辑器侧契约:host 域节点挂载哪种宿主交互 UI)。
// 节点面布局仍由声明派生;此表只决定交互挂载点——Input 挂注入栏,
// Output 的日志视图在控制台「节点」tab(NodeDetails 注册)。
export const HOST_INTERACT = { Input: 'inject', Output: 'console' }

// 端口带绑定/可选标记(编辑端派生:bound = 不参与触发)
export function dataInsOf(spec) {
  return (spec.data_in || []).map((p) => ({
    ...p,
    bound: !!(p.const_set || p.global_read),
  }))
}

// 组外端口:未入任何组的数据输出(≈ auto 节点的自产)
export function sourceOutsOf(spec) {
  const inGroup = new Set((spec.groups || []).flatMap((g) => g.outputs || []))
  return (spec.data_out || []).filter((p) => !inGroup.has(p.name))
}

// ---------------------------------------------------------------------------
// 渲染模型构建
// ---------------------------------------------------------------------------

// 输入端口行:一对竖直堆叠的点(信号上、数据下),均位于节点左边界
function portInRow(port, levels) {
  return {
    key: port.name,
    kind: 'in',
    name: port.name,
    label: portLabel(port),
    dim: port.bound,
    optional: port.optional,
    title: dataInTitle(port),
    lvl: levels?.in?.[port.name] || null,
  }
}

// 输出端口行:一对竖直堆叠的点(信号上、数据下),均位于节点右边界
function portOutRow(port, levels) {
  return {
    key: port.name,
    kind: 'out',
    name: port.name,
    label: portLabel(port),
    title: dataOutTitle(port),
    lvl: levels?.out?.[port.name] || null,
  }
}

// 端口标签:绑定/全局读写后缀(视觉语言只回答问题"值从哪来/到哪去")
function portLabel(p) {
  let s = p.name
  if (p.const_set) s += `=${JSON.stringify(p.const)}`
  if (p.global_read) s += `@${p.global_read}`
  if (p.global_write) s += `→${p.global_write}`
  return s
}

// 控制端口行(节点级:门控/电平/信号输出——全部是信号点,语义进 tooltip)
function ctrlInRow(port, levels) {
  return {
    key: port.name,
    kind: 'ctrl-in',
    name: port.name,
    title: ctrlTitle(port),
    lvl: levels?.in?.[port.name] || null,
  }
}

function ctrlOutRow(port, levels) {
  return {
    key: port.name,
    kind: 'ctrl-out',
    name: port.name,
    title: `信号输出(默认${port.default_level === 'active' ? '高' : '低'})`,
    lvl: levels?.out?.[port.name] || null,
  }
}

// 触发端口(组头:激活函数语义,贴左边界单点)
function triggerDot(port) {
  return {
    key: port.name,
    kind: 'trigger',
    name: port.name,
    visibleName: visibleTriggerName(port.name),
    title: `触发入口 ${port.name}:数据线(载荷+激活)或信号线(电平变化)均可触发`,
  }
}

// 组单元 → 组头 + 组身(组身两列:参数列 / 输出列,连词符垂直居中)
function groupUnit(group, ctx) {
  const ins = (group.inputs || []).map((n) => ctx.dataInMap[n]).filter(Boolean)
  const outs = (group.outputs || []).map((n) => ctx.dataOutMap[n]).filter(Boolean)
  const trigs = (group.triggers || []).map((n) => ctx.triggerMap[n]).filter(Boolean)
  const pulse =
    ins.some((p) => ctx.fresh.has(p.name)) || trigs.some((t) => ctx.triggerFresh.has(t.name))
  return {
    key: group.name,
    name: group.name,
    policy: group.policy || 'on_all_data_ready',
    glyph: POLICY_GLYPH[group.policy] || '→',
    triggers: trigs.map(triggerDot),
    inputs: ins.map((p) => portInRow(p, ctx.levels)),
    outputs: outs.map((p) => portOutRow(p, ctx.levels)),
    pulse,
  }
}

export function deriveNodeModel(spec, opts = {}) {
  // opts: { label, levels, snapNode, config, selected }
  if (!spec) return { unknown: true, name: opts.label || '?' }
  const snap = opts.snapNode || null
  const running = !!snap
  const levels = opts.levels || null

  const ctx = {
    dataInMap: Object.fromEntries(dataInsOf(spec).map((p) => [p.name, p])),
    triggerMap: Object.fromEntries((spec.trigger_in || []).map((p) => [p.name, p])),
    dataOutMap: Object.fromEntries((spec.data_out || []).map((p) => [p.name, p])),
    levels,
    fresh: new Set(snap?.fresh || []),
    triggerFresh: new Set(snap?.trigger_fresh || []),
  }

  const m = {
    unknown: false,
    name: spec.name,
    category: CATEGORY_COLORS[spec.category] ? spec.category : 'custom',
    color: CATEGORY_COLORS[spec.category] || CATEGORY_COLORS.custom,
    docSummary: spec.doc?.summary || '',
    isSource: isSourceNode(spec),
    isHost: (spec.category || '') === 'host',
    // 运行时态(快照驱动)
    running,
    pending: running && snap.state?.pending != null,
    faulted: running && !!snap.circuit_open,
    faultCount: snap?.fault_count || 0,
    groups: [],
    signalBand: null,
    sourceBand: null,
    initBand: null,
    stateChips: [],
    configChips: [],
  }

  // 组单元(方法带):每组 = 组头(函数)+ 组身(参数/输出两列)
  m.groups = (spec.groups || []).map((g) => groupUnit(g, ctx))

  // 信号栏:节点级控制端口(输入左 / 输出右,全部信号点)
  const cIns = (spec.control_in || []).map((p) => ctrlInRow(p, levels))
  const cOuts = (spec.control_out || []).map((p) => ctrlOutRow(p, levels))
  if (cIns.length || cOuts.length) m.signalBand = { inputs: cIns, outputs: cOuts }

  // 源产出带:auto 节点的未入组数据输出(自走 step 直接产出)
  const srcOuts = sourceOutsOf(spec).map((p) => portOutRow(p, levels))
  if (srcOuts.length) m.sourceBand = { outputs: srcOuts }

  // 构造带(init_in 预埋):__init__ 参数端口,头部下第一条
  const inits = (spec.init_in || []).map((n) => ctx.dataInMap[n]).filter(Boolean)
    .map((p) => portInRow(p, levels))
  if (inits.length) m.initBand = { inputs: inits }

  // 运行读值带:state 字段上脸(标量原样,对象/数组占位)
  if (running && snap.state) {
    m.stateChips = Object.entries(snap.state)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => ({ key: k, name: k, value: statePlaceholder(v) }))
  }

  // 配置带:全部 config 字段(默认值暗、覆盖值亮——仅选中/hover 显示)
  const overrides = opts.config || {}
  if ((spec.config || []).length) {
    m.configChips = (spec.config || []).map((f) => ({
      key: f.name,
      name: f.name,
      value: statePlaceholder(overrides[f.name] !== undefined ? overrides[f.name] : f.default),
      overridden: overrides[f.name] !== undefined,
    }))
  }

  return m
}

// 调色板迷你模型(与画布同源派生):分类 + 端口概要
export function paletteInfoOf(spec) {
  return {
    name: spec.name,
    category: CATEGORY_COLORS[spec.category] ? spec.category : 'custom',
    color: CATEGORY_COLORS[spec.category] || CATEGORY_COLORS.custom,
    auto: !!spec.auto,
    docSummary: spec.doc?.summary || '',
    ports: [
      ...(spec.data_in || []).map(() => 'in'),
      ...(spec.data_out || []).map(() => 'out'),
      ...(spec.trigger_in || []).map(() => 'trig'),
      ...(spec.control_in || []).map(() => 'c-in'),
      ...(spec.control_out || []).map(() => 'c-out'),
      ...((spec.groups || []).length > 0 ? [`${spec.groups.length}组`] : []),
    ].join(' '),
  }
}
