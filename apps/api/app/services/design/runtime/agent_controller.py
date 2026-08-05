"""Back-compat re-exports for tests and admin hooks."""
from app.services.design.runtime.graph.build import (
    _bind_design_hold_fns,
    _build_lc_design_graph,
    _bump,
    _cleanup_design_thread,
    _commit,
    _design_graph_node_timeout,
    _design_graph_retry_policy,
    _design_refund_hold_fn,
    _design_settle_hold_fn,
    _design_thread_id,
    _get_design_graph_checkpointer,
    _goto_cmd,
    _lc_design_graph,
    _unbind_design_hold_fns,
    cleanup_design_checkpoint,
    get_design_run_status,
    invalidate_agent_graph_cache,
    request_design_cancel,
    request_design_pause,
    resume_agent_graph,
    run_agent_graph,
    start_design_checkpoint_ttl_scheduler,
    sweep_stale_design_checkpoints,
)
from app.services.design.runtime.graph.state import (
    AgentRunState as _AgentRunState,
    AgentRuntime as _AgentRuntime,
    AgentTurnSchema,
    DecideTurnSchema,
    GraphState,
    PaintOpsSchema,
    PaintToolOp,
)


class AgentRunState(_AgentRunState):
    """Back-compat shim — checkpoint serde allows this module path."""


class AgentRuntime(_AgentRuntime):
    """Back-compat shim — checkpoint serde allows this module path."""


from app.services.design.runtime.graph.support import (
    _ask_propose_user_text,
    _chat_fallback_text,
    _derive_suggested_place_world,
    _ensure_propose_choice_ui,
    _format_spatial_placement,
    _is_canvas_work_intent,
    _is_lean_paint_turn,
    _lc_design_needs_canvas_ops,
    _normalize_choice_ui,
    _normalize_ops_payload,
    _parse_agent_turn,
    _placement_errors_for_free_creates,
    _resolve_agent_persona,
    _scene_digest,
    _should_route_to_paint,
    _turn_from_structured,
    _paint_tool_keys_for_turn,
    _ops_patch_too_broad,
    _structure_verify_issues,
)
from app.services.design.runtime.graph.nodes.bootstrap import (
    _apply_task_route_flags,
    _canvas_is_empty,
    _node_bootstrap,
)
from app.services.design.runtime.graph.nodes.decide import _node_design_agent, _node_resource
from app.services.design.runtime.graph.nodes.paint import _await_or_abandon, _node_paint_ops
from app.services.design.runtime.graph.nodes.memory import _node_memory
from app.services.design.runtime.graph.nodes.intent import _node_intent_classify
from app.services.design.runtime.graph.nodes.apply import (
    _node_action,
    _node_apply_confirm,
    _node_propose,
)
from app.services.design.runtime.graph.nodes.observe import _node_observe
from app.services.design.runtime.graph.nodes.settle import _node_settle

__all__ = [n for n in dir() if not n.startswith("_") or n.startswith("__")]
