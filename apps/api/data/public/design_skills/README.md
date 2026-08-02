# Design skills (OSS baseline)

Open-source ships **5 core skills** in `design_skills_seed.json` so self-host Agent can create / edit / vision / image-gen out of the box.

## Namespaces

| Namespace | Kind | Source | Key rules |
|-----------|------|--------|-----------|
| `core` | system core | `design_skills_seed.json` (`source=seed`) | Bare keys (`design_methodology`); aliases `core.<key>` |
| `ext` | server extension | `data/design_skills/<pack>/` (`source=file`) | Bare pack folder name, or `ext.<key>` |
| `user` | user / admin extension | Admin API (`source=admin`) | Always stored as `user.<local>`; cannot claim core keys |

Conflict prevention: seed never overwritten by file/admin; file never overwrites admin/seed; admin cannot register core/ext namespaces.

## ACL

- `preferred_tools` — canvas op allowlist while skill is loaded
- `allowed_resources` — `knowledge` / `prompts` / `aesthetics` / `tools`
- **User skills never reopen unrestricted surface** even when mixed with core skills
- Optional `owner_user_id` isolates a user skill to that account

## I/O validation

- Pack / admin meta must pass `validate_skill_meta` (key, name, body, ACL/schema shapes)
- `input_schema` / `output_schema` — JSON objects; `need_skills` may pass `{key, version, args}`
- `output_schema.allowed_ops` further restricts tool ops after preferred_tools

## Versioning

- Integer `version` bumps on sync / admin edit
- `pack_version` keeps semver from `_meta.json`
- Each bump writes `design_skill_revision` snapshot
- Pin at runtime: `need_skills: ["design_methodology@2"]` or `{ "key": "…", "version": 2 }`

## Hot reload

Process startup starts a daemon that polls seed JSON + pack mtimes (`DESIGN_SKILLS_HOT_RELOAD`, default on). Admin `POST /design/skills/resync` still forces a sync.

## Pack layout

```
data/design_skills/<key>/
  _meta.json          # registration (name/description/logo/locales/ACL/schemas/…)
  <key>-logo.png      # optional icon
  SKILL.md            # prompt body only (no YAML frontmatter)
```

| Key | Role |
|-----|------|
| `design_methodology` | Create **steps** + material one-liners (not layout ops) |
| `vision_extract` | User reference images |
| `aesthetics_align` | Optional sample alignment |
| `canvas_edit` | Edit existing nodes |
| `image_gen` | `create_image` + genPrompt boundary |

## Ownership vs prompt packs / knowledge

| Layer | Owns |
|-------|------|
| Prompt packs (`design_prompt_packs_seed.json`) | Protocol only: JSON shape, intent, when to `need_*`；runtime 经 `host.require_prompt_pack` / `assemble_stage_system` 注入，缺 pack 不硬编码兜底 |
| Core skills (this seed) | Engine playbooks: create steps, vision, edit, image boundary |
| Admin skills (`user.*`) | Product workflows + **layout ops** (`user.layout_ops`) |
| Knowledge | Numeric/encyclopedia detail (banner sizes, icon rules, palette) |

Runtime 调用链与 `prompts/` / `runtime/` 边界见仓库 [docs/design-agent-runtime.md](../../../../docs/design-agent-runtime.md)。

Designer workflow skills（需求整理 / 交互体验 / 视觉规范 / 交付表达 / 落层操作）走 **Admin**（`source=admin` / `user.*`），不要放进本目录。

Seed sync: API startup `ensure_design_skills` **inserts missing** `source=seed` keys only (cold start). It never updates existing rows and never overwrites `admin` / `file`. Bump `version` in JSON for new empty DBs; existing installs keep DB values — ops must Admin-edit seed rows to refresh bodies.
