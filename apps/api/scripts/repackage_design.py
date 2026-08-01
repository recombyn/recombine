"""One-shot: move services/design modules into domain packages + leave compat shims.

Run from repo root or apps/api:
  python apps/api/scripts/repackage_design.py
"""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

API_ROOT = Path(__file__).resolve().parents[1]
DESIGN = API_ROOT / "services" / "design"

# dest_package -> list of module filenames (without .py)
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
    # Package name must not collide with module ``catalog.py`` shim.
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

PKG_DOCS = {
    "runtime": "Design Agent runtime graph (orchestrator, LangGraph nodes, routing).",
    "ops": "Canvas tool_ops contract, validation, and hydrate helpers.",
    "prompts": "Skills, prompt packs, knowledge, tokens, and prompt builders.",
    "readpath": "Read-path catalog, canvas scene helpers, library seeds.",
    "admin": "Admin/persistence stores and design_* schema DDL.",
}


def _git_mv(src: Path, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    r = subprocess.run(
        ["git", "mv", str(src), str(dest)],
        cwd=str(API_ROOT.parent.parent) if (API_ROOT.parent.name == "apps") else str(API_ROOT),
        capture_output=True,
        text=True,
    )
    # Repo root is apps/api's parent.parent when structure is resume-creation-web/apps/api
    if r.returncode != 0:
        # Fallback: plain move + git add
        shutil.move(str(src), str(dest))
        subprocess.run(["git", "add", "-A", str(dest), str(src)], cwd=str(API_ROOT.parent.parent), check=False)


def _repo_root() -> Path:
    # apps/api -> apps -> repo
    return API_ROOT.parent.parent


def main() -> int:
    repo = _repo_root()
    for pkg, modules in LAYOUT.items():
        pkg_dir = DESIGN / pkg
        pkg_dir.mkdir(parents=True, exist_ok=True)
        init = pkg_dir / "__init__.py"
        if not init.exists():
            init.write_text(
                f'"""{PKG_DOCS[pkg]}"""\n',
                encoding="utf-8",
            )

        for mod in modules:
            src = DESIGN / f"{mod}.py"
            dest = pkg_dir / f"{mod}.py"
            if not src.exists():
                if dest.exists():
                    print(f"skip already moved: {pkg}/{mod}")
                    continue
                print(f"MISSING {src}", file=sys.stderr)
                return 1
            print(f"move {mod}.py -> {pkg}/{mod}.py")
            subprocess.run(
                ["git", "mv", str(src.relative_to(repo)).replace("\\", "/"), str(dest.relative_to(repo)).replace("\\", "/")],
                cwd=str(repo),
                check=True,
            )
            shim = DESIGN / f"{mod}.py"
            shim.write_text(
                (
                    f'"""Compatibility shim — prefer ``services.design.{pkg}.{mod}``."""\n'
                    f"from __future__ import annotations\n\n"
                    f"import sys\n\n"
                    f"from services.design.{pkg} import {mod} as _impl\n\n"
                    f"sys.modules[__name__] = _impl\n"
                ),
                encoding="utf-8",
            )
            subprocess.run(["git", "add", str(shim.relative_to(repo)).replace("\\", "/")], cwd=str(repo), check=True)

    # Refresh package docstring
    (DESIGN / "__init__.py").write_text(
        '''"""Design Agent domain.

Prefer domain packages:

- ``services.design.runtime`` — graph / orchestrator / model routing
- ``services.design.ops`` — tool_ops contract & validation
- ``services.design.prompts`` — skills / packs / knowledge / tokens
- ``services.design.catalog`` — catalog read-path & library
- ``services.design.admin`` — admin stores & schema
- ``services.design.aesthetics`` — aesthetics RAG

Legacy ``services.design.<module>`` imports still work via compatibility shims.
"""
''',
        encoding="utf-8",
    )
    subprocess.run(["git", "add", "apps/api/services/design/__init__.py"], cwd=str(repo), check=True)
    print("done")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
