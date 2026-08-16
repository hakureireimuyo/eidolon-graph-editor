"""工作区:图工程目录的存取(用户数据与源码严格分离,gitignored)。

布局(DATA_ROOT 可配置,默认 workspace):
    DATA_ROOT/projects/<safe-name>/
      project.json          # 工程清单:graph + editor_state + globals + resources
      resources/            # 工程资源(数据文件 / sqlite)

工程格式 = eidolon-graph-project 的目录工程形态(规范见其仓库):
- 图资产 = 内核纯格式(保序 JSON,声明顺序承载全局写序);
- 编辑器元数据(节点坐标 / 种子 / 视图)随工程走——不再是浏览器 localStorage;
- 原子写由 eidolon_graph_project.to_folder 保证(资源先落盘,清单 temp+replace
  作提交点),坏文件不会出现;
- 保存不校验(草稿可存,见 main.py);校验只在点「运行」时做一次。

旧版 V0 布局(DATA_ROOT/graphs/<name>.json,一图一文件)首次访问时
一次性迁移为目录工程:图资产原样,编辑器元数据以默认值重建。
"""

from __future__ import annotations

import json
import os
import re
import shutil
from pathlib import Path

from eidolon_graph_project import GraphProject, from_folder, to_folder

DATA_ROOT = Path(os.environ.get("EIDOLON_GRAPH_EDITOR_DATA", "workspace"))

_LEGACY_GRAPHS_DIR_NAME = "graphs"


def _safe(name: str) -> str:
    s = re.sub(r"[^\w一-鿿-]+", "-", name.strip()).strip("-").lower()
    return s or "graph"


def projects_dir() -> Path:
    d = DATA_ROOT / "projects"
    d.mkdir(parents=True, exist_ok=True)
    return d


def project_dir(name: str) -> Path:
    return projects_dir() / _safe(name)


def _legacy_path(name: str) -> Path:
    return DATA_ROOT / _LEGACY_GRAPHS_DIR_NAME / f"{_safe(name)}.json"


def _migrate_legacy(name: str) -> None:
    """旧版一图一文件 → 目录工程(仅一次:图资产原样,元数据默认重建)。"""
    legacy = _legacy_path(name)
    if not legacy.is_file() or project_dir(name).is_dir():
        return
    try:
        graph = json.loads(legacy.read_text(encoding="utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return  # 坏文件:跳过迁移,按不存在处理
    to_folder(GraphProject(graph=graph), project_dir(name))


def _migrate_all_legacy() -> None:
    legacy_dir = DATA_ROOT / _LEGACY_GRAPHS_DIR_NAME
    if legacy_dir.is_dir():
        for p in legacy_dir.glob("*.json"):
            _migrate_legacy(p.stem)


def list_projects() -> list[str]:
    """工程名清单(旧版一图一文件首次访问时迁移进目录工程)。"""
    _migrate_all_legacy()
    return sorted(p.parent.name for p in projects_dir().glob("*/project.json"))


def read_project(name: str) -> GraphProject:
    """读取工程:图资产 + 编辑器元数据 + 资源(目录工程形态)。"""
    _migrate_legacy(name)
    d = project_dir(name)
    if not d.is_dir():
        raise FileNotFoundError(f"工程 '{name}' 不存在")
    return from_folder(d)


def write_project(name: str, project: GraphProject) -> None:
    """写出工程(目录工程形态,原子写由格式库保证)。"""
    to_folder(project, project_dir(name))


def delete_project(name: str) -> None:
    d = project_dir(name)
    if d.is_dir():
        shutil.rmtree(d)
