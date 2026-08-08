# Motion / Lottie

Use when the user asks for Lottie, 动效, UI motion, loading/success/empty-state loops, or heartbeat like/favorite.

## Ops
- MUST emit `create_lottie` with `genPrompt` (brief motion + style).
- NEVER substitute `create_image` / `create_svg` / shape piles for motion.
- Do NOT invent huge `animationData` by hand unless the user pasted Bodymovin JSON.
- Static UI marks stay vector (`create_shape` / `boolean_op` / `create_svg`) — not Lottie.
- On edit: replace/refine via `create_lottie` or `update_node`; keep SCENE ids.
- Args detail: TOOL_DETAILS for `create_lottie`.
