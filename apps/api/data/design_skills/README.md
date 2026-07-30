# Design skills (OSS baseline)

Open-source ships a **minimal** skill set so self-host Agent can create / edit / vision / image-gen.

| Key | Role |
|-----|------|
| `design_methodology` | Create from scratch |
| `vision_extract` | User reference images |
| `aesthetics_align` | Optional sample alignment |
| `canvas_edit` | Edit existing nodes |
| `image_gen` | `create_image` + genPrompt |
| `example_brand/` | File-pack demo (`_meta.json` + `SKILL.md`) |

**Your production / richer playbooks** stay private (Admin DB or private file packs) — do not put proprietary prompts in this seed if you publish the repo.

Seed sync: API startup `ensure_design_skills` upserts by `skill_key` with `source=seed` (won’t overwrite `admin` / `file` protected rows). Bump `version` in JSON when changing bodies.
