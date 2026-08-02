# API seed data

```
apps/api/data/
  public/     # tracked — OSS-safe / infra seeds
  private/    # local only (gitignored) — create for SaaS / full product content
  README.md
```

| Location | Git | Role |
|----------|-----|------|
| `data/public/` | Tracked | OSS baseline + infra (`canvas_actions`, fonts, stages, prompt packs, **core skills**, …) |
| `data/private/` | Not in git | Full product prompts / extra skills / knowledge / tokens / models / cases |

Loaders use `resolve_data_file` / `resolve_data_dir`: **private wins** when the path exists.

`design_prompt_packs_seed.json` in **public** is a **minimal English runnable baseline** (enough for Agent cold start). Tuned product packs stay in **private** or Admin.

`design_skills_seed.json` in **public** ships the **5 core skills** (`design_methodology`, `vision_extract`, `aesthetics_align`, `canvas_edit`, `image_gen`). Designer workflow skills (`user.*`) stay Admin / private.

Create `data/private/` locally (or on the SaaS host) and drop seed JSON there — same filenames as under `public/`. Optional: `DESIGN_DATA_PRIVATE_DIR` (absolute, or relative to `apps/api`).
