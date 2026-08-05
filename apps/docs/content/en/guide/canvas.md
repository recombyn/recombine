# Canvas & tools

Infinite canvas with multiple **smart artboards**. Switch tools on the bottom bar; selection shows alignment, style, and fill controls. Press **C** for Agent. Full list: [Shortcuts](/guide/shortcuts).

## Toolbar

| Tool | Shortcut | Notes |
|------|----------|-------|
| Select | V | Click / marquee; drag empty canvas to pan |
| Hand | H | Pan; or hold Space |
| Shapes | R / L / O … | Rect, line, arrow, ellipse, polygon, star |
| Pen | P | Anchor paths; Esc / Enter to finish |
| Brush | Shift + P | Free draw; eraser on toolbar; brush library / stamps |
| Paint bucket | B | Fill shape with current stroke color |
| Text | T | Add text; font, weight, size; Markdown editing |
| Smart artboard | F | Drag a frame; then size presets, fill, lock, clip overflow |
| Upload image | I | Place a local image or video |
| Image generator | A | Text-to-image node — [Image generation](/guide/image-generation) |

## Smart artboards

- Multiple frames per project (e.g. phone + poster); size presets grouped by scene.
- Frame toolbar: presets, board color, lock, clip overflow, flip.
- **New frames stack on top** in layer order; reorder via Layers or shortcuts.
- Export, share preview, and Plaza covers prefer the current / best frame.

## Layers

| Capability | Notes |
|------------|-------|
| Scope | Lists **frames** and shape / text / image / video nodes together |
| Search | Filter by name |
| Order | Drag or shortcuts; matches canvas z-order |
| Hide / show | Eye toggle (frames too) |
| Lock | Prevent accidental edits |
| Naming | Image generator nodes show as “Image generator” (UI wording may vary) |

Shortcuts: `]` / `[` front / back; `Ctrl + ]` / `Ctrl + [` up / down; `Ctrl + Shift + H` visibility; `Ctrl + Shift + K` lock.

**Minimap** (bottom-left) frames the viewport; grid snap can be toggled.

## Multi-select & align

- Marquee or Shift-click for multi-select toolbar.
- Align, distribute, match size, and related actions (per toolbar).
- Single select: fill, stroke, radius, blend, opacity, etc.

## Fill & style

Solid, linear gradient, radial gradient, and **mesh / diffuse** fills with editable control points.

## Stroke

Open paths and stroked shapes expose width, alignment, cap, and join in the stroke panel. Defaults:

| Object | Cap | Join |
|--------|-----|------|
| Line, pen | Butt | Miter |
| Brush (pencil), arrow | Round | Round |

Panel values override defaults. Closed paths typically omit the cap control.

## Path edit & outline stroke

- **Double-click** a pen / path node to enter path edit. Subtools: select, pen (add anchors), curve (Alt / Option convert-point behavior).
- **Outline stroke** bakes the stroke into an editable filled path. Single open paths use geometric offset; multi-subpath strokes (e.g. arrows) use one silhouette matching paint. Pencil centerlines are sparsified before offset to keep anchors manageable.
- After outlining, stroke ink becomes fill; line / pen / pencil / arrow drop SVG stroke to avoid a double outline.

## Text & fonts

- Double-click to edit; basic Markdown.
- Font family, weight, size; searchable platform fonts.
- To extract editable text from an image, ask Agent in natural language.

## Images

Image nodes use [Image editing tools](/guide/image-tools). For generation use **A** or Agent **Image** mode.

## Video

- Drop a local video onto the canvas or use the upload entry; an **Uploading** placeholder appears while the file transfers.
- With a video selected: trim, crop, flip, **Extract frame** (first / at playhead), fullscreen, and download.
- **Extract frame** places a still image node beside the video for further image edits.
- Deleting an uploading placeholder **aborts the upload** and **cannot be undone** (so unfinished uploads are not restored via Ctrl+Z).

## Save & sync

Auto cloud sync when signed in; **Ctrl + S** to save. Leaving the editor syncs document and cover. Cloud wins across devices; local draft keeps unsynced edits when possible. See [FAQ](/faq/).

## Navigation tips

Space / Hand to pan; wheel to zoom; Ctrl + 0 = 100%; Shift + 1 = fit all. Drag corners to scale.
