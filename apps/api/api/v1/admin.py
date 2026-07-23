"""Admin API — /api/v1/admin/* for recombyn-admin."""

from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from pydantic import BaseModel, Field

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
from services.plaza import approve_submission, list_admin, reject_submission, set_submission_visible
from services.plaza.store import PlazaError
from services.wallet.card_keys import generate_card_keys, list_card_keys, revoke_card_keys
from services.llm.catalog_store import (
    delete_model,
    list_admin_models,
    upsert_model,
)
from services.design.dict_store import list_dicts, soft_delete_dict, upsert_dict
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
    dismiss_optimize_patch,
    generate_usage_optimize_patches,
    list_decision_logs,
    list_admin_skills,
    list_canvas_tools_admin,
    list_flows,
    list_global_rules,
    list_optimize_patches,
    skill_metrics_summary,
    soft_delete_skill,
    suggest_skill_optimize,
    upsert_canvas_tool,
    upsert_flow,
    upsert_global_rule,
    upsert_skill,
)
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
    tokens: int = Field(..., ge=1, le=10_000_000)
    expiresDays: int = Field(default=365, ge=0, le=3650)


class RevokeCardKeysIn(BaseModel):
    ids: list[str] = Field(..., min_length=1, max_length=200)


class RejectIn(BaseModel):
    reason: str | None = Field(default=None, max_length=500)


class PlazaVisibilityIn(BaseModel):
    visible: bool


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
    try:
        keys = generate_card_keys(
            count=body.count,
            tokens=body.tokens,
            expires_days=body.expiresDays,
        )
    except ValueError as err:
        detail = str(err)
        status = 503 if "CARD_KEY_SALT" in detail else 400
        raise HTTPException(status_code=status, detail=detail) from err
    return {
        "count": len(keys),
        "tokens": body.tokens,
        "expiresDays": body.expiresDays,
        "keys": keys,
    }


@router.post("/card-keys/revoke")
def admin_revoke_card_keys(
    body: RevokeCardKeysIn,
    _admin: SessionUser = Depends(require_admin),
) -> dict[str, Any]:
    return revoke_card_keys(body.ids)


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

class DesignSkillIn(BaseModel):
    id: int | None = None
    skillKey: str | None = Field(default=None, max_length=64)
    name: str = Field(..., min_length=1, max_length=128)
    category: str = Field(default="layout", max_length=32)
    promptPositive: str = Field(default="")
    promptNegative: str | None = None
    sortWeight: int = Field(default=0)
    scenes: str = Field(default="all", max_length=128)
    defaultModel: str = Field(default="doubao", max_length=32)
    maxRetries: int = Field(default=2, ge=0, le=10)
    enabled: bool = True
    outputFormat: str = Field(default="json", max_length=64)
    allowUserModelOverride: bool = False


class GlobalRuleIn(BaseModel):
    ruleKey: str = Field(..., min_length=1, max_length=96)
    ruleValue: str = Field(default="")


@router.get("/design/skills")
def admin_design_skills(
    q: str | None = None,
    enabled: bool | None = None,
    _admin: SessionUser = Depends(require_admin),
) -> dict[str, Any]:
    return {"items": list_admin_skills(q=q, enabled=enabled)}


@router.put("/design/skills")
def admin_upsert_design_skill(
    body: DesignSkillIn,
    _admin: SessionUser = Depends(require_admin),
) -> dict[str, Any]:
    try:
        item = upsert_skill(body.model_dump())
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return {"item": item}


@router.delete("/design/skills/{skill_id}")
def admin_delete_design_skill(
    skill_id: int,
    _admin: SessionUser = Depends(require_admin),
) -> dict[str, Any]:
    ok = soft_delete_skill(skill_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Not found")
    return {"ok": True}




@router.post("/design/content/resync")
def admin_design_content_resync(
    force: bool = True,
    _admin: SessionUser = Depends(require_admin),
) -> dict[str, Any]:
    """Cleanup obsolete keys + rewire flows from DB skill_key. Does not overwrite prompts."""
    return resync_design_content(force=force)

@router.get("/design/rules")
def admin_design_rules(_admin: SessionUser = Depends(require_admin)) -> dict[str, Any]:
    return {"items": list_global_rules()}


@router.put("/design/rules")
def admin_upsert_design_rule(
    body: GlobalRuleIn,
    _admin: SessionUser = Depends(require_admin),
) -> dict[str, Any]:
    try:
        item = upsert_global_rule(rule_key=body.ruleKey, rule_value=body.ruleValue)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return {"item": item}


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


@router.get("/design/flows")
def admin_design_flows(_admin: SessionUser = Depends(require_admin)) -> dict[str, Any]:
    return {"items": list_flows()}


class DesignFlowBody(BaseModel):
    scene: str
    skillIds: list[int] = Field(default_factory=list)
    failStrategy: str | None = None
    enabled: bool | None = True
    forceValidateFlags: list[Any] | None = None
    stepTokenCaps: list[Any] | None = None


@router.put("/design/flows")
def admin_design_flows_upsert(
    body: DesignFlowBody,
    _admin: SessionUser = Depends(require_admin),
) -> dict[str, Any]:
    try:
        item = upsert_flow(
            scene=body.scene,
            skill_ids=list(body.skillIds or []),
            fail_strategy=body.failStrategy,
            enabled=body.enabled,
            force_validate_flags=body.forceValidateFlags,
            step_token_caps=body.stepTokenCaps,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return {"item": item}


@router.get("/design/metrics")
def admin_design_metrics(_admin: SessionUser = Depends(require_admin)) -> dict[str, Any]:
    return skill_metrics_summary()


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


class DesignOptimizeIn(BaseModel):
    skillId: int = Field(..., ge=1)


@router.post("/design/optimize/suggest")
def admin_design_optimize_suggest(
    body: DesignOptimizeIn,
    _admin: SessionUser = Depends(require_admin),
) -> dict[str, Any]:
    """Return a suggestion only — never mutates Skill config."""
    try:
        return suggest_skill_optimize(int(body.skillId))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e



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
    _admin: SessionUser = Depends(require_admin),
) -> dict[str, Any]:
    ok = soft_delete_dict(item_id)
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


class SuggestSampleMetaIn(BaseModel):
    imageUrl: str = Field(..., min_length=1, max_length=5_000_000)
    model: str | None = Field(default=None, max_length=128)
    scene: str | None = Field(default=None, max_length=32)
    grade: str | None = Field(default=None, max_length=16)


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

