# API seed data

```
apps/api/data/
  public/     # tracked — OSS-safe / infra seeds
  private/    # gitignored — SaaS / local product content
  README.md
```

| Location | Git | Role |
|----------|-----|------|
| `data/public/` | Tracked | Public stubs + infra (`canvas_actions`, fonts, stages, …) |
| `data/private/` | Ignored (except README) | Full prompts / skills / knowledge / tokens / models / cases |

Loaders use `resolve_data_file` / `resolve_data_dir`: **private wins** when the path exists.

Optional: `DESIGN_DATA_PRIVATE_DIR` (absolute, or relative to `apps/api`).
