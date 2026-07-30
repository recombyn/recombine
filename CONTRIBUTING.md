# Contributing

Thanks for considering a contribution to Recombyn.

Please read the [Code of Conduct](./CODE_OF_CONDUCT.md). Security issues: [SECURITY.md](./SECURITY.md).

## Setup

See [README.md](./README.md) and [docs/self-hosting.md](./docs/self-hosting.md).

```bash
docker compose up -d redis
cp apps/api/.env.example apps/api/.env
npm install
npm run dev:api
npm run dev:web
```

## Guidelines

- Prefer small, focused PRs.
- Do not commit secrets (`.env`, API keys, passwords).
- Keep helpers in the same file unless shared by 3+ call sites.
- Run relevant tests: `npm run test:web`, `npm run test:api`.
- Use the PR template checklist.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](./LICENSE).
