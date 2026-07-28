"""Admin API — /api/v1/admin/* for recombyn-admin."""

from __future__ import annotations

import hmac
from typing import Any, Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from pydantic import BaseModel, Field

from config.settings import settings
from services.admin.users import (
    adjust_tokens,
    ensure_super_admin_role,
    get_user,
    list_users,
    update_user,
    user_ledger,
)
from services.admin.content import (
    delete_asset_admin,
    delete_like_admin,
    list_all_assets,
    list_all_likes,
    list_all_projects,
    list_plaza_feed_admin,
    list_plaza_published,
)
from services.auth import SessionUser
from services.auth.admin import is_admin_user, require_admin
from services.plaza import (
    approve_submission,
    delete_submission,
    get_submission,
    list_admin,
    reject_submission,
    set_cover_image,
    set_submission_visible,
    update_submission_title,
)
from services.plaza.store import PlazaError
from services.wallet.card_keys import generate_card_keys, list_card_keys, revoke_card_keys
from services.notices import (
    delete_notice,
    get_notice,
    list_notices_admin,
    upsert_notice,
)
from services.llm.catalog_store import (
    delete_model,
    list_admin_models,
    upsert_model,
)
from services.design.dict_store import (
    delete_dict_type,
    hard_delete_dict,
    list_dict_types,
    list_dicts,
    soft_delete_dict,
    upsert_dict,
    upsert_dict_type,
)
from services.design.knowledge_store import (
    list_knowledge,
    soft_delete_knowledge,
    upsert_knowledge,
)
from services.design.quality_sample_store import (
    get_quality_sample,
    hard_delete_quality_sample,
    list_quality_samples,
    mark_embed_pending,
    set_grade,
    soft_delete_quality_sample,
    upsert_quality_sample,
)
from services.design.library_store import (
    hard_delete_library_item,
    list_library_items,
    soft_delete_library_item,
    upsert_library_item,
)
from services.design.content_pack import resync_design_content
from services.design.admin_store import (
    apply_optimize_patch,
    clear_decision_logs,
    create_agent_flow,
    delete_agent_flow,
    dismiss_optimize_patch,
    generate_usage_optimize_patches,
    get_agent_flow,
    get_agent_flow_version,
    list_agent_flows,
    list_agent_flow_node_templates,
    list_decision_logs,
    list_canvas_tools_admin,
    list_optimize_patches,
    publish_agent_flow,
    skill_metrics_summary,
    update_agent_flow,
    upsert_canvas_tool,
    upsert_global_rule,
    test_run_agent_flow,
)
from services.design.catalog import get_global_rules
from services.design.stage_review_store import list_stage_reviews

router = APIRouter()


def _plaza_http(err: PlazaError) -> HTTPException:
    status = {
        "not_found": 404,
        "already_pending": 409,
        "already_published": 409,
        "document_too_large": 413,
        "invalid_project": 400,
        "invalid_document": 400,
        "cover_required": 400,
        "cover_aspect_invalid": 400,
        "artboard_required": 400,
    }.get(err.code, 400)
    return HTTPException(status_code=status, detail=err.message)


class UserPatchIn(BaseModel):
    role: Literal["user", "admin"] | None = None
    status: Literal["active", "disabled"] | None = None
    name: str | None = Field(default=None, max_length=80)


class AdjustTokensIn(BaseModel):
    amount: int = Field(..., description="Positive credit, negative debit")
    detail: str = Field(default="admin adjust", max_length=500)


class GenerateCardKeysIn(BaseModel):
    count: int = Field(default=10, ge=1, le=100)
    """credit = unified 积分 top-up; plan = membership + monthly 积分; token = legacy alias of credit."""
    kind: str = Field(default="credit", max_length=16)
    # Face value in 积分 (legacy million-Token faces are converted server-side).
    tokens: int = Field(default=0, ge=0, le=50_000_000)
    planId: str | None = Field(default=None, max_length=16)
    expiresDays: int = Field(default=365, ge=0, le=3650)
    # Dedicated generate password (CARD_KEY_OPS_PASSWORD), not the login password.
    password: str = Field(..., min_length=1, max_length=128)


def _require_card_key_ops_password(password: str) -> None:
    """Verify the dedicated card-key generate password from env."""
    ops = (settings.card_key_ops_password or "").strip()
    if not ops:
        raise HTTPException(
            status_code=503,
            detail="CARD_KEY_OPS_PASSWORD is not configured",
        )
    pw = (password or "").strip()
    if not pw or not hmac.compare_digest(pw, ops):
        raise HTTPException(status_code=403, detail="Generate password incorrect")


class RevokeCardKeysIn(BaseModel):
    ids: list[str] = Field(..., min_length=1, max_length=200)


class RejectIn(BaseModel):
    reason: str | None = Field(default=None, max_length=500)


class PlazaVisibilityIn(BaseModel):
    visible: bool


class PlazaCoverIn(BaseModel):
    """Custom list-cover image URL (from /uploads). Empty string clears."""
    url: str | None = Field(default=None, max_length=2000)


class PlazaTitleIn(BaseModel):
    title: str = Field(..., min_length=1, max_length=120)


@router.get("/me")
def admin_me(admin: SessionUser = Depends(require_admin)) -> dict[str, Any]:
    ensure_super_admin_role()
    return {
        "user": {
            "id": admin.id,
            "email": admin.email,
            "name": admin.name,
            "avatar": admin.avatar,
            "role": getattr(admin, "role", None) or ("admin" if is_admin_user(admin) else "user"),
            "status": getattr(admin, "status", None) or "active",
        }
    }


@router.get("/users")
def admin_list_users(
    page: int = Query(1, ge=1),
    pageSize: int = Query(20, ge=1, le=100),
    q: str | None = None,
    role: str | None = None,
    status: str | None = None,
    _admin: SessionUser = Depends(require_admin),
) -> dict[str, Any]:
    return list_users(page=page, page_size=pageSize, q=q, role=role, status=status)


@router.get("/users/{user_id}")
def admin_get_user(
    user_id: str,
    _admin: SessionUser = Depends(require_admin),
) -> dict[str, Any]:
    item = get_user(user_id)
    if not item:
        raise HTTPException(status_code=404, detail="User not found")
    return {"item": item}


@router.patch("/users/{user_id}")
def admin_patch_user(
    user_id: str,
    body: UserPatchIn,
    _admin: SessionUser = Depends(require_admin),
) -> dict[str, Any]:
    try:
        item = update_user(
            user_id,
            role=body.role,
            status=body.status,
            name=body.name,
        )
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err
    if not item:
        raise HTTPException(status_code=404, detail="User not found")
    return {"item": item}


@router.post("/users/{user_id}/adjust-tokens")
def admin_adjust_tokens(
    user_id: str,
    body: AdjustTokensIn,
    _admin: SessionUser = Depends(require_admin),
) -> dict[str, Any]:
    try:
        result = adjust_tokens(user_id, body.amount, detail=body.detail)
    except ValueError as err:
        msg = str(err)
        if msg == "insufficient_tokens":
            raise HTTPException(status_code=400, detail="Insufficient tokens") from err
        raise HTTPException(status_code=400, detail=msg) from err
    return result


@router.get("/users/{user_id}/ledger")
def admin_user_ledger(
    user_id: str,
    page: int = Query(1, ge=1),
    pageSize: int = Query(20, ge=1, le=100),
    kind: str = "all",
    _admin: SessionUser = Depends(require_admin),
) -> dict[str, Any]:
    return user_ledger(user_id, page=page, page_size=pageSize, kind=kind)


@router.get("/card-keys")
def admin_list_card_keys(
    status: str | None = None,
    _admin: SessionUser = Depends(require_admin),
) -> dict[str, Any]:
    return {"keys": list_card_keys(status=status)}


@router.post("/card-keys/generate")
def admin_generate_card_keys(
    body: GenerateCardKeysIn,
    _admin: SessionUser = Depends(require_admin),
) -> dict[str, Any]:
    _require_card_key_ops_password(body.password)
    try:
        keys = generate_card_keys(
            count=body.count,
            tokens=body.tokens,
            expires_days=body.expiresDays,
            kind=body.kind,
            plan_id=body.planId,
        )
    except ValueError as err:
        detail = str(err)
        status = 503 if "CARD_KEY_SALT" in detail else 400
        raise HTTPException(status_code=status, detail=detail) from err
    first = keys[0] if keys else {}
    return {
        "count": len(keys),
        "kind": first.get("kind") or body.kind,
        "planId": first.get("planId") or body.planId,
        "tokens": first.get("tokens") if keys else body.tokens,
        "expiresDays": body.expiresDays,
        "keys": keys,
    }


@router.post("/card-keys/revoke")
def admin_revoke_card_keys(
    body: RevokeCardKeysIn,
    _admin: SessionUser = Depends(require_admin),
) -> dict[str, Any]:
    return revoke_card_keys(body.ids)


class NoticeIn(BaseModel):
    id: str | None = None
    kind: Literal["announcement", "notification"] = "announcement"
    title: str = Field(..., min_length=1, max_length=200)
    body: str = Field(..., min_length=1, max_length=8000)
    status: Literal["draft", "published"] = "draft"
    publishedAt: float | None = None


@router.get("/notices")
def admin_list_notices(
    kind: str | None = None,
    status: str | None = None,
    _admin: SessionUser = Depends(require_admin),
) -> dict[str, Any]:
    return {"items": list_notices_admin(kind=kind, status=status)}


@router.post("/notices")
def admin_upsert_notice(
    body: NoticeIn,
    _admin: SessionUser = Depends(require_admin),
) -> dict[str, Any]:
    try:
        item = upsert_notice(
            notice_id=body.id,
            kind=body.kind,
            title=body.title,
            body=body.body,
            status=body.status,
            published_at=body.publishedAt,
        )
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err
    return {"item": item}


@router.get("/notices/{notice_id}")
def admin_get_notice(
    notice_id: str,
    _admin: SessionUser = Depends(require_admin),
) -> dict[str, Any]:
    item = get_notice(notice_id)
    if not item:
        raise HTTPException(status_code=404, detail="Not found")
    return {"item": item}


@router.delete("/notices/{notice_id}")
def admin_delete_notice(
    notice_id: str,
    _admin: SessionUser = Depends(require_admin),
) -> dict[str, Any]:
    if not delete_notice(notice_id):
        raise HTTPException(status_code=404, detail="Not found")
    return {"ok": True}


@router.get("/plaza")
def admin_plaza_list(
    status: str | None = None,
    _admin: SessionUser = Depends(require_admin),
) -> dict[str, Any]:
    return {"items": list_admin(status=status)}


@router.post("/plaza/{submission_id}/approve")
def admin_plaza_approve(
    submission_id: str,
    admin: SessionUser = Depends(require_admin),
) -> dict[str, Any]:
    try:
        item = approve_submission(submission_id, admin.id)
    except PlazaError as err:
        raise _plaza_http(err) from err
    return {"item": item}


@router.post("/plaza/{submission_id}/reject")
def admin_plaza_reject(
    submission_id: str,
    body: RejectIn | None = None,
    admin: SessionUser = Depends(require_admin),
) -> dict[str, Any]:
    try:
        item = reject_submission(
            submission_id,
            admin.id,
            reason=(body.reason if body else None),
        )
    except PlazaError as err:
        raise _plaza_http(err) from err
    return {"item": item}



@router.post("/plaza/{submission_id}/visibility")
def admin_plaza_visibility(
    submission_id: str,
    body: PlazaVisibilityIn,
    _admin: SessionUser = Depends(require_admin),
) -> dict[str, Any]:
    """Toggle whether an approved plaza item shows on C-end."""
    try:
        item = set_submission_visible(submission_id, body.visible)
    except PlazaError as err:
        raise _plaza_http(err) from err
    return {"item": item}


@router.post("/plaza/{submission_id}/cover")
def admin_plaza_cover(
    submission_id: str,
    body: PlazaCoverIn,
    _admin: SessionUser = Depends(require_admin),
) -> dict[str, Any]:
    """Upload / replace / clear custom plaza list cover (raster URL)."""
    try:
        item = set_cover_image(submission_id, body.url)
    except PlazaError as err:
        raise _plaza_http(err) from err
    return {"item": item}


@router.post("/plaza/{submission_id}/title")
def admin_plaza_title(
    submission_id: str,
    body: PlazaTitleIn,
    _admin: SessionUser = Depends(require_admin),
) -> dict[str, Any]:
    """Rename plaza listing title (snapshot only; does not touch live project)."""
    try:
        item = update_submission_title(submission_id, body.title)
    except PlazaError as err:
        raise _plaza_http(err) from err
    return {"item": item}


@router.delete("/plaza/{submission_id}")
def admin_plaza_delete(
    submission_id: str,
    _admin: SessionUser = Depends(require_admin),
) -> dict[str, Any]:
    """Permanently remove a plaza submission (and its likes)."""
    try:
        delete_submission(submission_id)
    except PlazaError as err:
        raise _plaza_http(err) from err
    return {"ok": True}


@router.get("/plaza/feed")
def admin_plaza_feed(
    tab: str = Query("recommended"),
    page: int = Query(1, ge=1),
    pageSize: int = Query(20, ge=1, le=100),
    userId: str | None = None,
    _admin: SessionUser = Depends(require_admin),
) -> dict[str, Any]:
    """Same shape as C-end /plaza/feed — tab=recommended|latest|following."""
    return list_plaza_feed_admin(
        tab=tab,
        page=page,
        page_size=pageSize,
        user_id=userId,
    )


@router.get("/plaza/published")
def admin_plaza_published(
    page: int = Query(1, ge=1),
    pageSize: int = Query(20, ge=1, le=100),
    q: str | None = None,
    _admin: SessionUser = Depends(require_admin),
) -> dict[str, Any]:
    return list_plaza_published(page=page, page_size=pageSize, q=q)


@router.get("/plaza/{submission_id}")
def admin_plaza_detail(
    submission_id: str,
    _admin: SessionUser = Depends(require_admin),
) -> dict[str, Any]:
    """Full submission including document — for admin canvas preview."""
    item = get_submission(submission_id, include_document=True)
    if not item:
        raise HTTPException(status_code=404, detail="Not found")
    return {"item": item}


@router.get("/likes")
def admin_list_likes(
    page: int = Query(1, ge=1),
    pageSize: int = Query(20, ge=1, le=100),
    q: str | None = None,
    _admin: SessionUser = Depends(require_admin),
) -> dict[str, Any]:
    return list_all_likes(page=page, page_size=pageSize, q=q)


@router.delete("/likes")
def admin_delete_like(
    userId: str = Query(...),
    submissionId: str = Query(...),
    _admin: SessionUser = Depends(require_admin),
) -> dict[str, Any]:
    ok = delete_like_admin(userId, submissionId)
    if not ok:
        raise HTTPException(status_code=404, detail="Not found")
    return {"ok": True}


@router.get("/projects")
def admin_list_projects(
    page: int = Query(1, ge=1),
    pageSize: int = Query(20, ge=1, le=100),
    q: str | None = None,
    _admin: SessionUser = Depends(require_admin),
) -> dict[str, Any]:
    return list_all_projects(page=page, page_size=pageSize, q=q)


@router.get("/assets")
def admin_list_assets(
    page: int = Query(1, ge=1),
    pageSize: int = Query(20, ge=1, le=100),
    kind: str | None = None,
    q: str | None = None,
    _admin: SessionUser = Depends(require_admin),
) -> dict[str, Any]:
    return list_all_assets(page=page, page_size=pageSize, kind=kind, q=q)


@router.delete("/assets/{asset_id}")
def admin_delete_asset(
    asset_id: str,
    _admin: SessionUser = Depends(require_admin),
) -> dict[str, Any]:
    ok = delete_asset_admin(asset_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Not found")
    return {"ok": True}



class ModelUpsertIn(BaseModel):
    id: str = Field(..., min_length=1, max_length=128)
    label: str = Field(..., min_length=1, max_length=255)
    kind: Literal["text", "image"] = "text"
    referenceTypes: list[Literal["text", "vision", "image"]] = Field(
        default_factory=lambda: ["text"],
        description="Route slots this model may fill: text / vision(multimodal) / image.",
    )
    provider: str = Field(default="doubao", max_length=64)
    apiModel: str = Field(..., min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=2000)
    iconKey: str | None = Field(default=None, max_length=64)
    iconUrl: str | None = Field(default=None, max_length=2000)
    price: str | None = Field(default=None, max_length=255)
    maxAttachments: int = Field(default=8, ge=0, le=64)
    thinking: bool = False
    enabled: bool = True
    sortOrder: int = Field(default=100, ge=0, le=100000)
    # Doubao Seedream size contract (resolutions / pixel bounds / size tables).
    imageLimits: dict[str, Any] | None = None
    imageLimitPreset: str | None = Field(default=None, max_length=64)
    priceMeta: dict[str, Any] | None = None


@router.get("/models/image-limit-presets")
def admin_list_image_limit_presets(
    _admin: SessionUser = Depends(require_admin),
) -> dict[str, Any]:
    from services.llm.catalog_store import list_image_limit_presets

    return {"items": list_image_limit_presets()}


class SyncPricesIn(BaseModel):
    provider: Literal["openrouter", "ark"] = "openrouter"
    onlyEmpty: bool = False


@router.post("/models/sync-prices")
def admin_sync_model_prices(
    body: SyncPricesIn,
    _admin: SessionUser = Depends(require_admin),
) -> dict[str, Any]:
    """Pull list prices: OpenRouter live API, or curated Ark docs snapshot."""
    try:
        if body.provider == "openrouter":
            from services.llm.price_sync import sync_openrouter_catalog_prices

            return sync_openrouter_catalog_prices(only_empty=bool(body.onlyEmpty))
        if body.provider == "ark":
            from services.llm.price_sync import sync_ark_catalog_prices

            return sync_ark_catalog_prices()
        raise HTTPException(status_code=400, detail="Unsupported price sync provider")
    except HTTPException:
        raise
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Price sync failed: {e}") from e


@router.get("/models")
def admin_list_models(
    kind: str | None = None,
    q: str | None = None,
    _admin: SessionUser = Depends(require_admin),
) -> dict[str, Any]:
    return {"items": list_admin_models(kind=kind, q=q)}


@router.put("/models")
def admin_upsert_model(
    body: ModelUpsertIn,
    _admin: SessionUser = Depends(require_admin),
) -> dict[str, Any]:
    try:
        item = upsert_model(body.model_dump())
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return {"item": item}


@router.delete("/models/{model_id}")
def admin_delete_model(
    model_id: str,
    _admin: SessionUser = Depends(require_admin),
) -> dict[str, Any]:
    ok = delete_model(model_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Not found")
    return {"ok": True}

class RuntimeSettingIn(BaseModel):
    """Whitelist settings still edited from 推理集群 (not the old rules table UI)."""

    key: str = Field(..., min_length=1, max_length=96)
    value: str = Field(default="")


class AgentFlowNodeIn(BaseModel):
    id: str = Field(..., min_length=1, max_length=128)
    label: str = Field(default="", max_length=128)
    kind: str = Field(default="node", max_length=32)
    x: float = 0
    y: float = 0
    capability: str = Field(default="", max_length=64)
    phaseKey: str = Field(default="", max_length=128)
    promptKey: str = Field(default="", max_length=128)
    configRef: str = Field(default="", max_length=128)
    promptText: str = Field(default="")
    routeConfig: str = Field(default="")
    description: str = Field(default="")
    modelId: str = Field(default="", max_length=128)


class AgentFlowEdgeIn(BaseModel):
    id: str = Field(..., min_length=1, max_length=128)
    source: str = Field(..., min_length=1, max_length=128)
    target: str = Field(..., min_length=1, max_length=128)
    label: str = Field(default="", max_length=128)


class AgentFlowGraphIn(BaseModel):
    version: int = 1
    nodes: list[AgentFlowNodeIn] = Field(default_factory=list)
    edges: list[AgentFlowEdgeIn] = Field(default_factory=list)


class AgentFlowCreateIn(BaseModel):
    name: str = Field(default="未命名流程", max_length=128)
    description: str = Field(default="", max_length=500)
    copyFromId: str | None = Field(default=None, max_length=64)


class AgentFlowUpdateIn(BaseModel):
    name: str | None = Field(default=None, max_length=128)
    description: str | None = Field(default=None, max_length=500)
    graph: AgentFlowGraphIn | None = None
    phaseMap: dict[str, str] | None = None


class AgentFlowTestRunIn(BaseModel):
    prompt: str = Field(default="", max_length=4000)


_RUNTIME_SETTING_KEYS = frozenset(
    {
        "billing.token_markup",
        "agent.react.max_rounds",
        "agent.react.max_reflect",
        "precheck.model_threshold",
        "precheck.vision_model",
        "precheck.fallback_chain",
        "assets.image_default_model",
        # 前端用户档位（经济/均衡/质量）— 覆盖 AgentModelsPanel 写死 fallback
        "precheck.user_preset.economy",
        "precheck.user_preset.balanced",
        "precheck.user_preset.quality",
        # P2 Agent 增强
        "agent.react.short_plan",
        "agent.react.dual_sample",
        "agent.react.defer_tools",
        # 对外人设（Auto / 用户锁定模型）
        "agent.persona.auto",
        "agent.persona.locked",
        # Agent 提示词（流程设计节点属性 → runtime settings）
        "agent.prompt.react_system",
        "agent.prompt.ask_system",
        "agent.prompt.ask_blocked_edit",
        "agent.prompt.plan_system",
        "agent.prompt.size_auto",
        "agent.prompt.ask_canvas_size",
        "agent.prompt.chat_fallback",
        "agent.prompt.unsafe_ops_ask",
        "agent.prompt.partial_system",
        "agent.prompt.chat_agent_system",
        "agent.prompt.need_tools_overlay",
        "agent.prompt.lc_tools_overlay",
        "agent.prompt.official_agent_system",
        # 看图契约（流程设计 / 美学相关节点）
        "aesthetics.prompt.vision_structure",
        "aesthetics.vision.structure_schema",
        "precheck.router_system",
    }
)


def _is_prompt_page_key(key: str) -> bool:
    """Keys editable as node prompt attrs in flow designer (agent prose + aesthetics)."""
    return (
        key.startswith("agent.prompt.")
        or key.startswith("agent.persona.")
        or key.startswith("aesthetics.prompt.")
        or key == "aesthetics.vision.structure_schema"
    )


@router.get("/design/runtime-settings")
def admin_design_runtime_settings(
    _admin: SessionUser = Depends(require_admin),
) -> dict[str, Any]:
    from services.design.admin_store import (
        STAGE_RULE_DEFAULTS,
        STAGE_RULE_DESCRIPTIONS,
        ensure_stage_rules,
    )

    ensure_stage_rules()
    rules = get_global_rules()
    keys = sorted(
        _RUNTIME_SETTING_KEYS
        | {k for k in STAGE_RULE_DEFAULTS if _is_prompt_page_key(k)}
    )
    items: list[dict[str, Any]] = []
    for k in keys:
        db_val = str(rules.get(k) or "")
        items.append(
            {
                "key": k,
                "value": db_val,
                "description": str(STAGE_RULE_DESCRIPTIONS.get(k) or ""),
                "using_default": not bool(db_val.strip()),
            }
        )
    return {"items": items}


def _is_agent_prompt_key(key: str) -> bool:
    return _is_prompt_page_key(key)


@router.put("/design/runtime-settings")
def admin_upsert_design_runtime_setting(
    body: RuntimeSettingIn,
    _admin: SessionUser = Depends(require_admin),
) -> dict[str, Any]:
    from services.design.admin_store import STAGE_RULE_DEFAULTS

    key = (body.key or "").strip()
    allowed = key in _RUNTIME_SETTING_KEYS or (
        _is_prompt_page_key(key) and key in STAGE_RULE_DEFAULTS
    )
    if not allowed:
        raise HTTPException(status_code=400, detail=f"unsupported setting: {key}")
    try:
        item = upsert_global_rule(rule_key=key, rule_value=body.value or "")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return {"item": {"key": item.get("ruleKey") or key, "value": item.get("ruleValue") or ""}}


@router.get("/design/agent-flows")
def admin_list_agent_flows(
    _admin: SessionUser = Depends(require_admin),
) -> dict[str, Any]:
    return {"items": list_agent_flows()}


@router.get("/design/agent-flow-node-templates")
def admin_list_agent_flow_node_templates(
    _admin: SessionUser = Depends(require_admin),
) -> dict[str, Any]:
    """左侧可拖节点模板（存全局规则，前端勿写死）。"""
    return {"items": list_agent_flow_node_templates()}


@router.post("/design/agent-flows")
def admin_create_agent_flow(
    body: AgentFlowCreateIn,
    _admin: SessionUser = Depends(require_admin),
) -> dict[str, Any]:
    graph = None
    phase_map = None
    copy_id = (body.copyFromId or "").strip()
    if copy_id:
        src = get_agent_flow(copy_id)
        if not src:
            raise HTTPException(status_code=404, detail="copy source not found")
        graph = src.get("graph")
        phase_map = src.get("phaseMap")
    try:
        item = create_agent_flow(
            name=body.name,
            description=body.description,
            graph=graph if isinstance(graph, dict) else None,
            phase_map=phase_map if isinstance(phase_map, dict) else None,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return {"item": item}


@router.get("/design/agent-flows/{flow_id}")
def admin_get_agent_flow(
    flow_id: str,
    includePublished: bool = False,
    _admin: SessionUser = Depends(require_admin),
) -> dict[str, Any]:
    item = get_agent_flow(flow_id, include_published_graph=includePublished)
    if not item:
        raise HTTPException(status_code=404, detail="Not found")
    return {"item": item}


@router.get("/design/agent-flows/{flow_id}/versions/{version}")
def admin_get_agent_flow_version(
    flow_id: str,
    version: int,
    _admin: SessionUser = Depends(require_admin),
) -> dict[str, Any]:
    item = get_agent_flow_version(flow_id, version)
    if not item:
        raise HTTPException(status_code=404, detail="version not found")
    return {"item": item}


@router.put("/design/agent-flows/{flow_id}")
def admin_update_agent_flow(
    flow_id: str,
    body: AgentFlowUpdateIn,
    _admin: SessionUser = Depends(require_admin),
) -> dict[str, Any]:
    try:
        item = update_agent_flow(
            flow_id,
            name=body.name,
            description=body.description,
            graph=body.graph.model_dump() if body.graph is not None else None,
            phase_map=body.phaseMap,
        )
    except ValueError as e:
        msg = str(e)
        if msg == "flow not found":
            raise HTTPException(status_code=404, detail=msg) from e
        raise HTTPException(status_code=400, detail=msg) from e
    return {"item": item}


@router.delete("/design/agent-flows/{flow_id}")
def admin_delete_agent_flow(
    flow_id: str,
    _admin: SessionUser = Depends(require_admin),
) -> dict[str, Any]:
    try:
        ok = delete_agent_flow(flow_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    if not ok:
        raise HTTPException(status_code=404, detail="Not found")
    return {"ok": True}


@router.post("/design/agent-flows/{flow_id}/publish")
def admin_publish_agent_flow(
    flow_id: str,
    _admin: SessionUser = Depends(require_admin),
) -> dict[str, Any]:
    """Publish draft → runtime version. Live Agent executes this snapshot only."""
    try:
        item = publish_agent_flow(flow_id)
    except ValueError as e:
        msg = str(e)
        if msg == "flow not found":
            raise HTTPException(status_code=404, detail=msg) from e
        raise HTTPException(status_code=400, detail=msg) from e
    return {"item": item}


@router.post("/design/agent-flows/{flow_id}/test-run")
def admin_test_run_agent_flow(
    flow_id: str,
    body: AgentFlowTestRunIn,
    _admin: SessionUser = Depends(require_admin),
) -> dict[str, Any]:
    """Validate + dry-walk the agent flow graph (no LLM / no canvas side effects)."""
    try:
        return test_run_agent_flow(flow_id=flow_id, prompt=body.prompt)
    except ValueError as e:
        msg = str(e)
        if msg == "flow not found":
            raise HTTPException(status_code=404, detail=msg) from e
        raise HTTPException(status_code=400, detail=msg) from e


@router.post("/design/content/resync")
def admin_design_content_resync(
    force: bool = True,
    _admin: SessionUser = Depends(require_admin),
) -> dict[str, Any]:
    """Cleanup obsolete keys. Does not restore Skill/Flow/Rules UI."""
    return resync_design_content(force=force)


class CanvasToolIn(BaseModel):
    opKey: str
    kind: str = "node"
    label: str = ""
    modelHint: str = ""
    argsSchema: str = ""
    enabled: bool = True
    sortOrder: int = 0


@router.get("/design/canvas-tools")
def admin_design_canvas_tools(_admin: SessionUser = Depends(require_admin)) -> dict[str, Any]:
    items = list_canvas_tools_admin()
    return {
        "items": [
            {
                "opKey": t["op_key"],
                "kind": t.get("kind") or "node",
                "label": t.get("label") or "",
                "modelHint": t.get("model_hint") or "",
                "argsSchema": t.get("args_schema") or "",
                "enabled": bool(t.get("enabled")),
                "sortOrder": int(t.get("sort_order") or 0),
            }
            for t in items
        ]
    }


@router.put("/design/canvas-tools")
def admin_upsert_design_canvas_tool(
    body: CanvasToolIn,
    _admin: SessionUser = Depends(require_admin),
) -> dict[str, Any]:
    try:
        item = upsert_canvas_tool(
            op_key=body.opKey,
            kind=body.kind,
            label=body.label,
            model_hint=body.modelHint,
            args_schema=body.argsSchema,
            enabled=body.enabled,
            sort_order=body.sortOrder,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return {"item": item}


@router.get("/design/metrics")
def admin_design_metrics(_admin: SessionUser = Depends(require_admin)) -> dict[str, Any]:
    return skill_metrics_summary()


@router.get("/model-usage/summary")
def admin_model_usage_summary(
    fromTs: float | None = Query(default=None),
    toTs: float | None = Query(default=None),
    _admin: SessionUser = Depends(require_admin),
) -> dict[str, Any]:
    from services.llm.usage_log import summarize_model_usage

    return summarize_model_usage(ts_from=fromTs, ts_to=toTs)


@router.get("/model-usage")
def admin_model_usage_list(
    page: int = Query(default=1, ge=1),
    pageSize: int = Query(default=50, ge=1, le=200),
    source: str | None = Query(default=None),
    provider: str | None = Query(default=None),
    model: str | None = Query(default=None),
    userId: str | None = Query(default=None),
    status: str | None = Query(default=None),
    via: str | None = Query(default=None),
    kind: str | None = Query(default=None),
    fromTs: float | None = Query(default=None),
    toTs: float | None = Query(default=None),
    _admin: SessionUser = Depends(require_admin),
) -> dict[str, Any]:
    from services.llm.usage_log import list_model_usage

    return list_model_usage(
        page=page,
        page_size=pageSize,
        source=source,
        provider=provider,
        model=model,
        user_id=userId,
        status=status,
        via=via,
        kind=kind,
        ts_from=fromTs,
        ts_to=toTs,
    )


@router.get("/design/decision-logs")
def admin_design_decision_logs(
    page: int = Query(default=1, ge=1),
    pageSize: int = Query(default=50, ge=1, le=100),
    route: str | None = Query(default=None),
    intent: str | None = Query(default=None),
    status: str | None = Query(default=None),
    q: str | None = Query(default=None),
    _admin: SessionUser = Depends(require_admin),
) -> dict[str, Any]:
    return list_decision_logs(
        page=page,
        page_size=pageSize,
        route=route,
        intent=intent,
        status=status,
        q=q,
    )


@router.post("/design/decision-logs/clear")
def admin_design_decision_logs_clear(
    _admin: SessionUser = Depends(require_admin),
) -> dict[str, Any]:
    """Wipe persisted decision_log / execution_log (fresh LangGraph 运行复盘)."""
    return clear_decision_logs()


@router.get("/design/stage-reviews")
def admin_design_stage_reviews(
    page: int = Query(default=1, ge=1),
    pageSize: int = Query(default=50, ge=1, le=100),
    skillId: int | None = Query(default=None),
    minRating: int | None = Query(default=None, ge=1, le=5),
    maxRating: int | None = Query(default=None, ge=1, le=5),
    _admin: SessionUser = Depends(require_admin),
) -> dict[str, Any]:
    """Historical stage ratings (legacy training runs)."""
    return list_stage_reviews(
        page=page,
        page_size=pageSize,
        skill_id=skillId,
        min_rating=minRating,
        max_rating=maxRating,
    )


@router.get("/design/optimize/patches")
def admin_list_optimize_patches(
    status: str | None = Query(default="pending"),
    _admin: SessionUser = Depends(require_admin),
) -> dict[str, Any]:
    return {"items": list_optimize_patches(status=status)}


@router.post("/design/optimize/generate")
def admin_generate_optimize_patches(
    _admin: SessionUser = Depends(require_admin),
) -> dict[str, Any]:
    """Mine usage metrics into pending patches (no auto-apply)."""
    return generate_usage_optimize_patches()


@router.post("/design/optimize/patches/{patch_id}/apply")
def admin_apply_optimize_patch(
    patch_id: int,
    _admin: SessionUser = Depends(require_admin),
) -> dict[str, Any]:
    try:
        return apply_optimize_patch(int(patch_id))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.post("/design/optimize/patches/{patch_id}/dismiss")
def admin_dismiss_optimize_patch(
    patch_id: int,
    _admin: SessionUser = Depends(require_admin),
) -> dict[str, Any]:
    try:
        return dismiss_optimize_patch(int(patch_id))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e



class DesignDictIn(BaseModel):
    id: int | None = None
    dictType: str = Field(..., min_length=1, max_length=32)
    code: str = Field(..., min_length=1, max_length=64)
    label: str = Field(..., min_length=1, max_length=128)
    sortOrder: int = 0
    enabled: bool = True


class DesignDictTypeIn(BaseModel):
    id: int | None = None
    code: str = Field(..., min_length=1, max_length=64)
    label: str = Field(..., min_length=1, max_length=128)
    sortOrder: int = 0
    enabled: bool = True


@router.get("/design/dict-types")
def admin_design_dict_types(
    enabled: bool | None = Query(default=None),
    _admin: SessionUser = Depends(require_admin),
) -> dict[str, Any]:
    return {"items": list_dict_types(enabled=enabled)}


@router.put("/design/dict-types")
def admin_upsert_design_dict_type(
    body: DesignDictTypeIn,
    _admin: SessionUser = Depends(require_admin),
) -> dict[str, Any]:
    try:
        item = upsert_dict_type(body.model_dump())
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return {"item": item}


@router.delete("/design/dict-types/{type_id}")
def admin_delete_design_dict_type(
    type_id: int,
    _admin: SessionUser = Depends(require_admin),
) -> dict[str, Any]:
    ok = delete_dict_type(type_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Not found")
    return {"ok": True}


@router.get("/design/dicts")
def admin_design_dicts(
    dictType: str | None = None,
    enabled: bool | None = Query(default=None),
    _admin: SessionUser = Depends(require_admin),
) -> dict[str, Any]:
    return {"items": list_dicts(dict_type=dictType, enabled=enabled)}


@router.put("/design/dicts")
def admin_upsert_design_dict(
    body: DesignDictIn,
    _admin: SessionUser = Depends(require_admin),
) -> dict[str, Any]:
    try:
        item = upsert_dict(body.model_dump())
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return {"item": item}


@router.delete("/design/dicts/{item_id}")
def admin_delete_design_dict(
    item_id: int,
    hard: bool = Query(default=False),
    _admin: SessionUser = Depends(require_admin),
) -> dict[str, Any]:
    ok = hard_delete_dict(item_id) if hard else soft_delete_dict(item_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Not found")
    return {"ok": True}


class DesignKnowledgeIn(BaseModel):
    id: int | None = None
    kind: str = Field(..., min_length=1, max_length=32)
    title: str = Field(..., min_length=1, max_length=128)
    body: str = Field(..., min_length=1)
    whenToUse: str = ""
    scenes: str = Field(default="all", max_length=128)
    skillCategories: str = Field(default="all", max_length=128)
    sortOrder: int = 0
    enabled: bool = True


@router.get("/design/knowledge")
def admin_design_knowledge(
    kind: str | None = None,
    enabled: bool | None = Query(default=None),
    _admin: SessionUser = Depends(require_admin),
) -> dict[str, Any]:
    return {"items": list_knowledge(kind=kind, enabled=enabled)}


@router.put("/design/knowledge")
def admin_upsert_design_knowledge(
    body: DesignKnowledgeIn,
    _admin: SessionUser = Depends(require_admin),
) -> dict[str, Any]:
    try:
        item = upsert_knowledge(body.model_dump())
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return {"item": item}


@router.delete("/design/knowledge/{item_id}")
def admin_delete_design_knowledge(
    item_id: int,
    _admin: SessionUser = Depends(require_admin),
) -> dict[str, Any]:
    ok = soft_delete_knowledge(item_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Not found")
    return {"ok": True}


@router.get("/design/kg-triples")
def admin_list_kg_triples(
    userId: str | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    _admin: SessionUser = Depends(require_admin),
) -> dict[str, Any]:
    """Inspect agent_kg_triple SPO rows (P3 knowledge graph)."""
    from services.agent_memory.kg import list_triples_admin

    return list_triples_admin(user_id=userId, limit=limit, offset=offset)


@router.delete("/design/kg-triples/{triple_id}")
def admin_delete_kg_triple(
    triple_id: str,
    _admin: SessionUser = Depends(require_admin),
) -> dict[str, Any]:
    from services.agent_memory.kg import soft_delete_triple

    ok = soft_delete_triple(triple_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Not found")
    return {"ok": True}


class QualitySampleIn(BaseModel):
    id: int | None = None
    name: str = Field(default="", max_length=128)
    scene: str = Field(default="website", max_length=32)
    grade: str = Field(default="good", max_length=16)
    tags: str = Field(default="", max_length=512)
    comment: str = Field(default="")
    imageUrl: str = Field(..., min_length=1, max_length=5_000_000)
    originPath: str | None = Field(default=None, max_length=512)
    enabled: bool = True
    meta: dict[str, Any] | None = None
    # Default true: runtime extracts DESIGN_TOKENS into meta on save; Admin meta wins.
    extractTokens: bool = True


class SuggestSampleMetaIn(BaseModel):
    imageUrl: str = Field(..., min_length=1, max_length=5_000_000)
    model: str | None = Field(default=None, max_length=128)
    scene: str | None = Field(default=None, max_length=32)
    grade: str | None = Field(default=None, max_length=16)


class ExtractSampleTokensIn(BaseModel):
    imageUrl: str = Field(..., min_length=1, max_length=5_000_000)
    name: str = Field(default="", max_length=128)
    grade: str = Field(default="good", max_length=16)
    tags: str = Field(default="", max_length=512)
    comment: str = Field(default="")
    canvasW: int = Field(default=0, ge=0, le=8192)
    canvasH: int = Field(default=0, ge=0, le=8192)


@router.post("/design/quality-samples/suggest-meta")
async def admin_suggest_sample_meta(
    body: SuggestSampleMetaIn,
    _admin: SessionUser = Depends(require_admin),
) -> dict[str, Any]:
    """Vision LLM: design screenshot → comment + tags (+ optional name)."""
    from services.design.aesthetics.suggest_meta import suggest_sample_meta

    try:
        return await suggest_sample_meta(
            image_url=body.imageUrl,
            model=body.model,
            scene=body.scene,
            grade=body.grade,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e)[:800]) from e


@router.post("/design/quality-samples/extract-tokens")
def admin_extract_sample_tokens(
    body: ExtractSampleTokensIn,
    _admin: SessionUser = Depends(require_admin),
) -> dict[str, Any]:
    """Runtime PIL extract → DESIGN_TOKENS meta (preview / fill Admin form; no DB write)."""
    from services.design.aesthetics.token_extract import extract_design_tokens_meta

    try:
        meta = extract_design_tokens_meta(
            image_url=body.imageUrl,
            name=body.name,
            grade=body.grade,
            tags=body.tags,
            comment=body.comment,
            canvas_w=body.canvasW,
            canvas_h=body.canvasH,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e)[:800]) from e
    return {"meta": meta}


@router.get("/design/quality-samples")
def admin_list_quality_samples(
    page: int = Query(1, ge=1),
    pageSize: int = Query(24, ge=1, le=100),
    scene: str | None = None,
    grade: str | None = None,
    q: str | None = None,
    enabled: bool | None = Query(default=None),
    embedStatus: str | None = None,
    _admin: SessionUser = Depends(require_admin),
) -> dict[str, Any]:
    return list_quality_samples(
        scene=scene,
        grade=grade,
        q=q,
        enabled=enabled,
        embed_status=embedStatus,
        page=page,
        page_size=pageSize,
    )


@router.put("/design/quality-samples")
def admin_upsert_quality_sample(
    body: QualitySampleIn,
    _admin: SessionUser = Depends(require_admin),
) -> dict[str, Any]:
    try:
        item = upsert_quality_sample(body.model_dump())
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return {"item": item}


@router.get("/design/quality-samples/coverage")
def admin_quality_samples_coverage(
    _admin: SessionUser = Depends(require_admin),
) -> dict[str, Any]:
    """Per-scene ready+good counts vs MIN_GOOD_READY_PER_SCENE (pre-draw vision readiness)."""
    from services.design.quality_sample_store import count_ready_good_by_scene

    return count_ready_good_by_scene()


@router.get("/design/quality-samples/clip-status")
def admin_clip_status(
    _admin: SessionUser = Depends(require_admin),
) -> dict[str, Any]:
    from services.design.aesthetics.clip_encoder import clip_status

    return clip_status()


@router.patch("/design/quality-samples/{sample_id:int}/grade")
def admin_set_quality_grade(
    sample_id: int,
    grade: str = Query(..., min_length=2, max_length=16),
    _admin: SessionUser = Depends(require_admin),
) -> dict[str, Any]:
    try:
        item = set_grade(sample_id, grade)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    if not item:
        raise HTTPException(status_code=404, detail="Not found")
    return {"item": item}


@router.post("/design/quality-samples/{sample_id:int}/reembed")
def admin_reembed_quality_sample(
    sample_id: int,
    _admin: SessionUser = Depends(require_admin),
) -> dict[str, Any]:
    item = mark_embed_pending(sample_id)
    if not item:
        raise HTTPException(status_code=404, detail="Not found")
    from services.design.aesthetics.embed_job import schedule_embed
    from services.design.aesthetics.clip_encoder import clip_status

    queued = schedule_embed(sample_id)
    return {
        "item": get_quality_sample(sample_id) or item,
        "queued": bool(queued.get("queued")),
        "schedule": queued,
        "clip": clip_status(),
    }


@router.delete("/design/quality-samples/{sample_id:int}")
def admin_delete_quality_sample(
    sample_id: int,
    hard: bool = Query(default=False),
    _admin: SessionUser = Depends(require_admin),
) -> dict[str, Any]:
    ok = (
        hard_delete_quality_sample(sample_id)
        if hard
        else soft_delete_quality_sample(sample_id)
    )
    if not ok:
        raise HTTPException(status_code=404, detail="Not found")
    return {"ok": True}


@router.get("/design/quality-samples/{sample_id:int}/thumb")
def admin_quality_sample_thumb(
    sample_id: int,
    _admin: SessionUser = Depends(require_admin),
):
    from fastapi.responses import Response
    from services.design.quality_sample_store import get_quality_sample_thumb

    raw = get_quality_sample_thumb(sample_id)
    if not raw:
        raise HTTPException(status_code=404, detail="No thumb")
    return Response(content=raw, media_type="image/webp", headers={"Cache-Control": "private, max-age=86400"})


@router.post("/design/cold-archive/run")
def admin_run_cold_archive(
    retentionDays: int = Query(default=30, ge=1, le=3650),
    batch: int = Query(default=80, ge=1, le=500),
    _admin: SessionUser = Depends(require_admin),
) -> dict[str, Any]:
    """Archive old design_task.result_svg + chat_messages.thinking into design_cold_blob."""
    from services.design.cold_archive import run_cold_archive

    return run_cold_archive(retention_days=retentionDays, batch=batch)


class QualitySampleFromTaskIn(BaseModel):
    taskId: str = Field(..., min_length=1, max_length=64)
    grade: str = Field(default="good", max_length=16)
    comment: str = Field(default="", max_length=2000)
    name: str = Field(default="", max_length=128)
    tags: str = Field(default="", max_length=512)
    scene: str | None = Field(default=None, max_length=32)


@router.post("/design/quality-samples/from-task")
def admin_quality_sample_from_task(
    body: QualitySampleFromTaskIn,
    _admin: SessionUser = Depends(require_admin),
) -> dict[str, Any]:
    """One-click: design_task.result_svg → aesthetics sample (+ embed schedule)."""
    from services.design.aesthetics.from_task import sample_from_task

    try:
        return sample_from_task(
            task_id=body.taskId,
            grade=body.grade,
            comment=body.comment,
            name=body.name,
            tags=body.tags,
            scene=body.scene,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.get("/design/tasks/{task_id}/preview")
def admin_design_task_preview(
    task_id: str,
    _admin: SessionUser = Depends(require_admin),
) -> dict[str, Any]:
    from services.design.aesthetics.from_task import get_task_preview

    item = get_task_preview(task_id)
    if not item:
        raise HTTPException(status_code=404, detail="Not found")
    return item


@router.get("/design/aesthetics/settings")
def admin_aesthetics_settings(
    _admin: SessionUser = Depends(require_admin),
) -> dict[str, Any]:
    from services.design.aesthetics.calibrate import aesthetics_settings
    from services.design.aesthetics.clip_encoder import clip_status

    out = aesthetics_settings()
    out["clip"] = clip_status()
    return out


class AestheticsThresholdIn(BaseModel):
    threshold: float = Field(..., ge=0.4, le=0.95)


@router.put("/design/aesthetics/threshold")
def admin_set_aesthetics_threshold(
    body: AestheticsThresholdIn,
    _admin: SessionUser = Depends(require_admin),
) -> dict[str, Any]:
    from services.design.aesthetics.calibrate import aesthetics_settings, set_threshold

    thr = set_threshold(body.threshold)
    return {"threshold": thr, "settings": aesthetics_settings()}


class AestheticsCalibrateIn(BaseModel):
    scene: str | None = Field(default=None, max_length=32)
    apply: bool = False


@router.post("/design/aesthetics/calibrate")
def admin_aesthetics_calibrate(
    body: AestheticsCalibrateIn | None = None,
    _admin: SessionUser = Depends(require_admin),
) -> dict[str, Any]:
    """Suggest (and optionally apply) score threshold from good↔good similarities."""
    from services.design.aesthetics.calibrate import calibrate_threshold

    payload = body or AestheticsCalibrateIn()
    return calibrate_threshold(scene=payload.scene, apply=bool(payload.apply))


class LibraryItemIn(BaseModel):
    id: int | None = None
    name: str = Field(..., min_length=1, max_length=128)
    kind: str = Field(default="style", max_length=32)
    scene: str = Field(default="all", max_length=64)
    coverUrl: str = Field(default="", max_length=5_000_000)
    tags: str = Field(default="", max_length=255)
    description: str = Field(default="")
    enabled: bool = True
    sortOrder: int = 0
    meta: dict[str, Any] | None = None


@router.get("/design/library")
def admin_design_library(
    page: int = Query(1, ge=1),
    pageSize: int = Query(24, ge=1, le=100),
    kind: str | None = None,
    scene: str | None = None,
    q: str | None = None,
    enabled: bool | None = Query(default=None),
    _admin: SessionUser = Depends(require_admin),
) -> dict[str, Any]:
    return list_library_items(
        kind=kind, scene=scene, q=q, enabled=enabled, page=page, page_size=pageSize
    )


@router.put("/design/library")
def admin_upsert_design_library(
    body: LibraryItemIn,
    _admin: SessionUser = Depends(require_admin),
) -> dict[str, Any]:
    try:
        item = upsert_library_item(body.model_dump())
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return {"item": item}


@router.delete("/design/library/{item_id}")
def admin_delete_design_library(
    item_id: int,
    hard: bool = Query(default=False),
    _admin: SessionUser = Depends(require_admin),
) -> dict[str, Any]:
    ok = hard_delete_library_item(item_id) if hard else soft_delete_library_item(item_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Not found")
    return {"ok": True}


class LayoutFromImageIn(BaseModel):
    imageUrl: str | None = Field(default=None, description="Primary reference (compat)")
    imageUrls: list[str] | None = Field(default=None, description="Ordered refs")
    brief: str | None = Field(default=None, max_length=2000)
    model: str | None = None
    aspectRatio: str | None = "3:4"
    quality: str | None = "hd"
    resolution: str | None = "2K"


@router.post("/design/library/layout-from-image")
async def admin_layout_from_image(
    body: LayoutFromImageIn,
    _admin: SessionUser = Depends(require_admin),
) -> dict[str, Any]:
    """AI: reference image (optional) -> grayscale layout / wireframe for library cover."""
    from services.llm.image_tools import generate_layout_wireframe

    urls = [u.strip() for u in (body.imageUrls or []) if isinstance(u, str) and u.strip()]
    if (body.imageUrl or "").strip() and (body.imageUrl or "").strip() not in urls:
        urls.insert(0, (body.imageUrl or "").strip())
    if not urls and not (body.brief or "").strip():
        raise HTTPException(status_code=400, detail="imageUrls/imageUrl or brief required")
    try:
        result = await generate_layout_wireframe(
            image_urls=urls or None,
            brief=body.brief,
            model=body.model,
            aspect_ratio=body.aspectRatio,
            quality=body.quality,
            resolution=body.resolution,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e)[:800]) from e
    return result


# ── Font catalog (tree: family → weight faces) ───────────────────────────────


class AdminFontFaceIn(BaseModel):
    family: str | None = None
    displayName: str = "Regular"
    weight: int = Field(default=400, ge=100, le=900)
    url: str
    format: str | None = None


class AdminFontUpsertIn(BaseModel):
    family: str = Field(..., min_length=1, max_length=255)
    displayName: str | None = Field(default=None, max_length=255)
    sortOrder: int | None = None
    faces: list[AdminFontFaceIn] | None = None
    url: str | None = None
    weight: int | None = Field(default=400, ge=100, le=900)
    format: str | None = None
    merge: bool = Field(
        default=True,
        description="When true, merge faces by weight; when false, replace all faces",
    )


def _admin_merge_faces(
    existing: list[Any] | None,
    incoming: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    by_weight: dict[int, dict[str, Any]] = {}
    if isinstance(existing, list):
        for c in existing:
            if not isinstance(c, dict):
                continue
            url = str(c.get("url") or "").strip()
            if not url:
                continue
            try:
                w = int(c.get("weight") or 400)
            except (TypeError, ValueError):
                w = 400
            by_weight[w] = c
    for face in incoming:
        try:
            w = int(face.get("weight") or 400)
        except (TypeError, ValueError):
            w = 400
        by_weight[w] = face
    return [by_weight[k] for k in sorted(by_weight.keys())]


def _normalize_admin_faces(
    family: str,
    faces: list[AdminFontFaceIn] | None,
    *,
    url: str | None = None,
    weight: int | None = 400,
    format: str | None = None,
) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    if faces:
        for f in faces:
            u = (f.url or "").strip()
            if not u:
                continue
            weight_n = int(f.weight or 400)
            label = (f.displayName or "Regular").strip() or "Regular"
            face_family = (f.family or "").strip() or (
                family if weight_n == 400 else f"{family} {label}"
            )
            out.append(
                {
                    "family": face_family,
                    "displayName": label,
                    "weight": weight_n,
                    "url": u,
                    **({"format": f.format} if f.format else {}),
                }
            )
    elif url and url.strip():
        weight_n = int(weight or 400)
        label = "Regular" if weight_n == 400 else f"Weight {weight_n}"
        out.append(
            {
                "family": family if weight_n == 400 else f"{family} {label}",
                "displayName": label,
                "weight": weight_n,
                "url": url.strip(),
                **({"format": format} if format else {}),
            }
        )
    return out


@router.get("/fonts")
def admin_list_fonts(
    page: int = Query(default=1, ge=1),
    pageSize: int = Query(default=200, ge=1, le=500),
    _admin: SessionUser = Depends(require_admin),
) -> dict[str, Any]:
    from services import fonts_store

    return fonts_store.list_fonts(page=page, page_size=pageSize)


@router.post("/fonts")
def admin_upsert_font(
    body: AdminFontUpsertIn,
    _admin: SessionUser = Depends(require_admin),
) -> dict[str, Any]:
    from services import fonts_store

    family = (body.family or "").strip()
    if not family:
        raise HTTPException(status_code=400, detail="family required")
    incoming = _normalize_admin_faces(
        family,
        body.faces,
        url=body.url,
        weight=body.weight,
        format=body.format,
    )
    existing = fonts_store.get_font_by_family(family)
    if body.merge and existing:
        children = _admin_merge_faces(existing.get("children"), incoming) if incoming else (
            existing.get("children") if isinstance(existing.get("children"), list) else []
        )
    else:
        children = incoming
    if not children:
        raise HTTPException(status_code=400, detail="At least one face with url is required")
    try:
        item = fonts_store.upsert_font(
            family=family,
            display_name=body.displayName or (existing or {}).get("displayName") or family,
            children=children,
            sort_order=body.sortOrder,
        )
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err
    return {"item": item}


@router.delete("/fonts/{family}")
def admin_delete_font(
    family: str,
    _admin: SessionUser = Depends(require_admin),
) -> dict[str, Any]:
    from services import fonts_store
    import urllib.parse

    fam = urllib.parse.unquote(family).strip()
    if not fam:
        raise HTTPException(status_code=400, detail="family required")
    ok = fonts_store.delete_font(fam)
    if not ok:
        raise HTTPException(status_code=404, detail="Not found")
    return {"ok": True}


@router.delete("/fonts/{family}/faces/{weight}")
def admin_delete_font_face(
    family: str,
    weight: int,
    _admin: SessionUser = Depends(require_admin),
) -> dict[str, Any]:
    from services import fonts_store
    import urllib.parse

    fam = urllib.parse.unquote(family).strip()
    existing = fonts_store.get_font_by_family(fam)
    if not existing:
        raise HTTPException(status_code=404, detail="Family not found")
    children = [
        c
        for c in (existing.get("children") or [])
        if isinstance(c, dict) and int(c.get("weight") or 400) != int(weight)
    ]
    if not children:
        fonts_store.delete_font(fam)
        return {"ok": True, "deletedFamily": True}
    item = fonts_store.upsert_font(
        family=fam,
        display_name=existing.get("displayName") or fam,
        children=children,
        sort_order=existing.get("sortOrder"),
    )
    return {"ok": True, "item": item}


@router.post("/fonts/upload")
async def admin_upload_font_file(
    file: UploadFile = File(..., description="ttf / otf / woff / woff2"),
    family: str | None = Form(default=None),
    displayName: str | None = Form(default=None),
    weight: int = Form(default=400),
    admin: SessionUser = Depends(require_admin),
) -> dict[str, Any]:
    """Upload a font file and register/merge as a catalog face."""
    import re
    import uuid
    from pathlib import Path

    from services import fonts_store
    from services.storage import put_bytes
    from config.settings import settings as _settings

    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="empty file")
    if len(raw) > 20 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="font file too large (max 20MB)")

    name = (file.filename or "font.ttf").strip()
    lower = name.lower()
    if not lower.endswith((".ttf", ".otf", ".woff", ".woff2")):
        raise HTTPException(status_code=400, detail="Only ttf/otf/woff/woff2 supported")

    if lower.endswith(".woff2"):
        mime, fmt, ext = "font/woff2", "woff2", "woff2"
    elif lower.endswith(".woff"):
        mime, fmt, ext = "font/woff", "woff", "woff"
    elif lower.endswith(".otf"):
        mime, fmt, ext = "font/otf", "opentype", "otf"
    else:
        mime, fmt, ext = "font/ttf", "truetype", "ttf"

    stem = Path(name).stem.strip() or "CustomFont"
    fam = (family or stem).strip() or "CustomFont"
    label = (displayName or "Regular").strip() or "Regular"
    try:
        weight_n = int(weight)
    except (TypeError, ValueError):
        weight_n = 400
    weight_n = max(100, min(900, weight_n))

    safe = re.sub(r"[^a-zA-Z0-9._-]+", "_", stem).strip("_")[:64] or "font"
    object_key = f"uploads/{admin.id}/fonts/{uuid.uuid4().hex[:12]}_{safe}.{ext}"
    put_bytes(object_key, raw, content_type=mime)
    base = (_settings.s3_public_base_url or "").rstrip("/")
    if _settings.s3_enabled and base:
        url = f"{base}/{object_key}"
    else:
        url = f"/api/v1/uploads/files/{object_key}"

    face_family = fam if weight_n == 400 else f"{fam} {label}"
    new_face = {
        "family": face_family,
        "displayName": label,
        "weight": weight_n,
        "url": url,
        "format": fmt,
    }
    existing = fonts_store.get_font_by_family(fam)
    merged = _admin_merge_faces(
        existing.get("children") if existing else None,
        [new_face],
    )
    item = fonts_store.upsert_font(
        family=fam,
        display_name=(existing or {}).get("displayName") or fam,
        children=merged,
    )
    return {
        "url": url,
        "key": object_key,
        "mime": mime,
        "format": fmt,
        "family": fam,
        "weight": weight_n,
        "item": item,
    }

