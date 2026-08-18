"""图编辑服务:内核之上的薄业务层——校验、编辑操作、headless 预览。

复用内核,不重实现:
- 校验 = 内核 model.validate(编辑事务提交前 / 预览运行前同一份语义);
- 编辑操作 = 内核 engine.edit.apply_edits(增删节点、增删连线、改配置、换实现),
  本层只做 HTTP JSON ↔ 内核 EditOp 的编解码;
- 运行 = 内核 engine.World 实时自驱(源节点按自身发射规则发事件,如 Clock
  默认每秒一次),会话常驻世界,前端只观察(WS 推送)——像写代码一样:编辑完
  点运行才真正跑起来;
- 节点实现 = 内核节点库(一节点一文件,全部节点归属内核——运行时不会缺节点);
  特殊节点(Output 日志输出 / Input 手动输入)的展示对接由本服务做特殊处理:
  读 Output 状态喂控制台、为 Input 提供注入端点。
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from typing import Any

from eidolon_graph.engine import (AddEdge, AddNode, ChangeImpl, EditOp, Event, NodeRegistry,
                                  RemoveEdge, RemoveNode, SetConfig, World, apply_edits)
from eidolon_graph.engine.builtins import OUTPUT, register_builtins
from eidolon_graph.engine.script import ScriptError, compile_script
from eidolon_graph.nodes.llm import register_llm_nodes
from eidolon_graph.model import (AssetLibrary, Graph, NodeInstance, ValidationError,
                                 ValidationReport, Wire, serialize, validate)

# 兼容两种启动方式:`uvicorn backend.main:app`(仓库根)与
# `cd backend && uvicorn main:app`(scripts/start.sh 的开发期方式)。
try:
    from . import workspace
except ImportError:  # pragma: no cover
    import workspace


def builtin_env() -> tuple[AssetLibrary, NodeRegistry]:
    """内置环境:内核节点库的类型资产 + 代码实现(每次请求新建,构造极廉价)。

    已保存的脚本节点(workspace/scripts/)一并注册——脚本节点经编译进入
    资产库,调色板/校验/预览与内置节点同构。
    """
    lib = AssetLibrary()
    registry = NodeRegistry()
    register_builtins(lib, registry)
    register_llm_nodes(lib, registry)  # LLM 封装节点(LlmCall/ContextStore/ContextCompile)
    for d in workspace.list_scripts():
        try:
            nt, _ = compile_script(d["source"], d["type_name"])
        except ScriptError:
            continue  # 坏脚本:跳过注册(保存时已校验,此处防御)
        if nt.name not in lib.node_types:
            lib.add_node_type(nt)
    return lib, registry


def save_script_node(type_name: str, source: str) -> None:
    """保存脚本节点:编译校验 + 内置重名检查(失败抛 ScriptError → 端点 400),再落盘。"""
    compile_script(source, type_name)
    lib = AssetLibrary()
    register_builtins(lib, NodeRegistry())
    if type_name in lib.node_types:
        raise ScriptError(f"脚本节点 '{type_name}' 与内置节点重名,请换一个类型名")
    workspace.save_script(type_name, source)


def delete_script_node(type_name: str) -> bool:
    return workspace.delete_script(type_name)


def node_types_payload(lib: AssetLibrary, registry: NodeRegistry) -> list[dict]:
    """调色板数据源 = 内核节点协议本身(前端不硬编码节点清单)。

    附带节点说明书:内核 impl.doc() 的结构化纯文本 {summary, sections}
    (编辑器只做展示对接,文档归属内核节点,随 pin rev 传播)。
    """
    payload: list[dict] = []
    for nt in lib.node_types.values():
        d = serialize.node_type_to_dict(nt)
        impl_name = nt.impl.name or nt.name
        d["doc"] = registry.get(impl_name)().doc() if registry.contains(impl_name) else None
        payload.append(d)
    return payload


def decode_graph(data: dict) -> Graph:
    return serialize.graph_from_dict(data)


def validate_graph_dict(data: dict, lib: AssetLibrary) -> ValidationReport:
    return validate(lib, decode_graph(data))


# ---------------------------------------------------------------------------
# 编辑操作编解码:HTTP JSON ↔ 内核 EditOp
# ---------------------------------------------------------------------------

def _wire_of(d: dict) -> Wire:
    return Wire(d["src_node"], d["src_port"], d["dst_node"], d["dst_port"],
                d.get("dst_slot", "data"))


def decode_ops(ops: list[dict]) -> list[EditOp]:
    decoded: list[EditOp] = []
    for op in ops:
        kind = op.get("op")
        if kind == "add_node":
            n = op["node"]
            decoded.append(AddNode(NodeInstance(node_id=n["node_id"],
                                                type_name=n["type_name"],
                                                config=dict(n.get("config", {})))))
        elif kind == "remove_node":
            decoded.append(RemoveNode(op["node_id"]))
        elif kind == "add_edge":
            decoded.append(AddEdge(_wire_of(op["wire"])))
        elif kind == "remove_edge":
            decoded.append(RemoveEdge(_wire_of(op["wire"])))
        elif kind == "set_config":
            decoded.append(SetConfig(op["node_id"], dict(op.get("config", {}))))
        elif kind == "change_impl":
            decoded.append(ChangeImpl(op["node_id"], op["new_type_name"]))
        else:
            raise ValueError(f"未知编辑操作 '{kind}'")
    return decoded


def apply_ops(graph: Graph, ops: list[dict], lib: AssetLibrary) -> tuple[Graph, ValidationReport]:
    """在草稿上应用编辑操作并校验:返回(新图, 校验报告)。不落盘——保存由调用方决定。"""
    draft = apply_edits(graph, decode_ops(ops))
    return draft, validate(lib, draft)


# ---------------------------------------------------------------------------
# 运行会话:编辑器内嵌引擎,世界自驱(事件源 = 节点),前端只观察
# ---------------------------------------------------------------------------

MAX_SESSIONS = 8


@dataclass
class Session:
    """一次运行会话:世界 + 追加式控制台(每节点已收录行数 → 只追加新增行)。

    控制台必须是**追加式**的:按节点声明序重建完整列表再按总行数取增量,
    声明序靠前节点的新行会落在列表中间,前端增量被截断 → 丢行/重复行。
    """

    world: World
    console: list[dict] = field(default_factory=list)   # {"node": id, "name": 类型名, "line": 文本}
    seen: dict[str, int] = field(default_factory=dict)  # 节点 id → 已收录行数


_sessions: dict[str, Session] = {}


def start_session(graph: Graph, lib: AssetLibrary, registry: NodeRegistry,
                  seed: int = 0) -> str:
    """运行按钮:新建会话并启动世界(实时自驱——源节点按自身发射规则发事件,
    Clock 默认每秒一次)。校验不通过抛 ValidationError。"""
    report = validate(lib, graph)
    if not report.ok:
        raise ValidationError(report)
    sid = uuid.uuid4().hex[:12]
    world = World(lib, graph, registry, seed=seed, realtime=True)
    world.start()
    _sessions[sid] = Session(world)
    if len(_sessions) > MAX_SESSIONS:  # 淘汰最旧会话(同时停止其世界自驱线程)
        old = _sessions.pop(next(iter(_sessions)))
        old.world.stop()
    return sid


def session_alive(sid: str) -> bool:
    return sid in _sessions


def session_view(sid: str) -> dict | None:
    """会话只读视图(世界自驱,宿主不推进):最新快照 + 控制台 + 日志。

    控制台条目为追加式收录(每次调用把各 Output 节点新增的行按声明序
    追加到会话列表尾部,跨 run 天然保持时间先后),前端按总条数取增量即可。
    """
    sess = _sessions.get(sid)
    if sess is None:
        return None
    world = sess.world
    snap = world.snapshot().to_dict()
    for ni in world.graph.nodes:
        if ni.type_name != OUTPUT.name:
            continue
        lines = (snap["nodes"].get(ni.node_id) or {}).get("state", {}).get("lines", [])
        seen = sess.seen.get(ni.node_id, 0)
        for line in lines[seen:]:
            sess.console.append({"node": ni.node_id, "name": ni.type_name, "line": line})
        sess.seen[ni.node_id] = len(lines)
    return {"run_no": world.run_no, "snapshot": snap,
            "console": list(sess.console), "log": list(world.log)}


def stop_session(sid: str) -> bool:
    """结束会话:停止世界自驱,销毁。"""
    sess = _sessions.pop(sid, None)
    if sess is not None:
        sess.world.stop()
        return True
    return False


def inject_event(sid: str, node: str, port: str, value: Any) -> bool:
    """注入宿主事件(Input 节点的手动触发):事件驱动不在乎事件从哪来——
    注入数据事件与节点产出数据向后传播完全同构。暂停期间亦可用。"""
    sess = _sessions.get(sid)
    if sess is None:
        return False
    sess.world.run([Event(node, port, value)])
    return True


def pause_session(sid: str) -> bool:
    """暂停:世界冻结(状态/信号/RNG 保留),暂停时长不计入发射周期。"""
    sess = _sessions.get(sid)
    if sess is None:
        return False
    sess.world.pause()
    return True


def resume_session(sid: str) -> bool:
    """恢复:发射时刻顺延暂停时长后继续自驱。"""
    sess = _sessions.get(sid)
    if sess is None:
        return False
    sess.world.resume()
    return True
