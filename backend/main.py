"""Eidolon Graph Editor —— 后端(本地 Web 服务)。

职责边界:
- 本服务是「图编辑服务」的 HTTP 壳 + 图资产文件存取;
- 校验 / 编辑操作 / 预览全部复用 eidolon-graph 内核(pin rev 依赖,不重实现);
- 前端只经本服务接触内核——编辑器内嵌引擎(Unity / Unreal 同构)。

数据(图资产)与源码分离,存于 DATA_ROOT(默认 workspace/,可配置)。
保存不校验(草稿可存,编辑不被打断);校验只在点「运行」时检查一次——
校验不通过拒绝运行,错误信息进前端「问题」tab。
"""

from __future__ import annotations

import asyncio
from typing import Any

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from eidolon_graph.model import Graph, ValidationError, serialize

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


class PreviewStartBody(BaseModel):
    graph: dict | None = None
    name: str | None = None
    seed: int = 0


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
    # 草稿可存:保存不校验(编译检查只在点「运行」时做一次,错误进「问题」tab)
    workspace.write_graph(name, body.graph)
    return {"name": name}


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


def _resolve_preview_graph(body: PreviewStartBody) -> Graph:
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
        return service.decode_graph(data)
    except Exception as e:  # 版本不兼容 / 格式损坏
        raise HTTPException(400, str(e))


@app.post("/api/preview/start")
def preview_start(body: PreviewStartBody) -> dict:
    """新建预览会话:世界常驻,前端按节奏推进 run()(事件驱动,无步数)。"""
    lib, registry = service.builtin_env()
    graph = _resolve_preview_graph(body)
    try:
        sid = service.start_session(graph, lib, registry, seed=body.seed)
    except ValidationError as e:
        raise HTTPException(422, {"detail": "图校验失败,拒绝运行", "report": e.report.to_dict()})
    return {"session": sid}


@app.websocket("/api/preview/sessions/{sid}/ws")
async def preview_ws(ws: WebSocket, sid: str) -> None:
    """运行中状态推送:世界自驱(事件源 = 节点),本端点只观察——run_no 变化时
    推送最新快照 + 控制台 + 日志。"""
    await ws.accept()
    if not service.session_alive(sid):
        await ws.close(code=4404)
        return
    last_run = -1
    try:
        while service.session_alive(sid):
            view = service.session_view(sid)
            if view is None:
                break
            if view["run_no"] != last_run:
                last_run = view["run_no"]
                await ws.send_json(view)
            await asyncio.sleep(0.1)
    except WebSocketDisconnect:
        pass
    finally:
        await ws.close()


class InjectBody(BaseModel):
    node: str
    port: str
    value: Any


@app.post("/api/preview/sessions/{sid}/inject")
def preview_inject(sid: str, body: InjectBody) -> dict:
    """注入宿主事件(手动触发):与节点产出数据向后传播同构。"""
    if not service.inject_event(sid, body.node, body.port, body.value):
        raise HTTPException(404, f"运行会话 '{sid}' 不存在或已停止")
    return {"ok": True}


@app.post("/api/preview/sessions/{sid}/pause")
def preview_pause(sid: str) -> dict:
    if not service.pause_session(sid):
        raise HTTPException(404, f"运行会话 '{sid}' 不存在或已停止")
    return {"paused": True}


@app.post("/api/preview/sessions/{sid}/resume")
def preview_resume(sid: str) -> dict:
    if not service.resume_session(sid):
        raise HTTPException(404, f"运行会话 '{sid}' 不存在或已停止")
    return {"resumed": True}


@app.delete("/api/preview/sessions/{sid}")
def preview_stop(sid: str) -> dict:
    return {"stopped": service.stop_session(sid)}


# 生产期:npm run build 产出 dist/,由本服务同源托管整站(开发期 Vite 直连后端)。
import os
from pathlib import Path

_DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
if _DIST.is_dir():  # pragma: no cover
    from fastapi.staticfiles import StaticFiles
    app.mount("/", StaticFiles(directory=_DIST, html=True), name="static")
