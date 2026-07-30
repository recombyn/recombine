# Open-source release checklist (maintainers)

Before making the repository public:

1. **Secrets** — `git grep` for real API keys, passwords, internal hostnames; rotate anything that ever leaked.
2. **Env** — only `*.env.example` committed; compose defaults documented as insecure-for-prod.
3. **Admin** — keep the operator console **private / unpublished**. Never list it as a public dependency; OSS must boot from seeds alone.
4. **URLs** — set real GitHub org in README badges / issue config when the remote exists.
5. **CI** — ensure `.github/workflows/*` pass on a clean clone.
6. **License headers** — root `LICENSE` + `NOTICE` are enough for MIT; no need to stamp every file.
7. **Tag** — cut `v0.x.0` with release notes pointing at `docs/self-hosting.md`.
