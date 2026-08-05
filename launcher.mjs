// Launcher: sets the correct working directory before starting the MCP server
// and explicitly loads .env so API keys are available regardless of how Claude
// Desktop spawns the process.
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Manually parse .env and inject into environment so keys are always present
// even when Claude Desktop spawns the process without a shell.
function loadEnv(envPath) {
  try {
    const content = readFileSync(envPath, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      if (key && !(key in process.env)) {
        process.env[key] = val;
      }
    }
  } catch {
    // .env is optional — silently continue if missing
  }
}

loadEnv(join(__dirname, '.env'));

const child = spawn(
  process.execPath,
  [join(__dirname, 'dist', 'index.js')],
  {
    cwd: __dirname,
    stdio: 'inherit',
    env: process.env,
  }
);

child.on('exit', (code) => process.exit(code ?? 0));
child.on('error', (err) => {
  process.stderr.write(`Launcher error: ${err.message}\n`);
  process.exit(1);
});
