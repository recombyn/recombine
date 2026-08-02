# Design Agent Runtime

后端 Design Agent 的调用链、包划分与内容边界。实现以代码为准；本页描述稳定约定。

## 调用链

```text
POST /api/v1/design/run  (api/v1/design.py)
  → orchestrator.run_design_job
      # 权限、hold、rules / region、BYOK
      → design_run.design_stream          # runtime 公开 facade
          → graph.build.run_agent_graph  # LangGraph
              → nodes: bootstrap → memory → intent → decide
                       → paint / apply / observe → settle
```

| 调用方 | 应使用 |
|--------|--------|
| HTTP / harness / 集成测试 | `services.design.runtime.orchestrator.run_design_job` |
| 编排内部（已过权限） | `services.design.runtime.design_run.design_stream` |
| Host 能力（拼 prompt / 校验 ops） | `services.design.runtime.host` 或 `design_run` 再导出 |
| 旧测试 / checkpoint serde | `agent_controller`（薄 re-export，非主路径） |

业务代码不要直接调用 `run_agent_graph`。

相关 HTTP：

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/design/run` | SSE 主跑（`status` / `decision` / `tool_ops` / `token` …） |
| POST | `/design/run/{taskId}/scene` | FE 回传画布快照 → `scene_feedback` |
| GET | `/design/catalog` | 公开 catalog |
| GET | `/design/canvas-tools` | 画布 op 能力表 |

## `services/design/runtime/` 包结构

```text
runtime/
  design_run.py           # 公开 facade：design_stream + host 再导出
  orchestrator.py         # 门禁 + 调 design_stream；partial 旁路
  agent_controller.py     # 兼容 shim（serde / 旧 import）
  models_route.py         # lane 选模（fast / standard / reasoning / vision / image）
  llm_step.py             # 单步 LLM stream / collect
  scene_feedback.py       # FE→BE 场景闩锁
  progress_stages.py      # Cursor 风格进度阶段
  decision_log.py         # 单次 run decision trace
  pipeline_support.py     # ref 图、用户可见错误等
  flow_runtime.py         # Admin 流程图 walker（非主 LangGraph 路径）
  host/                   # 产品侧原语（非 LC/LG 内置）
    prompts.py            # assemble_stage_system / require_prompt_pack …
    placement.py          # 放置块与 free-create 校验
    ops_gate.py           # paint ops 契约校验
    resources.py          # 延迟加载 need_* 资源
  graph/
    build.py              # StateGraph 编译 + run_agent_graph
    state.py              # AgentRuntime / schemas / 常量
    nodes/                # 图节点
    emit_sse.py           # SSE / canvas chrome
    llm_io.py             # stream LLM、persona、prompt text
    turns.py              # turn parse、Ask choice UI、decide→paint
    paint_kit.py          # paint tool kit / create_frame
    scene_log.py          # scene digest、admin-step、bump/goto
    support.py            # 薄 barrel（兼容旧 import）
```

约定：

- **LC/LG** 管图与流；**host** 管产品逻辑（prompt pack、放置、资源、ops 校验）。
- Agent 模式由模型决策并执行，不追问；Ask 模式可澄清。
- 放置跟用户意图，不单靠 ambient FOCUS。
- Stage system / paint / ask 等文案来自 **Admin prompt packs**；缺 pack 应失败，不在代码里硬编码兜底。
- Validation = 契约检查，不改写模型意图。

## `services/design/prompts/`（内容库）

与 runtime 分工：prompts = 存取与组装；runtime = 执行与 SSE。

| 模块 | 职责 |
|------|------|
| `prompt_pack_store.py` | Prompt packs（`paint_system` / `ask_system` / …），seed + DB；字段 `usedBy` 标注阶段（decide/paint/…） |
| `system_prompt_store.py` | 系统提示（agent / aesthetics / persona） |
| `skill_store.py` | Skills：触发、ACL、`need_skills`、文件包 |
| `knowledge_store.py` | 场景/技能知识注入 |
| `token_store.py` | Design token packs |
| `content_pack.py` | Content pack 版本戳 |
| `prompt_build.py` / `rules_text.py` | 拼装与规则文本工具 |

种子：`apps/api/data/public/design_prompt_packs_seed.json`、`design_skills_seed.json`、`design_skills/` 等。Skill 命名空间见 [design_skills/README.md](../apps/api/data/public/design_skills/README.md)。

Prompt pack 的 `usedBy`（阶段）：`intent` / `decide` / `paint` / `apply` / `observe` / `resources` / `aesthetics` / `persona` / `precheck` / `orchestrator` / `legacy` 等。Admin 可筛；ensure 时从 seed 同步到 DB。

## 相关文档

- API 概览：[api.md](./api.md)
- 后端目录与种子：[apps/api/README.md](../apps/api/README.md)
- LangGraph checkpointer：[postgres-switch.md](./postgres-switch.md#langgraph-checkpointer-design-agent--create_agent)
- 总架构：[architecture.md](./architecture.md)
