"""Aesthetic retrieve: user-primary skips corpus GOOD CLIP; pool slim."""

from __future__ import annotations

from unittest.mock import patch

from services.design.aesthetics.scorer import retrieve_aesthetic_refs


def test_user_refs_skip_good_ok_corpus():
    fake_bad = [
        {
            "id": 9,
            "name": "bad1",
            "scene": "website",
            "grade": "bad",
            "comment": "crowded",
            "imageUrl": "https://example.com/bad.png",
            "tags": "",
            "aesthetic_emb": None,
        }
    ]

    def _list(*, scene, grade, limit, fallback_scenes=True):  # noqa: ARG001
        assert grade == "bad"
        assert limit <= 96
        return list(fake_bad)

    with (
        patch(
            "services.design.aesthetics.scorer.list_ready_embeddings",
            side_effect=_list,
        ),
        patch(
            "services.design.aesthetics.token_extract.build_aesthetic_token_guidance",
            return_value=("TOKENS", []),
        ),
    ):
        out = retrieve_aesthetic_refs(
            prompt="做登录页",
            scene="website",
            user_ref_urls=["https://example.com/user.png"],
            use_user_refs=True,
        )
    assert out["mode"] == "user_primary"
    assert out["usedClip"] is False
    assert out["refs"] == []
    assert out["okRefs"] == []
    assert out["imageUrls"] == []  # no corpus images when user attach
    assert out["userRefCount"] == 1
    assert out["badRefs"]
    assert "TOKENS" in (out.get("guidance") or "")


def test_user_refs_false_uses_corpus_even_with_urls():
    seen: list[str] = []

    def _list(*, scene, grade, limit, fallback_scenes=True):  # noqa: ARG001
        seen.append(grade)
        return []

    with patch(
        "services.design.aesthetics.scorer.list_ready_embeddings",
        side_effect=_list,
    ):
        out = retrieve_aesthetic_refs(
            prompt="海报",
            scene="website",
            user_ref_urls=["https://example.com/user.png"],
            use_user_refs=False,
        )
    assert out["mode"] == "corpus_clip"
    assert "good" in seen
    assert out["userRefCount"] == 0

    seen_limits: list[int] = []

    def _list(*, scene, grade, limit, fallback_scenes=True):  # noqa: ARG001
        seen_limits.append(limit)
        return []

    with patch(
        "services.design.aesthetics.scorer.list_ready_embeddings",
        side_effect=_list,
    ):
        out = retrieve_aesthetic_refs(prompt="海报", scene="website")
    assert out["mode"] == "corpus_clip"
    assert seen_limits
    assert max(seen_limits) <= 128
