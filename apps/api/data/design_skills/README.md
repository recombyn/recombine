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

Seed sync: API startup `ensure_design_skills` upserts by `skill_key` with `source=seed` (won’t overwrite rows already marked `admin` / `file`). Bump `version` in JSON when changing bodies.
