# 节点设计开放问题(待重新讨论)

> 来源:节点渲染 v3 设计讨论(2026-08-18,见 node-visual-design-v3.md)。
> 本文件集中记录尚未定案的节点设计问题,便于之后重新发起讨论;
> 每个问题给出背景、问题点与可选方向,定案后移出本文件。
>
> **2026-08-19 更新**:Q1、Q2 已随内核端口语义抽象收敛定案(见
> 本文件末尾定案记录),移出本文件主体。

---

## 追加记录

*(后续讨论产生的新开放问题在此追加;定案的问题移出,并在对应设计文档落笔。)*

---

## 定案记录(2026-08-19)

### Q1 端口组合级别 —— **已定案**(内核语义,非编辑端暴露标记)

完整决策记录:[内核 docs/graph-port-capability-composition.md](../../kernel/eidolon-graph/docs/graph-port-capability-composition.md)(端口语义抽象收敛)

定案结论:

1. **表达方式**:端口级声明——DataIn 可选**资格槽**(signal 绑定)声明;
   SignalIn(节点级 enable / 端口级资格槽)与 SignalOut(仅信号节点)为独立
   端口;不再存在"每个数据端口默认附带信号"的隐式规则;
2. **信号语义**:Signal 是**输入资格**(level + pending),不是 Gate,不是
   输出状态报告;LOW 时数据照常接收缓存,effective = 默认属性;
3. **静态 / 动态**:未连接 = 静态(默认属性,条件恒成立);已连接 = 动态
   (等实际事件,无隐式默认事件)——连接状态改变输入契约;
4. **输出侧**:无隐式输出信号,无自动传导;"没有输出"不是事件;控制流由
   数据转信号节点(DataToSignal / CompareToSignal 等 + Script → Signal)
   显式构造;死等 = 拓扑诊断警告;
5. **编辑器含义**:渲染内核声明的端口组合——资格槽声明了才渲染信号点,
   不存在"隐藏/暴露"决定。

### Q2 数据转信号节点(Data → Signal)—— **已定案**

定案结论:转换节点作为**普通信号节点类型资产**(数据输入 + SignalOut +
转换行为),与 AND/OR/NOT/Latch、比较器同属信号节点;内置多个
(DataToSignal / ValueToSignal / CompareToSignal / PredicateToSignal /
ThresholdToSignal)+ 通用 Script → Signal 节点,覆盖全部控制需求;
Threshold/Comparator 产出数据,转换节点产出信号,边界按信号节点声明区分
(见 [内核 docs/graph-kernel-engineering.md](../../kernel/eidolon-graph/docs/graph-kernel-engineering.md) 信号节点方向)。

### 遗留(未定案,待不变量审查)

内核语义不变量审查(十问 + 极端组合矩阵)尚未完成——见
[内核 docs/graph-port-capability-composition.md §6](../../kernel/eidolon-graph/docs/graph-port-capability-composition.md)。
定案后再决定是否需要新的开放问题条目。
