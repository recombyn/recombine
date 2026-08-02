# Design Agent Runtime

Call chain, package split, and content boundaries for the backend Design Agent. Implementation is source of truth; this page describes stable conventions.

## Call chain

```text
POST /api/v1/design/run  (api/v1/design.py)
  → orchestrator.run_design_job
      # auth, hold, rules / region, BYOK
      → design_run.design_stream          # public runtime facade
          → graph.build.run_agent_graph  # LangGraph
              → nodes: bootstrap → memory → intent → decide
                       → paint / apply / observe → settle
```

| Caller | Use |
|--------|-----|
| HTTP / harness / integration tests | `services.design.runtime.orchestrator.run_design_job` |
| Orchestration internals (after auth) | `services.design.runtime.design_run.design_stream` |
| Host capabilities (assemble prompts / validate ops) | `services.design.runtime.host` or re-exports from `design_run` |
| Legacy tests / checkpoint serde | `agent_controller` (thin re-export; not the main path) |

Business code should not call `run_agent_graph` directly.

Related HTTP:

| Method | Path | Notes |
|--------|------|-------|
| POST | `/design/run` | SSE main run (`status` / `decision` / `tool_ops` / `token` …) |
| POST | `/design/run/{taskId}/scene` | FE canvas snapshot → `scene_feedback` |
| GET | `/design/catalog` | Public catalog |
| GET | `/design/canvas-tools` | Canvas op capability table |

## `services/design/runtime/` package layout

```text
runtime/
  design_run.py           # public facade: design_stream + host re-exports
  orchestrator.py         # gate + call design_stream; partial bypass
  agent_controller.py     # compat shim (serde / old imports)
  models_route.py         # lane model pick (fast / standard / reasoning / vision / image)
  llm_step.py             # single-step LLM stream / collect
  scene_feedback.py       # FE→BE scene latch
  progress_stages.py      # Cursor-style progress stages
  decision_log.py         # per-run decision trace
  pipeline_support.py     # ref images, user-visible errors, etc.
  flow_runtime.py         # Admin flow-graph walker (not main LangGraph path)
  host/                   # product primitives (not LC/LG builtins)
    prompts.py            # assemble_stage_system / require_prompt_pack …
    placement.py          # placement blocks + free-create checks
    ops_gate.py           # paint ops contract validation
    resources.py          # lazy-load need_* resources
  graph/
    build.py              # StateGraph compile + run_agent_graph
    state.py              # AgentRuntime / schemas / constants
    nodes/                # graph nodes
    emit_sse.py           # SSE / canvas chrome
    llm_io.py             # stream LLM, persona, prompt text
    turns.py              # turn parse, Ask choice UI, decide→paint
    paint_kit.py          # paint tool kit / create_frame
    scene_log.py          # scene digest, admin-step, bump/goto
    support.py            # thin barrel (compat old imports)
```

Conventions:

- **LC/LG** own the graph and stream; **host** owns product logic (prompt packs, placement, resources, ops validation).
- Agent mode: the model decides and executes — no follow-up questions. Ask mode may clarify.
- Placement follows user intent, not ambient FOCUS alone.
- Stage system / paint / ask copy comes from **Admin prompt packs**; missing packs should fail hard — no hardcoded fallbacks in code.
- Validation = contract checks; do not rewrite model intent.

## `services/design/prompts/` (content library)

Split vs runtime: prompts = store and assemble; runtime = execute and SSE.

| Module | Role |
|--------|------|
| `prompt_pack_store.py` | Prompt packs (`paint_system` / `ask_system` / …), seed + DB; `usedBy` marks stages (decide/paint/…) |
| `system_prompt_store.py` | System prompts (agent / aesthetics / persona) |
| `skill_store.py` | Skills: triggers, ACL, `need_skills`, file packs |
| `knowledge_store.py` | Scene/skill knowledge injection |
| `token_store.py` | Design token packs |
| `content_pack.py` | Content pack version stamp |
| `prompt_build.py` / `rules_text.py` | Assembly and rules-text helpers |

Seeds: `apps/api/data/public/design_prompt_packs_seed.json`, `design_skills_seed.json`, `design_skills/`, etc. Skill namespaces: [design_skills/README.md](../apps/api/data/public/design_skills/README.md).

Prompt pack `usedBy` stages: `intent` / `decide` / `paint` / `apply` / `observe` / `resources` / `aesthetics` / `persona` / `precheck` / `orchestrator` / `legacy`, etc. Admin can filter; ensure syncs from seed to DB.

## Related docs

- API overview: [api.md](./api.md)
- Backend layout and seeds: [apps/api/README.md](../apps/api/README.md)
- LangGraph checkpointer: [postgres-switch.md](./postgres-switch.md#langgraph-checkpointer-design-agent--create_agent)
- Architecture: [architecture.md](./architecture.md)
