import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(import.meta.dirname, '..');
const distEntryPath = path.join(repoRoot, 'dist', 'index.js');
const packageJsonPath = path.join(repoRoot, 'package.json');

interface EntryResult {
  status: number | null;
  output: string;
}

interface PackageJson {
  version: string;
  bin?: {
    contextweaver?: string;
    cw?: string;
  };
}

async function readPackageVersion(): Promise<string> {
  const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8')) as PackageJson;
  return packageJson.version;
}

async function readPackageJson(): Promise<PackageJson> {
  return JSON.parse(await fs.readFile(packageJsonPath, 'utf-8')) as PackageJson;
}

function runEntry(args: string[]): EntryResult {
  const tempHome = os.tmpdir();
  const result = spawnSync(process.execPath, [distEntryPath, ...args], {
    cwd: repoRoot,
    encoding: 'utf-8',
    env: {
      ...process.env,
      HOME: tempHome,
    },
  });

  return {
    status: result.status,
    output: `${result.stdout}${result.stderr}`.trim(),
  };
}

async function createAliasWrapper(commandName: string): Promise<string> {
  const wrapperDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cw-entry-wrapper-'));
  const wrapperPath = path.join(wrapperDir, commandName);
  const wrapperScript = `#!/usr/bin/env bash
exec ${JSON.stringify(process.execPath)} ${JSON.stringify(distEntryPath)} "$@"
`;

  await fs.writeFile(wrapperPath, wrapperScript, 'utf-8');
  await fs.chmod(wrapperPath, 0o755);
  return wrapperPath;
}

async function createAliasSymlink(commandName: string): Promise<string> {
  const symlinkDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cw-entry-symlink-'));
  const symlinkPath = path.join(symlinkDir, commandName);

  await fs.symlink(distEntryPath, symlinkPath);
  return symlinkPath;
}

function runAlias(wrapperPath: string, args: string[]): EntryResult {
  const result = spawnSync(wrapperPath, args, {
    cwd: repoRoot,
    encoding: 'utf-8',
    env: {
      ...process.env,
      HOME: os.tmpdir(),
    },
  });

  return {
    status: result.status,
    output: `${result.stdout}${result.stderr}`.trim(),
  };
}

function expectHelpSurface(result: EntryResult): void {
  expect(result.status).toBe(0);
  expect(result.output).not.toBe('');
  expect(result.output).toContain('Usage:');
  expect(result.output).toContain('Commands:');
}

describe('CLI entry smoke tests', () => {
  it('shows help when invoked without arguments', () => {
    const result = runEntry([]);

    expectHelpSurface(result);
    expect(result.output).toContain('contextweaver');
  });

  it('shows the standard help surface for help aliases', () => {
    for (const args of [['help'], ['-h'], ['--help']]) {
      const result = runEntry(args);

      expectHelpSurface(result);
      expect(result.output).toContain('Options:');
    }
  });

  it('keeps the version shortcut output stable', async () => {
    const version = await readPackageVersion();

    for (const args of [['-v'], ['--version']]) {
      const result = runEntry(args);

      expect(result.status).toBe(0);
      expect(result.output).toBe(version);
    }
  });

  it('keeps both published bin aliases pointed at dist/index.js', async () => {
    const packageJson = await readPackageJson();

    expect(packageJson.bin?.contextweaver).toBe('dist/index.js');
    expect(packageJson.bin?.cw).toBe('dist/index.js');
  });

  it('keeps contextweaver and cw wrappers behavior-identical for shared help entrypoints', async () => {
    const contextweaverPath = await createAliasWrapper('contextweaver');
    const cwPath = await createAliasWrapper('cw');

    for (const args of [[], ['--help']]) {
      const contextweaverResult = runAlias(contextweaverPath, args);
      const cwResult = runAlias(cwPath, args);

      expect(contextweaverResult.status).toBe(0);
      expect(cwResult.status).toBe(0);
      expect(contextweaverResult.output).toBe(cwResult.output);
    }
  });

  it('keeps direct dist execution and both published wrappers aligned for shared help entrypoints', async () => {
    const contextweaverPath = await createAliasWrapper('contextweaver');
    const cwPath = await createAliasWrapper('cw');

    for (const args of [[], ['--help']]) {
      const directResult = runEntry(args);
      const contextweaverResult = runAlias(contextweaverPath, args);
      const cwResult = runAlias(cwPath, args);

      expectHelpSurface(directResult);
      expectHelpSurface(contextweaverResult);
      expectHelpSurface(cwResult);
      expect(directResult.output).toBe(contextweaverResult.output);
      expect(contextweaverResult.output).toBe(cwResult.output);
    }
  });

  it('shows help when launched through published symlink aliases without arguments', async () => {
    const contextweaverPath = await createAliasSymlink('contextweaver');
    const cwPath = await createAliasSymlink('cw');

    const contextweaverResult = runAlias(contextweaverPath, []);
    const cwResult = runAlias(cwPath, []);

    expectHelpSurface(contextweaverResult);
    expectHelpSurface(cwResult);
    expect(contextweaverResult.output).toBe(cwResult.output);
  });

  it('shows visible output for representative shared-entry dispatches', () => {
    const indexHelp = runEntry(['index', '--help']);
    expect(indexHelp.status).toBe(0);
    expect(indexHelp.output).toContain('Usage:');
    expect(indexHelp.output).toContain('--force');

    const searchResult = runEntry(['search']);
    expect(searchResult.status).toBe(1);
    expect(searchResult.output).toContain('缺少 --information-request');
  });
});
