# Example Ext Pack

This folder is a **layout sample** for `source=file` / namespace `ext` skills.

## How to use

1. Copy `example_ext/` → rename the folder (folder name ≈ `skill_key`).
2. Edit `_meta.json` (name, description, ACL, triggers, locales).
3. Replace this `SKILL.md` with your real playbook body.
4. Restart API or Admin resync — the pack syncs into the Skill toolbox.

## Notes

- Product registration lives in `_meta.json` (`preferred_tools`, `allowed_resources`, `triggers`, …).
- Optional YAML frontmatter on this file is stripped from the runtime body; `_meta.json` wins when both exist.
- Do not reuse core keys from `design_skills_seed.json` (`design_methodology`, …).
