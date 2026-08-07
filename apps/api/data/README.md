# API seed data

```
apps/api/data/
  design_prompt_packs/    # _index.json + one *.md per kind
  design_skills_seed.json
  design_skills/          # optional ext packs (source=file)
  design_knowledge_seed.json
  design_tokens_seed.json
  canvas_actions_seed.json
  fonts_seed.json
  llm_models_seed.json
  …
  README.md
```

Single tracked seed tree — no private overlay. Loaders use `resolve_data_file` / `resolve_data_dir` → `apps/api/data/`.

| File / dir | Role |
|------------|------|
| `design_prompt_packs/` | Stage system / Ask / paint / aesthetics copy (`_index.json` meta + `*.md` bodies) |
| `design_skills_seed.json` | **5 core skills** (`design_methodology`, `vision_extract`, `aesthetics_align`, `canvas_edit`, `image_gen`) |
| `design_skills/<key>/` | Optional extension packs — see [design_skills/README.md](./design_skills/README.md) |
| `design_knowledge_seed.json` | Knowledge catalog bodies |
| `design_tokens_seed.json` | Design token packs |
| `canvas_actions_seed.json` | Canvas `tool_ops` registry |
| `llm_models_seed.json` | Model catalog |
| `fonts_seed.json` | Font catalog |

Day-to-day quality: add **Skills** (Admin / zip / `design_skills/` packs). Prompt packs + runtime graph ship complete for cold start.
