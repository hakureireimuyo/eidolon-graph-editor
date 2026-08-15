"""Eidolon Graph Editor —— 后端(本地 Web 服务)。

职责边界:
- 本服务是「图编辑服务」的 HTTP 壳 + 图资产文件存取;
- 校验 / 编辑操作 / 预览全部复用 eidolon-graph 内核(pin rev 依赖,不重实现);
- 前端只经本服务接触内核——编辑器内嵌引擎(Unity / Unreal 同构)。

数据(图资产)与源码分离,存于 DATA_ROOT(默认 workspace/,可配置)。
资产文件永远合法:保存前校验,预览前再校验(内核运行时加载时还会校验一遍)。
"""

from __future__ import annotations

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from eidolon_graph.model import serialize

# 兼容两种启动方式:`uvicorn backend.main:app`(仓库根)与
# `cd backend && uvicorn main:app`(scripts/start.sh 的开发期方式)。
try:
    from . import service, workspace
except ImportError:  # pragma: no cover
    import service
    import workspace

app = FastAPI(title="Eidolon Graph Editor", version="0.1.0")

# 开发期前端(Vite :5173)跨源直连本服务(:8000),必须放行预检。
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class GraphBody(BaseModel):
    graph: dict


class OpsBody(BaseModel):
    graph: dict
    ops: list[dict]


class PreviewBody(BaseModel):
    graph: dict | None = None
    name: str | None = None
    ticks: int = 1
    seed: int = 0
    trace: bool = False


@app.get("/api/health")
def health() -> dict:
    return {"ok": True, "service": "eidolon-graph-editor"}


@app.get("/api/node-types")
def node_types() -> dict:
    lib, _ = service.builtin_env()
    return {"node_types": service.node_types_payload(lib)}


@app.get("/api/graphs")
def list_graphs() -> dict:
    return {"graphs": workspace.list_graphs()}


@app.get("/api/graphs/{name}")
def get_graph(name: str) -> dict:
    try:
        data = workspace.read_graph(name)
    except FileNotFoundError:
        raise HTTPException(404, f"图 '{name}' 不存在")
    lib, _ = service.builtin_env()
    return {"name": name, "graph": data,
            "report": service.validate_graph_dict(data, lib).to_dict()}


@app.put("/api/graphs/{name}")
def save_graph(name: str, body: GraphBody) -> dict:
    lib, _ = service.builtin_env()
    report = service.validate_graph_dict(body.graph, lib)
    if not report.ok:
        raise HTTPException(422, {"detail": "图校验失败,拒绝保存", "report": report.to_dict()})
    workspace.write_graph(name, body.graph)
    return {"name": name, "report": report.to_dict()}


@app.delete("/api/graphs/{name}")
def delete_graph(name: str) -> dict:
    workspace.delete_graph(name)
    return {"name": name}


@app.post("/api/graphs/{name}/ops")
def apply_ops(name: str, body: OpsBody) -> dict:
    lib, _ = service.builtin_env()
    try:
        graph = service.decode_graph(body.graph)
        draft, report = service.apply_ops(graph, body.ops, lib)
    except ValueError as e:  # 未知操作 / 结构错误(节点或连线不存在等)
        raise HTTPException(400, str(e))
    return {"name": name, "ok": report.ok,
            "graph": serialize.graph_to_dict(draft), "report": report.to_dict()}


@app.post("/api/preview")
def preview(body: PreviewBody) -> dict:
    lib, registry = service.builtin_env()
    if body.graph is not None:
        data = body.graph
    elif body.name is not None:
        try:
            data = workspace.read_graph(body.name)
        except FileNotFoundError:
            raise HTTPException(404, f"图 '{body.name}' 不存在")
    else:
        raise HTTPException(400, "需要提供 graph 或 name")
    try:
        graph = service.decode_graph(data)
    except Exception as e:  # 版本不兼容 / 格式损坏
        raise HTTPException(400, str(e))
    return service.run_preview(graph, lib, registry, ticks=body.ticks,
                               seed=body.seed, trace=body.trace)


# 生产期:npm run build 产出 dist/,由本服务同源托管整站(开发期 Vite 直连后端)。
import os
from pathlib import Path

_DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
if _DIST.is_dir():  # pragma: no cover
    from fastapi.staticfiles import StaticFiles
    app.mount("/", StaticFiles(directory=_DIST, html=True), name="static")
