"""图编辑服务测试:校验 / 编辑操作编解码与草稿应用 / headless 预览确定性 / 工作区原子写。

只测服务层纯逻辑(不测 HTTP 与前端):前端改动由用户手动验证。
"""

from eidolon_graph.model import serialize

from backend import service, workspace

LOOP = {
    "name": "loop",
    "kernel_version": "0.1.0-0",
    "nodes": [
        {"node_id": "clock", "type_name": "Clock", "config": {}},
        {"node_id": "counter", "type_name": "Counter", "config": {}},
        {"node_id": "threshold", "type_name": "Threshold", "config": {"limit": 5}},
        {"node_id": "printer", "type_name": "Printer", "config": {}},
    ],
    "wires": [
        {"src_node": "clock", "src_port": "count", "dst_node": "counter", "dst_port": "increment"},
        {"src_node": "counter", "src_port": "count", "dst_node": "threshold", "dst_port": "value"},
        {"src_node": "threshold", "src_port": "over", "dst_node": "printer", "dst_port": "msg"},
        {"src_node": "printer", "src_port": "echo", "dst_node": "clock", "dst_port": "rate"},
        {"src_node": "threshold", "src_port": "under", "dst_node": "clock", "dst_port": "enable"},
    ],
}


def test_validate_graph_dict():
    lib, _ = service.builtin_env()
    assert service.validate_graph_dict(LOOP, lib).ok
    broken = {"name": "b", "nodes": [{"node_id": "n", "type_name": "Clock", "config": {}},
                                     {"node_id": "x", "type_name": "Counter", "config": {}}],
              "wires": [{"src_node": "n", "src_port": "count",
                         "dst_node": "x", "dst_port": "count"}]}  # 数据输出连数据输出
    report = service.validate_graph_dict(broken, lib)
    assert not report.ok and any("不是输入端口" in e for e in report.errors)


def test_ops_apply_on_draft():
    lib, _ = service.builtin_env()
    graph = service.decode_graph(LOOP)
    # 加节点 + 连线:合法
    ops = [{"op": "add_node", "node": {"node_id": "rng1", "type_name": "Random", "config": {}}},
           {"op": "add_edge", "wire": {"src_node": "rng1", "src_port": "draw",
                                       "dst_node": "printer", "dst_port": "msg"}}]
    draft, report = service.apply_ops(graph, ops, lib)
    assert report.ok and "rng1" in draft.node_map()
    # 交叉连线:应用成功但校验报错(草稿允许中间态,保存时才拦)
    draft2, report2 = service.apply_ops(draft, [{
        "op": "add_edge",
        "wire": {"src_node": "threshold", "src_port": "under",
                 "dst_node": "printer", "dst_port": "msg"}}], lib)
    assert not report2.ok and any("交叉连线" in e for e in report2.errors)
    # 删连线 / 改配置 / 删节点
    draft3, report3 = service.apply_ops(draft, [
        {"op": "remove_edge", "wire": {"src_node": "threshold", "src_port": "over",
                                       "dst_node": "printer", "dst_port": "msg"}},
        {"op": "set_config", "node_id": "threshold", "config": {"limit": 10}},
        {"op": "remove_node", "node_id": "printer"},
    ], lib)
    assert report3.ok
    assert "printer" not in draft3.node_map()
    assert draft3.node_map()["threshold"].config["limit"] == 10
    # 未知操作 / 结构错误 → ValueError
    try:
        service.apply_ops(graph, [{"op": "nope"}], lib)
    except ValueError:
        pass
    else:
        raise AssertionError("未知操作应抛 ValueError")


def test_preview_deterministic_and_order_independent():
    lib, registry = service.builtin_env()
    r1 = service.run_preview(service.decode_graph(LOOP), lib, registry, ticks=4, seed=42, trace=True)
    r2 = service.run_preview(service.decode_graph(LOOP), lib, registry, ticks=4, seed=42, trace=True)
    assert r1["ok"] and r2["ok"]
    assert r1["final"] == r2["final"]  # 同图同 seed:确定性可复现
    assert [t["tick"] for t in r1["traces"]] == [1, 2, 3, 4]  # 快照拍于每轮完成后的轮界
    # 节点声明顺序无关(内核验收性质在编辑器服务内同样成立)
    shuffled = dict(LOOP, nodes=list(reversed(LOOP["nodes"])))
    r3 = service.run_preview(service.decode_graph(shuffled), lib, registry, ticks=4, seed=42)
    assert r3["final"] == r1["final"]


def test_preview_rejects_invalid_graph():
    lib, registry = service.builtin_env()
    broken = {"name": "b", "nodes": [{"node_id": "n", "type_name": "NoSuch", "config": {}}],
              "wires": []}
    r = service.run_preview(service.decode_graph(broken), lib, registry)
    assert not r["ok"] and any("未声明" in e for e in r["report"]["errors"])


def test_workspace_roundtrip_and_atomic_write(tmp_path, monkeypatch):
    monkeypatch.setattr(workspace, "DATA_ROOT", tmp_path)
    assert workspace.list_graphs() == []
    workspace.write_graph("测试 世界", LOOP)
    assert workspace.list_graphs() == ["测试-世界"]
    assert workspace.read_graph("测试 世界") == LOOP  # 保序往返
    # 原子写不产生残留 temp 文件
    assert [p.name for p in workspace.graphs_dir().iterdir()] == ["测试-世界.json"]
    workspace.delete_graph("测试 世界")
    assert workspace.list_graphs() == []
    # 名称安全化:路径穿越等非法字符被清洗
    assert workspace.graph_path("a/b\\c").name == "a-b-c.json"
