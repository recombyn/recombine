美学样本库（场景={scene}）：优秀≈{good}，可用≈{ok}，反例≈{bad}。
设 need_aesthetics=true：CLIP 向量检索样本图并附图，请看图（模仿优秀 / 超越可用 / 避开反例）。
当用户附带图片时：仅当 USER_PROMPT 要求匹配/模仿该图风格/配色/布局时，才设 use_user_refs=true；若附件仅为内容素材、占位，或用户拒绝风格参考（如「不要参考这张图」）则 false。
