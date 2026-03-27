import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getProjectIdentity } from '../../src/db/index.js';
import { markIndexedProjectConfirmed, upsertIndexedProject } from '../../src/indexRegistry.js';
import { ensureIndexed } from '../../src/mcp/tools/codebaseRetrieval.js';

const tempDirs: string[] = [];
let previousHome: string | undefined;

async function createTempDir(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

async function createRepo(): Promise<string> {
  const repoRoot = await createTempDir('cw-mcp-repo-');
  await fs.mkdir(path.join(repoRoot, 'src'), { recursive: true });
  await fs.writeFile(path.join(repoRoot, 'src', 'app.ts'), 'export const app = true;\n', 'utf-8');
  await fs.writeFile(
    path.join(repoRoot, 'cwconfig.json'),
    JSON.stringify({ indexing: { includePatterns: ['src/**'] } }, null, 2),
    'utf-8',
  );
  return repoRoot;
}

beforeEach(async () => {
  previousHome = process.env.HOME;
  process.env.HOME = await createTempDir('cw-home-');
});

afterEach(async () => {
  if (previousHome === undefined) {
    delete process.env.HOME;
  } else {
    process.env.HOME = previousHome;
  }

  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe('ensureIndexed', () => {
  it('rejects MCP first-time auto-index when config is missing or unconfirmed', async () => {
    const repoRoot = await createRepo();
    const identity = getProjectIdentity(repoRoot);

    await expect(
      ensureIndexed(repoRoot, identity.projectId, undefined, {
        withLock: async (_projectId, _name, callback) => callback(),
        scanFn: vi.fn(),
      }),
    ).rejects.toThrow('cw index');
  });

  it('allows silent incremental repair only after confirmation has been recorded', async () => {
    const repoRoot = await createRepo();
    const identity = getProjectIdentity(repoRoot);
    const scanFn = vi.fn().mockResolvedValue({
      totalFiles: 1,
      added: 0,
      modified: 0,
      unchanged: 1,
      deleted: 0,
      skipped: 0,
      errors: 0,
    });

    await upsertIndexedProject({
      projectId: identity.projectId,
      projectPath: identity.projectPath,
      pathBirthtimeMs: identity.pathBirthtimeMs,
      lastIndexedAt: '2026-03-27T00:00:00.000Z',
      confirmedAt: null,
    });
    await markIndexedProjectConfirmed(identity.projectId, '2026-03-27T00:00:01.000Z');

    await expect(
      ensureIndexed(repoRoot, identity.projectId, undefined, {
        withLock: async (_projectId, _name, callback) => callback(),
        scanFn,
      }),
    ).resolves.toBeUndefined();
    expect(scanFn).toHaveBeenCalledTimes(1);
  });
});
