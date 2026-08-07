# Design prompt packs (seed)

```
design_prompt_packs/
  _index.json          # kindLabels + item metadata (no bodies)
  <kind>.md            # body text; filename must equal `kind`
  README.md
```

Edit a pack: change the matching `.md` (and `_index.json` if title / usedBy / scenes change).
Loader: `prompt_pack_store._load_prompt_packs_seed` → DB insert-missing on API start.

Do not put path separators in `kind` (flat filenames only).
