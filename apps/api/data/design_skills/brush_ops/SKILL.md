# Brush / pencil

Use when the user wants brush, pencil, 板绘, 线稿, pressure drawing, or freehand illustration — not geometric shape collage.

## Ops
- Emit `create_shape` with `shapeType=pencil` (NOT circle/ellipse stacks).
- Paint is **tip-stamp** (not old freehand ribbon):
  - `path`: SVG **M/L polyline only** (pressure/stamp ignore C/Q)
  - `pathPressure`: csv `0.05–1`, length MUST equal # of M/L points (light start/end, heavier mid)
  - `brushStyle` tip id: `solid|pencil-hb|soft|fountain|calligraphy|brushpen|marker|highlighter|chalk|charcoal|bristle|airbrush|watercolor|needle|bold`
  - optional `brushHardness` 0–100 (soft edge → hard tip, default ~80)
  - optional `pressureEnabled` true|false (default true when pathPressure set)
- Always set `stroke` + `borderWidth`.
- Prefer several expressive strokes over geometric primitives.
- Args detail: TOOL_DETAILS for `create_shape`.
