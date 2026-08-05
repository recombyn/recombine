"""Back-compat barrel — prefer emit_sse / llm_io / turns / paint_kit / scene_log."""
from __future__ import annotations

from app.services.design.runtime.graph.emit_sse import *  # noqa: F403
from app.services.design.runtime.graph.llm_io import *  # noqa: F403
from app.services.design.runtime.graph.turns import *  # noqa: F403
from app.services.design.runtime.graph.paint_kit import *  # noqa: F403
from app.services.design.runtime.graph.scene_log import *  # noqa: F403
from app.services.design.runtime.host.ops_gate import (  # noqa: F401
    _normalize_ops_payload,
    _op_name,
    _validate_ops_payload,
)
from app.services.design.runtime.host.placement import (  # noqa: F401
    _derive_suggested_place_world,
    _focus_frame_from_rt,
    _format_spatial_placement,
    _placement_errors_for_free_creates,
)

from app.services.design.runtime.graph.emit_sse import __all__ as _a1
from app.services.design.runtime.graph.llm_io import __all__ as _a2
from app.services.design.runtime.graph.turns import __all__ as _a3
from app.services.design.runtime.graph.paint_kit import __all__ as _a4
from app.services.design.runtime.graph.scene_log import __all__ as _a5

__all__ = (
    list(_a1)
    + list(_a2)
    + list(_a3)
    + list(_a4)
    + list(_a5)
    + [
        "_normalize_ops_payload",
        "_op_name",
        "_validate_ops_payload",
        "_derive_suggested_place_world",
        "_focus_frame_from_rt",
        "_format_spatial_placement",
        "_placement_errors_for_free_creates",
    ]
)
