# Image editing tools

Select an **image node** on the canvas; the image toolbar appears at the top. Most AI actions show credit cost before you confirm.

## Main toolbar

| Tool | Purpose |
|------|---------|
| **Chat** | Prompt-based edit (image-to-image); optional references, model, and resolution |
| **Upscale** | Super-resolution to **4K** or **8K** presets |
| **Remove background** | Cutout; choose “portrait / fine hair” or “product / hard edge” |
| **Eraser tool** | Brush a mask; confirmed erase removes those pixels |
| **Multi-angle** | Adjust viewpoint and regenerate (below) |
| **More …** | Expand, adjust, crop, flip & rotate |
| Blend / opacity | Photoshop-style blend modes |
| Corner radius | Rounded corners where supported |
| Export / fullscreen preview | Export single node or view fullscreen |

## More menu

| Action | Description |
|--------|-------------|
| **Expand** | Outpaint / extend canvas—good for backgrounds and margins |
| **Adjust** | Light, exposure, contrast, highlights / shadows, white / black point; saturation, temperature, tint; auto presets included |
| **Crop** | Drag crop box on canvas |
| **Flip & rotate** | Horizontal / vertical flip and angle |

Crop and expand open a session-style edit on canvas; confirm writes back to the node.

## Multi-angle

Panel split into **skybox** / **camera**:

- Presets: front, side, reverse angle, three-quarter, top-down, low angle, etc.
- Sliders: rotation, tilt, zoom (near / mid / far)
- **Apply now** generates per credits and replaces the current image

## Chat quick edit

1. Select image → **Chat**.
2. Describe the change (e.g. “warm lighting”, “remove background clutter”).
3. Optional references, model, and count; current image is the main reference.
4. Shows “Editing…” while generating; result writes to the node (multiple images go to variants).

If the image was AI-generated, the input may prefill the original prompt for fine-tuning.

## Multi-image variants

When multiple images were generated, the node shows “N images”:

- **View all**: expand all results
- **Set as main**: pick which one displays
- **Separate node**: split one onto the canvas for independent editing

## Reference credits (tools)

| Tool | Approx. credits |
|------|-----------------|
| Remove background | 10 |
| Upscale | 20 |
| Adjust | 20 |
| Expand | 30 |
| Multi-angle | 30 |

Text-to-image / image-to-image billed separately by model and count—see the number beside the button. Failed generation usually refunds credits; see [FAQ](/faq/) and [Account & credits](/guide/account).

## Agent-related capabilities

Some actions run mainly via Agent tools, e.g. splitting text in an image into editable layers (**Edit text**). Describe in natural language; no need to memorize tool entry points.
