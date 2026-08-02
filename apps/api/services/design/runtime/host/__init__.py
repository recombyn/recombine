"""Host-side prompt assembly, placement, ops gate, deferred resources."""
from services.design.runtime.host.prompts import (
    assemble_stage_system,
    interaction_mode_rules_pack,
    require_prompt_pack,
)
from services.design.runtime.host.placement import (
    build_placement_block,
    placement_errors_for_free_creates,
)
from services.design.runtime.host.ops_gate import validate_paint_ops
from services.design.runtime.host.resources import load_deferred_resources

__all__ = [
    "assemble_stage_system",
    "require_prompt_pack",
    "interaction_mode_rules_pack",
    "validate_paint_ops",
    "build_placement_block",
    "placement_errors_for_free_creates",
    "load_deferred_resources",
]
