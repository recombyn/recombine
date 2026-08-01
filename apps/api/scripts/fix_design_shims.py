"""Rewrite design compatibility shims (UTF-8, no BOM) after repackage."""

from __future__ import annotations

from pathlib import Path

API_ROOT = Path(__file__).resolve().parents[1]
DESIGN = API_ROOT / "services" / "design"

LAYOUT: dict[str, list[str]] = {
    "runtime": [
        "agent_controller",
        "orchestrator",
        "flow_runtime",
        "llm_step",
        "models_route",
        "pipeline_support",
        "decision_log",
        "scene_feedback",
        "progress_stages",
    ],
    "ops": [
        "tool_ops_contract",
        "validate",
        "action_registry",
        "image_hydrate",
        "svg_patch",
    ],
    "prompts": [
        "skill_store",
        "prompt_pack_store",
        "system_prompt_store",
        "knowledge_store",
        "token_store",
        "prompt_build",
        "rules_text",
        "content_pack",
    ],
    "readpath": [
        "catalog",
        "canvas_scene",
        "library_store",
        "library_seed",
        "seed",
    ],
    "admin": [
        "admin_store",
        "schema",
        "dict_store",
        "quality_sample_store",
        "cold_archive",
        "blob_codec",
        "stage_review_store",
        "task_store",
    ],
}


def main() -> None:
    for pkg, mods in LAYOUT.items():
        for mod in mods:
            path = DESIGN / f"{mod}.py"
            path.write_text(
                (
                    f'"""Compatibility shim — prefer ``services.design.{pkg}.{mod}``."""\n'
                    "from __future__ import annotations\n\n"
                    "import sys\n\n"
                    f"from services.design.{pkg} import {mod} as _impl\n\n"
                    "sys.modules[__name__] = _impl\n"
                ),
                encoding="utf-8",
                newline="\n",
            )
            print("shim", mod, "->", pkg)

    (DESIGN / "readpath" / "__init__.py").write_text(
        '"""Read-path catalog, canvas scene helpers, and library seeds."""\n',
        encoding="utf-8",
        newline="\n",
    )
    (DESIGN / "__init__.py").write_text(
        (
            '"""Design Agent domain.\n'
            "\n"
            "Prefer domain packages:\n"
            "\n"
            "- ``services.design.runtime`` — graph / orchestrator / model routing\n"
            "- ``services.design.ops`` — tool_ops contract and validation\n"
            "- ``services.design.prompts`` — skills / packs / knowledge / tokens\n"
            "- ``services.design.readpath`` — catalog read-path and library\n"
            "- ``services.design.admin`` — admin stores and schema\n"
            "- ``services.design.aesthetics`` — aesthetics RAG\n"
            "\n"
            "Legacy ``services.design.<module>`` imports still work via compatibility shims.\n"
            '"""\n'
        ),
        encoding="utf-8",
        newline="\n",
    )
    print("ok")


if __name__ == "__main__":
    main()
