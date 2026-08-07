# Design Agent Runtime

Call chain, package layout, **run lifecycle**, HITL patterns, and **what to extend** (Skills / prompt packs / aesthetics corpus). Implementation is source of truth; this page describes stable conventions.

## Call chain

```text
POST /api/v1/design/run  (app/api/routes/design.py)
  → orchestrator.run_design_job
      # auth, hold, rules / region, BYOK
      → design_run.design_stream          # public runtime facade
          → graph.build.run_agent_graph  # LangGraph
              → bootstrap
                   ├─ apply_ops? → apply_confirm → observe → settle
                   └─ memory → intent → decide → paint_ops
                        ├─ Ask + ops → propose → settle   # await user Confirm
                        └─ Agent → action → observe → settle
                             └─ critique fail / op fail → paint_ops (retry)
```

| Caller | Use |
|--------|-----|
| HTTP / harness / integration tests | `services.design.runtime.orchestrator.run_design_job` |
| Orchestration internals (after auth) | `services.design.runtime.design_run.design_stream` |
| Host capabilities (assemble prompts / validate ops) | `services.design.runtime.host` or re-exports from `design_run` |
| Legacy tests / checkpoint serde | `agent_controller` (thin re-export; not the main path) |

Business code should not call `run_agent_graph` directly.

### Related HTTP

| Method | Path | Notes |
|--------|------|-------|
| POST | `/design/run` | SSE main run (`status` / `decision` / `tool_ops` / `token` / `result` …) |
| POST | `/design/run/{taskId}/scene` | FE canvas snapshot → scene wait / interrupt resume |
| POST | `/design/run/{taskId}/pause` | Durable pause intent |
| POST | `/design/run/{taskId}/cancel` | Cancel + optional refund |
| POST | `/design/run/{taskId}/resume` | SSE resume from checkpoint |
| GET | `/design/catalog` | Public catalog |
| GET | `/design/canvas-tools` | Canvas op capability table |

Ask confirm body fields on `/design/run`: `apply_ops`, optional `proposal_id` + `proposal_task_id` (server prefers stored `meta.ask_proposal` when ids match).

---

## LC / LG stack (LangChain + LangGraph)

Design Agent is a **two-layer** setup. Do not confuse the outer product graph with the inner model/tool helpers.

| Layer | Library | Owns | Does not own |
|-------|---------|------|--------------|
| **Outer graph** | **LangGraph** `StateGraph` | Node order, `Command(goto=…)`, checkpointer, `interrupt` / resume driver, run lease | Prompt pack text, placement heuristics, op contract rewrite |
| **Inside nodes** | **LangChain** (+ optional `create_agent`) | Chat model I/O, structured output (`ainvoke_structured` / `response_format`), tool schemas | Product stage routing (that is the outer graph) |
| **Host** | `runtime/host/` | Assemble prompts, validate paint ops, placement blocks, lazy `need_*` resources | Graph compile / SSE framing |

```text
                    ┌─────────────────────────────────────────┐
  HTTP / SSE        │  orchestrator → design_stream            │
                    │       → run_agent_graph (driver)         │
                    └──────────────────┬──────────────────────┘
                                       │ astream + interrupt bridge
                    ┌──────────────────▼──────────────────────┐
                    │  LangGraph outer graph (checkpointer)    │
                    │  bootstrap → … → paint → observe → settle│
                    └──────────────────┬──────────────────────┘
                                       │ per-node
              ┌────────────────────────┼────────────────────────┐
              ▼                        ▼                        ▼
     host.prompts / ops        LangChain LLM stream      scene_feedback
     (packs, validate)         (+ structured / tools)    + interrupt()
```

### Outer graph nodes (`_build_lc_design_graph`)

Routing uses **dynamic** `Command(goto=…)` (nodes declare `destinations`), not a fixed edge list beyond `START → bootstrap`.

```text
START → bootstrap
          ├─ apply_ops present? → apply_confirm → observe → settle
          └─ memory → intent_classify → design_agent (decide)
                           │
                           ├─ chat / clarify only → settle
                           └─ needs paint → paint_ops
                                  ├─ Ask + ops → propose → settle   # Confirm = new run
                                  └─ Agent → action → observe
                                         ├─ critique / op fail + reflect_left → paint_ops
                                         └─ ok → settle → END
```

| Node | Role |
|------|------|
| `bootstrap` | Bind task, flags, Ask `apply_confirm` short-circuit |
| `memory` | Short / medium memory patch |
| `intent_classify` | Cheap intent → lane hints |
| `design_agent` | **Decide** stage: reply / clarify / `need_*`; **no** canvas ops |
| `paint_ops` | Structured `tool_ops` only (dedicated paint prompt pack) |
| `action` | Emit ops to FE (`tool_ops` SSE), track `emitted_op_ids` |
| `propose` | Ask preview (`proposed_ops` / choice UI) → settle without applying |
| `observe` | Wait FE scene (`interrupt`); structure / spatial / CLIP critique |
| `apply_confirm` | User Confirm path: apply stored / posted ops |
| `__settle__` | Wallet settle, result SSE, cleanup policy |

### Inside a node (LangChain)

Typical decide / paint path:

1. `host.prompts.assemble_stage_system` / `require_prompt_pack` — **fail hard** if pack missing  
2. `_stream_llm_text` or `ainvoke_structured` (`app/services/llm/agent.py`) — LangChain model (+ optional official `create_agent` for structured / tool loops)  
3. Parse → validate (`host.ops_gate` / paint contract) → `Command(update=…, goto=…)`

`create_agent` is a **helper inside** decide/paint/tool turns when structured or tool loops are needed. The **durable** product run (pause / resume / scene HITL) is always the **outer** `StateGraph` + shared `get_agent_checkpointer()`.

### Driver vs graph

`run_agent_graph` / `resume_agent_graph` in `build.py`:

- Claim **run lease**, rebind wallet callbacks  
- `graph.astream(…)` and bridge `__interrupt__` of kind `scene_feedback` (wait FE `/scene`, then `Command(resume=snap)`)  
- Honor durable **pause** / **cancel** intents across workers  
- On success / abandon: checkpoint cleanup per policy  

Graph nodes stay pure relative to SSE writers where possible; the driver owns cross-cutting lifecycle.

---

## Run lifecycle (framework)

Statuses on `design_task` (see `task_store`):

```text
queued → running ⇄ waiting_client → running → success
               ↘ paused ──────────↗ resume
               ↘ error (resumable true|false)
               → cancelled
```

| Concern | Mechanism |
|---------|-----------|
| Durable graph state | LangGraph checkpointer (`thread_id = design:{task_id}`); prod refuses memory |
| Cross-worker ownership | `claim_run_lease` / heartbeat / release (Redis SET NX → DB CAS) |
| Pause / cancel across workers | `run_intent` in task meta + local cancel |
| FE canvas truth between rounds | `interrupt({kind: scene_feedback})` + `scene_feedback` (local Event / Redis / DB) |
| Op idempotency on resume | `AgentRunState.emitted_op_ids` |
| Wallet callbacks | Process-local bind by `task_id` (not in checkpoint) |
| Orphan checkpoints | TTL sweeper (`design_run_checkpoint_ttl_hours`) |

### HITL patterns (intentional)

| Kind | Pattern | Notes |
|------|---------|-------|
| **Scene wait** | LangGraph `interrupt` + `Command(resume=snap)` | Standard HITL; FE POSTs `/scene` |
| **Ask confirm** | Settle with `proposed_ops` → **new** run via `apply_confirm` | Not same-thread interrupt; proposal stored in `meta.ask_proposal` + chat message |
| **User pause** | Durable intent + keep checkpoint | Resume API / chat Resume button |

`interrupt()` restarts the **observe** node from the top on resume — side effects before `interrupt` (e.g. `mark_waiting_client`) must be idempotent.

---

## Critique loop

After FE scene lands (observe), optional post-paint critique:

1. **Structure** — empty artboard / missing nodes vs intent  
2. **Spatial** — cramped empties, ignored `suggested_place`, stacked creates, outside viewport  
3. **Aesthetics (CLIP)** — if FE sent `preview_image` and corpus is ready  

On failure with `reflect_left > 0` → structured `reflect_note` → **paint_ops** again.  
CLIP missing / thin corpus → **fail-open** (`thin_corpus` / `unavailable`); design is not blocked.

Settings: `DESIGN_CRITIQUE_ENABLED`, `DESIGN_CRITIQUE_AESTHETICS`, `DESIGN_AESTHETICS_MIN_CORPUS`, `DESIGN_AESTHETICS_SCORE_THRESHOLD`.

---

## What to extend (content, not graph)

The outer graph is the **engine**. Day-to-day design quality usually means content:

| Goal | Extend | Where |
|------|--------|--------|
| How a class of work should be done | **Skill** | Admin / `design_skills*` / `need_skills` + `/` pin |
| Global tone, Ask copy, paint rules | **Prompt packs** | Admin → packs (`usedBy` stages) |
| Aesthetic gate has something to compare | **Corpus** | Admin → quality samples (`grade=good`, embed ready) |
| New canvas verbs | **tool_ops contract** | `design.ops` (rare) |

### Skills

- Decide/resource stages expose a **catalog**; model loads bodies via `need_skills` (lazy).  
- User can hard-pin with `skill_refs` (`/` chips).  
- Namespaces / ACL / versioning: [design_skills/README.md](../apps/api/data/design_skills/README.md).

### Aesthetics corpus (“语料”)

Not a chat training set. It is the **CLIP RAG sample library**:

- Upload design renders / screenshots per **scene** (`website`, `mobile`, `poster`, …)  
- Label **`grade=good`** (also `ok` / `bad` for retrieve hints)  
- Embed until `embed_status=ready`  
- Coverage: Admin `GET …/quality-samples/coverage` (`minReadyGood`, deficits)

Pre-draw retrieve and post-paint critique both read this corpus. Thin corpus → skip hard fail.

### Prompt packs

Stage system / paint / Ask propose copy come from Admin packs. Missing required packs should **fail hard** — no hardcoded Chinese fallbacks in runtime nodes.

---

## `app/services/design/runtime/` package layout

```text
runtime/
  design_run.py           # public facade: design_stream + host re-exports
  orchestrator.py         # gate + call design_stream; partial bypass
  agent_controller.py     # compat shim (serde / old imports)
  models_route.py         # lane model pick (fast / standard / reasoning / vision / image)
  llm_step.py             # single-step LLM stream / collect
  scene_feedback.py       # FE→BE scene latch (Event / Redis / DB)
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
    build.py              # StateGraph compile + lease + pause/resume driver
    state.py              # AgentRuntime / schemas / constants
    nodes/                # bootstrap, decide, paint, apply, observe, settle, …
    emit_sse.py           # SSE / canvas chrome
    llm_io.py             # stream LLM, persona, prompt text
    turns.py              # turn parse, Ask choice UI, decide→paint
    paint_kit.py          # paint tool kit / create_frame
    scene_log.py          # scene digest, admin-step, bump/goto
    support.py            # thin barrel (compat old imports)
```

Conventions:

- **LangGraph** owns the outer product graph, checkpointer, and interrupt driver; **LangChain** owns model I/O inside nodes; **host** owns product logic (prompt packs, placement, resources, ops validation). See [LC / LG stack](#lc--lg-stack-langchain--langgraph).
- **Agent** mode: model decides and executes — no clarifying questions. **Ask** mode may clarify or propose ops for Confirm.
- Placement follows user intent, not ambient FOCUS alone.
- Stage system / paint / ask copy from **Admin prompt packs**; missing packs fail hard.
- Validation = contract checks; do not rewrite model intent.
- Split graph helper modules must keep **lean imports** (no megafile copy-paste headers).

## `app/services/design/prompts/` (content library)

Split vs runtime: prompts = store and assemble; runtime = execute and SSE.

| Module | Role |
|--------|------|
| `prompt_pack_store.py` | Prompt packs (`paint_system` / `ask_system` / …), seed + DB; `usedBy` marks stages |
| `system_prompt_store.py` | System prompts (agent / aesthetics / persona) |
| `skill_store.py` | Skills: triggers, ACL, `need_skills`, file packs |
| `knowledge_store.py` | Scene/skill knowledge injection |
| `token_store.py` | Design token packs |
| `content_pack.py` | Content pack version stamp |
| `prompt_build.py` / `rules_text.py` | Assembly and rules-text helpers |

Aesthetics samples live under `app/services/design/admin/quality_sample_store.py` + `app/services/design/aesthetics/`.

Seeds: `apps/api/data/design_prompt_packs/`, `design_skills_seed.json`, `design_skills/`, etc.

Prompt pack `usedBy` stages: `intent` / `decide` / `paint` / `apply` / `observe` / `resources` / `aesthetics` / `persona` / `precheck` / `orchestrator` / `legacy`, etc.

## Key settings (env)

| Setting | Role |
|---------|------|
| `DESIGN_GRAPH_REQUIRE_DURABLE_CHECKPOINT` | Refuse memory checkpointer in prod |
| `DESIGN_RUN_LEASE_TTL_SEC` | Cross-worker run lease TTL |
| `DESIGN_SCENE_WAIT_POLL_MS` | Cross-worker scene poll interval |
| `DESIGN_RUN_CHECKPOINT_TTL_HOURS` | Orphan checkpoint sweeper |
| `DESIGN_CRITIQUE_ENABLED` | Structure / spatial critique |
| `DESIGN_CRITIQUE_AESTHETICS` | CLIP critique when preview present |
| `DESIGN_AESTHETICS_MIN_CORPUS` | Soft floor for ready+good samples |
| `DESIGN_AESTHETICS_SCORE_THRESHOLD` | Override admin threshold (`0` = use admin/default) |

## Eval helpers

- `apps/api/tests/design_harness.py` — `collect_design_events`, `eval_checkpoint`, critique helpers  
- Unit: `test_design_run_lifecycle.py`, `test_design_critique.py`, `test_design_eval_harness.py`  
- Integration: `tests/integration_tests/test_design_golden_paths.py`

## Related docs

- API overview: [api.md](./api.md)
- Backend layout and seeds: [apps/api/README.md](../apps/api/README.md)
- LangGraph checkpointer: [postgres-switch.md](./postgres-switch.md#langgraph-checkpointer-design-agent--create_agent)
- Architecture: [architecture.md](./architecture.md)
- Skill namespaces: [design_skills/README.md](../apps/api/data/design_skills/README.md)
- User-facing Agent guide: [apps/docs · guide/agent](../apps/docs/content/zh-CN/guide/agent.md)
