import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { crawl } from '../../src/scanner/crawler.js';
import { initFilter, isFiltered, isIncluded } from '../../src/scanner/filter.js';

const tempDirs: string[] = [];

async function createRepo(options?: {
  cwconfig?: Record<string, unknown>;
  gitignore?: string;
  files?: Record<string, string>;
}): Promise<string> {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'cw-filter-'));
  tempDirs.push(repoRoot);

  const files = options?.files ?? {
    'src/app.ts': 'export const app = true;\n',
    'src/generated/schema.ts': 'export const schema = true;\n',
    'src/nested/deep/file.ts': 'export const deep = true;\n',
    'packages/core/src/index.ts': 'export const core = true;\n',
    'docs/readme.md': '# docs\n',
    'dist/index.ts': 'export const dist = true;\n',
    'examples/cwconfig.json': '{"demo":true}\n',
    'logs/debug.ts': 'export const log = true;\n',
  };

  await Promise.all(
    Object.entries(files).map(async ([relativePath, content]) => {
      const fullPath = path.join(repoRoot, relativePath);
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, content, 'utf-8');
    }),
  );

  if (options?.gitignore !== undefined) {
    await fs.writeFile(path.join(repoRoot, '.gitignore'), options.gitignore, 'utf-8');
  }

  if (options?.cwconfig !== undefined) {
    await fs.writeFile(
      path.join(repoRoot, 'cwconfig.json'),
      JSON.stringify(options.cwconfig, null, 2),
      'utf-8',
    );
  }

  return repoRoot;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe('scanner filter', () => {
  it('defaults to including repo files when cwconfig.json is missing', async () => {
    const repoRoot = await createRepo();

    await initFilter(repoRoot);

    expect(isIncluded('src/app.ts')).toBe(true);
    expect(isFiltered('src/app.ts')).toBe(false);
  });

  it('treats patterns as repo-relative normalized paths', async () => {
    const repoRoot = await createRepo({
      cwconfig: {
        indexing: { includePatterns: ['packages/*/src/**'] },
      },
    });

    await initFilter(repoRoot);

    expect(isIncluded('packages/core/src/index.ts')).toBe(true);
    expect(isIncluded('src/app.ts')).toBe(false);
  });

  it('matches directory include patterns recursively', async () => {
    const repoRoot = await createRepo({
      cwconfig: {
        indexing: { includePatterns: ['src/'] },
      },
    });

    await initFilter(repoRoot);

    expect(isIncluded('src/nested/deep/file.ts')).toBe(true);
  });

  it('subtracts ignore patterns from included paths', async () => {
    const repoRoot = await createRepo({
      cwconfig: {
        indexing: {
          includePatterns: ['src/**'],
          ignorePatterns: ['src/generated/**'],
        },
      },
    });

    await initFilter(repoRoot);

    expect(isIncluded('src/generated/schema.ts')).toBe(true);
    expect(isFiltered('src/generated/schema.ts')).toBe(true);
  });

  it('does not allow includePatterns to re-include built-in excluded files', async () => {
    const repoRoot = await createRepo({
      cwconfig: {
        indexing: { includePatterns: ['dist/**'] },
      },
    });

    await initFilter(repoRoot);

    expect(isIncluded('dist/index.ts')).toBe(true);
    expect(isFiltered('dist/index.ts')).toBe(true);
  });

  it('does not allow includePatterns to re-include gitignored files', async () => {
    const repoRoot = await createRepo({
      cwconfig: {
        indexing: { includePatterns: ['logs/**'] },
      },
      gitignore: 'logs/\n',
    });

    await initFilter(repoRoot);

    expect(isIncluded('logs/debug.ts')).toBe(true);
    expect(isFiltered('logs/debug.ts')).toBe(true);
  });

  it('treats an empty includePatterns array as an empty scope', async () => {
    const repoRoot = await createRepo({
      cwconfig: {
        indexing: { includePatterns: [] },
      },
    });

    await initFilter(repoRoot);

    expect(isIncluded('src/app.ts')).toBe(false);
  });

  it('updates include state when cwconfig.json changes', async () => {
    const repoRoot = await createRepo({
      cwconfig: {
        indexing: { includePatterns: ['src/**'] },
      },
    });

    await initFilter(repoRoot);
    expect(isIncluded('src/app.ts')).toBe(true);
    expect(isIncluded('packages/core/src/index.ts')).toBe(false);

    await fs.writeFile(
      path.join(repoRoot, 'cwconfig.json'),
      JSON.stringify({ indexing: { includePatterns: ['packages/*/src/**'] } }, null, 2),
      'utf-8',
    );

    await initFilter(repoRoot);

    expect(isIncluded('src/app.ts')).toBe(false);
    expect(isIncluded('packages/core/src/index.ts')).toBe(true);
  });

  it('never includes cwconfig.json itself in index candidates', async () => {
    const repoRoot = await createRepo({
      cwconfig: {
        indexing: { includePatterns: ['cwconfig.json', 'src/**'] },
      },
    });

    await initFilter(repoRoot);

    expect(isIncluded('cwconfig.json')).toBe(true);
    expect(isFiltered('cwconfig.json')).toBe(true);
  });

  it('does not treat nested cwconfig.json files as the project config file', async () => {
    const repoRoot = await createRepo({
      cwconfig: {
        indexing: { includePatterns: ['examples/**'] },
      },
    });

    await initFilter(repoRoot);

    expect(isIncluded('examples/cwconfig.json')).toBe(true);
    expect(isFiltered('examples/cwconfig.json')).toBe(false);
  });

  it('does not let gitignore negation override built-in or project ignores', async () => {
    const repoRoot = await createRepo({
      cwconfig: {
        indexing: {
          includePatterns: ['dist/**', 'src/generated/**', 'cwconfig.json'],
          ignorePatterns: ['src/generated/**'],
        },
      },
      gitignore:
        '!dist/\n!dist/index.ts\n!src/generated/\n!src/generated/schema.ts\n!cwconfig.json\n',
    });

    await initFilter(repoRoot);

    expect(isFiltered('dist/index.ts')).toBe(true);
    expect(isFiltered('src/generated/schema.ts')).toBe(true);
    expect(isFiltered('cwconfig.json')).toBe(true);
  });

  it('aborts initialization when cwconfig.json is invalid', async () => {
    const repoRoot = await createRepo();
    await fs.writeFile(path.join(repoRoot, 'cwconfig.json'), '{ invalid json', 'utf-8');

    await expect(initFilter(repoRoot)).rejects.toThrow('cwconfig.json');
  });

  it('crawler returns only files inside configured include scope', async () => {
    const repoRoot = await createRepo({
      cwconfig: {
        indexing: {
          includePatterns: ['src/**', 'packages/*/src/**', 'dist/**', 'logs/**'],
          ignorePatterns: ['src/generated/**'],
        },
      },
      gitignore: 'logs/\n',
    });

    await initFilter(repoRoot);
    const result = await crawl(repoRoot);
    const relativePaths = result
      .map((file) => path.relative(repoRoot, file).replace(/\\/g, '/'))
      .sort();

    expect(relativePaths).toEqual([
      'packages/core/src/index.ts',
      'src/app.ts',
      'src/nested/deep/file.ts',
    ]);
  });
});
