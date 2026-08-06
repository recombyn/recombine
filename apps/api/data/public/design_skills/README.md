# Design skills (OSS baseline)

Open-source ships **5 core skills** in `design_skills_seed.json` so self-host Agent can create / edit / vision / image-gen out of the box.

This directory holds optional **extension packs** (`source=file`, namespace `ext`). OSS ships **one sample pack** (`example_ext/`) so you can copy the layout.

Official MIT encyclopedias ship under repo-root [`.agents/skills/`](../../../../../.agents/skills/) (`ui_ux_pro_max`, `garden_style`, `awesome_design_md`, `shadcn_ui`) and load into the same Skill toolbox.

**Runtime / lifecycle / when to add a Skill vs corpus vs prompt pack:** see repo [docs/design-agent-runtime.md](../../../../../docs/design-agent-runtime.md#what-to-extend-content-not-graph).

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
  SKILL.md            # prompt body; YAML frontmatter (name/description) supported
  LICENSE             # optional
```

| Format | Recognition |
|--------|-------------|
| Product pack | `_meta.json` + `SKILL.md` |
| Frontmatter-only | folder with only `SKILL.md` |
| User upload zip | either of the above |

Frontmatter is stripped from the runtime prompt body. Product `_meta.json` wins when both exist.

### Core (seed JSON)

| Key | Role |
|-----|------|
| `design_methodology` | Create **steps** + material one-liners (not layout ops); process: brief → structure → place → self-check |
| `vision_extract` | User reference images |
| `aesthetics_align` | Optional sample alignment |
| `canvas_edit` | Edit existing nodes |
| `image_gen` | `create_image` + genPrompt boundary |

### Sample ext pack (this folder)

| Key | Role |
|-----|------|
| `example_ext` | Layout sample — copy/rename to add real ext skills |

## Ownership vs prompt packs / knowledge

| Layer | Owns |
|-------|------|
| Prompt packs (`design_prompt_packs_seed.json`) | Protocol only: JSON shape, intent, when to `need_*` |
| Core skills (seed JSON) | Engine playbooks: create steps, vision, edit, image boundary |
| Ext packs (this folder) | Optional server extension playbooks |
| Admin skills (`user.*`) | Product workflows + optional layout/op playbooks (catalog; enable to load) |
| Knowledge | Numeric/encyclopedia detail |

Designer workflow skills go through **Admin** (`user.*`), not this directory.

Seed sync: API startup `ensure_design_skills` **inserts missing** `source=seed` keys only. File packs sync on startup / hot reload and **update** existing `source=file` rows when packs change.
