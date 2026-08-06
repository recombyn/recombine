import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../apps/api');
const win = process.platform === 'win32';
const venvPy = path.join(apiRoot, '.venv', win ? 'Scripts/python.exe' : 'bin/python');
const py = existsSync(venvPy) ? venvPy : 'python';

if (!existsSync(venvPy)) {
  console.warn(
    `[dev:api] apps/api/.venv not found — using "${py}". Prefer: cd apps/api && python -m venv .venv && pip install -e ".[dev]"`
  );
}

const child = spawn(
  py,
  ['-m', 'uvicorn', 'app.main:app', '--reload', '--host', '127.0.0.1', '--port', '8000'],
  { cwd: apiRoot, stdio: 'inherit', env: process.env }
);
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
