# Account & credits

## Open Account

After sign-in, open settings from the avatar / account entry. Common sections:

| Section | Contents |
|---------|----------|
| **Profile** | Display name, bio, avatar |
| **Plans** | Membership tiers, benefits, upgrade |
| **Credits / wallet** | Balance, estimated cost hints |
| **Usage & billing** | Top-ups and model usage ledger |
| **Redeem card key** | Membership or credit packs |
| **Agent** | Auto routing prefs, third-party models |

Labels may vary slightly in the product UI.

## Unified credits

One wallet currency: **credits**.

- **Chat / Agent**: usage from the provider is converted to credits and deducted.
- **Image generation / some image tools**: per image or per run (often shown next to the button).
- Membership grants a monthly pool shared by chat, Agent, and images.
- **Bring-your-own-key** chat models do **not** spend platform credits (platform image features still may). See [Custom & third-party models](/guide/custom-models).

When balance is too low, send / generate is blocked until you upgrade, redeem a key, or wait for free-tier daily reset.

## Plans

| Tier | Rough positioning (see in-product Plans) |
|------|------------------------------------------|
| **Free** | No monthly grant; limited daily design runs (usually Auto only) |
| **Standard (Plus)** | Monthly credits; pick platform models; add third-party models |
| **Pro** | Higher monthly credits; custom models and deeper features |
| **Ultra** (if offered) | Highest quota and priority |

“≈ N chats / N images” on cards are **estimates** for common models; real cost varies by model and prompt size.

### Switching plans

- Paid plans usually **cannot switch** until expiry; then you can change.
- Same-tier renewal or **credit card keys** may still redeem (follow on-screen rules).

## Usage & billing

Under **Usage & billing** (or similar):

- Top-ups / monthly grants
- Chat, Agent, and image spend

Use this to audit deductions. If a failed run was not refunded, note the time and report in-product.

## Redeem card keys

1. Open redemption and enter a key (often `XXXXX-XXXXX-XXXXX-XXXXX`).
2. Common types:
   - **Membership**: activates a plan and monthly credit grant
   - **Credits**: adds credits to the balance
3. Takes effect immediately. Generally non-refundable except where law or explicit policy requires otherwise.

External “buy card key” links may appear in the product.

## Agent preferences (Account → Agent)

Same local config as the editor Auto popover.

### Auto routing

| Preference | Effect |
|------------|--------|
| Standard | Platform default lane table |
| Pro / Max | Stronger preset lane → model maps |
| Custom lanes | Pick models for fast / standard / reasoning / multimodal / image |

**Only when chat model is Auto.** Lane meanings and backend selection: [Agent · Auto routing](/guide/agent#auto-routing-preferences).

### Third-party models

1. **Platform catalog** (e.g. OpenRouter, Volcengine Ark): mainly an API key; optional “Add model” for extra IDs.
2. **Manual entry**: provider name, model ID, base URL, kind (text / vision / image / video).

Keys stay on-device; your quota, not platform credits (except platform image tools). Web needs Plus+. Local desktop: [Desktop app](/guide/desktop).

Details: [Custom & third-party models](/guide/custom-models).

## Profile

- Edit display name, bio, and avatar (object storage; not long-term base64 in DB).
- Sign-in: email or Google (per registration).
- Email accounts can **change password** in settings; Google-only accounts usually have no email password.

## Notices

Under **Notices** (or message center):

| Type | Contents |
|------|----------|
| **Announcements** | Product news, membership / card-key notes |
| **Notifications** | Interaction and system alerts (as pushed) |

Mark all as read. Billing or entitlement changes are also announced here when possible.

## Related

- [Using Agent](/guide/agent)
- [Custom & third-party models](/guide/custom-models)
- [Desktop app](/guide/desktop)
- [Image generation](/guide/image-generation)
- [Image tools](/guide/image-tools)
- [Export & share](/features/export-share)
- [FAQ](/faq/)
