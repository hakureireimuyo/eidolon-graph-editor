"""图编辑服务测试:校验 / 编辑操作编解码与草稿应用 / 运行会话 / 工作区原子写。

只测服务层纯逻辑(不测 HTTP 与前端):前端改动由用户手动验证。

内核语义(阶段零,事件驱动):
- 运行 = 实时自驱会话:事件源 = 节点自身(Clock 按 rate 每秒一次),宿主不伪造
  事件、不推进节奏;反馈环跨发射迭代;停止即静止;
- 连线带 dst_slot(data|signal):信号源 = 控制输出或数据输出的信号端口;
- 节点声明顺序影响同一次单遍内的级联传播(旧内核"顺序无关"性质不成立)。
"""

import json
import time

import pytest

from eidolon_graph.model import ValidationError, serialize

from backend import service, workspace


def _wait_for(predicate, timeout=8.0):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return True
        time.sleep(0.05)
    return False


def _console_lines(view):
    """控制台条目(追加式 dict 列表)→ [(node, line)] 便于断言。"""
    return [(e["node"], e["line"]) for e in view["console"]]

LOOP = {
    "name": "loop",
    "kernel_version": "1.0.0-0",
    "nodes": [
        {"node_id": "clock", "type_name": "Clock", "config": {}},
        {"node_id": "counter", "type_name": "Counter", "config": {}},
        {"node_id": "threshold", "type_name": "Threshold", "config": {"limit": 5}},
        {"node_id": "printer", "type_name": "Output", "config": {}},
    ],
    "wires": [
        {"src_node": "clock", "src_port": "count", "dst_node": "counter", "dst_port": "increment"},
        {"src_node": "counter", "src_port": "count", "dst_node": "threshold", "dst_port": "value"},
        {"src_node": "threshold", "src_port": "over", "dst_node": "printer", "dst_port": "msg"},
        {"src_node": "printer", "src_port": "echo", "dst_node": "clock", "dst_port": "rate"},
        # 控制输出 → 控制输入:信号槽(内核要求 dst_slot='signal')
        {"src_node": "threshold", "src_port": "under", "dst_node": "clock", "dst_port": "enable",
         "dst_slot": "signal"},
    ],
}


def test_node_types_payload_includes_doc():
    """调色板数据源附带节点说明书:内核 doc() 结构化文本随类型资产下发。"""
    lib, registry = service.builtin_env()
    payload = service.node_types_payload(lib, registry)
    by_name = {s["name"]: s for s in payload}
    assert set(by_name) == set(lib.node_types.keys())
    for spec in payload:
        assert "doc" in spec  # 每个节点都带 doc 字段(无说明为默认空文档)
    timer = by_name["Timer"]
    assert timer["doc"]["summary"]  # 概要
    assert timer["doc"]["sections"][0]["title"]  # 分节
    assert all(isinstance(l, str) for l in timer["doc"]["sections"][0]["lines"])


def test_validate_graph_dict():
    lib, _ = service.builtin_env()
    assert service.validate_graph_dict(LOOP, lib).ok
    broken = {"name": "b", "kernel_version": "1.0.0-0",
             "nodes": [{"node_id": "n", "type_name": "Clock", "config": {}},
                       {"node_id": "x", "type_name": "Counter", "config": {}}],
              "wires": [{"src_node": "n", "src_port": "count",
                         "dst_node": "x", "dst_port": "count"}]}  # 数据输出连数据输出
    report = service.validate_graph_dict(broken, lib)
    assert not report.ok and any("不是输入端口" in e for e in report.errors)


def test_validate_signal_slot_rules():
    """dst_slot 语义:控制输出必须走信号槽;信号槽连数据输入是唯一合法交叉。

    注意:输入组端口必须连线或绑定(内核强校验),故测试图需把 judge/print
    组的数据输入全部接上,再单独验证信号槽规则。
    """
    lib, _ = service.builtin_env()
    cross = {"name": "c", "kernel_version": "1.0.0-0",
             "nodes": [{"node_id": "clk", "type_name": "Clock", "config": {}},
                       {"node_id": "t", "type_name": "Threshold", "config": {"limit": 1}},
                       {"node_id": "p", "type_name": "Output", "config": {}}],
             "wires": [
                 {"src_node": "clk", "src_port": "count", "dst_node": "t", "dst_port": "value"},
                 {"src_node": "t", "src_port": "over", "dst_node": "p", "dst_port": "msg"},
                 # 控制输出 → 数据输入,不带 dst_slot(缺省 data)
                 {"src_node": "t", "src_port": "under", "dst_node": "p", "dst_port": "msg"},
             ]}
    report = service.validate_graph_dict(cross, lib)
    assert not report.ok and any("只能连信号槽" in e for e in report.errors)
    # 同一条线带 dst_slot='signal' → 合法(control-out → data-in 信号,显式屏蔽)
    cross["wires"][2]["dst_slot"] = "signal"
    assert service.validate_graph_dict(cross, lib).ok
    # 数据输出带 dst_slot='signal' → 合法(信号端口显式路由)
    route = {"name": "b", "kernel_version": "1.0.0-0",
             "nodes": [{"node_id": "n", "type_name": "Clock", "config": {}},
                       {"node_id": "x", "type_name": "Counter", "config": {}}],
             "wires": [{"src_node": "n", "src_port": "count", "dst_node": "x", "dst_port": "increment"},
                       {"src_node": "n", "src_port": "count", "dst_node": "x", "dst_port": "increment",
                        "dst_slot": "signal"}]}
    assert service.validate_graph_dict(route, lib).ok
    # 数据输出数据槽连控制输入 → 交叉连线(数据线不能进控制端口)
    bad = {"name": "c", "kernel_version": "1.0.0-0",
           "nodes": [{"node_id": "n", "type_name": "Clock", "config": {}},
                     {"node_id": "g", "type_name": "AND", "config": {}}],
           "wires": [{"src_node": "n", "src_port": "count", "dst_node": "g", "dst_port": "a"}]}
    report = service.validate_graph_dict(bad, lib)
    assert not report.ok and any("交叉连线" in e for e in report.errors)


def test_ops_apply_on_draft():
    lib, _ = service.builtin_env()
    graph = service.decode_graph(LOOP)
    # 加节点 + 连线:合法(注意内核禁止扇入——端口不能接第二个来源)
    ops = [{"op": "add_node", "node": {"node_id": "rng1", "type_name": "Random", "config": {}}},
           {"op": "add_node", "node": {"node_id": "counter2", "type_name": "Counter", "config": {}}},
           {"op": "add_edge", "wire": {"src_node": "rng1", "src_port": "draw",
                                       "dst_node": "counter2", "dst_port": "increment"}}]
    draft, report = service.apply_ops(graph, ops, lib)
    assert report.ok and "rng1" in draft.node_map() and "counter2" in draft.node_map()
    # 交叉连线(数据输出 → 控制输入):应用成功但校验报错(草稿允许中间态,保存时才拦)
    draft2, report2 = service.apply_ops(draft, [{
        "op": "add_edge",
        "wire": {"src_node": "clock", "src_port": "count",
                 "dst_node": "clock", "dst_port": "enable"}}], lib)
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


def test_wire_codec_dst_slot_roundtrip():
    """_wire_of 透传 dst_slot;缺省为 data。"""
    lib, _ = service.builtin_env()
    graph = service.decode_graph(LOOP)
    # 无 dst_slot → 缺省 data;带 dst_slot='signal' → 保留
    ops = [{"op": "add_edge", "wire": {"src_node": "clock", "src_port": "count",
                                       "dst_node": "printer", "dst_port": "msg"}},
           {"op": "add_edge", "wire": {"src_node": "threshold", "src_port": "under",
                                       "dst_node": "printer", "dst_port": "msg",
                                       "dst_slot": "signal"}}]
    draft, _ = service.apply_ops(graph, ops, lib)
    wires = {w.src_port: w.dst_slot for w in draft.wires}
    assert wires["count"] == "data"
    assert wires["under"] == "signal"
    # 序列化往返不丢 dst_slot
    back = service.decode_graph(serialize.graph_to_dict(draft))
    assert {w.src_port: w.dst_slot for w in back.wires} == wires


def test_session_realtime_runs_and_stops():
    """运行会话:世界自驱(事件源 = 节点),启动即发第一次事件;停止即销毁。"""
    lib, registry = service.builtin_env()
    sid = service.start_session(service.decode_graph(LOOP), lib, registry, seed=0)
    assert _wait_for(lambda: service.session_view(sid) is not None
                     and service.session_view(sid)["run_no"] >= 1)
    assert service.stop_session(sid)
    assert service.session_view(sid) is None
    assert not service.session_alive(sid)
    assert not service.stop_session(sid)


def test_session_feedback_gating():
    """反馈环跨发射迭代:threshold 门控 clock,计数封顶后不再增长。"""
    lib, registry = service.builtin_env()
    sid = service.start_session(service.decode_graph(LOOP), lib, registry, seed=0)
    limit = LOOP["nodes"][2]["config"]["limit"]

    def gated():
        view = service.session_view(sid)
        if view is None or view["run_no"] < 3:
            return False
        return view["snapshot"]["nodes"]["clock"]["control_in_levels"]["enable"] == "inactive"

    assert _wait_for(gated)
    view = service.session_view(sid)
    counter_count = view["snapshot"]["nodes"]["counter"]["state"]["count"]
    assert counter_count <= limit + 1  # 门控生效,而非一路增长
    service.stop_session(sid)


def test_output_node_console():
    """内核 Output 日志输出节点:Clock 事件逐行累积,console 追加式收录带节点名/编号。"""
    lib, registry = service.builtin_env()
    graph = {"name": "out", "kernel_version": "1.0.0-0",
             "nodes": [{"node_id": "clock", "type_name": "Clock", "config": {}},
                       {"node_id": "out", "type_name": "Output", "config": {}}],
             "wires": [{"src_node": "clock", "src_port": "count",
                        "dst_node": "out", "dst_port": "msg"}]}
    assert service.validate_graph_dict(graph, lib).ok  # Output 已在宿主环境注册
    sid = service.start_session(service.decode_graph(graph), lib, registry)
    assert _wait_for(lambda: service.session_view(sid) is not None
                     and len(service.session_view(sid)["console"]) >= 3)
    view = service.session_view(sid)
    assert _console_lines(view)[:3] == [("out", "1"), ("out", "2"), ("out", "3")]
    assert view["console"][0]["name"] == "Output"  # 条目带节点名(前端拼前缀)
    service.stop_session(sid)


def test_two_outputs_sync_console():
    """一个 Clock 连两个 Output:每拍两行同步输出、恰好各一次,无丢行/重复行。

    回归:按节点声明序重建完整控制台再按总行数取增量,靠前节点的新行落在
    列表中间会被前端增量截断(丢行 + 重复行)——追加式收录修复后,两个
    输出的行按拍序交替出现。
    """
    lib, registry = service.builtin_env()
    graph = {"name": "out2", "kernel_version": "1.0.0-0",
             "nodes": [{"node_id": "clock", "type_name": "Clock", "config": {}},
                       {"node_id": "oa", "type_name": "Output", "config": {}},
                       {"node_id": "ob", "type_name": "Output", "config": {}}],
             "wires": [{"src_node": "clock", "src_port": "count", "dst_node": "oa", "dst_port": "msg"},
                       {"src_node": "clock", "src_port": "count", "dst_node": "ob", "dst_port": "msg"}]}
    assert service.validate_graph_dict(graph, lib).ok
    sid = service.start_session(service.decode_graph(graph), lib, registry)
    assert _wait_for(lambda: service.session_view(sid) is not None
                     and len(service.session_view(sid)["console"]) >= 6)
    view = service.session_view(sid)
    lines = _console_lines(view)
    # 前六行:每拍 oa/ob 各一行、值相同(扇出同步),拍序交替
    assert lines[:6] == [("oa", "1"), ("ob", "1"),
                         ("oa", "2"), ("ob", "2"),
                         ("oa", "3"), ("ob", "3")]
    # 无重复无遗漏:每个节点连续行号严格递增且无重复
    for node in ("oa", "ob"):
        seq = [int(l) for n, l in lines if n == node]
        assert seq == list(range(1, len(seq) + 1))
    service.stop_session(sid)


def test_start_session_rejects_invalid_graph():
    lib, registry = service.builtin_env()
    broken = {"name": "b", "kernel_version": "1.0.0-0",
              "nodes": [{"node_id": "n", "type_name": "NoSuch", "config": {}}],
              "wires": []}
    try:
        service.start_session(service.decode_graph(broken), lib, registry)
    except ValidationError as e:
        assert any("未声明" in x for x in e.report.errors)
    else:
        raise AssertionError("无效图应抛 ValidationError")


def test_random_function_node():
    """内核 Random 随机函数节点:Clock.count → num 触发,确定性输出可复现。"""
    from eidolon_graph.engine.rng import Rng, derive_seed
    lib, registry = service.builtin_env()
    graph = {"name": "rnd", "kernel_version": "1.0.0-0",
             "nodes": [{"node_id": "clock", "type_name": "Clock", "config": {}},
                       {"node_id": "r1", "type_name": "Random",
                        "config": {"seed": 7, "range": 10}},
                       {"node_id": "out", "type_name": "Output", "config": {}}],
             "wires": [{"src_node": "clock", "src_port": "count", "dst_node": "r1", "dst_port": "num"},
                       {"src_node": "r1", "src_port": "draw", "dst_node": "out", "dst_port": "msg"}]}
    assert service.validate_graph_dict(graph, lib).ok  # Random 在内核节点库注册
    sid = service.start_session(service.decode_graph(graph), lib, registry)
    assert _wait_for(lambda: service.session_view(sid) is not None
                     and len(service.session_view(sid)["console"]) >= 1)
    # 首次数值 = f(seed=7, num=1, range=10):确定性可复现
    expected = Rng(derive_seed(7, "1")).next_int(10)
    assert _console_lines(service.session_view(sid))[0] == ("out", str(expected))
    service.stop_session(sid)


def test_random_only_seed_wired():
    """只连 seed 也产生事件(输入组=函数):random(num=默认, seed=clock.output, range=默认)。"""
    from eidolon_graph.engine.rng import Rng, derive_seed
    lib, registry = service.builtin_env()
    graph = {"name": "rnd", "kernel_version": "1.0.0-0",
             "nodes": [{"node_id": "clock", "type_name": "Clock", "config": {}},
                       {"node_id": "r1", "type_name": "Random",
                        "config": {"num": 10, "range": 100}},
                       {"node_id": "out", "type_name": "Output", "config": {}}],
             "wires": [{"src_node": "clock", "src_port": "count", "dst_node": "r1", "dst_port": "seed"},
                       {"src_node": "r1", "src_port": "draw", "dst_node": "out", "dst_port": "msg"}]}
    assert service.validate_graph_dict(graph, lib).ok
    sid = service.start_session(service.decode_graph(graph), lib, registry)
    assert _wait_for(lambda: service.session_view(sid) is not None
                     and len(service.session_view(sid)["console"]) >= 1)
    expected = Rng(derive_seed(1, "10")).next_int(100)
    assert _console_lines(service.session_view(sid))[0] == ("out", str(expected))
    service.stop_session(sid)


def test_input_node_inject_propagates():
    """Input 宿主节点:注入事件 → 输出事件向后传播,与节点产出数据同构。"""
    lib, registry = service.builtin_env()
    graph = {"name": "in", "kernel_version": "1.0.0-0",
             "nodes": [{"node_id": "in1", "type_name": "Input", "config": {}},
                       {"node_id": "out", "type_name": "Output", "config": {}}],
             "wires": [{"src_node": "in1", "src_port": "out",
                        "dst_node": "out", "dst_port": "msg"}]}
    assert service.validate_graph_dict(graph, lib).ok  # Input 已在宿主环境注册
    sid = service.start_session(service.decode_graph(graph), lib, registry)
    assert service.inject_event(sid, "in1", "in", "你好,世界")
    assert _wait_for(lambda: service.session_view(sid) is not None
                     and ("out", "你好,世界") in _console_lines(service.session_view(sid)))
    view = service.session_view(sid)
    assert view["snapshot"]["nodes"]["in1"]["state"]["last"] == "你好,世界"
    # 同值重复注入同样产出:手动点击每次都是新事件(内核不做值去重)
    assert service.inject_event(sid, "in1", "in", "你好,世界")
    assert _wait_for(lambda: _console_lines(service.session_view(sid)).count(("out", "你好,世界")) == 2)
    assert service.inject_event(sid, "in1", "in", "第二条")
    assert _wait_for(lambda: ("out", "第二条") in _console_lines(service.session_view(sid)))
    assert _console_lines(service.session_view(sid)).count(("out", "你好,世界")) == 2
    service.stop_session(sid)
    assert not service.inject_event(sid, "in1", "in", "x")


def test_session_pause_resume():
    """暂停 = 传播闸门:源节点内部继续发射,输出结果不向后传播;恢复后冲刷补全。"""
    lib, registry = service.builtin_env()
    sid = service.start_session(service.decode_graph(LOOP), lib, registry, seed=0)
    assert _wait_for(lambda: service.session_view(sid) is not None
                     and service.session_view(sid)["run_no"] >= 1)
    assert service.pause_session(sid)
    time.sleep(1.3)  # 暂停期间 clock 内部继续计数,counter 冻结
    view = service.session_view(sid)
    clock_count = view["snapshot"]["nodes"]["clock"]["state"]["count"]
    assert clock_count >= 2  # 内部仍在运行
    assert view["snapshot"]["nodes"]["counter"]["state"]["count"] == 1  # 传递停住
    assert service.resume_session(sid)
    # 恢复:冲刷挂起投递,counter 补上暂停期间的最新 count
    assert _wait_for(lambda: service.session_view(sid)["snapshot"]["nodes"]
                     ["counter"]["state"]["count"] >= 1 + clock_count)
    service.stop_session(sid)
    assert not service.pause_session(sid)


def test_workspace_roundtrip_and_atomic_write(tmp_path, monkeypatch):
    """目录工程存取:图资产 + 编辑器元数据(坐标/种子)随工程往返。"""
    from eidolon_graph_project import GraphProject

    monkeypatch.setattr(workspace, "DATA_ROOT", tmp_path)
    assert workspace.list_projects() == []
    workspace.write_project("测试 世界", GraphProject(
        graph=dict(LOOP),
        editor_state={"version": 1, "seed": 7, "positions": {"clock": {"x": 1.5, "y": 2.5}}},
    ))
    assert workspace.list_projects() == ["测试-世界"]
    loaded = workspace.read_project("测试 世界")
    assert loaded.graph == LOOP  # 保序往返
    assert loaded.positions() == {"clock": {"x": 1.5, "y": 2.5}}  # 坐标随工程
    assert loaded.seed() == 7  # 种子随工程(读档续跑确定性可复现)
    # 原子写不产生残留 temp 文件
    assert [p.name for p in workspace.projects_dir().iterdir()] == ["测试-世界"]
    workspace.delete_project("测试 世界")
    assert workspace.list_projects() == []
    # 名称安全化:路径穿越等非法字符被清洗
    assert workspace.project_dir("a/b\\c").name == "a-b-c"


def test_workspace_legacy_graphs_migrated(tmp_path, monkeypatch):
    """旧版 V0 一图一文件(graphs/<name>.json)首次访问时迁移为目录工程。"""
    monkeypatch.setattr(workspace, "DATA_ROOT", tmp_path)
    legacy_dir = tmp_path / "graphs"
    legacy_dir.mkdir(parents=True)
    (legacy_dir / "旧图.json").write_text(json.dumps(LOOP), encoding="utf-8")
    assert workspace.list_projects() == ["旧图"]  # 迁移发生在列表时
    loaded = workspace.read_project("旧图")
    assert loaded.graph == LOOP  # 图资产原样
    assert loaded.positions() == {}  # 元数据默认重建
    assert (tmp_path / "projects" / "旧图" / "project.json").is_file()


# ---------------------------------------------------------------------------
# 脚本节点(1.2:内嵌脚本自定义节点,保存/加载/注册)
# ---------------------------------------------------------------------------

SCRIPT_ADDER = '''
class Node:
    """两数相加。"""
    data_in = [DataIn("a", Annot(int)), DataIn("b", Annot(int))]
    data_out = [DataOut("sum", Annot(int))]
    groups = [InputGroup("add", inputs=["a", "b"], outputs=["sum"])]

    def tick(self, ctx):
        return {"sum": ctx.a + ctx.b}
'''


def test_script_node_save_load_and_registration(tmp_path, monkeypatch):
    """保存 → 清单可见 → builtin_env 注册(调色板 node-types 自动携带)→ 可校验。"""
    monkeypatch.setattr(workspace, "DATA_ROOT", tmp_path)
    service.save_script_node("ScriptAdder", SCRIPT_ADDER)
    # 清单
    scripts = workspace.list_scripts()
    assert scripts == [{"type_name": "ScriptAdder", "source": SCRIPT_ADDER}]
    # 注册进资产库:node-types payload 可见(kind=script)
    lib, registry = service.builtin_env()
    payload = service.node_types_payload(lib, registry)
    by = {s["name"]: s for s in payload}
    assert "ScriptAdder" in by
    assert by["ScriptAdder"]["impl"]["kind"] == "script"
    assert by["ScriptAdder"]["impl"]["source"] == SCRIPT_ADDER
    # 图引用脚本节点:校验通过、可预览运行
    g = {"name": "t", "kernel_version": "1.0.0-0",
         "nodes": [{"node_id": "a", "type_name": "ScriptAdder", "config": {}},
                   {"node_id": "ia", "type_name": "Input", "config": {}},
                   {"node_id": "ib", "type_name": "Input", "config": {}}],
         "wires": [{"src_node": "ia", "src_port": "out", "dst_node": "a", "dst_port": "a"},
                   {"src_node": "ib", "src_port": "out", "dst_node": "a", "dst_port": "b"}]}
    assert service.validate_graph_dict(g, lib).ok
    # 删除后清单与注册消失
    assert service.delete_script_node("ScriptAdder")
    assert workspace.list_scripts() == []
    lib2, _ = service.builtin_env()
    assert "ScriptAdder" not in lib2.node_types


def test_script_node_rejects_bad_source(tmp_path, monkeypatch):
    """编译失败(语法/声明错误)拒绝保存,不落盘。"""
    monkeypatch.setattr(workspace, "DATA_ROOT", tmp_path)
    with pytest.raises(Exception, match="语法错误"):
        service.save_script_node("Broken", "class Node:\n  def tick( self:")
    assert workspace.list_scripts() == []


def test_script_node_duplicate_name_rejected(tmp_path, monkeypatch):
    """与内置节点重名:保存即拒绝(调色板/资产库不会出现歧义)。"""
    monkeypatch.setattr(workspace, "DATA_ROOT", tmp_path)
    with pytest.raises(Exception, match="重名"):
        service.save_script_node("Clock", SCRIPT_ADDER)
    assert workspace.list_scripts() == []
