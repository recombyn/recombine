# Local Langfuse (optional Agent tracing)

UI: http://127.0.0.1:3100  
Login: `admin@recombyn.local` / see `.env` → `LANGFUSE_INIT_USER_PASSWORD`

Langfuse itself is separate OSS ([MIT core](https://langfuse.com/handbook/chapters/open-source)). Recombyn only wires SDK keys — see [docs/self-hosting.md](../../docs/self-hosting.md).

## Start (Windows)

```powershell
cd infra/langfuse
.\start-for-windows.ps1
```

This starts a minimized `wsl sleep infinity` session and leaves it open on purpose.
**Do not close that window** while using Langfuse. If WSL has no Windows-side session, it runs `systemctl poweroff` on the distro, Postgres dies, and login shows `Can't reach database server at postgres:5432`.

Requires `%USERPROFILE%\.wslconfig`:

```ini
[wsl2]
vmIdleTimeout=-1
```

Do **not** use `networkingMode=mirrored` with this setup.

## Wire API

In `apps/api/.env`:

```bash
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_SECRET_KEY=sk-lf-...
LANGFUSE_BASE_URL=http://127.0.0.1:3100
LANGFUSE_PROJECT_ID=recombyn-design
LANGFUSE_TRACING=true
```

Restart the API, run an agent task, then open Traces in Langfuse (filter `metadata.task_id`).
