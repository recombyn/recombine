# API seed data

```
apps/api/data/
  public/     # tracked — OSS-safe / infra seeds
  private/    # local only (gitignored) — optional overlay
  README.md
```

| Location | Git | Role |
|----------|-----|------|
| `data/public/` | Tracked | OSS baseline + infra (`canvas_actions`, fonts, stages, prompt packs, **core skills**, …) |
| `data/private/` | Not in git | Optional overlay (same filenames as `public/`; private wins when present) |

Loaders use `resolve_data_file` / `resolve_data_dir`: **private wins** when the path exists.

`design_prompt_packs_seed.json` in **public** is a **minimal English runnable baseline** (enough for Agent cold start).

`design_skills_seed.json` in **public** ships the **5 core skills** (`design_methodology`, `vision_extract`, `aesthetics_align`, `canvas_edit`, `image_gen`).

Create `data/private/` locally if you need overlays — same filenames as under `public/`. Optional: `DESIGN_DATA_PRIVATE_DIR` (absolute, or relative to `apps/api`).
