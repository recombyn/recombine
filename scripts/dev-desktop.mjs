import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const webRoot = path.join(repoRoot, 'apps', 'web');
const win = process.platform === 'win32';
const mode = process.argv[2] === 'build' ? 'build' : 'dev';

const cargoBin = path.join(os.homedir(), '.cargo', 'bin');
const cargoExe = path.join(cargoBin, win ? 'cargo.exe' : 'cargo');

if (!existsSync(cargoExe)) {
  console.error(
    '[dev:desktop] Rust toolchain not found (cargo missing).\n' +
      '  Install: https://rustup.rs\n' +
      `  Expected: ${cargoExe}`
  );
  process.exit(1);
}

const pathKey = win ? 'Path' : 'PATH';
const prev = process.env[pathKey] || process.env.PATH || '';
const env = {
  ...process.env,
  [pathKey]: `${cargoBin}${path.delimiter}${prev}`,
};

const npmCmd = win ? 'npm.cmd' : 'npm';
const script = mode === 'build' ? 'tauri:build' : 'tauri:dev';

const child = spawn(npmCmd, ['run', script], {
  cwd: webRoot,
  stdio: 'inherit',
  env,
  shell: win,
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
