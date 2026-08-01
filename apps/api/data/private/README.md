# Private seed overlay (not committed)

Copy production / SaaS seed JSON here. Runtime resolves **private first**, then `data/public/`.

## Typical files

| Path | Notes |
|------|--------|
| `design_prompt_packs_seed.json` | Prompt packs + agent system keys |
| `design_skills_seed.json` | Skill seed rows |
| `design_knowledge_seed.json` | Knowledge corpus |
| `design_tokens_seed.json` | Design-system token packs |
| `llm_models_seed.json` | Model catalog + image presets |
| `official_cases/` | Plaza official case JSON |
| `design_skills/` | File-based skill packs |

Optional: set `DESIGN_DATA_PRIVATE_DIR` in `apps/api/.env` (absolute, or relative to `apps/api`).
