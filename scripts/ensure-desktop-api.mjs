/**
 * Ensure a local FastAPI is listening on 127.0.0.1:8000 for desktop-local.
 * If already up, do nothing. Otherwise spawn uvicorn (venv preferred).
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apiRoot = path.join(repoRoot, 'apps', 'api');
const win = process.platform === 'win32';
const HOST = '127.0.0.1';
const PORT = 8000;

function healthOk(timeoutMs = 800) {
  return new Promise((resolve) => {
    const req = http.get(
      { host: HOST, port: PORT, path: '/api/v1/health', timeout: timeoutMs },
      (res) => {
        res.resume();
        resolve(res.statusCode != null && res.statusCode < 500);
      }
    );
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.on('error', () => resolve(false));
  });
}

function resolvePython() {
  const venvPy = path.join(apiRoot, '.venv', win ? 'Scripts/python.exe' : 'bin/python');
  if (existsSync(venvPy)) return venvPy;
  return win ? 'python' : 'python3';
}

export async function ensureDesktopApi() {
  if (await healthOk()) {
    console.log(`[desktop:local] API already on http://${HOST}:${PORT}`);
    return { started: false, child: null };
  }

  const py = resolvePython();
  console.log(`[desktop:local] starting API via ${py} (cwd=${apiRoot})`);

  const child = spawn(
    py,
    ['-m', 'uvicorn', 'app.main:app', '--host', HOST, '--port', String(PORT)],
    {
      cwd: apiRoot,
      stdio: 'inherit',
      env: {
        ...process.env,
        // Always isolate desktop-local from cloud MySQL in apps/api/.env.
        DATABASE_URL: '',
        S3_ENABLED: 'false',
        DESKTOP_LOCAL_AUTO_LOGIN: 'true',
        RECOMBYN_API_ROOT: apiRoot,
      },
      shell: win,
      detached: false,
    }
  );

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (child.exitCode != null) {
      throw new Error(`[desktop:local] API exited early (code ${child.exitCode})`);
    }
    if (await healthOk(1200)) {
      console.log(`[desktop:local] API ready at http://${HOST}:${PORT}`);
      return { started: true, child };
    }
    await new Promise((r) => setTimeout(r, 400));
  }

  try {
    child.kill();
  } catch {
    /* ignore */
  }
  throw new Error('[desktop:local] timed out waiting for API health');
}

const isMain =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  ensureDesktopApi().catch((err) => {
    console.error(err?.message || err);
    process.exit(1);
  });
}
