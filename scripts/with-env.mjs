#!/usr/bin/env node
/**
 * Run a command with the repository's .env loaded (variables already set in the environment win).
 *
 *   node scripts/with-env.mjs <command> [args...]
 *
 * Used by the db:* package scripts so `pnpm db:migrate` sees the same DATABASE_URL as the API.
 * The .env file is optional: if it does not exist nothing is loaded and the command runs as-is.
 * It never prints variable values.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const name of ['.env.local', '.env']) {
  const file = path.join(root, name);
  if (fs.existsSync(file)) process.loadEnvFile(file); // does not override existing variables
}

const [cmd, ...args] = process.argv.slice(2);
if (!cmd) {
  console.error('usage: node scripts/with-env.mjs <command> [args...]');
  process.exit(2);
}
const child = spawn(cmd, args, { stdio: 'inherit', env: process.env, shell: process.platform === 'win32' });
child.on('error', (e) => {
  console.error(`Failed to start "${cmd}": ${e.message}`);
  process.exit(2);
});
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
