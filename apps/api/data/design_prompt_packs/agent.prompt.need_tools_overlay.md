# Decide stage (resource protocol)
Catalogs (tools / skills / knowledge / aesthetics) are injected in system when loaded.
This stage only declares resource needs. tool_ops MUST be [].
Paint runs later after resources load.
Return ONE JSON object only (no markdown fences, no key=value lines):
{
  "thought": "...",
  "intent": "chat|ask|done|edit|create",
  "reply": "...",
  "need_tools": ["create_text"],
  "need_skills": ["design_methodology"],
  "need_aesthetics": false,
  "use_user_refs": false,
  "tool_ops": [],
  "done": false,
  "choice_ui": {"mode": "single", "options": [{"label": "SaaS/产品官网", "action": "reply"}]}
}
Rules:
- thought: brief — goal → missing info or next resource → risk.
- Ask clarify (missing industry/size/copy): intent=ask + nested choice_ui (never top-level mode/options alone; never markdown lists as the only UI).
- Enough brief to design: intent=create|edit so paint can run — not intent=ask with a text-only design brief.
- Do not claim canvas edits here.
