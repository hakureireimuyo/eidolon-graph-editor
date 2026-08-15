"""工作区:图资产文件的存取(用户数据与源码严格分离,gitignored)。

布局(卡带目录 V0):DATA_ROOT/graphs/<name>.json —— 一图一文件;
JSON 保序(内核 serialize,声明顺序承载全局写序);写入为 temp + replace 原子操作,
坏文件不会出现。资产文件永远合法:保存前校验(见 main.py),运行时加载时内核会再校验一遍。
"""

from __future__ import annotations

import os
import re
import tempfile
from pathlib import Path

from eidolon_graph.model import serialize

DATA_ROOT = Path(os.environ.get("EIDOLON_GRAPH_EDITOR_DATA", "workspace"))


def _safe(name: str) -> str:
    s = re.sub(r"[^\w一-鿿-]+", "-", name.strip()).strip("-").lower()
    return s or "graph"


def graphs_dir() -> Path:
    d = DATA_ROOT / "graphs"
    d.mkdir(parents=True, exist_ok=True)
    return d


def graph_path(name: str) -> Path:
    return graphs_dir() / f"{_safe(name)}.json"


def list_graphs() -> list[str]:
    return sorted(p.stem for p in graphs_dir().glob("*.json"))


def read_graph(name: str) -> dict:
    p = graph_path(name)
    if not p.is_file():
        raise FileNotFoundError(f"图 '{name}' 不存在")
    return serialize.loads(p.read_text(encoding="utf-8"))


def write_graph(name: str, data: dict) -> None:
    """原子写:temp + replace;JSON 保序(内核 serialize)。"""
    p = graph_path(name)
    fd, tmp = tempfile.mkstemp(dir=p.parent, prefix=".tmp-", suffix=".json")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(serialize.dumps(data))
        os.replace(tmp, p)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def delete_graph(name: str) -> None:
    p = graph_path(name)
    if p.is_file():
        p.unlink()
