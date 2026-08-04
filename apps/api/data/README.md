# API seed data

```
apps/api/data/
  public/     # tracked — OSS-safe / infra seeds
  README.md
```

| Location | Git | Role |
|----------|-----|------|
| `data/public/` | Tracked | OSS baseline + infra (`canvas_actions`, fonts, stages, prompt packs, **core skills**, …) |

Loaders read from `data/public/` via `resolve_data_file` / `resolve_data_dir`.

`design_prompt_packs_seed.json` is a **minimal English runnable baseline** (enough for Agent cold start).

`design_skills_seed.json` ships the **5 core skills** (`design_methodology`, `vision_extract`, `aesthetics_align`, `canvas_edit`, `image_gen`).

Extension file packs (`source=file` / `ext`): `data/public/design_skills/<key>/` — see [public/design_skills/README.md](./public/design_skills/README.md).
