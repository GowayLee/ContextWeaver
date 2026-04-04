import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EmbeddingFatalError } from '../src/api/embedding/index.js';
import {
  buildIndexPreview,
  buildIndexScopeLogLines,
  deleteIndexedProjectDirectory,
  ensureProjectConfigForIndex,
  ensureSearchableProject,
  initProjectConfigCommand,
  installBundledSkills,
  recordIndexedProject,
  resolveSkillInstallTarget,
  runCleanIndexes,
  runIndexCommand,
} from '../src/cli.js';
import { runIndexCliCommand } from '../src/index.js';
import { isIndexedProjectConfirmed, listIndexedProjects } from '../src/indexRegistry.js';

const tempDirs: string[] = [];
let previousHome: string | undefined;

async function createTempDir(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

async function createRepo(options?: {
  withConfig?: boolean;
  files?: Record<string, string>;
  config?: Record<string, unknown>;
}): Promise<string> {
  const repoRoot = await createTempDir('cw-repo-');
  const files = options?.files ?? {
    'src/app.ts': 'export const app = true;\n',
    'src/config.json': '{"ok":true}\n',
    'src/nested/util.ts': 'export const util = true;\n',
  };

  await Promise.all(
    Object.entries(files).map(async ([relativePath, content]) => {
      const fullPath = path.join(repoRoot, relativePath);
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, content, 'utf-8');
    }),
  );

  if (options?.withConfig !== false) {
    await fs.writeFile(
      path.join(repoRoot, 'cwconfig.json'),
      JSON.stringify(options?.config ?? { indexing: { includePatterns: ['src/**'] } }, null, 2),
      'utf-8',
    );
  }

  return repoRoot;
}

const mockStats = {
  totalFiles: 3,
  added: 3,
  modified: 0,
  unchanged: 0,
  deleted: 0,
  skipped: 0,
  errors: 0,
};

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
      '{\n  "indexing": {\n    "includePatterns": [\n      "src/**"\n    ],\n    "ignorePatterns": []\n  }\n}\n',
    );
  });

  it('installs bundled skills into a target directory', async () => {
    const targetDir = await createTempDir('cw-skills-target-');

    const installed = await installBundledSkills({
      targetDir,
      force: false,
    });

    expect(installed.map((item) => item.name).sort()).toEqual([
      'enhancing-prompts',
      'using-contextweaver',
    ]);
    await expect(
      fs.readFile(path.join(targetDir, 'using-contextweaver', 'SKILL.md'), 'utf-8'),
    ).resolves.toContain('name: using-contextweaver');
    await expect(
      fs.readFile(path.join(targetDir, 'enhancing-prompts', 'SKILL.md'), 'utf-8'),
    ).resolves.toContain('name: enhancing-prompts');
  });

  it('refuses to overwrite an installed skill directory without force', async () => {
    const targetDir = await createTempDir('cw-skills-target-');

    await installBundledSkills({ targetDir, force: false });

    await expect(installBundledSkills({ targetDir, force: false })).rejects.toThrow(
      'already exists',
    );
  });

  it('defaults skill installation to the local opencode skill directory', () => {
    expect(resolveSkillInstallTarget({ cwd: '/tmp/repo' })).toBe('/tmp/repo');
  });

  it('resolves an explicit skill installation directory relative to cwd', () => {
    expect(
      resolveSkillInstallTarget({
        cwd: '/tmp/repo',
        targetDir: './agent-skills',
      }),
    ).toBe('/tmp/repo/agent-skills');
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
      '  - ignore (built-in): node_modules, .git, .svn, .hg, .idea, .vscode, .vs, .venv, venv',
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
          confirmedAt: null,
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
          confirmedAt: null,
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
          confirmedAt: null,
        },
        {
          projectId: 'missing12345',
          projectPath: '/missing/repo-2',
          pathBirthtimeMs: 1,
          lastIndexedAt: '2026-03-27T00:00:00.000Z',
          confirmedAt: null,
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
    const repoRoot = await createRepo();
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
        yes: true,
        isInteractive: false,
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

  it('creates cwconfig.json and aborts index when project config is missing', async () => {
    const repoRoot = await createRepo({ withConfig: false });

    const result = await ensureProjectConfigForIndex(repoRoot);

    expect(result.kind).toBe('created_config');
    expect(await fs.readFile(path.join(repoRoot, 'cwconfig.json'), 'utf-8')).toContain('src/**');
  });

  it('builds an aggregated preview of matched directories and extensions', async () => {
    const repoRoot = await createRepo();

    const preview = await buildIndexPreview(repoRoot);

    expect(preview.totalFiles).toBe(3);
    expect(preview.directorySummaries).toEqual(['src/: .json(1), .ts(2)']);
  });

  it('shows real matched file paths in the preview sample', async () => {
    const repoRoot = await createRepo();

    const preview = await buildIndexPreview(repoRoot);

    expect(preview.samplePaths).toEqual(['src/app.ts', 'src/config.json', 'src/nested/util.ts']);
  });

  it('does not start indexing when preview confirmation is rejected', async () => {
    const repoRoot = await createRepo();
    const scanFn = vi.fn();

    await expect(
      runIndexCommand({
        rootPath: repoRoot,
        force: false,
        isInteractive: true,
        confirmIndex: async () => false,
        scanFn,
      }),
    ).rejects.toThrow('Index confirmation declined');
    expect(scanFn).not.toHaveBeenCalled();
  });

  it('renders actual matched paths before asking for confirmation', async () => {
    const repoRoot = await createRepo();
    const lines: string[] = [];

    await expect(
      runIndexCommand({
        rootPath: repoRoot,
        force: false,
        isInteractive: true,
        logLine: (line) => lines.push(line),
        confirmIndex: async () => false,
      }),
    ).rejects.toThrow('Index confirmation declined');

    expect(lines).toContain('- src/app.ts');
  });

  it('refuses non-interactive index preview without --yes', async () => {
    const repoRoot = await createRepo();

    await expect(
      runIndexCommand({
        rootPath: repoRoot,
        force: false,
        isInteractive: false,
      }),
    ).rejects.toThrow('--yes');
  });

  it('fails fast when the current config matches no indexable files', async () => {
    const repoRoot = await createRepo({
      config: { indexing: { includePatterns: ['docs/**'] } },
      files: { 'docs/readme.txt': 'hello\n' },
    });

    await expect(
      runIndexCommand({
        rootPath: repoRoot,
        force: false,
        yes: true,
        isInteractive: false,
      }),
    ).rejects.toThrow('no indexable files');
  });

  it('treats --yes as explicit confirmation and records confirmedAt', async () => {
    const repoRoot = await createRepo();
    const scanFn = vi.fn().mockResolvedValue(mockStats);

    await runIndexCommand({
      rootPath: repoRoot,
      force: false,
      yes: true,
      isInteractive: false,
      scanFn,
    });

    const projects = await listIndexedProjects();
    expect(projects).toHaveLength(1);
    expect(await isIndexedProjectConfirmed(projects[0]!.projectId)).toBe(true);
  });

  it('prints a failure verdict with stage context and no success summary on fatal embedding failure', async () => {
    const info = vi.fn();
    const error = vi.fn();
    const exit = vi.fn();

    await runIndexCliCommand({
      rootPath: '/repo',
      yes: true,
      isInteractive: false,
      runIndexCommandFn: vi
        .fn()
        .mockRejectedValue(new Error('向量嵌入阶段失败: provider exploded')),
      logger: { info, error },
      exit,
    });

    expect(info).not.toHaveBeenCalledWith(expect.stringContaining('索引完成'));
    expect(info).not.toHaveBeenCalledWith(expect.stringContaining('总数:'));
    expect(error).toHaveBeenCalledWith('索引失败：向量嵌入阶段失败: provider exploded');
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('prints a verdict first and then safe provider diagnostics for fatal embedding failures', async () => {
    const info = vi.fn();
    const error = vi.fn();
    const exit = vi.fn();
    const diagnosticsError = new EmbeddingFatalError('向量嵌入阶段失败: batch too large', {
      diagnostics: {
        stage: 'embed',
        category: 'batch_too_large',
        httpStatus: 400,
        providerType: 'invalid_request_error',
        providerCode: 'batch_limit_exceeded',
        upstreamMessage: 'batch too large for provider',
        endpointHost: 'api.example.com',
        endpointPath: '/v1/embeddings',
        model: 'text-embedding-3-large',
        batchSize: 32,
        dimensions: 1024,
        requestCount: 27,
      },
    });

    await runIndexCliCommand({
      rootPath: '/repo',
      yes: true,
      isInteractive: false,
      runIndexCommandFn: vi.fn().mockRejectedValue(diagnosticsError),
      logger: { info, error },
      exit,
    });

    expect(error).toHaveBeenNthCalledWith(1, '索引失败：向量嵌入阶段失败: batch too large');
    expect(error).toHaveBeenCalledWith('阶段: embed');
    expect(error).toHaveBeenCalledWith('错误类别: batch_too_large');
    expect(error).toHaveBeenCalledWith('HTTP 状态: 400');
    expect(error).toHaveBeenCalledWith('Provider type: invalid_request_error');
    expect(error).toHaveBeenCalledWith('Provider code: batch_limit_exceeded');
    expect(error).toHaveBeenCalledWith('Provider message: batch too large for provider');
    expect(error).toHaveBeenCalledWith('Endpoint: api.example.com/v1/embeddings');
    expect(error).toHaveBeenCalledWith('Model: text-embedding-3-large');
    expect(error).toHaveBeenCalledWith('Batch size: 32');
    expect(error).toHaveBeenCalledWith('Dimensions: 1024');
    expect(error).toHaveBeenCalledWith('Request items: 27');

    const output = error.mock.calls.map(([line]) => line).join('\n');
    expect(output).not.toContain('test-key');
    expect(output).not.toContain('Bearer ');
    expect(output).not.toContain('Authorization');
    expect(output).not.toContain('api_key=secret');
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('keeps success-only completion output on successful indexing runs', async () => {
    const info = vi.fn();
    const error = vi.fn();
    const exit = vi.fn();

    await runIndexCliCommand({
      rootPath: '/repo',
      yes: true,
      isInteractive: false,
      runIndexCommandFn: vi.fn().mockResolvedValue(mockStats),
      logger: { info, error },
      exit,
    });

    expect(info).toHaveBeenCalledWith('索引完成：索引已更新');
    expect(info).toHaveBeenCalledWith(expect.stringContaining('总数:3 新增:3'));
    expect(error).not.toHaveBeenCalled();
    expect(exit).not.toHaveBeenCalled();
  });

  it('rejects local search when the repo has never completed confirmed indexing', async () => {
    const repoRoot = await createRepo();

    await expect(ensureSearchableProject(repoRoot)).rejects.toThrow('cw index');
  });
});
