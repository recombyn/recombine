# API seed data

```
apps/api/data/
  public/     # tracked — OSS-safe / infra seeds
  private/    # local only (gitignored) — create for SaaS / full product content
  README.md
```

| Location | Git | Role |
|----------|-----|------|
| `data/public/` | Tracked | Public stubs + infra (`canvas_actions`, fonts, stages, …) |
| `data/private/` | Not in git | Full prompts / skills / knowledge / tokens / models / cases |

Loaders use `resolve_data_file` / `resolve_data_dir`: **private wins** when the path exists.

Create `data/private/` locally (or on the SaaS host) and drop seed JSON there — same filenames as under `public/`. Optional: `DESIGN_DATA_PRIVATE_DIR` (absolute, or relative to `apps/api`).
