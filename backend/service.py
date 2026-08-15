"""图编辑服务:内核之上的薄业务层——校验、编辑操作、headless 预览。

复用内核,不重实现:
- 校验 = 内核 model.validate(编辑事务提交前 / 预览运行前同一份语义);
- 编辑操作 = 内核 engine.edit.apply_edits(增删节点、增删连线、改配置、换实现),
  本层只做 HTTP JSON ↔ 内核 EditOp 的编解码;
- 预览 = 内核 engine.World 真实运行(同步轮次,轮初读轮末提交,确定性可复现 +
  RNG seed)——编辑器天然是调试器,预览不需要 dry-run 模式;
- 节点实现 V0 仅内核内置白名单(Clock/Counter/…),领域节点 stub 由宿主后续注册
  (协议是唯一边界:注册什么实现就跑什么)。
"""

from __future__ import annotations

from typing import Any

from eidolon_graph.engine import (AddEdge, AddNode, ChangeImpl, EditOp, NodeRegistry,
                                  RemoveEdge, RemoveNode, SetConfig, World, apply_edits)
from eidolon_graph.engine.builtins import register_builtins
from eidolon_graph.model import (AssetLibrary, Graph, NodeInstance, ValidationReport,
                                 Wire, serialize, validate)


def builtin_env() -> tuple[AssetLibrary, NodeRegistry]:
    """内置环境:类型资产 + 代码实现(每次请求新建,构造极廉价)。"""
    lib = AssetLibrary()
    registry = NodeRegistry()
    register_builtins(lib, registry)
    return lib, registry


def node_types_payload(lib: AssetLibrary) -> list[dict]:
    """调色板数据源 = 内核节点协议本身(前端不硬编码节点清单)。"""
    return [serialize.node_type_to_dict(nt) for nt in lib.node_types.values()]


def decode_graph(data: dict) -> Graph:
    return serialize.graph_from_dict(data)


def validate_graph_dict(data: dict, lib: AssetLibrary) -> ValidationReport:
    return validate(lib, decode_graph(data))


# ---------------------------------------------------------------------------
# 编辑操作编解码:HTTP JSON ↔ 内核 EditOp
# ---------------------------------------------------------------------------

def _wire_of(d: dict) -> Wire:
    return Wire(d["src_node"], d["src_port"], d["dst_node"], d["dst_port"])


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
# headless 预览:编辑器内嵌引擎,预览 = 真实运行
# ---------------------------------------------------------------------------

MAX_PREVIEW_TICKS = 10000


def run_preview(graph: Graph, lib: AssetLibrary, registry: NodeRegistry,
                ticks: int = 1, seed: int = 0, trace: bool = False) -> dict:
    """从第 0 轮起确定性运行 ticks 拍(每次调用全新世界;同图同 seed 结果恒等)。"""
    report = validate(lib, graph)
    if not report.ok:
        return {"ok": False, "report": report.to_dict()}
    world = World(lib, graph, registry, seed=seed)
    traces: list[dict] = []
    for _ in range(max(0, min(ticks, MAX_PREVIEW_TICKS))):
        world.tick()
        if trace:
            traces.append(world.snapshot().to_dict())
    return {"ok": True, "report": report.to_dict(), "ticks_run": ticks,
            "final": world.snapshot().to_dict(), "traces": traces, "log": world.log}
