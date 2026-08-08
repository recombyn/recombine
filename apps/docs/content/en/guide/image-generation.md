# Image generation

recombyn offers two common ways to generate images: an **image generator node on the canvas**, and **Image mode in Agent chat**. Both share resolution, aspect ratio, count, and model settings.

## Image generator node

1. Click **Image generator** in the bottom toolbar, or press **A**.
2. A generator card appears at the viewport center; the input shows **only when that node is selected**.
3. Enter a prompt; upload references with **+**, or use `@` to reference existing attachments.
4. Tap setting chips to adjust: **resolution · aspect ratio · count** (e.g. `2K · 1:1 · 1 image`).
5. Pick an image model, confirm credits, and send.

On success, the node becomes a normal image node; if multiple images were generated, extras go to **multi-image variants** on that image—you can switch the main image or split into separate nodes. On failure, you may see “Image generation failed” or “No image returned”; retry with a new prompt / model.

### Common settings

| Item | Options |
|------|---------|
| Resolution | SD 1K / HD 2K / UHD 4K |
| Aspect ratio | Auto, 21:9, 16:9, 3:2, 4:3, 1:1, 3:4, 2:3, 9:16 |
| Count | 1–4 images |
| Smart aspect | Model confirms ratio from content |

Credit cost appears beside the send button (lightning icon + number), based on model and count.

### Platform vs BYOK

- **Web / Cloud**: Seedream, GPT Image, etc. are platform models and spend **platform credits**.
- **Third-party image kind**: add via [Custom & third-party models](/guide/custom-models) (catalog or manual). Uses your quota.
- **Local desktop**: no platform image catalog — configure BYOK. See [Desktop app](/guide/desktop).

## Agent **Image** mode

Switch among three modes at the bottom of the right chat:

| Mode | Description |
|------|-------------|
| **Agent** | Direct canvas edits: layout, add elements, swap images, etc. |
| **Ask** | Answers / proposes a plan; shows an ops preview and applies only after **Confirm** |
| **Image** | Focused text-to-image / reference-to-image; controls similar to generator node |

In **Image** mode, describe the scene and attach references to generate in chat and place on canvas. Home briefs can also pick image scenarios for a full design kickoff.

## References & @

- **Reference images**: upload locally, or paste in chat (Ctrl + V).
- **@**: pick from attachments already in the current conversation—“continue from this reference.”
- **Model**: choose separately via the model button below the input, not in the `@` panel.

With an existing image selected, toolbar **Chat** edits via image-to-image (see [Image editing tools](/guide/image-tools)).

## Relation to full design flow

Starting website / mobile app / poster, etc. from Home also offers:

- **Run mode**: Agent pipeline (skill chain + auto routing) or single-model draw.
- **Collaboration pace**: human-in-the-loop / key milestones / fully automatic (see [Using Agent](/guide/agent)).

For pure image generation, prefer the generator node or Agent **Image** mode.
