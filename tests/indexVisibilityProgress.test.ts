import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runIndexCommand } from '../src/cli.js';

const tempDirs: string[] = [];
let previousHome: string | undefined;

async function createTempDir(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

async function createRepo(): Promise<string> {
  const repoRoot = await createTempDir('cw-progress-');
  await fs.mkdir(path.join(repoRoot, 'src'), { recursive: true });
  await fs.writeFile(path.join(repoRoot, 'src/app.ts'), 'export const app = true;\n', 'utf-8');
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

describe('index visibility progress', () => {
  it('logs stage-first progress lines through the existing onProgress callback', async () => {
    const repoRoot = await createRepo();
    const lines: string[] = [];
    const scanFn = vi.fn().mockImplementation(async (_rootPath, options) => {
      options.onProgress?.(10, 100, '阶段 crawl: 发现 3 个候选文件');
      options.onProgress?.(20, 100, '阶段 process: 已处理 2/3 个文件');
      options.onProgress?.(45, 100, '阶段 chunk/embed: 待嵌入 2 个文件');
      options.onProgress?.(60, 100, '阶段 chunk/embed: 已完成 1/4 个批次');
      options.onProgress?.(90, 100, '阶段 persist: 正在同步 SQLite / LanceDB / FTS');

      return {
        totalFiles: 3,
        added: 2,
        modified: 0,
        unchanged: 1,
        deleted: 0,
        skipped: 0,
        errors: 0,
        skippedByReason: {},
        visibility: {
          candidateFiles: 3,
          processedFiles: 3,
          embeddingFiles: 2,
          selfHealFiles: 0,
          deletedPaths: 0,
        },
      };
    });

    await runIndexCommand({
      rootPath: repoRoot,
      force: false,
      yes: true,
      isInteractive: false,
      logLine: (line) => lines.push(line),
      scanFn,
      recordIndexedProjectFn: async () => {},
    });

    expect(scanFn).toHaveBeenCalledTimes(1);
    expect(lines).toContain('阶段 crawl: 发现 3 个候选文件');
    expect(lines).toContain('阶段 process: 已处理 2/3 个文件');
    expect(lines).toContain('阶段 chunk/embed: 待嵌入 2 个文件');
    expect(lines).toContain('阶段 chunk/embed: 已完成 1/4 个批次');
    expect(lines).toContain('阶段 persist: 正在同步 SQLite / LanceDB / FTS');
    expect(lines).not.toContain(expect.stringContaining('索引进度:'));

    const onProgress = scanFn.mock.calls[0]?.[1]?.onProgress;
    expect(onProgress).toBeTypeOf('function');
  });
});
