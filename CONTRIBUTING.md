# Contributing

Thanks for considering a contribution to Recombyn.

Please read the [Code of Conduct](./CODE_OF_CONDUCT.md). Security issues: [SECURITY.md](./SECURITY.md).

## Setup

See [README.md](./README.md) and [docs/self-hosting.md](./docs/self-hosting.md).

```bash
docker compose up -d redis
cp apps/api/.env.example apps/api/.env   # fill LLM keys as needed
npm install
npm run install:api                      # Python API deps
npm run dev:api                          # http://127.0.0.1:8000
npm run dev:web                          # http://localhost:3000
```

Useful scripts:

| Command | Purpose |
|---------|---------|
| `npm run dev:web` / `dev:api` / `dev:docs` | Local servers |
| `npm run test` | Web + API tests |
| `npm run test:web` / `test:api` | Scoped tests |
| `npm run test:e2e` | Playwright (under `e2e/`) |
| `npm run build` | Production web build |

## Git identity (required)

Commits must use an email verified on your GitHub account, or GitHub will not attribute them to you.

```bash
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
# or GitHub noreply: 12345678+username@users.noreply.github.com
git config --global --get user.email
```

Do **not** add `Co-authored-by: Cursor` (or similar bot trailers) unless you intentionally want that co-author on the commit.

## Branch & pull request flow (CLI)

1. **Sync default branch**

```bash
git checkout master
git pull origin master
```

2. **Create a topic branch**

```bash
git checkout -b feat/short-description
# or: fix/...  docs/...  chore/...
```

3. **Make changes**, keep the diff focused. Prefer helpers in the same file unless shared by 3+ call sites.

4. **Run checks** that match your change

```bash
npm run test:web          # frontend
npm run test:api:unit     # API unit
# optional: npm run test:e2e
```

5. **Review what you will commit**

```bash
git status
git diff
git log -5 --oneline      # match existing message style
```

6. **Stage and commit** (message: imperative, why over what; 1–2 sentences)

```bash
git add path/to/changed/files
git commit -m "$(cat <<'EOF'
Add concise subject in imperative mood.

Optional body: why this change matters.
EOF
)"
```

PowerShell:

```powershell
git add path/to/changed/files
git commit -m @"
Add concise subject in imperative mood.

Optional body: why this change matters.
"@
```

Examples of good subjects (same style as this repo):

- `Fix canvas align guides for multi-select`
- `Drop unused assets from apps/web/public`
- `Document self-host MySQL defaults`

7. **Push and open a PR**

```bash
git push -u origin HEAD
gh pr create --fill
# or with an explicit body:
gh pr create --title "Your title" --body "$(cat <<'EOF'
## Summary
- …

## Test plan
- [ ] …
EOF
)"
```

Use the checklist in [`.github/PULL_REQUEST_TEMPLATE.md`](./.github/PULL_REQUEST_TEMPLATE.md).

8. **Address review**, then push again on the same branch (`git push`). Prefer **rebase** onto `master` if asked; avoid rewriting commits that others already based work on.

## Do / don’t

| Do | Don’t |
|----|--------|
| Small, focused PRs | Mix unrelated refactors with features |
| Verify email before first push | Commit `.env`, keys, or local IDE folders (`.cursor/`) |
| Link issues in the PR body | Force-push `master` / rewrite published history without maintainers |
| Update docs when behavior changes | Leave failing tests on the default branch |

## Commit message conventions

- **Subject**: imperative (`Add`, `Fix`, `Remove`, …), ~72 chars, no trailing period required.
- **Body** (optional): motivation and user-visible impact.
- Prefer English for commit subjects (matches git history); PR descriptions may be Chinese or English.

## License

By contributing, you agree that your contributions are licensed under the [Recombyn Source Available License](./LICENSE).
