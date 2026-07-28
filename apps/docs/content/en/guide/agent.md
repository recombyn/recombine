# Using Agent

The right-side chat is recombyn’s design Agent: understand briefs, edit the canvas, generate images, and iterate. Press **C** to open / close the panel; **Ctrl + Shift + L** adds canvas selection to the conversation.

## Three interaction modes

Switch in the chat input area:

| Mode | Label | Behavior |
|------|-------|----------|
| **Agent** | Agent — auto execute | Directly edits the canvas (layout, add elements, swap colors / images, etc.) |
| **Ask** | Ask — consult first | Answers / proposes plans only; tap **Confirm execute** when ready to apply |
| **Image** | Image — image generation | Focused on text-to-image / reference-to-image; adjust resolution, aspect ratio, count, and model |

You can **stop** anytime after sending.

## Checkpoints & restore

After Agent edits the canvas, chat shows **checkpoints** (snapshots):

| Action | Notes |
|--------|-------|
| **Undo** | Drop this turn’s canvas changes |
| **Keep** | Confirm the result |
| **View** | Preview that checkpoint (per UI) |
| **Restore to this step** | On history, restore canvas to that turn’s state |

Some checkpoints **expire after refresh** (“snapshot invalid”). Keep or export important results.

## Activity log

While running: thinking, skill / rule / knowledge / aesthetics lookup, canvas size, tool calls, image steps — useful when stuck.

## Attachments & @ references

Upload with **+**, or **Ctrl + V** paste in chat. Type `@` to search and reference **attachments already added in the current conversation**, e.g. “follow this reference.”

The `@` panel does not search models, projects, or canvas nodes. Pick models via the model button below the input; add canvas selection with **Ctrl + Shift + L**.

## Model choice: Auto vs lock

Open the **model button** under the input. Common sections: **Design** / **Image generation**.

| Choice | Behavior |
|--------|----------|
| **Auto** | System picks a **lane** for this turn, then maps it to a model (below) |
| **A platform model** | Locks that model for the turn (and until you switch back); Auto lane map is overridden to the same model |
| **Third-party custom model** | Uses your own API key and endpoint; **does not** spend platform credits (see [Third-party models](#third-party-models-bring-your-own-key)) |

Free tier usually allows **Auto** only; paid plans can pick platform models. See the in-product **Plans** page.

Image models include Doubao Seedream, GPT Image, Nano Banana Pro / Nano Banana 2, etc. (list in product). Details: [Image generation](/guide/image-generation).

## Auto routing preferences

**Applies only when the chat model is Auto.** Configure in either place (same local storage):

1. **Account settings → Agent** (full form)
2. Compact **Auto routing** card in the Agent / Ask model popover

### Preference presets

| Preference | Meaning |
|------------|---------|
| **Standard** | Platform default lane → model table |
| **Pro** | Stronger reasoning / vision lane map |
| **Max** | Flagship quality-first map |
| **Custom lanes** | You assign a model per lane |

Pro / Max / Custom send a `route_overrides` map with the request; Standard follows the platform Admin defaults.

### Five lanes (Custom)

You are not “running this model immediately.” You are filling a **task type → model** map. Lanes are **not** all called at once.

| Lane | Meaning | Typical use |
|------|---------|-------------|
| **Fast lane** | Short Q&A, tiny tweaks, no redesign | “Make the title red” |
| **Standard lane** | Typical canvas edits | Layout / color / local poster edits |
| **Reasoning lane** | Blank create, multi-artboard, design systems, hard multi-step | “Build a full site from scratch” |
| **Multimodal** | Must understand attached images | Style from a reference / screenshot |
| **Image model** | Image-generation catalog slot (not a chat lane) | When the pipeline needs AI photos |

Price tags (Cheap / Moderate / Costly) are guidance only; only the lane chosen for this turn runs.

### How the backend decides (summary)

1. With Auto, the client sends your lane map (or Pro / Max preset).
2. The backend **classifies the lane** (cheap structured LLM router; heuristic fallback):
   - Images + understand intent → **Multimodal**
   - Empty / long / from-scratch → **Reasoning**
   - Short edit on existing content → **Fast**
   - Ask mode without images → prefer **Fast**
   - Otherwise → **Standard**
3. Looks up the model for that lane; if images are present but the model cannot see them, soft-switches to the **Multimodal** slot.
4. Image generation uses the **Image model** slot (separate from chat) and bills platform credits per image (except BYOK chat calls).
5. Retries may follow a platform fallback chain; retry caps are platform-managed.

When you lock a model: fast / standard / reasoning / multimodal all pin to that model.

## Third-party models (bring your own key)

Some plans (e.g. Standard and up) can add **OpenAI / Claude–compatible** providers under **Account → Agent → third-party models**.

### How to add

1. Open Account → **Agent**.
2. Fill in:
   - **Model type**: **Chat** (conversation / edits) or **Multimodal** (vision). For image generation, keep using platform image models (platform credits).
   - Provider **name**, optional website
   - **API key** (stored in this browser only)
   - **Base URL** (compatible endpoint, no trailing `/`)
3. After save, the model appears in the chat model list.

### Billing notes

- BYOK chat calls use **your** provider quota — **no platform credits**.
- Platform image gen / image tools in the same session still bill platform credits.
- Clearing site data removes local keys; add them again if needed.

Without a qualifying plan, the UI prompts you to upgrade.

## Full design flow (Home / kickoff)

When starting a full-page design from Home or Agent:

### Run mode

| Mode | Description |
|------|-------------|
| **Agent pipeline** | Skill-chain collaboration; backend routes models by task |
| **Single-model draw** | Direct output from a chosen model, without the full skill pipeline |

### Collaboration pace

| Pace | Description |
|------|-------------|
| **Human-in-the-loop** | Pause for confirmation each stage (default) |
| **Key milestones** | Pause only at important milestones |
| **Fully automatic** | Run end-to-end (you can still stop anytime) |

Scenario types include website, mobile app, image, poster / banner, etc.

## Sessions & activity

- **New chat** and **history** (count capped per product).
- Free tier: daily Auto trials; manual model pick may be plan-gated.

## Credits & billing

Chat, Agent, and image generation share one credit balance. Balance, ledger, plans, and card keys: [Account & credits](/guide/account).
