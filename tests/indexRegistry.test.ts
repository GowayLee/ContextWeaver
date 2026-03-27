import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  findStaleIndexedProjects,
  listIndexedProjects,
  removeIndexedProjects,
  upsertIndexedProject,
} from '../src/indexRegistry.js';

const tempDirs: string[] = [];
let previousHome: string | undefined;
let registryPath = '';

async function createTempDir(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

beforeEach(async () => {
  previousHome = process.env.HOME;
  const fakeHome = await createTempDir('cw-home-');
  process.env.HOME = fakeHome;
  registryPath = path.join(fakeHome, '.contextweaver', 'indexes.json');
});

afterEach(async () => {
  if (previousHome === undefined) {
    delete process.env.HOME;
  } else {
    process.env.HOME = previousHome;
  }

  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe('indexRegistry', () => {
  it('returns an empty list when the registry file is missing', async () => {
    await expect(listIndexedProjects()).resolves.toEqual([]);
  });

  it('stores absolute project paths and updates lastIndexedAt on upsert', async () => {
    const repoRoot = await createTempDir('cw-repo-');

    await upsertIndexedProject({
      projectId: 'abc123def0',
      projectPath: repoRoot,
      pathBirthtimeMs: 1,
      lastIndexedAt: '2026-03-27T00:00:00.000Z',
    });
    await upsertIndexedProject({
      projectId: 'abc123def0',
      projectPath: repoRoot,
      pathBirthtimeMs: 1,
      lastIndexedAt: '2026-03-27T00:00:01.000Z',
    });

    await expect(listIndexedProjects()).resolves.toEqual([
      {
        projectId: 'abc123def0',
        projectPath: path.resolve(repoRoot),
        pathBirthtimeMs: 1,
        lastIndexedAt: '2026-03-27T00:00:01.000Z',
      },
    ]);
  });

  it('detects stale projects when the stored path is missing', async () => {
    const missingPath = path.join(process.env.HOME || '', 'missing-repo');

    await upsertIndexedProject({
      projectId: 'abc123def0',
      projectPath: missingPath,
      pathBirthtimeMs: 1,
      lastIndexedAt: '2026-03-27T00:00:00.000Z',
    });

    await expect(findStaleIndexedProjects()).resolves.toEqual([
      {
        projectId: 'abc123def0',
        projectPath: path.resolve(missingPath),
        pathBirthtimeMs: 1,
        lastIndexedAt: '2026-03-27T00:00:00.000Z',
      },
    ]);
  });

  it('detects stale projects when a different repo exists at the same path', async () => {
    const repoRoot = await createTempDir('cw-repo-');

    await upsertIndexedProject({
      projectId: 'abc123def0',
      projectPath: repoRoot,
      pathBirthtimeMs: Number.MAX_SAFE_INTEGER,
      lastIndexedAt: '2026-03-27T00:00:00.000Z',
    });

    const stale = await findStaleIndexedProjects();

    expect(stale[0]?.projectId).toBe('abc123def0');
  });

  it('removes records by project id', async () => {
    const repoRoot = await createTempDir('cw-repo-');

    await upsertIndexedProject({
      projectId: 'abc123def0',
      projectPath: repoRoot,
      pathBirthtimeMs: 1,
      lastIndexedAt: '2026-03-27T00:00:00.000Z',
    });

    await removeIndexedProjects(['abc123def0']);

    await expect(listIndexedProjects()).resolves.toEqual([]);
  });

  it('throws on malformed registry content', async () => {
    await fs.mkdir(path.dirname(registryPath), { recursive: true });
    await fs.writeFile(registryPath, '{ invalid json', 'utf-8');

    await expect(listIndexedProjects()).rejects.toThrow('indexes.json');
  });

  it('keeps registry removal safe when the index directory is already missing', async () => {
    const missingPath = path.join(process.env.HOME || '', 'missing-repo');

    await upsertIndexedProject({
      projectId: 'missing12345',
      projectPath: missingPath,
      pathBirthtimeMs: 1,
      lastIndexedAt: '2026-03-27T00:00:00.000Z',
    });

    await removeIndexedProjects(['missing12345']);

    await expect(listIndexedProjects()).resolves.toEqual([]);
  });
});
