# Security Policy

## Supported versions

Security fixes are applied on the default branch (`main` / `master`). If you self-host, upgrade to the latest tagged release when available.

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security bugs.

Email the maintainers (see repository profile / `SECURITY` contact when published), and include:

- Affected component (`apps/web`, `apps/api`, deploy compose, …)
- Reproduction steps or PoC (non-destructive preferred)
- Impact assessment (auth bypass, data leak, RCE, …)

We aim to acknowledge reports within **7 days** and coordinate a fix or advisory before any public disclosure.

## Self-host hardening (checklist)

See [docs/self-hosting.md](docs/self-hosting.md). At minimum:

- Change MySQL and `SUPER_ADMIN_BOOTSTRAP_PASSWORD` defaults
- Rotate `CARD_KEY_SALT` / provider API keys
- Never commit `.env` files
- Terminate TLS in front of the stack
