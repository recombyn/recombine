# Custom & third-party models

You can connect your **own API keys** (BYOK) to OpenAI- / Claude-compatible providers instead of using only platform models.

Entry: **Account settings → Agent → Third-party models**. After saving, models appear in the chat **model picker**.

## Who can add them?

| Environment | Requirement |
|-------------|-------------|
| **Web / Cloud desktop** | Usually **Plus** or higher; the UI prompts to upgrade if needed |
| **Local desktop** | No membership gate; local builds have **no platform model catalog**, so you **must** add your own keys to chat / generate |

Keys and endpoints stay on your device. Calls use **your** provider quota and **do not** spend platform credits. Platform image tools (remove background, upscale, etc.) still bill platform credits if used in the same session.

## Two ways to add

### 1. Platform catalog (recommended)

Built-in platforms (e.g. **OpenRouter**, **Volcengine Ark / Doubao** — see the live UI).

1. Pick a platform.
2. Usually paste only the **API Key** (base URL and common models autofill).
3. Save. Catalog text / image / video models for that platform show up in the picker.

Some platforms also support **Add model**: with a saved key, register an extra model ID (ID, display name, icon, kind: text / vision / image / video).

### 2. Manual entry

Choose **Manual entry** for any compatible endpoint:

| Field | Meaning |
|-------|---------|
| **Model kind** | **Text** (chat edits), **Vision** (understand refs), **Image**, **Video** |
| **Provider name** | Display label |
| **Website** | Optional |
| **Model ID** | Upstream `model` field — not a custom display name |
| **API Key** | Your secret |
| **Base URL** | Compatible endpoint; `http(s)://…`, **no** trailing `/` |

## Where to select

Open the Agent panel → model button under the composer → pick your third-party / catalog model.

## Billing

| Call | Platform credits? |
|------|-------------------|
| BYOK chat / vision / image / video via your key | **No** |
| Platform models & image tools | **Yes** |

## Security

Clearing site data or wiping local desktop app data removes saved keys — add them again. Don’t paste keys into public issues.

## Related

- [Using Agent](/guide/agent)
- [Account & credits](/guide/account)
- [Desktop app](/guide/desktop)
- [Image generation](/guide/image-generation)
