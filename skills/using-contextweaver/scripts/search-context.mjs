#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const distEntry = path.join(repoRoot, 'dist/index.js');
const forwardedArgs = process.argv.slice(2);
const hasFormat = forwardedArgs.includes('--format');
const args = ['search', ...(hasFormat ? [] : ['--format', 'json']), ...forwardedArgs];

let command;
let commandArgs;

if (process.env.CONTEXTWEAVER_BIN) {
  command = process.env.CONTEXTWEAVER_BIN;
  commandArgs = args;
} else if (fs.existsSync(distEntry)) {
  command = process.execPath;
  commandArgs = [distEntry, ...args];
} else {
  command = 'contextweaver';
  commandArgs = args;
}

const result = spawnSync(command, commandArgs, {
  stdio: 'inherit',
  env: process.env,
});

process.exit(result.status ?? 1);
