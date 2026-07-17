# agent-skills.example

Local design-agent style guides live in `../agent-skills/` (gitignored — do **not** commit).

These are **internal only** — no user-facing skill picker. Guides merge into `AUTO_STYLE_GUIDE`; the agent infers category from the user prompt (and any uploaded references).

## Setup

```bash
mkdir -p apps/web/agent-skills
# Required:
#   _core.md
#   ui.md
#   poster.md
#   ecommerce.md
#   packaging.md
#   brand.md          # VI / 画册 / 展板
```

Category files may use optional YAML frontmatter:

```md
---
label: 海报设计
---

# Guide body (merged into the global agent style guide)
```

`_core.md` has no frontmatter; it is always included first.

Shared SVG templates (committed): `apps/web/public/agent-templates/`.
