# Eidolon Graph Editor

可视化**图编辑器**——可视化创建、编辑、校验、预览可执行世界(图资产)。独立仓库独立演化,后续由 eidolon-studio 引用整合(见 docs/graph-kernel-engineering.md:eidolon-graph-editor 是编辑服务,由 eidolon-studio 调用)。

## 在生态中的角色(重要)

本编辑器是 **eidolon-graph 内核的编辑器界面层**,不重实现任何图语义:

- 校验 = 内核 `model.validate`(裸端口 / 交叉连线 / 引用存在性 / 类型兼容 / 信号槽 + 静态提示);
- 编辑操作 = 内核 `engine.edit.apply_edits`(增删节点、增删连线、改配置、换实现);
- 预览 = 内核 `engine.World` **真实运行**(headless `run()`,事件驱动单遍 + RNG seed,确定性可复现)——**编辑器天然是调试器**,预览不需要 dry-run 模式;
- 图资产格式 = 内核 `model.serialize`(保序 JSON,声明顺序承载全局写序)——资产格式先于编辑器存在,编辑器只是图数据的可视化编辑界面。

```
eidolon-graph(内核:模型 + 引擎)
    └── eidolon-graph-editor(本仓库:编辑服务,编辑器内嵌引擎)
            └── eidolon-studio(使用者界面层,引用整合本编辑器)
```

## 数据与项目分离

用户内容(图资产)与源码严格分离:

```
eidolon-graph-editor/
├── backend/               # FastAPI 服务(复用内核)
├── frontend/              # React + Vite + React Flow(画布)
├── workspace/             # gitignored,可经环境变量指向任意目录
│   └── graphs/<name>.json # 图资产,一图一文件
└── scripts/start.sh       # 一键启动
```

- 数据默认在 `workspace/`,可用环境变量 `EIDOLON_GRAPH_EDITOR_DATA` 指向任意目录;
- 图资产是**内核格式**(节点 + 连线 + 配置),不含 UI 坐标——节点摆放位置等表现元数据存前端本地(localStorage),资产与表现分离。

## 运行

### 一键启动(推荐)

```bash
cd eidolon-graph-editor
uv sync                 # 首次:创建 .venv 并安装后端依赖(git 源 pin rev 安装内核)
bash scripts/start.sh   # 同时启动后端(:8000)与前端(:5173);停止:bash scripts/start.sh stop
```

打开 `http://localhost:5173`:从内置节点白名单(Clock/Counter/Threshold/…)拖入画布 → 连线(数据槽/信号槽着色区分:控制端口走信号槽,control-out → data-in 信号连线合法,数据输出连信号槽被拒绝)→ 配置节点 → 预览运行。

内核以 git 源 pin rev 安装(pyproject `[tool.uv.sources]`,当前指向 `f238034`,事件驱动 `World.run()` + 实时自驱调度 + 传播闸门暂停 + 节点库一节点一文件 + 可选参数端口 + 输入缓冲在节点基类 + 数据流同轮收敛)。

### 手动启动

```bash
cd eidolon-graph-editor
uv sync
uv run uvicorn backend.main:app --reload --port 8000   # 后端

cd frontend
npm install
npm run dev                                            # 前端:http://localhost:5173
```

## API(摘要)

| 端点 | 作用 |
|------|------|
| `GET /api/health` | 健康检查 |
| `GET /api/node-types` | 内置节点类型清单(调色板数据源 = 内核协议) |
| `GET /api/graphs` | 图资产清单 |
| `GET /api/graphs/{name}` | 图资产 + 校验报告 |
| `PUT /api/graphs/{name}` | 保存(校验不通过返回 422 + 报告) |
| `DELETE /api/graphs/{name}` | 删除 |
| `POST /api/graphs/{name}/ops` | 编辑操作批量应用(草稿上,不落盘)→ 新图 + 校验报告 |
| `POST /api/preview/start` | 运行按钮:新建会话并启动世界(实时自驱,校验不通过 422 + 报告)→ session id |
| `WS /api/preview/sessions/{sid}/ws` | 运行中状态推送:世界自驱(事件源 = 节点),快照 + 控制台 + 日志 |
| `POST /api/preview/sessions/{sid}/inject` | 注入宿主事件(手动触发,Input 节点)——与节点产出数据向后传播同构 |
| `POST /api/preview/sessions/{sid}/pause` | 暂停 = 传播闸门:内部照常运行,输出投递挂起 |
| `POST /api/preview/sessions/{sid}/resume` | 恢复:冲刷挂起投递并完成级联传递 |
| `DELETE /api/preview/sessions/{sid}` | 停止会话,销毁世界 |

编辑操作(`ops`)的 JSON 形态是内核 EditOp 的 HTTP 编解码:

```json
{"op": "add_node",    "node": {"node_id": "c1", "type_name": "Clock", "config": {}}}
{"op": "remove_node", "node_id": "c1"}
{"op": "add_edge",    "wire": {"src_node": "clock", "src_port": "count", "dst_node": "counter", "dst_port": "increment", "dst_slot": "data"}}
{"op": "remove_edge", "wire": {…}}
{"op": "set_config",  "node_id": "threshold", "config": {"limit": 5}}
{"op": "change_impl", "node_id": "n1", "new_type_name": "…"}
```

## V0 范围与后续路线

V0:内核节点库(一节点一文件,含 Output 日志输出 / Input 手动输入 / Random 随机函数)+ 单图画布 + 校验报告 + 事件驱动运行(顶栏右侧平铺「运行/暂停/结束」,世界自驱——源节点按自身规则发事件,Clock 默认每秒一次;暂停 = 传播闸门;运行中图锁定编辑;「文件」菜单:新建/载入/重命名/保存/删除;「终端」菜单:控制台收起/展开;种子每图自动随机)。编辑器不定义节点——节点全部归属内核,编辑器只对特殊节点做展示对接(读 Output 状态喂控制台、为 Input 渲染输入栏)。

后续(独立演化):
1. 运行会话增强(暂停/恢复/事件注入——内核 `run(events)` 已就位,编辑器作为调试器的完整形态);
2. 子图编辑(定义节点 = 带接口声明的子图封装,可视化类型编辑);
3. 节点类型资产编辑与宿主实现注册界面(领域节点 stub 注入);
4. 撤销/重做、多选批量操作;
5. 卡带目录完整布局(node_types/、globals.json、快照存档)。
