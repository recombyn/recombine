# Import files

Home can import local files into an editable canvas.

## Types

| Type | Notes |
|------|-------|
| **Images** | Image nodes; use [Image tools](/guide/image-tools) and Agent |
| **PDF** | Best-effort canvas structure for re-layout |
| **Word** | Editable content for continued design |

Extensions and size limits follow upload UI hints.

## Suggested flow

1. Import from Home (or drop if supported).
2. Wait for parse → editor.
3. Check **artboard size** for the target scene.
4. Tidy order in [Layers](/guide/canvas#layers); hide unused layers.
5. Use Agent for style / copy / images; refine manually as needed.

## Notes

- Complex PDF / Word won’t be pixel-perfect.
- Scanned / image-only PDFs may land as full-page images; use remove-bg, crop, or Agent text extraction.
- Imported projects still sync, export, and share normally.
