import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildIndexScopeLogLines,
  deleteIndexedProjectDirectory,
  initProjectConfigCommand,
  recordIndexedProject,
  runCleanIndexes,
  runIndexCommand,
} from '../src/cli.js';
import { listIndexedProjects } from '../src/indexRegistry.js';

const tempDirs: string[] = [];
let previousHome: string | undefined;

async function createTempDir(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
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

describe('cli helpers', () => {
  it('creates cwconfig.json for init-project', async () => {
    const repoRoot = await createTempDir('cw-repo-');

    await initProjectConfigCommand({ cwd: repoRoot, force: false });

    await expect(fs.readFile(path.join(repoRoot, 'cwconfig.json'), 'utf-8')).resolves.toBe(
      '{\n  "indexing": {\n    "ignorePatterns": []\n  }\n}\n',
    );
  });

  it('refuses to overwrite cwconfig.json without force', async () => {
    const repoRoot = await createTempDir('cw-repo-');
    await fs.writeFile(path.join(repoRoot, 'cwconfig.json'), '{}\n', 'utf-8');

    await expect(initProjectConfigCommand({ cwd: repoRoot, force: false })).rejects.toThrow(
      'cwconfig.json',
    );
  });

  it('builds scope log lines for the index command and warns on empty include scope', async () => {
    const repoRoot = await createTempDir('cw-repo-');
    await fs.writeFile(
      path.join(repoRoot, 'cwconfig.json'),
      JSON.stringify({ indexing: { includePatterns: [] } }, null, 2),
      'utf-8',
    );

    const lines = await buildIndexScopeLogLines(repoRoot);

    expect(lines).toEqual([
      '索引范围:',
      '  - include: <empty>',
      '  - ignore (project): <none>',
      '  - ignore (.gitignore at repo root): enabled',
      '  - ignore (built-in): enabled',
      '  - always excluded: cwconfig.json',
      '  - warning: current config yields an empty indexing scope',
    ]);
  });

  it('refuses interactive cleanup in non-tty mode without flags', async () => {
    await expect(runCleanIndexes({ isInteractive: false })).rejects.toThrow('--yes');
  });

  it('supports dry-run cleanup without deleting directories', async () => {
    const deletedIds: string[] = [];
    const result = await runCleanIndexes({
      isInteractive: false,
      dryRun: true,
      staleProjects: [
        {
          projectId: 'abc123def0',
          projectPath: '/missing/repo',
          pathBirthtimeMs: 1,
          lastIndexedAt: '2026-03-27T00:00:00.000Z',
        },
      ],
      deleteDirectory: async (projectId) => {
        deletedIds.push(projectId);
      },
    });

    expect(result).toEqual({
      staleProjectIds: ['abc123def0'],
      deletedProjectIds: [],
      failedProjectIds: [],
      prunedProjectIds: [],
    });
    expect(deletedIds).toEqual([]);
  });

  it('keeps stale indexes when confirmation is rejected', async () => {
    const result = await runCleanIndexes({
      isInteractive: true,
      staleProjects: [
        {
          projectId: 'abc123def0',
          projectPath: '/missing/repo',
          pathBirthtimeMs: 1,
          lastIndexedAt: '2026-03-27T00:00:00.000Z',
        },
      ],
      confirmDelete: async () => false,
    });

    expect(result.deletedProjectIds).toEqual([]);
    expect(result.staleProjectIds).toEqual(['abc123def0']);
  });

  it('only deletes direct children of the global index directory', async () => {
    await expect(deleteIndexedProjectDirectory('../escape')).rejects.toThrow('direct child');
  });

  it('never deletes reserved global state paths', async () => {
    await expect(deleteIndexedProjectDirectory('logs')).rejects.toThrow('reserved');
  });

  it('removes stale indexes on confirmed cleanup and prunes missing directories', async () => {
    const deletedIds: string[] = [];
    const prunedIds: string[][] = [];

    const result = await runCleanIndexes({
      isInteractive: true,
      staleProjects: [
        {
          projectId: 'abc123def0',
          projectPath: '/missing/repo',
          pathBirthtimeMs: 1,
          lastIndexedAt: '2026-03-27T00:00:00.000Z',
        },
        {
          projectId: 'missing12345',
          projectPath: '/missing/repo-2',
          pathBirthtimeMs: 1,
          lastIndexedAt: '2026-03-27T00:00:00.000Z',
        },
      ],
      confirmDelete: async () => true,
      deleteDirectory: async (projectId) => {
        if (projectId === 'missing12345') {
          const error = new Error('already missing');
          (error as NodeJS.ErrnoException).code = 'ENOENT';
          throw error;
        }
        deletedIds.push(projectId);
      },
      removeRecords: async (projectIds) => {
        prunedIds.push([...projectIds]);
      },
    });

    expect(result).toEqual({
      staleProjectIds: ['abc123def0', 'missing12345'],
      deletedProjectIds: ['abc123def0'],
      failedProjectIds: [],
      prunedProjectIds: ['missing12345'],
    });
    expect(deletedIds).toEqual(['abc123def0']);
    expect(prunedIds).toEqual([['abc123def0', 'missing12345']]);
  });

  it('records the indexed project after a successful scan', async () => {
    const repoRoot = await createTempDir('cw-repo-');

    await recordIndexedProject(repoRoot);

    const projects = await listIndexedProjects();
    expect(projects[0]?.projectPath).toBe(repoRoot);
  });

  it('runs the index command flow and surfaces registry write failures', async () => {
    const repoRoot = await createTempDir('cw-repo-');
    const lines: string[] = [];
    const scanFn = vi.fn().mockResolvedValue({
      totalFiles: 0,
      added: 0,
      modified: 0,
      unchanged: 0,
      deleted: 0,
      skipped: 0,
      errors: 0,
    });

    await expect(
      runIndexCommand({
        rootPath: repoRoot,
        force: false,
        logLine: (line) => lines.push(line),
        scanFn,
        recordIndexedProjectFn: async () => {
          throw new Error('indexes.json write failed');
        },
      }),
    ).rejects.toThrow('indexes.json');

    expect(scanFn).toHaveBeenCalledTimes(1);
    expect(lines).toContain('索引范围:');
  });
});
